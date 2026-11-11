import {escapeHtml as e} from './domain.js';

export const siteDescription = 'GHT Arquitectura y Urbanismo: proyectos de arquitectura y urbanismo desde Madrid.';
export function siteOrigin(requestUrl, env) {
  if (env.PUBLIC_SITE_URL) {
    const configured = new URL(env.PUBLIC_SITE_URL);
    if (!['https:', 'http:'].includes(configured.protocol) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash || (configured.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(configured.hostname))) throw new Error('PUBLIC_SITE_URL must be a trusted site origin.');
    return configured.origin;
  }
  if (['localhost','127.0.0.1','[::1]'].includes(requestUrl.hostname)) return requestUrl.origin;
  return 'https://ghtarquitectura.com';
}
export const pageDescription = value => String(value || '').replace(/\s+/g,' ').trim().slice(0,160);
export const layout = (title, body, seo = {}) => {
  const fullTitle = `${title} — GHT Arquitectura`;
  const description = pageDescription(seo.description || siteDescription);
  const meta = seo.canonical ? `<link rel="canonical" href="${e(seo.canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="GHT Arquitectura"><meta property="og:title" content="${e(fullTitle)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(seo.canonical)}"><meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${e(fullTitle)}"><meta name="twitter:description" content="${e(description)}">${seo.image ? `<meta property="og:image" content="${e(seo.image)}"><meta name="twitter:image" content="${e(seo.image)}">` : ''}` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(description)}"><meta name="robots" content="${seo.index ? 'index,follow' : 'noindex,nofollow'}">${meta}<title>${e(fullTitle)}</title><link rel="icon" type="image/svg+xml" href="/brand/g-logo.svg"><link rel="stylesheet" href="/style.css"><script type="module" src="/navigation.js"></script></head><body><header class="header"><a class="brand" href="/" aria-label="GHT Arquitectura, inicio"><img src="/brand/logo.png" alt="" width="2172" height="724"></a><nav aria-label="Navegación principal"><a href="/#proyectos">Proyectos</a><a href="/estudio">Estudio</a><a href="/inmobiliaria">Inmobiliaria</a><a href="/contacto">Contacto</a></nav></header>${body}<footer><span>GHT Arquitectura y Urbanismo</span><span>Madrid · Desde 1976</span><a href="/contacto">Contacto</a><a href="/admin">Administración</a></footer></body></html>`;
};

