import { root, esc, api, notice, removeGalleryRow, savePhotoText } from "./common.js";
import { adminImageSource, retryVariants, uploadPhotos } from "./images.js";
async function listProperties(isCurrent = () => true) {
  const properties = await api("/api/admin/properties");
  if (!isCurrent()) return;
  root.innerHTML = `<div class="admin-bar"><p>${properties.length} inmuebles</p><button id="new-property">Nuevo inmueble +</button></div><div id="notice" role="status" tabindex="-1"></div><div>${properties.map((p) => `<button class="admin-row" data-property="${esc(p.id)}"><span><strong>${esc(p.title)}</strong><small>${p.operation === "rent" ? "Alquiler" : "Venta"} · ${esc(p.location)}</small></span><span>${p.published ? "Publicado" : "Borrador"} →</span></button>`).join("") || "<p>No hay inmuebles todavía.</p>"}</div>`;
  root.querySelector("#new-property").onclick = () => editProperty();
  root.querySelectorAll("[data-property]").forEach((b) => b.onclick = () => editProperty(b.dataset.property));
}
async function editProperty(id, retained = null) {
  const p = id ? await api(`/api/admin/properties/${id}`) : { images: [], operation: "sale", availability: "available" };
  const val = (key) => retained ? retained[key] : p[key];
  const choice = (key, value, label) => `<option value="${value}" ${val(key) === value ? "selected" : ""}>${label}</option>`;
  root.innerHTML = `<button class="back" id="property-back">← Todos los inmuebles</button><h2>${id ? "Editar inmueble" : "Nuevo inmueble"}</h2><div id="notice" role="status" tabindex="-1"></div><form id="property-form"><div class="form-grid"><label>Título <input name="title" required maxlength="180" value="${esc(val("title"))}"></label><label>Operación <select name="operation">${choice("operation", "sale", "Venta")}${choice("operation", "rent", "Alquiler")}</select></label><label>Disponibilidad <select name="availability">${choice("availability", "available", "Disponible")}${choice("availability", "reserved", "Reservado")}${choice("availability", "sold", "Vendido o alquilado")}</select></label><label>Ubicación <input name="location" maxlength="150" value="${esc(val("location"))}"></label><label>Precio en euros <input name="price_eur" type="number" min="0" max="1000000000" step="1" value="${esc(val("price_eur"))}"><small>En alquiler, precio mensual. Vacío: consultar precio.</small></label><label>Superficie en m² <input name="area_m2" type="number" min="0.01" max="1000000" step="0.01" value="${esc(val("area_m2"))}"></label><label>Dormitorios <input name="bedrooms" type="number" min="0" max="1000" step="1" value="${esc(val("bedrooms"))}"></label><label>Baños <input name="bathrooms" type="number" min="0" max="1000" step="1" value="${esc(val("bathrooms"))}"></label></div><label>Descripción <textarea name="description" rows="6" maxlength="10000">${esc(val("description"))}</textarea><small>Admite Markdown: **negrita**, *cursiva*, listas y [enlaces](https://ejemplo.com).</small></label>${!id ? `<label>Fotos <input type="file" name="pending_photos" accept="image/jpeg,image/png,image/webp" multiple><small>Puedes seleccionar varias fotos y describir cada una después de guardar.</small></label>` : ""}<label class="check"><input type="checkbox" name="published" ${val("published") ? "checked" : ""}> Publicado</label><button>Guardar inmueble</button></form>${id ? `<section class="images"><h3>Fotos</h3><p>Elige una portada; si no eliges ninguna, se utiliza la primera foto. El nombre o descripción aparece en el visor y sirve como texto alternativo.</p><form id="property-upload"><label>Añadir fotos <input type="file" name="file" accept="image/jpeg,image/png,image/webp" multiple required><small>Puedes seleccionar varias fotos a la vez.</small></label><button>Subir fotos</button></form><div class="gallery-editor">${p.images.map((img, i) => `<div class="image-row"><img src="/media/${encodeURIComponent(adminImageSource(img))}" alt="${esc(img.alt)}" loading="lazy"><div class="image-details"><label for="property-alt-${esc(img.id)}">Nombre o descripción de la foto ${i + 1}</label><input id="property-alt-${esc(img.id)}" data-property-alt="${esc(img.id)}" maxlength="300" value="${esc(img.alt)}"><div class="image-actions"><button type="button" data-property-save-alt="${esc(img.id)}">Guardar texto</button><button type="button" data-property-cover="${esc(img.id)}" ${p.cover_image_id === img.id ? "disabled" : ""}>${p.cover_image_id === img.id ? "Portada" : "Usar como portada"}</button><button type="button" data-property-move="${i}" data-direction="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir foto ${i + 1}">↑</button><button type="button" data-property-move="${i}" data-direction="1" ${i === p.images.length - 1 ? "disabled" : ""} aria-label="Bajar foto ${i + 1}">↓</button><button type="button" data-property-optimize="${esc(img.id)}">Optimizar foto</button><button type="button" class="remove-image" data-property-remove="${esc(img.id)}">Eliminar foto</button></div></div></div>`).join("")}</div></section>` : "<p>Guarda el inmueble para añadir fotos.</p>"}`;
  root.querySelector("#property-back").onclick = () => listProperties();
  const snapshot = () => {
    const form = root.querySelector("#property-form"), data = Object.fromEntries(new FormData(form));
    data.published = form.published.checked;
    delete data.pending_photos;
    return data;
  };
  const refresh = async (message) => {
    const values = snapshot();
    await editProperty(id, values);
    notice(message);
  };
  const uploadMessage = (result, total) => {
    let message = `${result.uploaded} de ${total} fotos subidas.`;
    if (result.failed.length) message += ` No se subieron: ${result.failed.join("; ")}.`;
    if (result.optimizationFailed.length) message += ` No se pudieron optimizar: ${result.optimizationFailed.join(", ")}. Usa «Optimizar foto» para reintentar.`;
    return message;
  };
  const progress = (current, total) => notice(`Subiendo y optimizando foto ${current} de ${total}…`);
  root.querySelector("#property-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type="submit"], button:not([type])');
    const data = snapshot();
    const files = id ? [] : Array.from(form.elements.pending_photos.files);
    const shouldPublish = data.published;
    if (!id && files.length) data.published = false;
    let savedId = id;
    button.disabled = true;
    try {
      const result = await api(id ? `/api/admin/properties/${id}` : "/api/admin/properties", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      savedId ||= result.id;
      let message = "Inmueble guardado.";
      if (files.length) {
        const uploaded = await uploadPhotos('properties', savedId, files, progress);
        message += ` ${uploadMessage(uploaded, files.length)}`;
        if (shouldPublish && !uploaded.failed.length) {
          await api(`/api/admin/properties/${savedId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...data, published:true})});
        } else if (shouldPublish && uploaded.failed.length) {
          message += ' El inmueble queda como borrador; añade las fotos pendientes antes de publicarlo.';
        }
      }
      await editProperty(savedId);
      notice(message);
    } catch (error) {
      if (!id && savedId) {
        await editProperty(savedId);
        notice(`Inmueble guardado. ${error.message}`);
      } else {
        button.disabled = false;
        notice(error.message);
      }
    }
  };
  if (!id) return;
  root.querySelector("#property-upload").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget, files = Array.from(form.elements.file.files), button = form.querySelector("button");
    button.disabled = true;
    try {
      const result = await uploadPhotos('properties', id, files, progress);
      await refresh(uploadMessage(result, files.length));
    } catch (error) {
      button.disabled = false;
      notice(error.message);
    }
  };
  root.querySelectorAll("[data-property-cover]").forEach((b) => b.onclick = async () => {
    try {
      await api(`/api/admin/properties/${id}/cover`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: b.dataset.propertyCover }) });
      await refresh("Portada actualizada.");
    } catch (error) {
      notice(error.message);
    }
  });
  root.querySelectorAll("[data-property-save-alt]").forEach((b) => b.onclick = async () => {
    const imageId = b.dataset.propertySaveAlt, input = root.querySelector(`[data-property-alt="${imageId}"]`);
    await savePhotoText({button:b, input, images:p.images, imageId, url:`/api/admin/properties/${id}/images/${imageId}`});
  });
  root.querySelectorAll("[data-property-optimize]").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const image = p.images.find((i) => i.id === b.dataset.propertyOptimize);
      await retryVariants("properties", id, image);
      await refresh("Foto optimizada.");
    } catch (error) {
      b.disabled = false;
      notice("No se pudo optimizar la foto. Inténtalo de nuevo.");
    }
  });
  root.querySelectorAll("[data-property-remove]").forEach((b) => b.onclick = async () => {
    if (!window.confirm("¿Eliminar esta foto del inmueble?")) return;
    b.disabled = true;
    try {
      const imageId = b.dataset.propertyRemove;
      const result = await api(`/api/admin/properties/${id}/images/${imageId}`, { method: "DELETE" });
      if (p.cover_image_id === imageId) p.cover_image_id = null;
      removeGalleryRow(b, p.images, imageId, {kind:'property', uploadSelector:'#property-upload [name=file]'});
      notice(result.cleanupPending ? "Foto eliminada; la limpieza del archivo se reintentará automáticamente." : "Foto eliminada.", {focus:false});
    } catch (error) {
      b.disabled = false;
      notice(error.message, {focus:false});
    }
  });
  root.querySelectorAll("[data-property-move]").forEach((b) => b.onclick = async () => {
    const ids = p.images.map((x) => x.id), i = Number(b.dataset.propertyMove), j = i + Number(b.dataset.direction);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api(`/api/admin/properties/${id}/order`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      await refresh("Orden actualizado.");
    } catch (error) {
      notice(error.message);
    }
  });
}
export {
  listProperties
};
