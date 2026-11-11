import {escapeHtml as e} from './domain.js';
import {imageMarkup, projectGalleryImage} from './image-variants.js';

export function paragraphs(text) {
  return e(text).split(/\n\s*\n/).filter(Boolean)
    .map(paragraph => `<p>${paragraph.replaceAll('\n', '<br>')}</p>`).join('');
}

export function mosaicGallery(images, label) {
  if (!images.length) return '';
  const groups = [];
  for (let start = 0; start < images.length; start += 7) {
    const items = images.slice(start, start + 7);
    const classes = ['project-gallery-group', `project-gallery-group-${items.length}`];
    if (items.length === 7) classes.push('project-gallery-group-full');
    if (items.length % 2) classes.push('project-gallery-group-odd');
    const tiles = items.map((image, index) => projectGalleryImage(image, start + index)).join('');
    groups.push(`<div class="${classes.join(' ')}">${tiles}</div>`);
  }
  return `<div class="project-gallery" aria-label="${e(label)}">${groups.join('')}</div>
    <dialog class="gallery-viewer" aria-label="Visor de imágenes">
      <div class="gallery-viewer-bar">
        <span class="gallery-viewer-count" aria-live="polite"></span>
        <button type="button" class="gallery-viewer-close" aria-label="Cerrar visor">✕</button>
      </div>
      <div class="gallery-viewer-stage">
        <button type="button" class="gallery-viewer-prev" aria-label="Imagen anterior">←</button>
        <img class="gallery-viewer-image" alt="">
        <button type="button" class="gallery-viewer-next" aria-label="Imagen siguiente">→</button>
      </div>
      <p class="gallery-viewer-caption"></p>
    </dialog><script type="module" src="/gallery.js"></script>`;
}
export const card = p => `<a class="project" href="/proyectos/${e(p.slug)}"><div class="project-image">${p.cover ? imageMarkup(p.cover,{alt:'',sizes:'(max-width: 700px) 86vw, 41vw'}) : '<span>GHT / PROYECTO</span>'}</div><div class="project-meta"><span>${e(p.category || 'Arquitectura')}</span><span>${e(p.year)}</span></div><h3>${e(p.title)}</h3><p>${e(p.location)}</p></a>`;
