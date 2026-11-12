import { siteImageApi } from "./site-images.js";
import { isAdmin } from "./auth.js";
import { uploadVariant } from "./image-variants.js";
import { propertyApi } from "./property.js";
import { contentKeys, validateSiteContent } from "./site-content.js";
import { siteContent } from "./content-repository.js";
import { projectApi } from "./project-api.js";
import { json } from "./http.js";
async function adminApi(request, env, path) {
  if (!await isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Origen no permitido" }, 403);
  const pending = await env.DB.prepare("SELECT object_key FROM pending_media_deletions LIMIT 25").all();
  for (const item of pending.results) {
    try {
      await env.MEDIA.delete(item.object_key);
      await env.DB.prepare("DELETE FROM pending_media_deletions WHERE object_key=?").bind(item.object_key).run();
    } catch (error) {
      console.error("Media cleanup pending", error);
    }
  }
  const siteImageMatch = path.match(/^\/api\/admin\/content\/images\/(studio|team_[1-4])$/);
  if (siteImageMatch) return await siteImageApi(request, env, siteImageMatch[1]);
  const variantMatch = path.match(/^\/api\/admin\/(projects|properties)\/([\w-]+)\/images\/([\w-]+)\/variants\/(\d+)$/);
  if (variantMatch) return request.method === "PUT" ? await uploadVariant(request, env, variantMatch[1], variantMatch[2], variantMatch[3], variantMatch[4]) : json({ error: "Método no permitido" }, 405);
  if (path === "/api/admin/properties" || path.startsWith("/api/admin/properties/")) return await propertyApi(request, env, path);
  if (path === "/api/admin/content" && request.method === "GET") return json(await siteContent(env));
  if (path === "/api/admin/content" && request.method === "PUT") {
    const content = validateSiteContent(await request.json());
    await env.DB.batch(contentKeys.map((key) => env.DB.prepare("INSERT INTO site_content (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, content[key])));
    return json({ ok: true });
  }
  return projectApi(request, env, path);
}
export {
  adminApi
};
