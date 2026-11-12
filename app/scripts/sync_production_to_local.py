#!/usr/bin/env python3
"""Replace local Wrangler D1/R2 with a verified, read-only copy of production."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from backfill_remote_images import parse_jsonc

APP = Path(__file__).resolve().parents[1]
WRANGLER = APP / 'node_modules/.bin/wrangler'
WORKER = APP / 'scripts/local_sync_worker.js'
LOCAL_STATE = APP / '.wrangler/state'
KEY_QUERIES = (
    'SELECT object_key FROM project_images',
    'SELECT thumbnail_key FROM project_images WHERE thumbnail_key IS NOT NULL',
    'SELECT object_key FROM project_image_variants',
    'SELECT object_key FROM property_images',
    'SELECT thumbnail_key FROM property_images WHERE thumbnail_key IS NOT NULL',
    'SELECT object_key FROM property_image_variants',
    "SELECT value FROM site_content WHERE key IN ('studio_image_key','studio_image_variant_key','team_1_image_key','team_1_image_variant_key','team_2_image_key','team_2_image_variant_key','team_3_image_key','team_3_image_variant_key','team_4_image_key','team_4_image_variant_key')",
)


def reorder_export(source, destination):
    """Create tables before rows while retaining sqlite_sequence initialization."""
    buckets = [[] for _ in range(6)]
    buffer = ''
    for char in source:
        buffer += char
        if char != ';' or not sqlite3.complete_statement(buffer):
            continue
        sql = re.sub(r'^(?:\s|--[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)*', '', buffer).upper()
        if sql.startswith('PRAGMA DEFER_FOREIGN_KEYS'):
            bucket = 0
        elif sql.startswith('CREATE TABLE '):
            bucket = 1
        elif re.match(r'DELETE\s+FROM\s+["`\[]?SQLITE_SEQUENCE\b', sql):
            bucket = 3
        elif re.match(r'INSERT\s+INTO\s+["`\[]?SQLITE_SEQUENCE\b', sql):
            bucket = 4
        elif sql.startswith('INSERT INTO '):
            bucket = 2
        elif re.match(r'CREATE\s+(?:UNIQUE\s+)?INDEX\b', sql):
            bucket = 5
        else:
            raise ValueError('Unsupported SQL statement in D1 export; local data was not replaced.')
        buckets[bucket].append(buffer)
        buffer = ''
    if buffer.strip():
        raise ValueError('Incomplete D1 export; local data was not replaced.')
    destination.write_text(''.join(statement for bucket in buckets for statement in bucket), encoding='utf-8')
    destination.chmod(0o600)


def inspect_database(state):
    """Check the imported database and return unique referenced R2 keys."""
    matches = []
    for path in (state / 'v3/d1').rglob('*.sqlite'):
        with sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True) as db:
            names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if {'projects', 'project_images', 'properties', 'property_images', 'd1_migrations'} <= names:
                matches.append(path)
    if len(matches) != 1:
        raise ValueError('Could not identify exactly one imported local D1 database.')
    with sqlite3.connect(f'{matches[0].as_uri()}?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('The imported database failed its integrity check.')
        violations = db.execute('PRAGMA foreign_key_check').fetchall()
        if violations:
            raise ValueError(f'The imported database contains {len(violations)} foreign-key violations.')
        keys = {row[0] for query in KEY_QUERIES for row in db.execute(query) if row[0]}
        if any(not isinstance(key, str) or len(key) > 1024 for key in keys):
            raise ValueError('The imported database contains an invalid media key.')
        counts = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
                  for table in ('projects', 'project_images', 'properties', 'property_images')}
    return sorted(keys), counts


def running_local_server():
    """Detect Wrangler development servers for this app on Linux, regardless of port."""
    proc = Path('/proc')
    if not proc.is_dir():
        raise RuntimeError('Cannot check for running Wrangler servers on this operating system.')
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if (entry / 'cwd').resolve() not in (APP.resolve(), APP.parent.resolve()):
                continue
            args = (entry / 'cmdline').read_bytes().split(b'\0')
            if any(Path(os.fsdecode(arg)).name == 'wrangler' for arg in args if arg) and b'dev' in args:
                return True
        except (OSError, ProcessLookupError):
            continue
    return False


def read_config(account_id):
    config = parse_jsonc((APP / 'wrangler.jsonc').read_text(encoding='utf-8'))
    databases = [d for d in config.get('d1_databases', []) if d.get('binding') == 'DB']
    buckets = [b for b in config.get('r2_buckets', []) if b.get('binding') == 'MEDIA']
    if len(databases) != 1 or len(buckets) != 1:
        raise ValueError('Expected exactly one DB binding and one MEDIA binding.')
    db, bucket = databases[0], buckets[0]
    if not db.get('database_name') or not db.get('database_id') or not bucket.get('bucket_name'):
        raise ValueError('Configure the D1 database and R2 bucket before syncing.')
    db = {**db, 'remote': False, 'migrations_dir': str(APP / 'migrations')}
    worker_config = {
        'name': 'ght-local-media-copy', 'account_id': account_id, 'main': str(WORKER),
        'compatibility_date': config['compatibility_date'], 'd1_databases': [db],
        'r2_buckets': [{**bucket, 'binding': 'PRODUCTION', 'remote': True},
                       {**bucket, 'binding': 'LOCAL', 'remote': False}],
    }
    return db, bucket, worker_config


def run_wrangler(args, account_id, *, timeout=600):
    env = {**os.environ, 'CLOUDFLARE_ACCOUNT_ID': account_id, 'CI': '1'}
    result = subprocess.run([str(WRANGLER), *args], cwd=APP, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Wrangler failed: {result.stderr[-2000:]}')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def request_copy(base, token, key=None):
    data = None if key is None else json.dumps({'key': key}).encode()
    request = urllib.request.Request(base, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'
    }, method='GET' if key is None else 'POST')
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def copy_one(base, token, key):
    for attempt in range(3):
        try:
            request_copy(base, token, key)
            return None
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return 'missing'
            reason = f'HTTP {error.code}'
        except (OSError, urllib.error.URLError, ValueError) as error:
            reason = type(error).__name__
        if attempt < 2:
            time.sleep(0.5 * (attempt + 1))
    return reason


def copy_media(keys, config, stage, account_id):
    token = secrets.token_urlsafe(32)
    port = free_port()
    config_path = stage.parent / 'wrangler.json'
    config_path.write_text(json.dumps(config), encoding='utf-8')
    config_path.chmod(0o600)
    # This file belongs to the temporary config, not the app; it is removed afterwards.
    dev_vars = stage.parent / '.dev.vars'
    dev_vars.write_text('SYNC_TOKEN=' + token + '\n', encoding='utf-8')
    dev_vars.chmod(0o600)
    env = {**os.environ, 'CLOUDFLARE_ACCOUNT_ID': account_id, 'CI': '1'}
    cmd = [str(WRANGLER), 'dev', '--config', str(config_path), '--persist-to', str(stage),
           '--ip', '127.0.0.1', '--port', str(port), '--inspector-port', str(free_port())]
    base = f'http://127.0.0.1:{port}/'
    with (stage.parent / 'wrangler.log').open('w+', encoding='utf-8') as log:
        process = subprocess.Popen(cmd, cwd=APP, env=env, stdout=log, stderr=log)
        try:
            for _ in range(240):
                if process.poll() is not None:
                    raise RuntimeError('The temporary Wrangler Worker could not start.')
                try:
                    request_copy(base, token)
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.25)
            else:
                raise RuntimeError('Timed out starting the temporary Wrangler Worker.')
            failures = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures = {pool.submit(copy_one, base, token, key): key for key in keys}
                for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
                    reason = future.result()
                    if reason:
                        failures.append((futures[future], reason))
                    if index % 100 == 0 or index == len(keys):
                        print(f'Checked {index}/{len(keys)} media objects; {len(failures)} failed.', flush=True)
            if failures:
                details = ', '.join(f'{key} ({reason})' for key, reason in failures[:20])
                raise RuntimeError(f'{len(failures)} media objects could not be copied: {details}. Local data was not replaced.')
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def replace_state(stage, state=LOCAL_STATE):
    """Move old state into an ignored backup and install the verified state."""
    if running_local_server():
        raise RuntimeError('Stop all local Wrangler development servers before replacing local data.')
    backups = state.parent / 'state-backups'
    backups.mkdir(mode=0o700, parents=True, exist_ok=True)
    backups.chmod(0o700)
    backup = backups / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4))
    had_state = state.exists()
    if had_state:
        state.rename(backup)
    try:
        stage.rename(state)
    except BaseException:
        if had_state:
            backup.rename(state)
        raise
    return backup if had_state else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account-id', default=os.environ.get('CLOUDFLARE_ACCOUNT_ID'),
                        help='Cloudflare account ID (or set CLOUDFLARE_ACCOUNT_ID)')
    parser.add_argument('--verify-only', action='store_true',
                        help='Perform the complete transfer and checks, then discard the staged copy')
    args = parser.parse_args(argv)
    if not args.account_id or not re.fullmatch(r'[0-9a-fA-F]{32}', args.account_id):
        parser.error('Provide your 32-character Cloudflare account ID with --account-id or CLOUDFLARE_ACCOUNT_ID.')
    if not WRANGLER.is_file():
        parser.error('Install dependencies in app/ first: npm install')
    try:
        if not args.verify_only and running_local_server():
            raise RuntimeError('Stop all local Wrangler development servers before syncing.')
        db, bucket, config = read_config(args.account_id)
        state_parent = LOCAL_STATE.parent
        state_parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='ght-sync-', dir=state_parent) as temp:
            root = Path(temp)
            stage = root / 'state'
            exported, ordered = root / 'production.sql', root / 'ordered.sql'
            print(f"Exporting D1 {db['database_name']} and copying R2 {bucket['bucket_name']}.", flush=True)
            run_wrangler(['d1','export',db['database_name'],'--remote','--output',str(exported),
                          '--skip-confirmation'], args.account_id)
            exported.chmod(0o600)
            reorder_export(exported.read_text(encoding='utf-8'), ordered)
            print('Importing into isolated local storage…', flush=True)
            run_wrangler(['d1','execute',db['database_name'],'--local','--persist-to',str(stage),
                          '--file',str(ordered)], args.account_id)
            keys, counts = inspect_database(stage)
            print(f"Imported {counts['projects']} projects, {counts['properties']} properties; {len(keys)} media objects to copy.", flush=True)
            if keys:
                copy_media(keys, config, stage, args.account_id)
            if args.verify_only:
                print('Verification succeeded; staged data was discarded. Local state is unchanged.')
            else:
                backup = replace_state(stage)
                print(f'Local D1 and R2 replaced successfully. Backup: {backup or "none (no previous state)"}')
    except (OSError, ValueError, RuntimeError, sqlite3.Error, subprocess.TimeoutExpired) as error:
        parser.exit(1, f'Sync failed: {error}\n')


if __name__ == '__main__':
    main()
