import {escapeHtml as e} from './domain.js';
const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const integer = (value,label,max) => {
 if(value===null || value===undefined || value==='') return null;
 if(!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)>max) throw new Error(`${label} no es válido.`);
 return Number(value);
};
export function validateProperty(input) {
 const title=typeof input.title==='string'?input.title.trim():'';
 const slug=typeof input.slug==='string'?input.slug.trim().toLowerCase():'';
 const location=typeof input.location==='string'?input.location.trim():'';
 const description=typeof input.description==='string'?input.description.trim():'';
 if(!title || title.length>180) throw new Error('El título es obligatorio (máximo 180 caracteres).');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length>180) throw new Error('El slug solo admite letras minúsculas, números y guiones.');
 if(!['sale','rent'].includes(input.operation) || !['available','reserved','sold'].includes(input.availability)) throw new Error('Operación o disponibilidad no válida.');
 if(location.length>150 || description.length>10000) throw new Error('El contenido es demasiado largo.');
 const areaRaw=input.area_m2; let area_m2=null;
 if(areaRaw!==null && areaRaw!==undefined && areaRaw!=='') { if(!/^\d+(?:\.\d{1,2})?$/.test(String(areaRaw)) || Number(areaRaw)<=0 || Number(areaRaw)>1000000) throw new Error('La superficie no es válida.'); area_m2=Number(areaRaw); }
 return {title,slug,operation:input.operation,availability:input.availability,location,description,area_m2,price_eur:integer(input.price_eur,'El precio',1000000000),bedrooms:integer(input.bedrooms,'El número de dormitorios',1000),bathrooms:integer(input.bathrooms,'El número de baños',1000),published:input.published===true||input.published===1?1:0};
}
export async function listProperties(env,all=false) {
 return (await env.DB.prepare(`SELECT p.*, COALESCE((SELECT COALESCE(thumbnail_key,object_key) FROM property_images i WHERE i.property_id=p.id AND i.id=p.cover_image_id),(SELECT COALESCE(thumbnail_key,object_key) FROM property_images i WHERE i.property_id=p.id ORDER BY position,id LIMIT 1)) AS cover FROM properties p ${all?'':'WHERE p.published=1'} ORDER BY p.created_at DESC,p.id ASC`).all()).results;
}
export const priceText = p => p.price_eur===null ? 'Consultar precio' : new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(p.price_eur)+(p.operation==='rent'?' / mes':'');
export const statusText = p => p.availability==='reserved'?'Reservado':p.availability==='sold'?(p.operation==='rent'?'Alquilado':'Vendido'):(p.operation==='rent'?'Alquiler':'Venta');
export const propertyCard = p => `<a class="project property-card" href="/inmobiliaria/${e(p.slug)}"><div class="project-image">${p.cover?`<img src="/media/${encodeURIComponent(p.cover)}" alt="" loading="lazy" decoding="async">`:'<span>GHT / INMOBILIARIA</span>'}</div><div class="project-meta"><span>${e(statusText(p))}</span><span>${e(priceText(p))}</span></div><h3>${e(p.title)}</h3><p>${e(p.location)}</p></a>`;
export async function propertyApi(request,env,path) {
 if(path==='/api/admin/properties' && request.method==='GET') return json(await listProperties(env,true));
 if(path==='/api/admin/properties' && request.method==='POST') {
  const p=validateProperty(await request.json()),id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO properties (id,title,slug,operation,availability,location,price_eur,area_m2,bedrooms,bathrooms,description,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,p.title,p.slug,p.operation,p.availability,p.location,p.price_eur,p.area_m2,p.bedrooms,p.bathrooms,p.description,p.published,now,now).run();return json({id},201);
 }
 const match=path.match(/^\/api\/admin\/properties\/([\w-]+)(?:\/(images|order|cover)(?:\/([\w-]+)(?:\/(thumbnail))?)?)?$/);
 if(!match)return json({error:'No encontrado'},404);
 const [,id,action,imageId,variant]=match;
 const property=await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first();
 if(!property)return json({error:'Inmueble no encontrado'},404);
 if(!action && request.method==='GET')return json({...property,images:(await env.DB.prepare('SELECT * FROM property_images WHERE property_id=? ORDER BY position,id').bind(id).all()).results});
 if(!action && request.method==='PUT') {
  const p=validateProperty(await request.json());await env.DB.prepare('UPDATE properties SET title=?,slug=?,operation=?,availability=?,location=?,price_eur=?,area_m2=?,bedrooms=?,bathrooms=?,description=?,published=?,updated_at=? WHERE id=?').bind(p.title,p.slug,p.operation,p.availability,p.location,p.price_eur,p.area_m2,p.bedrooms,p.bathrooms,p.description,p.published,new Date().toISOString(),id).run();return json({ok:true});
 }
 if(action==='images' && !imageId && request.method==='POST') {
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024)return json({error:'Imagen inválida. Usa JPG, PNG o WebP de hasta 10 MB.'},400);
  const key=crypto.randomUUID(),img=crypto.randomUUID();await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
  try {await env.DB.prepare('INSERT INTO property_images (id,property_id,object_key,alt,position) VALUES (?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM property_images WHERE property_id=?))').bind(img,id,key,String(form.get('alt')||'').slice(0,300),id).run();} catch(error){await env.MEDIA.delete(key);throw error;}return json({id:img},201);
 }
 if(action==='images' && imageId){
  const image=await env.DB.prepare('SELECT * FROM property_images WHERE id=? AND property_id=?').bind(imageId,id).first();if(!image)return json({error:'Imagen no encontrada'},404);
  if(variant==='thumbnail' && request.method==='PUT'){
   const bytes=await request.arrayBuffer(),h=new Uint8Array(bytes,0,Math.min(bytes.byteLength,12));
   if(request.headers.get('Content-Type')!=='image/webp'||!bytes.byteLength||bytes.byteLength>2*1024*1024||h.length<12||String.fromCharCode(...h.slice(0,4))!=='RIFF'||String.fromCharCode(...h.slice(8,12))!=='WEBP')return json({error:'Miniatura inválida'},400);
   const key=crypto.randomUUID();await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
   try {const stmts=[env.DB.prepare('UPDATE property_images SET thumbnail_key=? WHERE id=? AND property_id=?').bind(key,imageId,id)];if(image.thumbnail_key)stmts.push(env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(image.thumbnail_key));await env.DB.batch(stmts);}catch(error){await env.MEDIA.delete(key);throw error;}return json({ok:true});
  }
  if(variant)return json({error:'Método no permitido'},405);
  if(request.method==='PATCH') {const {alt}=await request.json();if(typeof alt!=='string'||alt.length>300)return json({error:'Texto alternativo no válido'},400);await env.DB.prepare('UPDATE property_images SET alt=? WHERE id=? AND property_id=?').bind(alt.trim(),imageId,id).run();return json({ok:true});}
  if(request.method==='DELETE') {
   const keys=[image.object_key,...(image.thumbnail_key?[image.thumbnail_key]:[])];await env.DB.batch([...keys.map(key=>env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(key)),env.DB.prepare('UPDATE properties SET cover_image_id=NULL WHERE id=? AND cover_image_id=?').bind(id,imageId),env.DB.prepare('DELETE FROM property_images WHERE id=? AND property_id=?').bind(imageId,id)]);
   try{for(const key of keys){await env.MEDIA.delete(key);await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(key).run();}return json({ok:true});}catch{return json({ok:true,cleanupPending:true});}
  }
 }
 if(action==='cover' && !imageId && request.method==='PUT') {const {imageId:cover}=await request.json();if(typeof cover!=='string'||!await env.DB.prepare('SELECT id FROM property_images WHERE id=? AND property_id=?').bind(cover,id).first())return json({error:'Imagen no encontrada'},400);await env.DB.prepare('UPDATE properties SET cover_image_id=? WHERE id=?').bind(cover,id).run();return json({ok:true});}
 if(action==='order' && !imageId && request.method==='PUT') {const {ids}=await request.json(),existing=(await env.DB.prepare('SELECT id FROM property_images WHERE property_id=?').bind(id).all()).results.map(x=>x.id);if(!Array.isArray(ids)||ids.length!==existing.length||new Set(ids).size!==existing.length||ids.some(x=>!existing.includes(x)))return json({error:'Orden inválido'},400);await env.DB.batch(ids.map((img,i)=>env.DB.prepare('UPDATE property_images SET position=? WHERE id=? AND property_id=?').bind(i,img,id)));return json({ok:true});}
 return json({error:'Método no permitido'},405);
}
