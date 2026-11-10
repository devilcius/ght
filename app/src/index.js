import {validateProject, validateProjectOrder, escapeHtml as e} from './domain.js';
import {isAdmin} from './auth.js';
import {imagesFor, imageMarkup, galleryImage, projectGalleryImage, uploadVariant, variantKeys, variantDeletion, variantsExpression} from './image-variants.js';
import {handleContact} from './contact.js';
import {listProperties,propertyApi,propertyCard,priceText,statusText} from './property.js';
import {contentKeys, validateSiteContent} from './site-content.js';

const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const html = (body, status = 200) => new Response(body, {status, headers:{'Content-Type':'text/html; charset=utf-8'}});
const siteDescription = 'GHT Arquitectura y Urbanismo: proyectos de arquitectura y urbanismo desde Madrid.';
function siteOrigin(requestUrl, env) {
  if (env.PUBLIC_SITE_URL) {
    const configured = new URL(env.PUBLIC_SITE_URL);
    if (!['https:', 'http:'].includes(configured.protocol) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash || (configured.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(configured.hostname))) throw new Error('PUBLIC_SITE_URL must be a trusted site origin.');
    return configured.origin;
  }
  if (['localhost','127.0.0.1','[::1]'].includes(requestUrl.hostname)) return requestUrl.origin;
  return 'https://ghtarquitectura.com';
}
const pageDescription = value => String(value || '').replace(/\s+/g,' ').trim().slice(0,160);
const layout = (title, body, seo = {}) => {
  const fullTitle = `${title} — GHT Arquitectura`;
  const description = pageDescription(seo.description || siteDescription);
  const meta = seo.canonical ? `<link rel="canonical" href="${e(seo.canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="GHT Arquitectura"><meta property="og:title" content="${e(fullTitle)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(seo.canonical)}"><meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${e(fullTitle)}"><meta name="twitter:description" content="${e(description)}">${seo.image ? `<meta property="og:image" content="${e(seo.image)}"><meta name="twitter:image" content="${e(seo.image)}">` : ''}` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(description)}"><meta name="robots" content="${seo.index ? 'index,follow' : 'noindex,nofollow'}">${meta}<title>${e(fullTitle)}</title><link rel="stylesheet" href="/style.css"></head><body><header class="header"><a class="brand" href="/" aria-label="GHT Arquitectura, inicio">GHT<span>arquitectura<br>y urbanismo</span></a><nav aria-label="Navegación principal"><a href="/#proyectos">Proyectos</a><a href="/estudio">Estudio</a><a href="/inmobiliaria">Inmobiliaria</a><a href="/contacto">Contacto</a></nav></header>${body}<footer><span>GHT Arquitectura y Urbanismo</span><span>Madrid · Desde 1976</span><a href="/contacto">Contacto</a><a href="/admin">Administración</a></footer></body></html>`;
};

async function projects(env, all = false) {
  const result = await env.DB.prepare(`SELECT p.*, (SELECT json_object('object_key',i.object_key,'thumbnail_key',i.thumbnail_key,'variants',json(${variantsExpression('project_image_variants')})) FROM project_images i WHERE i.id=COALESCE((SELECT x.id FROM project_images x WHERE x.project_id=p.id AND x.id=p.cover_image_id),(SELECT x.id FROM project_images x WHERE x.project_id=p.id ORDER BY x.position,x.id LIMIT 1)) LIMIT 1) AS cover_json FROM projects p ${all ? '' : 'WHERE p.published=1'} ORDER BY (p.display_order IS NULL),p.display_order ASC,p.created_at DESC,p.id ASC`).all();
  return result.results.map(({cover_json,...p})=>({...p,cover:cover_json?JSON.parse(cover_json):null}));
}
async function siteContent(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM site_content').all();
  return Object.fromEntries(rows.results.map(row => [row.key,row.value]));
}
const paragraphs = text => e(text).split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${p.replaceAll('\n','<br>')}</p>`).join('');
const card = p => `<a class="project" href="/proyectos/${e(p.slug)}"><div class="project-image">${p.cover ? imageMarkup(p.cover,{alt:'',sizes:'(max-width: 700px) 86vw, 41vw'}) : '<span>GHT / PROYECTO</span>'}</div><div class="project-meta"><span>${e(p.category || 'Arquitectura')}</span><span>${e(p.year)}</span></div><h3>${e(p.title)}</h3><p>${e(p.location)}</p></a>`;
async function api(request, env, path) {
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
export default {async fetch(request, env) {
  const url = new URL(request.url), path = url.pathname;
  try {
    const origin = siteOrigin(url, env);
    const indexable = origin === url.origin;
    if (path === '/robots.txt') {
      const body = indexable ? `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
      return new Response(body, {headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
    if (path === '/sitemap.xml') {
      if (!indexable) return new Response('Not found',{status:404});
      const published = await env.DB.prepare('SELECT slug FROM projects WHERE published=1 ORDER BY slug').all();
      const properties = await env.DB.prepare('SELECT slug FROM properties WHERE published=1 ORDER BY slug').all();
      const paths = ['/','/estudio','/contacto','/inmobiliaria',...published.results.map(project => `/proyectos/${encodeURIComponent(project.slug)}`),...properties.results.map(property => `/inmobiliaria/${encodeURIComponent(property.slug)}`)];
      const entries = paths.map(p=>`<url><loc>${e(origin + p)}</loc></url>`).join('');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (path === '/api/contact') return await handleContact(request,env);
    if (path.startsWith('/api/admin/')) return await api(request,env,path);
    if (path === '/admin') {
      if (!await isAdmin(request,env)) return html(layout('Acceso restringido','<main class="section"><h1>Acceso restringido</h1><p>El acceso de administración no está configurado.</p></main>'),401);
      return html(layout('Administración','<main class="admin section"><p class="eyebrow">GHT / ADMINISTRACIÓN</p><h1>Administración</h1><nav class="admin-tabs" aria-label="Secciones de administración"><button id="tab-projects">Proyectos</button><button id="tab-properties">Inmobiliaria</button><button id="tab-content">Estudio y contacto</button></nav><div id="app"></div></main><script type="module" src="/admin.js"></script>'));
    }
    if (path.startsWith('/media/')) {
      const key = decodeURIComponent(path.slice(7));
      const visible = await env.DB.prepare('SELECT p.published FROM project_images i JOIN projects p ON p.id=i.project_id WHERE i.object_key=? OR i.thumbnail_key=? UNION ALL SELECT p.published FROM property_images i JOIN properties p ON p.id=i.property_id WHERE i.object_key=? OR i.thumbnail_key=? UNION ALL SELECT p.published FROM project_image_variants v JOIN project_images i ON i.id=v.image_id JOIN projects p ON p.id=i.project_id WHERE v.object_key=? UNION ALL SELECT p.published FROM property_image_variants v JOIN property_images i ON i.id=v.image_id JOIN properties p ON p.id=i.property_id WHERE v.object_key=? LIMIT 1').bind(key,key,key,key,key,key).first();
      if (!visible || (!visible.published && !await isAdmin(request,env))) return new Response('Not found',{status:404});
      const object = await env.MEDIA.get(key); if (!object) return new Response('Not found',{status:404});
      const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('X-Content-Type-Options','nosniff'); headers.set('Cache-Control','private, no-cache'); headers.set('ETag',object.httpEtag);
      const validators=(request.headers.get('If-None-Match')||'').split(',').map(value=>value.trim().replace(/^W\//,''));
      if(validators.includes(object.httpEtag)||validators.includes('*')) return new Response(null,{status:304,headers});
      return new Response(object.body,{headers});
    }
    if (path === '/') {
      const allProjects = await projects(env);
      const categories = [...new Set(allProjects.map(p => p.category.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
      const selectedCategory = url.searchParams.get('categoria') || '';
      const list = selectedCategory ? allProjects.filter(p=>p.category.trim() === selectedCategory).sort((a,b)=>(a.category_display_order ?? Number.MAX_SAFE_INTEGER)-(b.category_display_order ?? Number.MAX_SAFE_INTEGER)) : allProjects;
      const filters = `<nav class="category-filters" aria-label="Filtrar proyectos por categoría"><a href="/#proyectos" ${selectedCategory ? '' : 'aria-current="page"'}>Todos</a>${categories.map(category=>`<a href="/?categoria=${encodeURIComponent(category)}#proyectos" ${selectedCategory===category ? 'aria-current="page"' : ''}>${e(category)}</a>`).join('')}</nav>`;
      const content = await siteContent(env);
      return html(layout('Arquitectura y urbanismo', `<main><section class="hero"><div><p class="eyebrow">ARQUITECTURA Y URBANISMO · MADRID</p><h1>Espacios para<br><em>vivir mejor.</em></h1><p class="hero-copy">Arquitectura pensada desde las personas, el lugar y el paso del tiempo.</p><a class="text-link" href="#proyectos">Explorar proyectos <span>↗</span></a></div><div class="hero-art"><span>GHT</span><small>EST. 1976<br>MADRID</small></div><div class="hero-index">01 / 03 <span>ESTUDIO DE ARQUITECTURA</span></div></section><section class="section" id="proyectos"><div class="section-heading"><div><p class="eyebrow">UNA SELECCIÓN DE NUESTRO TRABAJO</p><h2>Proyectos<span class="dot">.</span></h2></div><p>Ideas que toman forma.<br>Espacios que cuentan historias.</p></div>${filters}<p class="project-count">${list.length} ${list.length === 1 ? 'proyecto' : 'proyectos'}</p><div class="project-grid">${list.map(card).join('') || '<p>No hay proyectos en esta categoría.</p>'}</div></section><section class="about section" id="estudio"><p class="eyebrow">02 / EL ESTUDIO</p><div><h2>Arquitectura con<br><em>perspectiva.</em></h2><p>Desde 1976, en GHT trabajamos en arquitectura y urbanismo desde Madrid. Una trayectoria construida a través de proyectos, personas y lugares.</p><a href="/estudio" class="text-link">Conoce el estudio ↗</a></div></section><section class="contact section" id="contacto"><p class="eyebrow">03 / HABLEMOS</p><h2>¿Tienes un proyecto<br><em>en mente?</em></h2><a class="contact-link" href="/contacto">Hablemos ↗</a><div class="contact-details"><span>${e(content.contact_address)}</span><a href="tel:${e(content.contact_phone.replace(/[^+\d]/g,''))}">${e(content.contact_phone)}</a><a href="mailto:${encodeURIComponent(content.contact_email)}">${e(content.contact_email)}</a></div></section></main>`,{canonical:origin+'/',description:siteDescription,index:indexable && !selectedCategory}));
    }
    if (path === '/estudio' || path === '/estudio/') {
      const content = await siteContent(env);
      const team = [1,2,3,4].map(i => `<article class="team-member"><h3>${e(content[`team_${i}_name`])}</h3><div>${paragraphs(content[`team_${i}_bio`])}</div></article>`).join('');
      return html(layout('El estudio', `<main class="section content-page"><p class="eyebrow">GHT / EL ESTUDIO</p><h1>Sobre nuestro <em>estudio.</em></h1><div class="content-intro">${paragraphs(content.studio_intro)}</div><section class="team"><p class="eyebrow">LAS PERSONAS DETRÁS DE GHT</p><h2>Nuestro equipo<span class="dot">.</span></h2><div class="team-grid">${team}</div></section><a class="text-link" href="/contacto">Hablemos de tu proyecto ↗</a></main>`,{canonical:origin+'/estudio',description:'Conoce la trayectoria y el equipo de GHT Arquitectura y Urbanismo en Madrid.',index:indexable}));
    }
    if (path === '/contacto' || path === '/contacto/') {
      const content = await siteContent(env);
      const propertySlug = url.searchParams.get('inmueble');
      const property = propertySlug ? await env.DB.prepare('SELECT slug,title FROM properties WHERE slug=? AND published=1').bind(propertySlug).first() : null;
      const enquiry = property ? `<p class="enquiry-context">Consulta sobre: <strong>${e(property.title)}</strong></p><input type="hidden" name="propertySlug" value="${e(property.slug)}">` : '';
      return html(layout('Contacto', `<main class="section content-page"><p class="eyebrow">GHT / CONTACTO</p><h1>Hablemos de tu <em>proyecto.</em></h1><p>Estamos en Madrid. Puedes contactar con nosotros por teléfono o correo electrónico.</p><div class="contact-cards"><div><span>VISÍTANOS</span><p>${e(content.contact_address)}</p></div><div><span>LLÁMANOS</span><p><a href="tel:${e(content.contact_phone.replace(/[^+\d]/g,''))}">${e(content.contact_phone)}</a></p></div><div><span>ESCRÍBENOS</span><p><a href="mailto:${encodeURIComponent(content.contact_email)}">${e(content.contact_email)}</a></p></div></div><section class="contact-form-section" aria-labelledby="form-heading"><div><p class="eyebrow">TU CONSULTA</p><h2 id="form-heading">Cuéntanos tu idea<span class="dot">.</span></h2><p>Escríbenos y nos pondremos en contacto contigo.</p></div><form id="contact-form" class="contact-form">${enquiry}<div class="contact-fields"><label for="contact-name">Nombre</label><input id="contact-name" name="name" autocomplete="name" required minlength="2" maxlength="120"><label for="contact-email">Correo electrónico</label><input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254"><label for="contact-message">Mensaje</label><textarea id="contact-message" name="message" required minlength="10" maxlength="5000" rows="7"></textarea></div><div class="contact-honeypot" aria-hidden="true"><label for="contact-website">Sitio web</label><input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off"></div><label class="contact-consent"><input type="checkbox" name="consent" required><span>Acepto que GHT utilice mis datos para responder a mi consulta.</span></label><p id="contact-status" role="status" aria-live="polite" tabindex="-1"></p><button type="submit">Enviar mensaje <span aria-hidden="true">↗</span></button><noscript><p>Para enviar este formulario necesitas activar JavaScript. También puedes escribirnos al correo indicado arriba.</p></noscript></form></section><script type="module" src="/contact.js"></script></main>`,{canonical:origin+'/contacto' ,description:'Contacta con GHT Arquitectura y Urbanismo en Madrid por teléfono o correo electrónico.',index:indexable}));
    }
    if (path === '/inmobiliaria' || path === '/inmobiliaria/') {
      const all = await listProperties(env), selected = url.searchParams.get('operacion') || '';
      const list = selected ? all.filter(p=>p.operation===selected) : all;
      const filters = `<nav class="category-filters" aria-label="Filtrar inmuebles por operación"><a href="/inmobiliaria" ${selected?'':'aria-current="page"'}>Todos</a><a href="/inmobiliaria?operacion=sale" ${selected==='sale'?'aria-current="page"':''}>Venta</a><a href="/inmobiliaria?operacion=rent" ${selected==='rent'?'aria-current="page"':''}>Alquiler</a></nav>`;
      return html(layout('Inmobiliaria',`<main class="section content-page properties-page"><p class="eyebrow">GHT / INMOBILIARIA</p><h1>Encuentra tu <em>espacio.</em></h1><p>Descubre nuestros inmuebles en venta y alquiler.</p>${filters}<p class="project-count">${list.length} ${list.length===1?'inmueble':'inmuebles'}</p><div class="project-grid">${list.map(propertyCard).join('') || '<p>En este momento no hay inmuebles publicados.</p>'}</div></main>`,{canonical:origin+'/inmobiliaria',description:'Descubre los inmuebles en venta y alquiler de GHT Arquitectura.',index:indexable&&!selected}));
    }
    const propertyMatch = path.match(/^\/inmobiliaria\/([a-z0-9-]+)\/?$/);
    if (propertyMatch) {
      const p=await env.DB.prepare('SELECT * FROM properties WHERE slug=? AND published=1').bind(propertyMatch[1]).first();
      if(!p)return html(layout('No encontrado','<main class="section"><h1>Inmueble no encontrado</h1><a href="/inmobiliaria">Volver a inmobiliaria</a></main>'),404);
      const imgs=await imagesFor(env,'properties',p.id);
      const featured=imgs.find(i=>i.id===p.cover_image_id)||imgs[0],image=featured?`${origin}/media/${encodeURIComponent(featured.object_key)}`:undefined;
      const facts=[p.area_m2!==null?`${p.area_m2} m²`:'',p.bedrooms!==null?`${p.bedrooms} dormitorios`:'',p.bathrooms!==null?`${p.bathrooms} baños`:''].filter(Boolean);
      const info=[p.location,statusText(p),priceText(p)].filter(Boolean).join(' · ');
      const gallery=imgs.map((i,index)=>galleryImage(i,index)).join('');
      return html(layout(p.title,`<main class="section detail"><a class="text-link" href="/inmobiliaria">← Todos los inmuebles</a><p class="eyebrow">${e(statusText(p))} / ${e(p.location)}</p><h1>${e(p.title)}</h1><p class="property-price">${e(priceText(p))}</p><p>${e(facts.join(' · '))}</p><div class="description">${paragraphs(p.description)}</div><a class="property-enquire" href="/contacto?inmueble=${encodeURIComponent(p.slug)}#form-heading">Solicitar información ↗</a><div class="gallery">${gallery}</div></main>`,{canonical:origin+'/inmobiliaria/'+encodeURIComponent(p.slug),description:pageDescription(p.description||`${p.title} — ${info}. Inmobiliaria GHT.`),image,index:indexable}));
    }
    const match = path.match(/^\/proyectos\/([a-z0-9-]+)\/?$/);
    if (match) {
      const p = await env.DB.prepare('SELECT * FROM projects WHERE slug=? AND published=1').bind(match[1]).first();
      if (!p) return html(layout('No encontrado','<main class="section"><h1>Proyecto no encontrado</h1><a href="/">Volver al inicio</a></main>'),404);
      const imgs = await imagesFor(env,'projects',p.id);
      const featured = imgs.find(i => i.id === p.cover_image_id) || imgs[0];
      const socialImage = featured ? `${origin}/media/${encodeURIComponent(featured.object_key)}` : undefined;
      const details = [p.category,p.location,p.year].filter(Boolean).join(' · ');
      const description = pageDescription(p.description || `${p.title}${details ? ' — '+details : ''}. Proyecto de GHT Arquitectura y Urbanismo.`);
      const mosaic=Array.from({length:Math.ceil(imgs.length/7)},(_,group)=>{const start=group*7,items=imgs.slice(start,start+7);return `<div class="project-gallery-group${items.length===7?' project-gallery-group-full':''}${items.length%2?' project-gallery-group-odd':''}">${items.map((img,index)=>projectGalleryImage(img,start+index)).join('')}</div>`;}).join('');
      const gallery=imgs.length ? `<div class="project-gallery" aria-label="Galería del proyecto">${mosaic}</div><dialog class="gallery-viewer" aria-label="Visor de imágenes"><div class="gallery-viewer-bar"><span class="gallery-viewer-count" aria-live="polite"></span><button type="button" class="gallery-viewer-close" aria-label="Cerrar visor">✕</button></div><div class="gallery-viewer-stage"><button type="button" class="gallery-viewer-prev" aria-label="Imagen anterior">←</button><img class="gallery-viewer-image" alt=""><button type="button" class="gallery-viewer-next" aria-label="Imagen siguiente">→</button></div><p class="gallery-viewer-caption"></p></dialog><script type="module" src="/gallery.js"></script>` : '';
      return html(layout(p.title,`<main class="section detail"><a class="text-link" href="/#proyectos">← Todos los proyectos</a><p class="eyebrow">${e(p.category)} / ${e(p.year)}</p><h1>${e(p.title)}</h1><p>${e(p.location)}</p><p class="description">${e(p.description)}</p>${gallery}</main>`,{canonical:origin+'/proyectos/'+encodeURIComponent(p.slug),description,image:socialImage,index:indexable}));
    }
    return env.ASSETS.fetch(request);
  } catch (err) { console.error('Request failed', err); return path.startsWith('/api/') ? json({error:err.message?.includes('UNIQUE') ? 'Ya existe un proyecto con ese slug.' : err.message || 'Error interno'},400) : html(layout('Error','<main class="section"><h1>No se pudo cargar la página.</h1></main>'),500); }
}};
