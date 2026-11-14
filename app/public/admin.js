import {root} from './admin/common.js';
import {list} from './admin/projects.js';
import {listProperties} from './admin/properties.js';
import {editContent} from './admin/content.js';
import {listUsers} from './admin/users.js';

const sections = {
  '/admin/proyectos': {link: document.querySelector('#tab-projects'), load: list},
  '/admin/inmobiliaria': {link: document.querySelector('#tab-properties'), load: listProperties},
  '/admin/estudio': {link: document.querySelector('#tab-content'), load: editContent},
  '/admin/usuarios': {link: document.querySelector('#tab-users'), load: listUsers}
};
let navigationVersion = 0;

function showPage() {
  const version = ++navigationVersion;
  const path = location.pathname.replace(/\/$/, '') || '/admin';
  const active = sections[path] || sections['/admin/proyectos'];
  for (const section of Object.values(sections)) {
    if (section === active) section.link.setAttribute('aria-current', 'page');
    else section.link.removeAttribute('aria-current');
  }
  const isCurrent = () => version === navigationVersion;
  active.load(isCurrent).catch(error => { if (isCurrent()) root.textContent = error.message; });
}

for (const [path, section] of Object.entries(sections)) {
  section.link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.pathname !== path) history.pushState(null, '', path);
    showPage();
  });
}
window.addEventListener('popstate', showPage);
showPage();
