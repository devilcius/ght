#!/usr/bin/env python3
"""Run the image backfill against the configured remote D1/R2 through a loopback-only Worker."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

APP = Path(__file__).resolve().parents[1]


def parse_jsonc(text):
    """Read Wrangler JSONC without altering comment-like text inside strings."""
    out = []
    index = 0
    quoted = escaped = False
    while index < len(text):
        char = text[index]
        if quoted:
            out.append(char)
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
            out.append(char)
        elif text.startswith('//', index):
            end = text.find('\n', index + 2)
            index = len(text) if end == -1 else end - 1
        elif text.startswith('/*', index):
            end = text.find('*/', index + 2)
            if end == -1:
                raise ValueError('Unterminated JSONC comment.')
            out.append(' ')
            index = end + 1
        else:
            out.append(char)
        index += 1
    clean = ''.join(out)
    result = []
    quoted = escaped = False
    for index, char in enumerate(clean):
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == ',' and clean[index + 1:].lstrip().startswith(('}', ']')):
            continue
        result.append(char)
    return json.loads(''.join(result))


def make_config(config, account_id):
    databases = [x for x in config.get('d1_databases', []) if x.get('binding') == 'DB']
    buckets = [x for x in config.get('r2_buckets', []) if x.get('binding') == 'MEDIA']
    if len(databases) != 1 or len(buckets) != 1:
        raise ValueError('Expected exactly one DB binding and one MEDIA binding.')
    db, bucket = databases[0], buckets[0]
    if not db.get('database_name') or not db.get('database_id') or db['database_id'] == 'local-placeholder' or not bucket.get('bucket_name'):
        raise ValueError('Configure a real database_name, database_id and bucket_name in app/wrangler.jsonc first.')
    return {'name':'ght-variant-backfill', 'account_id':account_id, 'main':str(APP/'src/index.js'),
            'compatibility_date':config['compatibility_date'],
            'assets':{'directory':str(APP/'public'),'binding':'ASSETS','run_worker_first':True},
            'd1_databases':[{**db,'remote':True,'migrations_dir':str(APP/'migrations')}],
            'r2_buckets':[{**bucket,'remote':True}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account-id', required=True, help='Cloudflare account ID containing the configured database and bucket')
    parser.add_argument('--execute', action='store_true', help='Acknowledge that optimized files and metadata will be written to live D1/R2')
    args = parser.parse_args()
    if not args.execute:
        parser.error('Pass --execute to write optimized variants to the configured remote D1/R2.')
    if len(args.account_id) != 32 or any(c not in '0123456789abcdefABCDEF' for c in args.account_id):
        parser.error('Provide a 32-character Cloudflare account ID.')
    try:
        config = parse_jsonc((APP/'wrangler.jsonc').read_text())
        temporary = make_config(config, args.account_id)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Invalid Wrangler configuration: {error}\n')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='ght-remote-variants-') as directory:
        path = Path(directory)/'wrangler.json'
        path.write_text(json.dumps(temporary), encoding='utf-8')
        os.chmod(path, 0o600)
        command = [str(APP/'node_modules/.bin/wrangler'), 'dev', '--config', str(path), '--ip', '127.0.0.1', '--port', str(port), '--var', 'LOCAL_DEVELOPMENT:true']
        print(f"Target database: {temporary['d1_databases'][0]['database_name']}; bucket: {temporary['r2_buckets'][0]['bucket_name']}. Connecting…", flush=True)
        with open(Path(directory)/'wrangler.log','w+') as log:
            process = subprocess.Popen(command,cwd=APP,stdout=log,stderr=log)
            try:
                base=f'http://127.0.0.1:{port}'
                for _ in range(300):
                    if process.poll() is not None:
                        log.flush();log.seek(0)
                        raise RuntimeError('Wrangler failed to start:\n'+log.read()[-4000:])
                    try:
                        with urllib.request.urlopen(base+'/api/admin/projects',timeout=2) as response:
                            json.load(response)
                        break
                    except urllib.error.HTTPError as error:
                        if error.code == 400:
                            raise RuntimeError('Database query failed. Apply the image-variants D1 migration remotely before running this script.') from error
                        time.sleep(.2)
                    except OSError:
                        time.sleep(.2)
                else:
                    raise RuntimeError('Timed out connecting to the temporary local Worker.')
                subprocess.run([sys.executable,str(APP/'scripts/generate_image_variants.py'),'--port',str(port)],cwd=APP,check=True)
            finally:
                process.terminate()
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired: process.kill();process.wait()


if __name__ == '__main__':
    try: main()
    except (RuntimeError, subprocess.CalledProcessError) as error: sys.exit(str(error))
