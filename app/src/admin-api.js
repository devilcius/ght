import {validateProject, validateProjectOrder} from './domain.js';
import {isAdmin} from './auth.js';
import {imagesFor, uploadVariant, variantKeys, variantDeletion} from './image-variants.js';
import {propertyApi} from './property.js';
import {contentKeys, validateSiteContent} from './site-content.js';
import {projects, siteContent} from './content-repository.js';
import {json} from './http.js';

export async function adminApi(request, env, path) {
  if (!await isAdmin(request, env)) return json({error:'No autorizado'}, 401);
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('Origin') !== new URL(request.url).origin) return json({error:'Origen no permitido'}, 403);
  // Retry storage deletions left pending by an earlier failed request.
  const pending = await env.DB.prepare('SELECT object_key FROM pending_media_deletions LIMIT 25').all();
  for (const item of pending.results) {
    try {
      await env.MEDIA.delete(item.object_key);
      await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(item.object_key).run();
    } catch (error) { console.error('Media cleanup pending', error); }
  }
  const variantMatch = path.match(/^\/api\/admin\/(projects|properties)\/([\w-]+)\/images\/([\w-]+)\/variants\/(\d+)$/);
  if (variantMatch) return request.method === 'PUT' ? await uploadVariant(request,env,variantMatch[1],variantMatch[2],variantMatch[3],variantMatch[4]) : json({error:'Método no permitido'},405);
  if (path === '/api/admin/properties' || path.startsWith('/api/admin/properties/')) return await propertyApi(request,env,path);
  if (path === '/api/admin/content' && request.method === 'GET') return json(await siteContent(env));
  if (path === '/api/admin/content' && request.method === 'PUT') {
    const content = validateSiteContent(await request.json());
    await env.DB.batch(contentKeys.map(key => env.DB.prepare('INSERT INTO site_content (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,content[key])));
    return json({ok:true});
  }
  if (path === '/api/admin/projects' && request.method === 'GET') return json(await projects(env, true));
  if (path === '/api/admin/projects' && request.method === 'POST') {
    const input = await request.json(); const p = validateProject(input);
    const displayOrder = Object.hasOwn(input,'display_order') ? validateProjectOrder(input.display_order) : null;
    const categoryDisplayOrder = Object.hasOwn(input,'category_display_order') ? validateProjectOrder(input.category_display_order) : null;
    const localImport = env.LOCAL_DEVELOPMENT === 'true' && ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
    const id = localImport && /^wp-[0-9]+$/.test(input.importId || '') ? input.importId : crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO projects (id,title,slug,category,location,year,description,published,created_at,updated_at,display_order,category_display_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,p.title,p.slug,p.category,p.location,p.year,p.description,p.published,now,now,displayOrder,categoryDisplayOrder).run();
    return json({id},201);
  }
  const imageMatch = path.match(/^\/api\/admin\/projects\/([\w-]+)\/images\/([\w-]+)(?:\/(thumbnail))?$/);
  if (imageMatch) {
    const [,projectId,imageId,variant] = imageMatch;
    const image = await env.DB.prepare('SELECT * FROM project_images WHERE id=? AND project_id=?').bind(imageId,projectId).first();
    if (!image) return json({error:'Imagen no encontrada'},404);
    if (variant === 'thumbnail' && request.method === 'PUT') {
      const bytes = await request.arrayBuffer();
      if (request.headers.get('Content-Type') !== 'image/webp' || !bytes.byteLength || bytes.byteLength > 2*1024*1024) return json({error:'Miniatura inválida'},400);
      const header = new Uint8Array(bytes,0,Math.min(bytes.byteLength,12));
      if (header.length < 12 || String.fromCharCode(...header.slice(0,4)) !== 'RIFF' || String.fromCharCode(...header.slice(8,12)) !== 'WEBP') return json({error:'Miniatura inválida'},400);
      const key = crypto.randomUUID();
      await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
      try {
        const statements = [env.DB.prepare('UPDATE project_images SET thumbnail_key=? WHERE id=? AND project_id=?').bind(key,imageId,projectId)];
        if (image.thumbnail_key) statements.push(env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(image.thumbnail_key));
        await env.DB.batch(statements);
      } catch (error) { await env.MEDIA.delete(key); throw error; }
      return json({ok:true});
    }
    if (variant) return json({error:'Método no permitido'},405);
    if (request.method === 'PATCH') {
      const {alt} = await request.json();
      if (typeof alt !== 'string' || alt.length > 300) return json({error:'El texto alternativo debe tener como máximo 300 caracteres.'},400);
      await env.DB.prepare('UPDATE project_images SET alt=? WHERE id=? AND project_id=?').bind(alt.trim(),imageId,projectId).run();
      return json({ok:true});
    }
    if (request.method === 'DELETE') {
      const variants = await variantKeys(env,'projects',imageId);
      await env.DB.batch([
        ...variants.map(key=>env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(key)),
        variantDeletion(env,'projects',imageId),
        env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(image.object_key),
        ...(image.thumbnail_key ? [env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(image.thumbnail_key)] : []),
        env.DB.prepare('UPDATE projects SET cover_image_id=NULL WHERE id=? AND cover_image_id=?').bind(projectId,imageId),
        env.DB.prepare('DELETE FROM project_images WHERE id=? AND project_id=?').bind(imageId,projectId)
      ]);
      try {
        await env.MEDIA.delete(image.object_key);
        await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(image.object_key).run();
        if (image.thumbnail_key) { await env.MEDIA.delete(image.thumbnail_key); await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(image.thumbnail_key).run(); }
        for(const key of variants){await env.MEDIA.delete(key);await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(key).run();}
        return json({ok:true});
      } catch (error) {
        console.error('Media cleanup pending', error);
        return json({ok:true,cleanupPending:true});
      }
    }
    return json({error:'Método no permitido'},405);
  }
  const match = path.match(/^\/api\/admin\/projects\/([\w-]+)(?:\/(images|order|cover))?$/);
  if (!match) return json({error:'No encontrado'},404);
  const [,id,action] = match;
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();
  if (!project) return json({error:'Proyecto no encontrado'},404);
  if (!action && request.method === 'GET') {
    return json({...project,images:await imagesFor(env,'projects',id)});
  }
  if (!action && request.method === 'PUT') {
    const input = await request.json(); const p = validateProject(input);
    const displayOrder = Object.hasOwn(input,'display_order') ? validateProjectOrder(input.display_order) : project.display_order;
    const categoryDisplayOrder = Object.hasOwn(input,'category_display_order') ? validateProjectOrder(input.category_display_order) : (p.category === project.category ? project.category_display_order : null);
    await env.DB.prepare('UPDATE projects SET title=?,slug=?,category=?,location=?,year=?,description=?,published=?,updated_at=?,display_order=?,category_display_order=? WHERE id=?').bind(p.title,p.slug,p.category,p.location,p.year,p.description,p.published,new Date().toISOString(),displayOrder,categoryDisplayOrder,id).run();
    return json({ok:true});
  }
  if (action === 'images' && request.method === 'POST') {
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File) || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024 || file.size === 0) return json({error:'Imagen inválida. Usa JPG, PNG o WebP de hasta 10 MB.'},400);
    const key = crypto.randomUUID(); const imageId = crypto.randomUUID();
    await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
    try { await env.DB.prepare('INSERT INTO project_images (id,project_id,object_key,alt,position) VALUES (?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM project_images WHERE project_id=?))').bind(imageId,id,key,String(form.get('alt') || '').slice(0,300),id).run(); }
    catch (err) { await env.MEDIA.delete(key); throw err; }
    return json({id:imageId},201);
  }
  if (action === 'cover' && request.method === 'PUT') {
    const {imageId} = await request.json();
    if (typeof imageId !== 'string' || !await env.DB.prepare('SELECT id FROM project_images WHERE id=? AND project_id=?').bind(imageId,id).first()) return json({error:'Imagen no encontrada'},400);
    await env.DB.prepare('UPDATE projects SET cover_image_id=? WHERE id=?').bind(imageId,id).run();
    return json({ok:true});
  }
  if (action === 'order' && request.method === 'PUT') {
    const {ids} = await request.json();
    const existing = (await env.DB.prepare('SELECT id FROM project_images WHERE project_id=?').bind(id).all()).results.map(x=>x.id);
    if (!Array.isArray(ids) || ids.length !== existing.length || new Set(ids).size !== existing.length || ids.some(x=>!existing.includes(x))) return json({error:'Orden inválido'},400);
    await env.DB.batch(ids.map((imageId,i)=>env.DB.prepare('UPDATE project_images SET position=? WHERE id=? AND project_id=?').bind(i,imageId,id)));
    return json({ok:true});
  }
  return json({error:'Método no permitido'},405);
}
