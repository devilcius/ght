import {json} from './http.js';

const slots = ['studio', 'team_1', 'team_2', 'team_3', 'team_4'];
export const siteImageKeys = slots.flatMap(slot => [`${slot}_image_key`, `${slot}_image_variant_key`]);
export function siteImageUrl(content, slot) {
  const key = content[`${slot}_image_variant_key`] || content[`${slot}_image_key`];
  return key ? `/media/${encodeURIComponent(key)}` : slot === 'studio' ? '/brand/estudio.jpg' : '/brand/team-placeholder.svg';
}

export async function siteImageApi(request, env, slot) {
  if (!slots.includes(slot)) return json({error: 'Imagen no encontrada'}, 404);
  if (!['POST', 'DELETE'].includes(request.method)) return json({error: 'Método no permitido'}, 405);
  const originalField = `${slot}_image_key`, variantField = `${slot}_image_variant_key`;
  let original, variant;
  if (request.method === 'POST') {
    const form = await request.formData();
    original = form.get('file'); variant = form.get('optimized');
    if (!(original instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(original.type) || !original.size || original.size > 10 * 1024 * 1024) return json({error: 'Selecciona una imagen JPEG, PNG o WebP de hasta 10 MB.'}, 400);
    if (variant) {
      if (!(variant instanceof File) || variant.type !== 'image/webp' || variant.size > 2 * 1024 * 1024 || variant.size < 12) return json({error: 'La imagen optimizada no es válida.'}, 400);
      const header = new Uint8Array(await variant.slice(0, 12).arrayBuffer());
      if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP') return json({error: 'La imagen optimizada no es válida.'}, 400);
    }
  }
  const previous = await env.DB.prepare('SELECT value FROM site_content WHERE key IN (?,?)').bind(originalField, variantField).all();
  const oldKeys = [...new Set(previous.results.map(row => row.value).filter(Boolean))];
  const originalKey = original ? crypto.randomUUID() : null;
  const variantKey = variant ? crypto.randomUUID() : null;
  const created = [];
  try {
    if (original) { await env.MEDIA.put(originalKey, original.stream(), {httpMetadata: {contentType: original.type}}); created.push(originalKey); }
    if (variant) { await env.MEDIA.put(variantKey, variant.stream(), {httpMetadata: {contentType: variant.type}}); created.push(variantKey); }
    const statements = [[originalField, originalKey], [variantField, variantKey]].map(([field, key]) => key
      ? env.DB.prepare('INSERT INTO site_content (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(field, key)
      : env.DB.prepare('DELETE FROM site_content WHERE key=?').bind(field));
    statements.push(...oldKeys.map(key => env.DB.prepare('INSERT OR IGNORE INTO pending_media_deletions (object_key) VALUES (?)').bind(key)));
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.allSettled(created.map(key => env.MEDIA.delete(key)));
    throw error;
  }
  let cleanupPending = false;
  for (const key of oldKeys) {
    try { await env.MEDIA.delete(key); await env.DB.prepare('DELETE FROM pending_media_deletions WHERE object_key=?').bind(key).run(); }
    catch { cleanupPending = true; }
  }
  return json({ok: true, objectKey: originalKey, displayKey: variantKey || originalKey, cleanupPending});
}
