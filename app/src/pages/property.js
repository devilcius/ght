import {renderProperty} from '../page-views.js';
import {imagesFor} from '../image-variants.js';
import {publishedPropertyBySlug} from '../content-repository.js';
import {priceText, statusText} from '../property.js';
import {mosaicGallery} from '../components.js';
import {layout} from '../layout.js';
import {html} from '../http.js';

export async function propertyPage(env, propertyMatch, origin, indexable) {
  const p=await publishedPropertyBySlug(env, propertyMatch[1]);
  if(!p)return html(layout('No encontrado','<main class="section"><h1>Inmueble no encontrado</h1><a href="/inmobiliaria">Volver a inmobiliaria</a></main>'),404);
  const imgs=await imagesFor(env,'properties',p.id);
  const featured=imgs.find(i=>i.id===p.cover_image_id)||imgs[0],image=featured?`${origin}/media/${encodeURIComponent(featured.object_key)}`:undefined;
  const facts=[p.area_m2!==null?`${p.area_m2} m²`:'',p.bedrooms!==null?`${p.bedrooms} dormitorios`:'',p.bathrooms!==null?`${p.bathrooms} baños`:''].filter(Boolean);
  const info=[p.location,statusText(p),priceText(p)].filter(Boolean).join(' · ');
  const gallery=mosaicGallery(imgs,'Galería del inmueble');
  return renderProperty({p, facts, gallery, origin, info, image, indexable});
}
