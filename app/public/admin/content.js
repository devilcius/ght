import { root, esc, api, notice } from './common.js';
import { optimizeSiteImage } from './images.js';

async function editContent(isCurrent = () => true) {
  const content = await api('/api/admin/content');
  if (!isCurrent()) return;
  const text = (key, label, rows = 1) => `<label>${label}${rows === 1 ? `<input name="${key}" value="${esc(content[key])}" required>` : `<textarea name="${key}" rows="${rows}">${esc(content[key])}</textarea>`}</label>`;
  const image = (slot, label) => {
    const key = content[`${slot}_image_variant_key`] || content[`${slot}_image_key`];
    const src = key ? `/media/${encodeURIComponent(key)}` : slot === 'studio' ? '/brand/estudio.jpg' : '/brand/team-placeholder.svg';
    return `<div class="site-image-editor" data-site-image="${slot}"><img src="${esc(src)}" alt="Vista previa: ${label}"><div><label>${label}<input type="file" accept="image/jpeg,image/png,image/webp" data-site-file="${slot}"></label><div class="site-image-actions"><button type="button" data-site-upload="${slot}">Actualizar imagen</button><button type="button" class="secondary" data-site-reset="${slot}" ${key ? '' : 'disabled'}>Restablecer imagen</button></div><small>JPEG, PNG o WebP, hasta 10 MB. Las imágenes se guardan al actualizarlas.</small><p class="site-image-status" role="status" aria-live="polite"></p></div></div>`;
  };
  root.innerHTML = `<h2>Estudio y contacto</h2><p>Edita la presentación, las personas del equipo y los datos de contacto.</p><div id="notice" role="alert" tabindex="-1"></div><form id="content-form">${image('studio', 'Imagen del estudio')}${text('studio_intro', 'Presentación del estudio', 8)}<h3>Equipo</h3>${[1, 2, 3, 4].map(i => `<fieldset><legend>Persona ${i}</legend>${image(`team_${i}`, 'Fotografía')}${text(`team_${i}_name`, 'Nombre')}${text(`team_${i}_bio`, 'Biografía', 6)}</fieldset>`).join('')}<h3>Contacto</h3><div class="form-grid">${text('contact_email', 'Correo electrónico')}${text('contact_phone', 'Teléfono')}</div>${text('contact_address', 'Dirección')}<div class="content-save"><button type="submit" disabled>Guardar cambios</button><span class="content-save-status" role="status" aria-live="polite">No hay cambios pendientes.</span></div></form>`;
  const form = root.querySelector('#content-form');
  const save = form.querySelector('button[type="submit"]');
  const saveStatus = form.querySelector('.content-save-status');
  const values = () => JSON.stringify(Object.fromEntries(new FormData(form)));
  let savedValues = values(), saving = false;
  const refreshSave = () => {
    const changed = values() !== savedValues;
    save.disabled = saving || !changed;
    saveStatus.textContent = saving ? 'Guardando los cambios…' : changed ? 'Hay cambios de texto sin guardar.' : 'No hay cambios pendientes.';
  };
  form.addEventListener('input', event => { if (event.target.name) refreshSave(); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving || values() === savedValues) return;
    const submitted = values();
    saving = true; save.textContent = 'Guardando…'; refreshSave();
    let saved = false, saveError = '';
    try {
      await api('/api/admin/content', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: submitted});
      savedValues = submitted; saved = true;
      if (form.isConnected) notice('Contenido guardado.', {focus: false});
    } catch (error) { saveError = error.message; if (form.isConnected) notice(error.message, {focus: false}); }
    finally {
      saving = false; save.textContent = 'Guardar cambios';
      if (form.isConnected) {
        refreshSave();
        if (saveError) saveStatus.textContent = `No se pudieron guardar los cambios: ${saveError}`;
        else if (saved && values() === savedValues) saveStatus.textContent = 'Cambios guardados.';
      }
    }
  };
  root.querySelectorAll('[data-site-image]').forEach(editor => {
    const slot = editor.dataset.siteImage, file = editor.querySelector('[data-site-file]');
    const upload = editor.querySelector('[data-site-upload]'), reset = editor.querySelector('[data-site-reset]');
    const status = editor.querySelector('.site-image-status');
    const fallback = slot === 'studio' ? '/brand/estudio.jpg' : '/brand/team-placeholder.svg';
    upload.onclick = async () => {
      if (!file.files.length) { notice('Selecciona una imagen primero.', {focus: false}); return; }
      const selected = file.files[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 10 * 1024 * 1024 || !selected.size) { notice('Selecciona una imagen JPEG, PNG o WebP de hasta 10 MB.', {focus: false}); return; }
      upload.disabled = true; reset.disabled = true; file.disabled = true;
      upload.textContent = 'Subiendo imagen…'; status.textContent = 'Preparando y subiendo imagen…';
      try {
        notice('Preparando imagen…', {focus: false});
        const form = new FormData(); form.append('file', selected);
        let optimized = true;
        try { form.append('optimized', await optimizeSiteImage(selected), 'optimized.webp'); } catch { optimized = false; }
        const result = await api(`/api/admin/content/images/${slot}`, {method: 'POST', body: form});
        if (!editor.isConnected) return;
        editor.querySelector('img').src = `/media/${encodeURIComponent(result.displayKey)}`;
        file.value = ''; reset.dataset.hasImage = 'true';
        status.textContent = optimized ? 'Imagen guardada. No necesitas guardar los textos.' : 'Imagen guardada, pero no se pudo optimizar en este navegador.';
        notice(optimized ? 'Imagen actualizada.' : 'Imagen actualizada, pero no se pudo optimizar en este navegador.', {focus: false});
      } catch (error) { if (editor.isConnected) { status.textContent = error.message; notice(error.message, {focus: false}); } }
      finally { upload.disabled = false; file.disabled = false; upload.textContent = 'Actualizar imagen'; reset.disabled = reset.dataset.hasImage !== 'true'; if (upload.isConnected) upload.focus({preventScroll: true}); }
    };
    reset.dataset.hasImage = reset.disabled ? 'false' : 'true';
    reset.onclick = async () => {
      upload.disabled = true; reset.disabled = true; file.disabled = true;
      reset.textContent = 'Restableciendo…'; status.textContent = 'Restableciendo imagen…';
      try {
        await api(`/api/admin/content/images/${slot}`, {method: 'DELETE'});
        if (!editor.isConnected) return;
        editor.querySelector('img').src = fallback; file.value = ''; reset.dataset.hasImage = 'false';
        status.textContent = 'Imagen restablecida y guardada.';
        notice('Imagen restablecida.', {focus: false});
      } catch (error) { if (editor.isConnected) { status.textContent = error.message; notice(error.message, {focus: false}); } }
      finally { upload.disabled = false; file.disabled = false; reset.textContent = 'Restablecer imagen'; reset.disabled = reset.dataset.hasImage !== 'true'; if (reset.isConnected) (reset.disabled ? upload : reset).focus({preventScroll: true}); }
    };
  });
}
export { editContent };
