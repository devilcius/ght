const root = document.querySelector("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
async function api(url, options = {}) {
  const r = await fetch(url, options), data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
function notice(message, {focus = true} = {}) {
  const n = document.querySelector("#notice");
  n.textContent = message;
  if (focus) n.focus();
}

async function savePhotoText({button, input, images, imageId, url}) {
  const alt = input.value;
  button.disabled = true;
  try {
    await api(url, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({alt})});
    const image = images.find(item => item.id === imageId);
    if (image) image.alt = alt.trim();
    if (button.isConnected) {
      button.closest('.image-row').querySelector('img').alt = alt.trim();
      notice('Texto alternativo guardado.', {focus: false});
    }
  } catch (error) {
    if (button.isConnected) notice(error.message, {focus: false});
  } finally {
    button.disabled = false;
    if (button.isConnected) button.focus({preventScroll: true});
  }
}

function removeGalleryRow(button, images, imageId, {kind, uploadSelector}) {
  const index = images.findIndex(image => image.id === imageId);
  if (index !== -1) images.splice(index, 1);
  const row = button.closest('.image-row');
  const gallery = row.parentElement;
  const neighbor = row.nextElementSibling || row.previousElementSibling;
  row.remove();

  const isProperty = kind === 'property';
  const moveAttribute = isProperty ? 'data-property-move' : 'data-move';
  const labelPrefix = isProperty ? 'Nombre o descripción de la foto' : 'Texto alternativo de la imagen';
  const imageName = isProperty ? 'foto' : 'imagen';
  const rows = [...gallery.querySelectorAll('.image-row')];
  rows.forEach((item, position) => {
    item.querySelector('.image-details label').textContent = `${labelPrefix} ${position + 1}`;
    item.querySelectorAll(`[${moveAttribute}]`).forEach(control => {
      const direction = Number(control.dataset.direction);
      control.setAttribute(moveAttribute, position);
      control.disabled = direction < 0 ? position === 0 : position === rows.length - 1;
      control.setAttribute('aria-label', `${direction < 0 ? 'Subir' : 'Bajar'} ${imageName} ${position + 1}`);
    });
  });
  const nextControl = neighbor?.querySelector('.remove-image') || root.querySelector(uploadSelector);
  nextControl?.focus({preventScroll: true});
}
export {
  api,
  esc,
  notice,
  removeGalleryRow,
  savePhotoText,
  root
};
