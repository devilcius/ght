import {variantsExpression} from './image-variants.js';

export async function projects(env, all = false) {
  const result = await env.DB.prepare(`SELECT p.*, (SELECT json_object('object_key',i.object_key,'thumbnail_key',i.thumbnail_key,'variants',json(${variantsExpression('project_image_variants')})) FROM project_images i WHERE i.id=COALESCE((SELECT x.id FROM project_images x WHERE x.project_id=p.id AND x.id=p.cover_image_id),(SELECT x.id FROM project_images x WHERE x.project_id=p.id ORDER BY x.position,x.id LIMIT 1)) LIMIT 1) AS cover_json FROM projects p ${all ? '' : 'WHERE p.published=1'} ORDER BY (p.display_order IS NULL),p.display_order ASC,p.created_at DESC,p.id ASC`).all();
  return result.results.map(({cover_json,...p})=>({...p,cover:cover_json?JSON.parse(cover_json):null}));
}
export async function siteContent(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM site_content').all();
  return Object.fromEntries(rows.results.map(row => [row.key,row.value]));
}

export async function publishedProjectBySlug(env, slug) {
  return env.DB.prepare('SELECT * FROM projects WHERE slug=? AND published=1').bind(slug).first();
}

export async function publishedPropertyBySlug(env, slug) {
  return env.DB.prepare('SELECT * FROM properties WHERE slug=? AND published=1').bind(slug).first();
}

export async function propertyEnquiryBySlug(env, slug) {
  return env.DB.prepare('SELECT slug,title FROM properties WHERE slug=? AND published=1').bind(slug).first();
}
