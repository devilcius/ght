#!/usr/bin/env python3
"""Generate missing local portfolio thumbnails; never connects to a remote server."""
import argparse
import io
import json
import sys
import urllib.error
import urllib.request
from PIL import Image, ImageOps


def request(base, path, method='GET', data=None, content_type=None):
    headers = {'Origin':base}
    if content_type: headers['Content-Type'] = content_type
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req,timeout=30) as response: return response.read()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8787)
    args=parser.parse_args()
    if not 1 <= args.port <= 65535: parser.error('Port out of range')
    base=f'http://127.0.0.1:{args.port}'
    projects=json.loads(request(base,'/api/admin/projects'))
    created=skipped=failed=0
    for project in projects:
        detail=json.loads(request(base,'/api/admin/projects/'+project['id']))
        for image in detail['images']:
            if image['thumbnail_key']:
                skipped+=1
                continue
            try:
                original=request(base,'/media/'+image['object_key'])
                with Image.open(io.BytesIO(original)) as loaded:
                    picture=ImageOps.exif_transpose(loaded)
                    picture.thumbnail((800,800),Image.Resampling.LANCZOS)
                    if picture.mode not in ('RGB','RGBA'): picture=picture.convert('RGBA' if 'transparency' in picture.info else 'RGB')
                    output=io.BytesIO();picture.save(output,format='WEBP',quality=80,method=4)
                request(base,f"/api/admin/projects/{project['id']}/images/{image['id']}/thumbnail",'PUT',output.getvalue(),'image/webp')
                created+=1
            except (OSError,ValueError,urllib.error.URLError) as error:
                failed+=1
                print(f"Failed image {image['id']}: {error}",file=sys.stderr)
        print(f"Project {project['id']}: {created} generated, {skipped} already present, {failed} failed",file=sys.stderr,flush=True)
    print(json.dumps({'created':created,'skipped':skipped,'failed':failed}))
    if failed: sys.exit(1)

if __name__ == '__main__':main()
