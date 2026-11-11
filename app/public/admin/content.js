import { root, esc, api, notice } from "./common.js";
async function editContent() {
  const content = await api("/api/admin/content");
  const text = (key, label, rows = 1) => `<label>${label}${rows === 1 ? `<input name="${key}" value="${esc(content[key])}" required>` : `<textarea name="${key}" rows="${rows}">${esc(content[key])}</textarea>`}</label>`;
  root.innerHTML = `<h2>Estudio y contacto</h2><p>Revisa los textos importados antes de publicar la nueva web.</p><div id="notice" role="alert" tabindex="-1"></div><form id="content-form">${text("studio_intro", "Presentación del estudio", 8)}<h3>Equipo</h3>${[1, 2, 3, 4].map((i) => `<fieldset><legend>Persona ${i}</legend>${text(`team_${i}_name`, "Nombre")}${text(`team_${i}_bio`, "Biografía", 6)}</fieldset>`).join("")}<h3>Contacto</h3><div class="form-grid">${text("contact_email", "Correo electrónico")}${text("contact_phone", "Teléfono")}</div>${text("contact_address", "Dirección")}<button type="submit">Guardar contenido</button></form>`;
  root.querySelector("#content-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      notice("Contenido guardado.");
    } catch (error) {
      notice(error.message);
    }
  };
}
export {
  editContent
};
