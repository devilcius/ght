import {escapeHtml as e} from './domain.js';
import {isAdmin} from './auth.js';
import {handleContact} from './contact.js';
import {adminApi} from './admin-api.js';
import {serveMedia} from './media.js';
import {json, html} from './http.js';
import {siteOrigin, layout} from './layout.js';
import {homePage} from './pages/home.js';
import {studioPage} from './pages/studio.js';
import {contactPage} from './pages/contact.js';
import {propertiesPage} from './pages/properties.js';
import {propertyPage} from './pages/property.js';
import {projectPage} from './pages/project.js';

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
    if (path.startsWith('/api/admin/')) return await adminApi(request,env,path);
    if (/^\/admin(?:\/(?:proyectos|inmobiliaria|estudio|usuarios))?\/?$/.test(path)) {
      if (!await isAdmin(request,env)) return html(layout('Acceso restringido','<main class="section"><h1>Acceso restringido</h1><p>No tienes acceso a la administración.</p></main>'),401);
      return html(layout('Administración','<main class="admin section"><p class="eyebrow">GHT / ADMINISTRACIÓN</p><h1>Administración</h1><nav class="admin-tabs" aria-label="Secciones de administración"><a id="tab-projects" href="/admin/proyectos">Proyectos</a><a id="tab-properties" href="/admin/inmobiliaria">Inmobiliaria</a><a id="tab-content" href="/admin/estudio">Estudio y contacto</a><a id="tab-users" href="/admin/usuarios">Usuarios</a></nav><div id="app"></div></main><script type="module" src="/admin.js"></script>'));
    }
    if (path.startsWith('/media/')) return await serveMedia(request, env, path);
    if (path === '/') return await homePage(env, url, origin, indexable);
    if (path === '/estudio' || path === '/estudio/') return await studioPage(env, origin, indexable);
    if (path === '/contacto' || path === '/contacto/') return await contactPage(env, url, origin, indexable);
    if (path === '/inmobiliaria' || path === '/inmobiliaria/') return await propertiesPage(env, url, origin, indexable);
    const propertyMatch = path.match(/^\/inmobiliaria\/([a-z0-9-]+)\/?$/);
    if (propertyMatch) return await propertyPage(env, propertyMatch, origin, indexable);
    const match = path.match(/^\/proyectos\/([a-z0-9-]+)\/?$/);
    if (match) return await projectPage(env, match, origin, indexable);
    return env.ASSETS.fetch(request);
  } catch (err) { console.error('Request failed', err); return path.startsWith('/api/') ? json({error:err.message?.includes('UNIQUE') ? 'Ya existe un proyecto con ese slug.' : err.message || 'Error interno'},400) : html(layout('Error','<main class="section"><h1>No se pudo cargar la página.</h1></main>'),500); }
}};
