import {isAdmin} from './auth.js';

export async function serveMedia(request, env, path) {
      const key = decodeURIComponent(path.slice(7));
      const visible = await env.DB.prepare(`SELECT p.published FROM project_images i JOIN projects p ON p.id=i.project_id WHERE i.object_key=? OR i.thumbnail_key=? UNION ALL SELECT p.published FROM property_images i JOIN properties p ON p.id=i.property_id WHERE i.object_key=? OR i.thumbnail_key=? UNION ALL SELECT p.published FROM project_image_variants v JOIN project_images i ON i.id=v.image_id JOIN projects p ON p.id=i.project_id WHERE v.object_key=? UNION ALL SELECT p.published FROM property_image_variants v JOIN property_images i ON i.id=v.image_id JOIN properties p ON p.id=i.property_id WHERE v.object_key=? UNION ALL SELECT 1 AS published FROM site_content WHERE key IN ('studio_image_key','studio_image_variant_key','team_1_image_key','team_1_image_variant_key','team_2_image_key','team_2_image_variant_key','team_3_image_key','team_3_image_variant_key','team_4_image_key','team_4_image_variant_key') AND value=? LIMIT 1`).bind(key,key,key,key,key,key,key).first();
      if (!visible || (!visible.published && !await isAdmin(request,env))) return new Response('Not found',{status:404});
      const object = await env.MEDIA.get(key); if (!object) return new Response('Not found',{status:404});
      const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('X-Content-Type-Options','nosniff'); headers.set('Cache-Control','private, no-cache'); headers.set('ETag',object.httpEtag);
      const validators=(request.headers.get('If-None-Match')||'').split(',').map(value=>value.trim().replace(/^W\//,''));
      if(validators.includes(object.httpEtag)||validators.includes('*')) return new Response(null,{status:304,headers});
      return new Response(object.body,{headers});
}
