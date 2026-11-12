import { root, esc, api, notice } from './common.js';
import { optimizeSiteImage } from './images.js';

async function editContent(isCurrent = () => true) {
  const content = await api('/api/admin/content');
  if (!isCurrent()) return;
  const text = (key, label, rows = 1) => `<label>${label}${rows === 1 ? `<input name="${key}" value="${esc(content[key])}" required>` : `<textarea name="${key}" rows="${rows}">${esc(content[key])}</textarea>`}</label>`;
  const image = (slot, label) => {
    const key = content[`${slot}_image_variant_key`] || content[`${slot}_image_key`];
    const src = key ? `/media/${encodeURIComponent(key)}` : slot === 'studio' ? '/brand/estudio.jpg' : '/brand/team-placeholder.svg';
    return `<div class="site-image-editor" data-site-image="${slot}"><img src="${esc(src)}" alt="Vista previa: ${label}"><div><label>${label}<input type="file" accept="image/jpeg,image/png,image/webp" data-site-file="${slot}"></label><div class="site-image-actions"><button type="button" data-site-upload="${slot}">Actualizar imagen</button><button type="button" class="secondary" data-site-reset="${slot}" ${key ? '' : 'disabled'}>Restablecer imagen</button></div><small>JPEG, PNG o WebP, hasta 10 MB.</small></div></div>`;
  };
  root.innerHTML = `<h2>Estudio y contacto</h2><p>Edita la presentación, las personas del equipo y los datos de contacto.</p><div id="notice" role="alert" tabindex="-1"></div><form id="content-form">${image('studio', 'Imagen del estudio')}${text('studio_intro', 'Presentación del estudio', 8)}<h3>Equipo</h3>${[1, 2, 3, 4].map(i => `<fieldset><legend>Persona ${i}</legend>${image(`team_${i}`, 'Fotografía')}${text(`team_${i}_name`, 'Nombre')}${text(`team_${i}_bio`, 'Biografía', 6)}</fieldset>`).join('')}<h3>Contacto</h3><div class="form-grid">${text('contact_email', 'Correo electrónico')}${text('contact_phone', 'Teléfono')}</div>${text('contact_address', 'Dirección')}<button type="submit">Guardar contenido</button></form>`;
  root.querySelector('#content-form').onsubmit = async event => {
    event.preventDefault();
    try {
      await api('/api/admin/content', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});
      notice('Contenido guardado.', {focus: false});
    } catch (error) { notice(error.message, {focus: false}); }
  };
  root.querySelectorAll('[data-site-image]').forEach(editor => {
    const slot = editor.dataset.siteImage, file = editor.querySelector('[data-site-file]');
    const upload = editor.querySelector('[data-site-upload]'), reset = editor.querySelector('[data-site-reset]');
    const fallback = slot === 'studio' ? '/brand/estudio.jpg' : '/brand/team-placeholder.svg';
    upload.onclick = async () => {
      if (!file.files.length) { notice('Selecciona una imagen primero.', {focus: false}); return; }
      const selected = file.files[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 10 * 1024 * 1024 || !selected.size) { notice('Selecciona una imagen JPEG, PNG o WebP de hasta 10 MB.', {focus: false}); return; }
      upload.disabled = true; reset.disabled = true;
      try {
        notice('Preparando imagen…', {focus: false});
        const form = new FormData(); form.append('file', selected);
        let optimized = true;
        try { form.append('optimized', await optimizeSiteImage(selected), 'optimized.webp'); } catch { optimized = false; }
        const result = await api(`/api/admin/content/images/${slot}`, {method: 'POST', body: form});
        if (!editor.isConnected) return;
        editor.querySelector('img').src = `/media/${encodeURIComponent(result.displayKey)}`;
        file.value = ''; reset.dataset.hasImage = 'true';
        notice(optimized ? 'Imagen actualizada.' : 'Imagen actualizada, pero no se pudo optimizar en este navegador.', {focus: false});
      } catch (error) { if (editor.isConnected) notice(error.message, {focus: false}); }
      finally { upload.disabled = false; reset.disabled = reset.dataset.hasImage !== 'true'; if (upload.isConnected) upload.focus({preventScroll: true}); }
    };
    reset.dataset.hasImage = reset.disabled ? 'false' : 'true';
    reset.onclick = async () => {
      upload.disabled = true; reset.disabled = true;
      try {
        await api(`/api/admin/content/images/${slot}`, {method: 'DELETE'});
        if (!editor.isConnected) return;
        editor.querySelector('img').src = fallback; file.value = ''; reset.dataset.hasImage = 'false';
        notice('Imagen restablecida.', {focus: false});
      } catch (error) { if (editor.isConnected) notice(error.message, {focus: false}); }
      finally { upload.disabled = false; reset.disabled = reset.dataset.hasImage !== 'true'; if (reset.isConnected) (reset.disabled ? upload : reset).focus({preventScroll: true}); }
    };
  });
}
export { editContent };
