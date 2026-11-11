import { root, esc, api, notice, removeGalleryRow, savePhotoText } from "./common.js";
import { adminImageSource, generateVariants, retryVariants } from "./images.js";
async function list(isCurrent = () => true) {
  const ps = await api("/api/admin/projects");
  if (!isCurrent()) return;
  root.innerHTML = `<div class="admin-bar"><p>${ps.length} proyectos</p><button id="new">Nuevo proyecto +</button></div><div id="notice" role="alert" tabindex="-1"></div><div>${ps.map((p) => `<button class="admin-row" data-id="${esc(p.id)}"><span><strong>${esc(p.title)}</strong><small>${esc(p.category)} · ${esc(p.year)}${p.display_order != null ? ` · Orden ${esc(p.display_order)}` : ""}</small></span><span>${p.published ? "Publicado" : "Borrador"} →</span></button>`).join("") || "<p>No hay proyectos todavía.</p>"}</div>`;
  root.querySelector("#new").onclick = () => edit();
  root.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => edit(b.dataset.id));
}
async function edit(id, retained = null) {
  const p = id ? await api(`/api/admin/projects/${id}`) : { images: [] };
  const fieldValue = (key) => retained ? retained[key] : p[key];
  root.innerHTML = `<button class="back" id="back">← Todos los proyectos</button><h2>${id ? "Editar proyecto" : "Nuevo proyecto"}</h2><div id="notice" role="status" tabindex="-1"></div><form id="project-form"><div class="form-grid"><label>Título <input name="title" required maxlength="180" value="${esc(fieldValue("title"))}"></label><label>Slug <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${esc(fieldValue("slug"))}"><small>Minúsculas, números y guiones.</small></label><label>Categoría <input name="category" value="${esc(fieldValue("category"))}"></label><label>Ubicación <input name="location" value="${esc(fieldValue("location"))}"></label><label>Año <input name="year" value="${esc(fieldValue("year"))}"></label><label>Orden en el portafolio <input type="number" name="display_order" min="1" max="1000000" step="1" value="${esc(fieldValue("display_order"))}"><small>Los números menores aparecen primero. Deja vacío para mostrarlo después de los proyectos ordenados.</small></label><label>Orden en su categoría <input type="number" name="category_display_order" min="1" max="1000000" step="1" value="${esc(fieldValue("category_display_order"))}"><small>Solo afecta al filtro de esta categoría. Vacío: se usa el orden del portafolio.</small></label></div><label>Descripción <textarea name="description" rows="5">${esc(fieldValue("description"))}</textarea></label><label class="check"><input type="checkbox" name="published" ${fieldValue("published") ? "checked" : ""}> Publicado</label><button>Guardar proyecto</button></form>${id ? `<section class="images"><h3>Galería</h3><p>Elige una portada; si no eliges ninguna, se utiliza la primera imagen. El texto alternativo describe la imagen para quienes no pueden verla.</p><form id="upload"><label>Añadir imagen <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></label><label>Texto alternativo <input name="alt" maxlength="300"></label><button>Subir imagen</button></form><div class="gallery-editor">${p.images.map((img, i) => `<div class="image-row"><img src="/media/${encodeURIComponent(adminImageSource(img))}" alt="${esc(img.alt)}" loading="lazy"><div class="image-details"><label for="alt-${esc(img.id)}">Texto alternativo de la imagen ${i + 1}</label><input id="alt-${esc(img.id)}" data-alt="${esc(img.id)}" maxlength="300" value="${esc(img.alt)}"><div class="image-actions"><button type="button" data-save-alt="${esc(img.id)}">Guardar texto</button><button type="button" data-cover="${esc(img.id)}" ${p.cover_image_id === img.id ? "disabled" : ""}>${p.cover_image_id === img.id ? "Portada" : "Usar como portada"}</button><button type="button" data-move="${i}" data-direction="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir imagen ${i + 1}">↑</button><button type="button" data-move="${i}" data-direction="1" ${i === p.images.length - 1 ? "disabled" : ""} aria-label="Bajar imagen ${i + 1}">↓</button><button type="button" data-optimize="${esc(img.id)}">Optimizar imagen</button><button type="button" class="remove-image" data-remove="${esc(img.id)}">Eliminar imagen</button></div></div></div>`).join("")}</div></section>` : "<p>Guarda el proyecto para añadir imágenes.</p>"}`;
  root.querySelector("#back").onclick = () => list();
  const categoryInput = root.querySelector("#project-form [name=category]");
  let previousCategory = categoryInput.value.trim();
  categoryInput.addEventListener("change", () => {
    const current = categoryInput.value.trim();
    if (current !== previousCategory) root.querySelector("#project-form [name=category_display_order]").value = "";
    previousCategory = current;
  });
  const snapshot = () => {
    const form = root.querySelector("#project-form"), values = Object.fromEntries(new FormData(form));
    values.published = form.published.checked;
    return values;
  };
  const refresh = async (message, focusSelector) => {
    const values = snapshot();
    await edit(id, values);
    notice(message);
    if (focusSelector) root.querySelector(focusSelector)?.focus();
  };
  root.querySelector("#project-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = snapshot();
    try {
      const result = await api(id ? `/api/admin/projects/${id}` : "/api/admin/projects", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      await edit(id || result.id);
      notice("Proyecto guardado.");
    } catch (e) {
      notice(e.message);
    }
  };
  if (id) {
    root.querySelectorAll("[data-cover]").forEach((b) => b.onclick = async () => {
      try {
        await api(`/api/admin/projects/${id}/cover`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: b.dataset.cover }) });
        await refresh("Portada actualizada.");
      } catch (e) {
        notice(e.message);
      }
    });
    root.querySelector("#upload").onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget, file = form.elements.file.files[0], button = form.querySelector("button");
      button.disabled = true;
      notice("Subiendo y optimizando imagen…");
      try {
        const result = await api(`/api/admin/projects/${id}/images`, { method: "POST", body: new FormData(form) });
        let message = "Imagen subida.";
        try {
          await generateVariants(file, "projects", id, result.id);
        } catch (error) {
          message = "Imagen subida, pero no se pudo optimizar. Usa «Optimizar imagen» para reintentar.";
        }
        await refresh(message);
      } catch (e) {
        button.disabled = false;
        notice(e.message);
      }
    };
    root.querySelectorAll("[data-save-alt]").forEach((b) => b.onclick = async () => {
      const imageId = b.dataset.saveAlt, input = root.querySelector(`[data-alt="${imageId}"]`);
      await savePhotoText({button:b, input, images:p.images, imageId, url:`/api/admin/projects/${id}/images/${imageId}`});
    });
    root.querySelectorAll("[data-optimize]").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        const image = p.images.find((i) => i.id === b.dataset.optimize);
        await retryVariants("projects", id, image);
        await refresh("Imagen optimizada.");
      } catch (error) {
        b.disabled = false;
        notice("No se pudo optimizar la imagen. Inténtalo de nuevo.");
      }
    });
    root.querySelectorAll("[data-remove]").forEach((b) => b.onclick = async () => {
      if (!window.confirm("¿Eliminar esta imagen del proyecto?")) return;
      b.disabled = true;
      try {
        const imageId = b.dataset.remove;
        const result = await api(`/api/admin/projects/${id}/images/${imageId}`, { method: "DELETE" });
        if (p.cover_image_id === imageId) p.cover_image_id = null;
        removeGalleryRow(b, p.images, imageId, {kind:'project', uploadSelector:'#upload [name=file]'});
        notice(result.cleanupPending ? "Imagen eliminada; la limpieza del archivo se reintentará automáticamente." : "Imagen eliminada.", {focus:false});
      } catch (e) {
        b.disabled = false;
        notice(e.message, {focus:false});
      }
    });
    root.querySelectorAll("[data-move]").forEach((b) => b.onclick = async () => {
      const ids = p.images.map((i2) => i2.id), i = Number(b.dataset.move), next = i + Number(b.dataset.direction);
      [ids[next], ids[i]] = [ids[i], ids[next]];
      try {
        await api(`/api/admin/projects/${id}/order`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        await refresh("Orden actualizado.", `[data-move="${next}"][data-direction="${b.dataset.direction}"]`);
      } catch (e) {
        notice(e.message);
      }
    });
  }
}
export {
  list
};
