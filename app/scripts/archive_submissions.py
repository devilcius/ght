#!/usr/bin/env python3
"""Preserve WordPress Elementor submissions in a private local SQLite archive."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_DIR = ROOT / 'private-archive'
TABLES = {
    'e_submissions': ['id', 'type', 'hash_id', 'main_meta_id', 'post_id', 'referer', 'referer_title', 'element_id', 'form_name', 'campaign_id', 'user_id', 'user_ip', 'user_agent', 'actions_count', 'actions_succeeded_count', 'status', 'is_read', 'meta', 'created_at_gmt', 'updated_at_gmt', 'created_at', 'updated_at'],
    'e_submissions_values': ['id', 'submission_id', 'key', 'value'],
    'e_submissions_actions_log': ['id', 'submission_id', 'action_name', 'action_label', 'status', 'log', 'created_at_gmt', 'updated_at_gmt', 'created_at', 'updated_at'],
}


def rows(source, table):
    """Decode MariaDB extended INSERTs; retain the distinction between SQL NULL and 'NULL'."""
    pattern = re.compile(r'INSERT INTO `wq5aC_' + re.escape(table) + r'` VALUES\s*')
    for match in pattern.finditer(source):
        i = match.end()
        row, value = [], []
        quoted = escaped = active = field_quoted = False
        while i < len(source):
            c = source[i]
            i += 1
            if quoted:
                if escaped:
                    value.append({'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a', 'b': '\b'}.get(c, c))
                    escaped = False
                elif c == '\\':
                    escaped = True
                elif c == "'":
                    if i < len(source) and source[i] == "'":
                        value.append("'")
                        i += 1
                    else:
                        quoted = False
                else:
                    value.append(c)
            elif c == "'":
                quoted = field_quoted = True
            elif c == '(' and not active:
                row, value, active, field_quoted = [], [], True, False
            elif c in ',)' and active:
                field = ''.join(value)
                if not field_quoted:
                    field = field.strip()
                    field = None if field.upper() == 'NULL' else field
                if field is not None:
                    field.encode('utf-8', 'strict')  # Reject invalid text instead of silently altering it.
                row.append(field)
                value, field_quoted = [], False
                if c == ')':
                    yield row
                    active = False
            elif c == ';' and not active:
                break
            elif active:
                value.append(c)
        else:
            raise ValueError(f'Unterminated INSERT statement in {table}')


def write_archive(dump, archive_dir=ARCHIVE_DIR):
    raw = dump.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    # The dump contains non-UTF-8 bytes in unrelated tables; fail if they occur in a preserved field.
    source = raw.decode('utf-8', errors='surrogateescape')
    archive_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(archive_dir, 0o700)
    dest = archive_dir / f'contact-submissions-{digest}.sqlite3'
    if dest.exists():
        raise FileExistsError(f'An archive for this exact dump already exists: {dest.name}. It was not changed.')
    fd, name = tempfile.mkstemp(prefix='.submissions-', suffix='.tmp', dir=archive_dir)
    os.fchmod(fd, 0o600)
    os.close(fd)
    temp = Path(name)
    counts = {}
    try:
        with sqlite3.connect(temp) as conn:
            conn.execute('CREATE TABLE archive_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            for table, columns in TABLES.items():
                conn.execute('CREATE TABLE "' + table + '" (' + ', '.join('"' + c + '" TEXT' for c in columns) + ')')
                statement = 'INSERT INTO "' + table + '" VALUES (' + ','.join('?' for _ in columns) + ')'
                count = 0
                for row in rows(source, table):
                    if len(row) != len(columns):
                        raise ValueError(f'{table}: expected {len(columns)} columns, got {len(row)}')
                    conn.execute(statement, row)
                    count += 1
                counts[table] = count
            for key, value in {'source_sha256': digest, 'format_version': '1', **{f'count_{k}': str(v) for k, v in counts.items()}}.items():
                conn.execute('INSERT INTO archive_info VALUES (?, ?)', (key, value))
            for table in ('e_submissions_values', 'e_submissions_actions_log'):
                missing = conn.execute(f'SELECT COUNT(*) FROM "{table}" t LEFT JOIN e_submissions s ON t.submission_id = s.id WHERE s.id IS NULL').fetchone()[0]
                if missing:
                    raise ValueError(f'{table}: {missing} orphan rows; no archive was created')
            if conn.execute('SELECT COUNT(DISTINCT id) FROM e_submissions').fetchone()[0] != counts['e_submissions']:
                raise ValueError('Duplicate submission IDs; no archive was created')
            if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('SQLite integrity check failed')
            date_range = conn.execute('SELECT MIN(created_at_gmt), MAX(created_at_gmt) FROM e_submissions').fetchone()
        # Atomic creation; never replace an earlier archive if another run wins the race.
        os.link(temp, dest)
        return {'archive': str(dest), 'source_sha256': digest, 'counts': counts, 'created_at_gmt_min': date_range[0], 'created_at_gmt_max': date_range[1]}
    finally:
        temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', type=Path, help='Path to the source SQL dump')
    args = parser.parse_args()
    dumps = list((ROOT / 'db').glob('*.sql')) if not args.dump else [args.dump]
    if len(dumps) != 1:
        parser.error('Specify --dump when db/ does not contain exactly one SQL dump')
    try:
        print(json.dumps(write_archive(dumps[0]), indent=2))
    except (FileExistsError, ValueError, UnicodeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'Archive not created: {error}\n')


if __name__ == '__main__':
    main()
