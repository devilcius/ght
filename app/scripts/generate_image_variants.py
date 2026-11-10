#!/usr/bin/env python3
"""Create missing responsive versions through a local Wrangler server."""
import argparse
import concurrent.futures
import io
import json
import sys
import urllib.request
from PIL import Image, ImageOps


def request(base, path, method='GET', data=None, headers=None):
    all_headers = {'Origin': base, **(headers or {})}
    req = urllib.request.Request(base + path, data=data, headers=all_headers, method=method)
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()


def variants_for(image, existing=frozenset()):
    """Yield distinct responsive sizes without enlarging the source image."""
    image = ImageOps.exif_transpose(image)
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    for width in sorted({min(target, image.width) for target in (480, 960, 1600)}):
        if width in existing:
            yield width, None, None
            continue
        height = max(1, round(image.height * width / image.width))
        if height > 10000:
            raise ValueError('Image is too tall to create an optimized version')
        resized = image.resize((width, height), Image.Resampling.LANCZOS) if width != image.width else image
        for quality in (80, 65, 50):
            output = io.BytesIO()
            resized.save(output, format='WEBP', quality=quality, method=4)
            if output.tell() <= 2 * 1024 * 1024:
                break
        if output.tell() > 2 * 1024 * 1024:
            raise ValueError('Unable to reduce the optimized image below 2 MiB')
        yield width, height, output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--workers', type=int, default=3, help='Number of images to process at once (1–4)')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port out of range')
    if not 1 <= args.workers <= 4:
        parser.error('Workers must be between 1 and 4')
    base = f'http://127.0.0.1:{args.port}'
    created = skipped = failed = 0
    jobs = []
    for kind in ('projects', 'properties'):
        owners = json.loads(request(base, '/api/admin/' + kind))
        for owner in owners:
            detail = json.loads(request(base, f"/api/admin/{kind}/{owner['id']}"))
            for image in detail['images']:
                jobs.append((kind, owner['id'], image))

    def process(job):
        kind, owner_id, image = job
        existing = {v['width'] for v in image.get('variants', [])}
        if {480, 960, 1600}.issubset(existing):
            return 0, 3
        original = request(base, '/media/' + image['object_key'])
        made = already = 0
        with Image.open(io.BytesIO(original)) as source:
            for width, height, content in variants_for(source, existing):
                if width in existing:
                    already += 1
                    continue
                request(base, f"/api/admin/{kind}/{owner_id}/images/{image['id']}/variants/{width}", 'PUT', content, {'Content-Type':'image/webp','X-Image-Height':str(height)})
                made += 1
        return made, already

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(process, job): job for job in jobs}
        for index, future in enumerate(concurrent.futures.as_completed(pending), 1):
            try:
                made, already = future.result()
                created += made
                skipped += already
            except Exception as error:
                failed += 1
                kind, _, image = pending[future]
                print(f"Failed {kind} image {image['id']}: {error}", file=sys.stderr, flush=True)
            if index % 20 == 0 or index == len(jobs):
                print(f"{index}/{len(jobs)} images: {created} created, {skipped} present, {failed} failed", file=sys.stderr, flush=True)
    print(json.dumps({'created':created,'skipped':skipped,'failed':failed}))
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
