import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mosaicGallery, paragraphs} from '../src/components.js';
import {siteOrigin, layout} from '../src/layout.js';

test('gallery keeps image order across groups and escapes accessible text', () => {
  const images = Array.from({length: 8}, (_, i) => ({object_key: `image-${i}`, alt: i === 0 ? '<room>' : ''}));
  const markup = mosaicGallery(images, 'Fotos "del inmueble"');
  assert.match(markup, /project-gallery-group-7 project-gallery-group-full/);
  assert.match(markup, /project-gallery-group-1 project-gallery-group-odd/);
  assert.ok(markup.indexOf('/media/image-6') < markup.indexOf('/media/image-7'));
  assert.match(markup, /&lt;room&gt;/);
  assert.match(markup, /Fotos &quot;del inmueble&quot;/);
  assert.equal(mosaicGallery([], 'Fotos'), '');
});

test('paragraphs escape content and preserve paragraph breaks', () => {
  assert.equal(paragraphs('One\nline\n\n<script>'), '<p>One<br>line</p><p>&lt;script&gt;</p>');
});

test('site origin accepts only a trusted origin without credentials or paths', () => {
  const request = new URL('http://localhost:8787/');
  assert.equal(siteOrigin(request, {}), 'http://localhost:8787');
  assert.equal(siteOrigin(request, {PUBLIC_SITE_URL:'https://example.com'}), 'https://example.com');
  assert.throws(() => siteOrigin(request, {PUBLIC_SITE_URL:'https://example.com/path'}));
  assert.throws(() => siteOrigin(request, {PUBLIC_SITE_URL:'http://example.com'}));
});

test('shared navigation marks the current section including detail pages', () => {
  for (const [path, href] of [
    ['/', '/#proyectos'], ['/proyectos/casa', '/#proyectos'], ['/estudio', '/estudio'],
    ['/inmobiliaria/piso', '/inmobiliaria'], ['/contacto', '/contacto']
  ]) {
    const html = layout('Test', '<main></main>', {canonical: 'https://example.com'+path});
    assert.ok(html.includes(`href="${href}" aria-current="page"`));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  }
});
