import { validateProject, validateProjectOrder } from "./domain.js";
import { imagesFor, variantKeys, variantDeletion } from "./image-variants.js";
import { projects } from "./content-repository.js";
import { json } from "./http.js";
import * as repository from "./project-repository.js";
async function projectApi(request, env, path) {
  if (path === "/api/admin/projects" && request.method === "GET") return json(await projects(env, true));
  if (path === "/api/admin/projects" && request.method === "POST") {
    const input = await request.json();
    const p = validateProject(input);
    const displayOrder = Object.hasOwn(input, "display_order") ? validateProjectOrder(input.display_order) : null;
    const categoryDisplayOrder = Object.hasOwn(input, "category_display_order") ? validateProjectOrder(input.category_display_order) : null;
    const localImport = env.LOCAL_DEVELOPMENT === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
    const id2 = localImport && /^wp-[0-9]+$/.test(input.importId || "") ? input.importId : crypto.randomUUID(), now = (/* @__PURE__ */ new Date()).toISOString();
    await repository.createProject(env.DB, id2, p, now, displayOrder, categoryDisplayOrder);
    return json({ id: id2 }, 201);
  }
  const imageMatch = path.match(/^\/api\/admin\/projects\/([\w-]+)\/images\/([\w-]+)(?:\/(thumbnail))?$/);
  if (imageMatch) {
    const [, projectId, imageId, variant] = imageMatch;
    const image = await repository.findImage(env.DB, imageId, projectId);
    if (!image) return json({ error: "Imagen no encontrada" }, 404);
    if (variant === "thumbnail" && request.method === "PUT") {
      const bytes = await request.arrayBuffer();
      if (request.headers.get("Content-Type") !== "image/webp" || !bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) return json({ error: "Miniatura inválida" }, 400);
      const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
      if (header.length < 12 || String.fromCharCode(...header.slice(0, 4)) !== "RIFF" || String.fromCharCode(...header.slice(8, 12)) !== "WEBP") return json({ error: "Miniatura inválida" }, 400);
      const key = crypto.randomUUID();
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/webp" } });
      try {
        const statements = [repository.setThumbnail(env.DB, key, imageId, projectId)];
        if (image.thumbnail_key) statements.push(repository.pendingDeletion(env.DB, image.thumbnail_key));
        await env.DB.batch(statements);
      } catch (error) {
        await env.MEDIA.delete(key);
        throw error;
      }
      return json({ ok: true });
    }
    if (variant) return json({ error: "Método no permitido" }, 405);
    if (request.method === "PATCH") {
      const { alt } = await request.json();
      if (typeof alt !== "string" || alt.length > 300) return json({ error: "El texto alternativo debe tener como máximo 300 caracteres." }, 400);
      await repository.updateAlt(env.DB, alt.trim(), imageId, projectId);
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      const variants = await variantKeys(env, "projects", imageId);
      await env.DB.batch([
        ...variants.map((key) => repository.pendingDeletion(env.DB, key)),
        variantDeletion(env, "projects", imageId),
        repository.pendingDeletion(env.DB, image.object_key),
        ...image.thumbnail_key ? [repository.pendingDeletion(env.DB, image.thumbnail_key)] : [],
        repository.clearCover(env.DB, projectId, imageId),
        repository.deleteImage(env.DB, imageId, projectId)
      ]);
      try {
        await env.MEDIA.delete(image.object_key);
        await repository.clearPendingDeletion(env.DB, image.object_key);
        if (image.thumbnail_key) {
          await env.MEDIA.delete(image.thumbnail_key);
          await repository.clearPendingDeletion(env.DB, image.thumbnail_key);
        }
        for (const key of variants) {
          await env.MEDIA.delete(key);
          await repository.clearPendingDeletion(env.DB, key);
        }
        return json({ ok: true });
      } catch (error) {
        console.error("Media cleanup pending", error);
        return json({ ok: true, cleanupPending: true });
      }
    }
    return json({ error: "Método no permitido" }, 405);
  }
  const match = path.match(/^\/api\/admin\/projects\/([\w-]+)(?:\/(images|order|cover))?$/);
  if (!match) return json({ error: "No encontrado" }, 404);
  const [, id, action] = match;
  const project = await repository.findProject(env.DB, id);
  if (!project) return json({ error: "Proyecto no encontrado" }, 404);
  if (!action && request.method === "GET") {
    return json({ ...project, images: await imagesFor(env, "projects", id) });
  }
  if (!action && request.method === "PUT") {
    const input = await request.json();
    const p = validateProject(input);
    const displayOrder = Object.hasOwn(input, "display_order") ? validateProjectOrder(input.display_order) : project.display_order;
    const categoryDisplayOrder = Object.hasOwn(input, "category_display_order") ? validateProjectOrder(input.category_display_order) : p.category === project.category ? project.category_display_order : null;
    await repository.updateProject(env.DB, id, p, displayOrder, categoryDisplayOrder);
    return json({ ok: true });
  }
  if (action === "images" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0) return json({ error: "Imagen inválida. Usa JPG, PNG o WebP de hasta 10 MB." }, 400);
    const key = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    try {
      await repository.insertImage(env.DB, imageId, id, key, String(form.get("alt") || "").slice(0, 300));
    } catch (err) {
      await env.MEDIA.delete(key);
      throw err;
    }
    return json({ id: imageId }, 201);
  }
  if (action === "cover" && request.method === "PUT") {
    const { imageId } = await request.json();
    if (typeof imageId !== "string" || !await repository.imageExists(env.DB, imageId, id)) return json({ error: "Imagen no encontrada" }, 400);
    await repository.setCover(env.DB, imageId, id);
    return json({ ok: true });
  }
  if (action === "order" && request.method === "PUT") {
    const { ids } = await request.json();
    const existing = await repository.imageIds(env.DB, id);
    if (!Array.isArray(ids) || ids.length !== existing.length || new Set(ids).size !== existing.length || ids.some((x) => !existing.includes(x))) return json({ error: "Orden inválido" }, 400);
    await env.DB.batch(ids.map((imageId, i) => repository.setImagePosition(env.DB, i, imageId, id)));
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
}
export {
  projectApi
};
