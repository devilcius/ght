const root = document.querySelector("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
async function api(url, options = {}) {
  const r = await fetch(url, options), data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
function notice(message) {
  const n = document.querySelector("#notice");
  n.textContent = message;
  n.focus();
}
export {
  api,
  esc,
  notice,
  root
};
