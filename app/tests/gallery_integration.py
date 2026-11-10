#!/usr/bin/env python3
"""Exercise gallery management against isolated Wrangler D1/R2 state."""
import base64
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET

APP = Path(__file__).resolve().parents[1]
WRANGLER = str(APP / 'node_modules/.bin/wrangler')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xz0sAAAAASUVORK5CYII=')
WEBP = base64.b64decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def call(base, path, method='GET', body=None, content_type=None, origin=None):
    headers = {'Origin': origin or base}
    target = base
    if base.startswith('http://public.test:'):
        headers['Host'] = base.removeprefix('http://')
        target = base.replace('http://public.test:', 'http://127.0.0.1:', 1)
    if content_type:
        headers['Content-Type'] = content_type
    request = urllib.request.Request(target + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def send_json(base, path, method, payload):
    return call(base, path, method, json.dumps(payload).encode(), 'application/json')


def upload(base, project_id, alt):
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n{alt}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n').encode() + PNG + f'\r\n--{boundary}--\r\n'.encode()
    status, data, _ = call(base, f'/api/admin/projects/{project_id}/images', 'POST', body, f'multipart/form-data; boundary={boundary}')
    assert status == 201, (status, data)
    return json.loads(data)['id']


def main():
    with tempfile.TemporaryDirectory(prefix='ght-gallery-test-') as state:
        subprocess.run([WRANGLER, 'd1', 'migrations', 'apply', 'ght', '--local', '--persist-to', state], cwd=APP, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
        admin_port = free_port()
        processes = []
        log = open(Path(state) / 'wrangler.log', 'w+')
        try:
            cmd = [WRANGLER, 'dev', '--local', '--port', str(admin_port), '--inspector-port', str(free_port()), '--persist-to', state, '--var', 'LOCAL_DEVELOPMENT:true']
            processes.append(subprocess.Popen(cmd, cwd=APP, stdout=log, stderr=log))
            # An alternate Host header exercises the non-local authentication path on the same instance.
            admin, public = f'http://127.0.0.1:{admin_port}', f'http://public.test:{admin_port}'
            for base in (admin, public):
                for _ in range(100):
                    try:
                        call(base, '/')
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.1)
                else:
                    log.flush()
                    log.seek(0)
                    raise RuntimeError('Local Worker failed to start:\n' + log.read())
            project = {'title':'Gallery test','slug':'gallery-test','category':'Residencial','published':False}
            status, data, _ = send_json(admin, '/api/admin/projects', 'POST', project)
            assert status == 201, data
            pid = json.loads(data)['id']
            first, second = upload(admin, pid, 'Primera'), upload(admin, pid, 'Segunda')
            path = f'/api/admin/projects/{pid}'
            detail = json.loads(call(admin, path)[1]); objects = {x['id']:x['object_key'] for x in detail['images']}
            assert call(public, path)[0] == 401
            assert call(public, '/proyectos/gallery-test')[0] == 404
            assert call(public, '/media/' + objects[first])[0] == 404
            assert b'/proyectos/gallery-test' not in call(admin, '/sitemap.xml')[1]
            assert b'Disallow: /admin' in call(admin, '/robots.txt')[1]
            assert b'Disallow: /api/' in call(admin, '/robots.txt')[1]
            assert b'Disallow: /\n' in call(public, '/robots.txt')[1]
            assert send_json(admin, path+'/images/'+first, 'PATCH', {'alt':'Vista del patio'})[0] == 200
            assert send_json(admin, path+'/images/'+first, 'PATCH', {'alt':'x'*301})[0] == 400
            assert call(admin, path+'/images/'+first+'/thumbnail', 'PUT', b'not webp', 'image/webp')[0] == 400
            assert call(admin, path+'/images/'+first+'/thumbnail', 'PUT', WEBP, 'image/webp')[0] == 200
            detail = json.loads(call(admin, path)[1]); thumb = next(x['thumbnail_key'] for x in detail['images'] if x['id'] == first)
            assert call(public, '/media/'+thumb)[0] == 404
            assert call(admin, path+'/images/'+first+'/variants/1', 'PUT', WEBP, 'image/webp')[0] == 400
            req = urllib.request.Request(admin+path+'/images/'+first+'/variants/1', data=WEBP, method='PUT', headers={'Origin':admin,'Content-Type':'image/webp','X-Image-Height':'1'})
            with urllib.request.urlopen(req) as response: assert response.status == 200
            detail = json.loads(call(admin, path)[1]); variant = next(x['variants'][0]['object_key'] for x in detail['images'] if x['id'] == first)
            assert call(public, '/media/'+variant)[0] == 404
            assert send_json(admin, path+'/order', 'PUT', {'ids':[second,first]})[0] == 200
            assert send_json(admin, path+'/cover', 'PUT', {'imageId':first})[0] == 200
            project['published'] = True
            assert send_json(admin, path, 'PUT', project)[0] == 200
            status, page, _ = call(public, '/proyectos/gallery-test')
            assert status == 200 and b'Vista del patio' in page
            assert b'Gallery test' in page and b'property="og:image"' in page
            assert b'https://ghtarquitectura.com/proyectos/gallery-test' in page
            assert b'content="noindex,nofollow"' in page  # Preview host differs from canonical.
            local_page = call(admin, '/proyectos/gallery-test')[1]
            assert f'{admin}/proyectos/gallery-test'.encode() in local_page
            assert b'content="index,follow"' in local_page
            assert b'property="og:image"' in local_page and objects[first].encode() in local_page
            sitemap = call(admin, '/sitemap.xml')[1]
            paths = [entry.text for entry in ET.fromstring(sitemap).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
            assert f'{admin}/proyectos/gallery-test' in paths and f'{admin}/admin' not in paths
            assert b'content="noindex,nofollow"' in call(admin, '/admin')[1]
            assert b'content="noindex,nofollow"' in call(admin, '/?categoria=Residencial')[1]
            gallery = page.split(b'<div class="gallery">', 1)[1]
            assert gallery.index(objects[second].encode()) < gallery.index(variant.encode())
            status, _, headers = call(public, '/media/'+objects[first]); assert status == 200 and headers['Cache-Control'] == 'private, no-cache'
            assert variant.encode() in call(public, '/')[1]
            status, _, headers = call(public, '/media/'+variant); assert status == 200
            etag = headers['ETag']
            req = urllib.request.Request(f'http://127.0.0.1:{admin_port}/media/{variant}',headers={'Host':f'public.test:{admin_port}','If-None-Match':etag})
            try: urllib.request.urlopen(req); raise AssertionError('Expected 304')
            except urllib.error.HTTPError as error: assert error.code == 304
            # A project cannot edit or delete another project's image.
            status, data, _ = send_json(admin, '/api/admin/projects', 'POST', {'title':'Other','slug':'other','category':'Dotacional','published':True}); other = json.loads(data)['id']
            filtered = call(public, '/?categoria=Residencial')[1]
            assert b'gallery-test' in filtered and b'/proyectos/other' not in filtered
            assert b'aria-current="page"' in filtered
            assert b'/proyectos/other' in call(public, '/?categoria=Dotacional')[1]
            # Ordering is global and retained when an unrelated project update omits it.
            project['display_order'] = 2
            assert send_json(admin, path, 'PUT', project)[0] == 200
            other_path = f'/api/admin/projects/{other}'
            other_data = {'title':'Other','slug':'other','category':'Dotacional','published':True,'display_order':1}
            assert send_json(admin, other_path, 'PUT', other_data)[0] == 200
            assert call(public, '/')[1].index(b'/proyectos/other') < call(public, '/')[1].index(b'/proyectos/gallery-test')
            del other_data['display_order']
            assert send_json(admin, other_path, 'PUT', other_data)[0] == 200
            assert json.loads(call(admin, other_path)[1])['display_order'] == 1
            assert send_json(admin, other_path, 'PUT', {**other_data, 'display_order': '-1'})[0] == 400
            assert send_json(admin, other_path, 'PUT', {**other_data, 'display_order': ''})[0] == 200
            assert json.loads(call(admin, other_path)[1])['display_order'] is None
            assert call(admin, f'/api/admin/projects/{other}/images/{first}', 'DELETE')[0] == 404
            assert call(admin, path+'/images/'+first, 'DELETE')[0] == 200
            detail = json.loads(call(admin, path)[1]); assert detail['cover_image_id'] is None and len(detail['images']) == 1
            assert call(public, '/media/'+objects[first])[0] == 404
            assert call(public, '/media/'+thumb)[0] == 404
            assert call(public, '/media/'+variant)[0] == 404
            assert objects[second].encode() in call(public, '/')[1]
            project['published'] = False
            assert send_json(admin, path, 'PUT', project)[0] == 200
            assert call(public, '/proyectos/gallery-test')[0] == 404
            assert call(public, '/media/'+objects[second])[0] == 404
            assert b'/proyectos/gallery-test' not in call(admin, '/sitemap.xml')[1]
            assert call(admin, '/media/'+objects[second])[0] == 200
            assert call(public, path+'/images/'+second, 'DELETE')[0] == 401
            # Property publication, gallery and enquiry workflow uses isolated data.
            listing = {'title':'Piso de prueba','slug':'piso-prueba','operation':'sale','availability':'available','location':'Madrid','price_eur':'250000','area_m2':'80','bedrooms':'2','bathrooms':'1','description':'Piso de prueba','published':False}
            status, data, _ = send_json(admin, '/api/admin/properties', 'POST', listing)
            assert status == 201, data
            prop = json.loads(data)['id']; prop_path = f'/api/admin/properties/{prop}'
            assert call(public, '/inmobiliaria/piso-prueba')[0] == 404
            assert call(public, '/api/admin/properties')[0] == 401
            boundary = uuid.uuid4().hex
            payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\nSalón\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n').encode() + PNG + f'\r\n--{boundary}--\r\n'.encode()
            status, data, _ = call(admin, prop_path+'/images', 'POST', payload, f'multipart/form-data; boundary={boundary}'); assert status == 201, data
            image_id = json.loads(data)['id']
            details = json.loads(call(admin, prop_path)[1]); key = details['images'][0]['object_key']
            assert call(public, '/media/'+key)[0] == 404
            req = urllib.request.Request(admin+prop_path+'/images/'+image_id+'/variants/1', data=WEBP, method='PUT', headers={'Origin':admin,'Content-Type':'image/webp','X-Image-Height':'1'})
            with urllib.request.urlopen(req) as response: assert response.status == 200
            details = json.loads(call(admin, prop_path)[1]); property_variant = details['images'][0]['variants'][0]['object_key']
            assert call(public, '/media/'+property_variant)[0] == 404
            assert send_json(admin, prop_path+'/cover', 'PUT', {'imageId':image_id})[0] == 200
            listing['published']=True
            assert send_json(admin, prop_path, 'PUT', listing)[0] == 200
            assert b'Piso de prueba' in call(public, '/inmobiliaria?operacion=sale')[1]
            assert b'Piso de prueba' not in call(public, '/inmobiliaria?operacion=rent')[1]
            assert call(public, '/media/'+key)[0] == 200
            status, _, headers = call(public, '/media/'+property_variant); assert status == 200
            property_etag = headers['ETag']
            assert b'/inmobiliaria/piso-prueba' in call(admin, '/sitemap.xml')[1]
            contact = call(admin, '/contacto?inmueble=piso-prueba')[1]
            assert b'Consulta sobre' in contact and b'piso-prueba' in contact
            enquiry={'name':'Prueba','email':'test@example.com','message':'Quiero saber más sobre este inmueble.','consent':True,'propertySlug':'piso-prueba'}
            assert json.loads(send_json(admin, '/api/contact', 'POST', enquiry)[1])['simulated'] is True
            listing['published']=False
            assert send_json(admin, prop_path, 'PUT', listing)[0] == 200
            assert call(public, '/inmobiliaria/piso-prueba')[0] == 404
            assert call(public, '/media/'+key)[0] == 404
            req = urllib.request.Request(f'http://127.0.0.1:{admin_port}/media/{property_variant}',headers={'Host':f'public.test:{admin_port}','If-None-Match':property_etag})
            try: urllib.request.urlopen(req); raise AssertionError('Unpublished image must not return 304')
            except urllib.error.HTTPError as error: assert error.code == 404
            assert send_json(admin, '/api/contact', 'POST', enquiry)[0] == 400
            assert b'/inmobiliaria/piso-prueba' not in call(admin, '/sitemap.xml')[1]
            assert call(admin, prop_path+'/images/'+image_id, 'DELETE')[0] == 200
            assert call(admin, '/media/'+property_variant)[0] == 404
            print('Gallery and property integration passed: publication, images, enquiry, filtering and authorization.')
        finally:
            for process in processes:
                process.terminate()
            for process in processes:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
            log.close()


if __name__ == '__main__':
    main()
