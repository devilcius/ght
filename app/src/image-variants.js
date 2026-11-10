import {escapeHtml as e} from './domain.js';
const definitions = {
 projects:{images:'project_images',variants:'project_image_variants',owner:'project_id'},
 properties:{images:'property_images',variants:'property_image_variants',owner:'property_id'}
};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const variantsExpression = (variants,alias='i') => `COALESCE((SELECT json_group_array(json_object('width',v.width,'height',v.height,'object_key',v.object_key)) FROM ${variants} v WHERE v.image_id=${alias}.id),'[]')`;
export async function imagesFor(env,kind,ownerId) {
 const d=definitions[kind];
 const rows=(await env.DB.prepare(`SELECT i.*, ${variantsExpression(d.variants)} AS variants_json FROM ${d.images} i WHERE i.${d.owner}=? ORDER BY i.position,i.id`).bind(ownerId).all()).results;
 return rows.map(({variants_json,...image})=>({...image,variants:JSON.parse(variants_json)}));
}
export async function uploadVariant(request,env,kind,ownerId,imageId,widthText) {
 const d=definitions[kind],width=Number(widthText),height=Number(request.headers.get('X-Image-Height'));
 if(!Number.isInteger(width)||width<1||width>1600||!Number.isInteger(height)||height<1||height>10000) return json({error:'Dimensiones de imagen no válidas.'},400);
 const image=await env.DB.prepare(`SELECT id FROM ${d.images} WHERE id=? AND ${d.owner}=?`).bind(imageId,ownerId).first();
 if(!image)return json({error:'Imagen no encontrada.'},404);
 const bytes=await request.arrayBuffer(),h=new Uint8Array(bytes,0,Math.min(bytes.byteLength,12));
 if(request.headers.get('Content-Type')!=='image/webp'||!bytes.byteLength||bytes.byteLength>2*1024*1024||h.length<12||String.fromCharCode(...h.slice(0,4))!=='RIFF'||String.fromCharCode(...h.slice(8,12))!=='WEBP')return json({error:'Imagen optimizada no válida.'},400);
 const existing=await env.DB.prepare(`SELECT object_key FROM ${d.variants} WHERE image_id=? AND width=?`).bind(imageId,width).first();
 const key=crypto.randomUUID();await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
 try {
  const statements=[env.DB.prepare(`INSERT INTO ${d.variants} (image_id,width,height,object_key) VALUES (?,?,?,?) ON CONFLICT(image_id,width) DO UPDATE SET height=excluded.height,object_key=excluded.object_key`).bind(imageId,width,height,key)];
  if(existing)statements.push(env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(existing.object_key));
  await env.DB.batch(statements);
 }catch(error){await env.MEDIA.delete(key);throw error;}
 return json({ok:true,width,height});
}
export async function variantKeys(env,kind,imageId) {
 const d=definitions[kind];return (await env.DB.prepare(`SELECT object_key FROM ${d.variants} WHERE image_id=?`).bind(imageId).all()).results.map(row=>row.object_key);
}
export const variantDeletion = (env,kind,imageId) => env.DB.prepare(`DELETE FROM ${definitions[kind].variants} WHERE image_id=?`).bind(imageId);
export function imageMarkup(image,{sizes='(max-width: 700px) 86vw, 82vw',eager=false,alt=image.alt||'',className='',gallery=false}={}) {
 const variants=(image.variants||[]).slice().sort((a,b)=>a.width-b.width);
 if(gallery && !variants.length && image.thumbnail_key) return `<picture><source media="(max-width: 700px)" srcset="/media/${encodeURIComponent(image.thumbnail_key)}"><img src="/media/${encodeURIComponent(image.object_key)}" alt="${e(alt)}" loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''}></picture>`;
 const srcset=variants.map(v=>`/media/${encodeURIComponent(v.object_key)} ${v.width}w`).join(', ');
 const fallback=variants.at(-1)?.object_key || image.thumbnail_key || image.object_key;
 const dimensions=variants.at(-1);
 return `<img${className?` class="${e(className)}"`:''} src="/media/${encodeURIComponent(fallback)}"${srcset?` srcset="${e(srcset)}" sizes="${e(sizes)}"`:''}${dimensions?` width="${dimensions.width}" height="${dimensions.height}"`:''} alt="${e(alt)}" loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''}>`;
}
export function galleryImage(image,index) {
 const markup=imageMarkup(image,{eager:index===0,gallery:true});
 return image.variants?.length ? `<a href="/media/${encodeURIComponent(image.object_key)}" target="_blank" rel="noopener" aria-label="Ver imagen original">${markup}</a>` : markup;
}
export function projectGalleryImage(image,index) {
 const markup=imageMarkup(image,{eager:index===0,gallery:true,sizes:'(max-width: 700px) 86vw, 41vw'});
 return `<a class="project-gallery-item" href="/media/${encodeURIComponent(image.object_key)}" aria-label="Ampliar imagen ${index+1}${image.alt ? ': '+e(image.alt) : ''}">${markup}<span class="project-gallery-expand" aria-hidden="true">↗</span></a>`;
}
