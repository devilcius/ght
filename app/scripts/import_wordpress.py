#!/usr/bin/env python3
"""Inspect or import selected WordPress projects into the local GHT development server."""
import argparse
import collections
import hashlib
import json
import mimetypes
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]


def sql_rows(source, table):
    """Read extended INSERT tuples, decoding MySQL string escapes without executing SQL."""
    pattern = re.compile(r'INSERT INTO `wq5aC_' + re.escape(table) + r'` VALUES\s*')
    for match in pattern.finditer(source):
        i = match.end()
        row, value, quoted, escaped, active = [], '', False, False, False
        while i < len(source):
            c = source[i]
            i += 1
            if quoted:
                if escaped:
                    value += {'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a'}.get(c, c)
                    escaped = False
                elif c == '\\':
                    escaped = True
                elif c == "'":
                    quoted = False
                else:
                    value += c
            elif c == "'":
                quoted = True
            elif c == '(':
                row, value, active = [], '', True
            elif c == ',' and active:
                row.append(value)
                value = ''
            elif c == ')' and active:
                row.append(value)
                yield row
                active = False
            elif c == ';' and not active:
                break
            elif active:
                value += c
        else:
            raise ValueError(f'Unterminated INSERT in {table}')


def load(source, uploads):
    posts = list(sql_rows(source, 'posts'))
    projects = {p[0]: p for p in posts if p[20] == 'proyectos' and p[7] == 'publish'}
    attachments = {p[0]: p for p in posts if p[20] == 'attachment'}
    metadata = collections.defaultdict(dict)
    for row in sql_rows(source, 'postmeta'):
        if row[1] in projects or row[1] in attachments:
            metadata[row[1]][row[2]] = row[3]
    terms = {r[0]: r[1] for r in sql_rows(source, 'terms')}
    taxonomies = {r[0]: terms.get(r[1], '') for r in sql_rows(source, 'term_taxonomy') if r[2] == 'categoria_proyectos'}
    categories = collections.defaultdict(list)
    for row in sql_rows(source, 'term_relationships'):
        if row[0] in projects and row[1] in taxonomies:
            categories[row[0]].append(taxonomies[row[1]])
    output = []
    for pid, post in projects.items():
        meta = metadata[pid]
        warnings, images = [], []
        try:
            gallery_count = int(meta.get('galeria') or 0)
        except ValueError:
            gallery_count = 0
            warnings.append('invalid gallery count')
        for position in range(gallery_count):
            attachment_id = meta.get(f'galeria_{position}_item_imagen', '')
            if not attachment_id:
                warnings.append(f'gallery slot {position + 1} is empty')
                continue
            if attachment_id not in attachments:
                warnings.append(f'gallery slot {position + 1}: missing attachment {attachment_id}')
                continue
            relative = metadata[attachment_id].get('_wp_attached_file', '')
            resolved = (uploads / relative).resolve()
            if not relative or not resolved.is_relative_to(uploads.resolve()) or not resolved.is_file():
                warnings.append(f'gallery slot {position + 1}: missing file for attachment {attachment_id}')
                continue
            mime = mimetypes.guess_type(resolved.name)[0]
            if mime not in ('image/jpeg', 'image/png', 'image/webp'):
                warnings.append(f'gallery slot {position + 1}: unsupported file type for attachment {attachment_id}')
                continue
            if resolved.stat().st_size > 10 * 1024 * 1024:
                warnings.append(f'gallery slot {position + 1}: file exceeds 10 MB for attachment {attachment_id}')
                continue
            images.append({'attachment_id': attachment_id, 'position': position, 'path': relative, 'alt': metadata[attachment_id].get('_wp_attachment_image_alt', ''), 'mime': mime})
        assigned = categories[pid]
        if len(assigned) > 1:
            warnings.append('multiple categories: ' + ', '.join(assigned))
        if not assigned:
            warnings.append('no project category assigned')
        if meta.get('situacion__', '').casefold() in {x.casefold() for x in assigned}:
            warnings.append('location appears to repeat category; review manually')
        featured_id = meta.get('_thumbnail_id', '')
        if featured_id and featured_id not in [image['attachment_id'] for image in images]:
            warnings.append(f'featured image {featured_id} is not in resolved gallery')
        output.append({'featured_attachment_id': featured_id, 'wordpress_id': pid, 'title': post[5], 'slug': post[11], 'category': assigned[0] if assigned else '', 'location': meta.get('situacion__', ''), 'year': meta.get('ano', ''), 'description': '', 'published': True, 'gallery_slots': gallery_count, 'images': images, 'warnings': warnings})
    return output


def request(url, method='GET', data=None, content_type=None):
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    if parsed.hostname != '127.0.0.1' or parsed.scheme != 'http':
        raise ValueError('Imports are restricted to 127.0.0.1 over HTTP')
    headers = {'Origin': f'{parsed.scheme}://{parsed.netloc}'}
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Local API returned {error.code}: {error.read().decode()}') from error


def upload(base, project_id, image, uploads):
    boundary = uuid.uuid4().hex
    content = (uploads / image['path']).read_bytes()
    payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n{image["alt"]}\r\n'
               f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="image"\r\nContent-Type: {image["mime"]}\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    return request(f'{base}/api/admin/projects/{project_id}/images', 'POST', payload, f'multipart/form-data; boundary={boundary}')


def verify_existing(base, detail, project, uploads):
    """Only resume or update a legacy sample when source fields and existing images match."""
    for key in ('title', 'slug', 'category', 'location', 'year', 'description'):
        if detail[key] != project[key]:
            return False, f'field {key} differs'
    actual = detail['images']
    if len(actual) > len(project['images']):
        return False, 'extra gallery images'
    for current, source in zip(actual, project['images']):
        if current['alt'] != source['alt']:
            return False, 'image alt text differs'
        with urllib.request.urlopen(base + '/media/' + current['object_key'], timeout=30) as response:
            existing_hash = hashlib.sha256(response.read()).digest()
        source_hash = hashlib.sha256((uploads / source['path']).read_bytes()).digest()
        if existing_hash != source_hash:
            return False, 'gallery contents or order differ'
    return True, ''


def set_cover(base, project_id, project, images):
    featured = project['featured_attachment_id']
    if not featured:
        return
    for source, target in zip(project['images'], images):
        if source['attachment_id'] == featured:
            request(f'{base}/api/admin/projects/{project_id}/cover', 'PUT', json.dumps({'imageId': target['id']}).encode(), 'application/json')
            return
    raise RuntimeError(f'Featured attachment {featured} is not present in the gallery')


def import_project(base, project, uploads, existing):
    slug = project['slug']
    previous = existing.get(slug)
    project_id = 'wp-' + project['wordpress_id']
    payload = {k: project[k] for k in ('title', 'slug', 'category', 'location', 'year', 'description')}
    if previous:
        detail = request(base + '/api/admin/projects/' + previous['id'])
        if previous['id'] != project_id:
            # The earlier sample has random IDs. Only set its cover when all data still matches.
            matches, why = verify_existing(base, detail, project, uploads)
            if not matches or len(detail['images']) != len(project['images']) or detail['cover_image_id']:
                return 'skipped existing project; unchanged' + (f' ({why})' if why else '')
            set_cover(base, detail['id'], project, detail['images'])
            return 'existing verified sample; featured cover restored'
        if detail['published']:
            return 'already imported; existing published project unchanged'
        matches, why = verify_existing(base, detail, project, uploads)
        if not matches:
            return f'skipped modified draft; unchanged ({why})'
        images = detail['images']
    else:
        payload.update({'published': False, 'importId': project_id})
        request(base + '/api/admin/projects', 'POST', json.dumps(payload).encode(), 'application/json')
        images = []
    # The gallery itself is the checkpoint: a request can succeed even if its response is lost.
    for image in project['images'][len(images):]:
        result = upload(base, project_id, image, uploads)
        images.append({'id': result['id']})
    set_cover(base, project_id, project, images)
    payload['published'] = True
    request(base + '/api/admin/projects/' + project_id, 'PUT', json.dumps(payload).encode(), 'application/json')
    return 'imported and published'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', type=Path, default=next((ROOT / 'db').glob('*.sql')))
    parser.add_argument('--uploads', type=Path, default=ROOT / 'ght/wp-content/uploads')
    parser.add_argument('--ids', nargs='+', help='WordPress project IDs; default: inspect all')
    parser.add_argument('--all', action='store_true', help='Explicitly select all projects for import')
    parser.add_argument('--port', type=int, default=8787, help='Local Wrangler port (default: 8787)')
    parser.add_argument('--import-local', action='store_true', help='Import into local Wrangler only')
    args = parser.parse_args()
    if args.import_local and not args.ids and not args.all:
        parser.error('--import-local requires explicit --ids or --all')
    if args.all and args.ids:
        parser.error('Use --all or --ids, not both')
    if not 1 <= args.port <= 65535:
        parser.error('Port out of range')
    projects = load(args.dump.read_text(encoding='utf-8', errors='replace'), args.uploads)
    selected = [p for p in projects if not args.ids or p['wordpress_id'] in args.ids]
    if args.ids and set(args.ids) != {p['wordpress_id'] for p in selected}:
        parser.error('One or more project IDs were not found among published projects')
    if args.import_local:
        base = f'http://127.0.0.1:{args.port}'
        existing = {p['slug']: p for p in request(base + '/api/admin/projects')}
        for project in selected:
            try:
                project['import_status'] = import_project(base, project, args.uploads, existing)
                print(f"{project['wordpress_id']}: {project['import_status']}", file=sys.stderr, flush=True)
            except Exception as error:
                project['import_status'] = f'failed: {error}'
                print(f"{project['wordpress_id']}: {project['import_status']}; rerun to resume", file=sys.stderr)
                raise
    summary = {'total_published_projects': len(projects), 'selected_projects': len(selected), 'gallery_slots': sum(p['gallery_slots'] for p in selected), 'resolved_images': sum(len(p['images']) for p in selected), 'projects_with_warnings': sum(bool(p['warnings']) for p in selected), 'projects': selected}
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
