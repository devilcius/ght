import {renderProject} from '../page-views.js';
import {imagesFor} from '../image-variants.js';
import {publishedProjectBySlug} from '../content-repository.js';
import {mosaicGallery} from '../components.js';
import {layout, pageDescription} from '../layout.js';
import {html} from '../http.js';

export async function projectPage(env, match, origin, indexable) {
  const p = await publishedProjectBySlug(env, match[1]);
  if (!p) return html(layout('No encontrado','<main class="section"><h1>Proyecto no encontrado</h1><a href="/">Volver al inicio</a></main>'),404);
  const imgs = await imagesFor(env,'projects',p.id);
  const featured = imgs.find(i => i.id === p.cover_image_id) || imgs[0];
  const socialImage = featured ? `${origin}/media/${encodeURIComponent(featured.object_key)}` : undefined;
  const details = [p.category,p.location,p.year].filter(Boolean).join(' · ');
  const description = pageDescription(p.description || `${p.title}${details ? ' — '+details : ''}. Proyecto de GHT Arquitectura y Urbanismo.`);
  const gallery=mosaicGallery(imgs,'Galería del proyecto');
  return renderProject({p, gallery, origin, description, socialImage, indexable});
}
