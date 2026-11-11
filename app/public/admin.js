import {root} from './admin/common.js';
import {list} from './admin/projects.js';
import {listProperties} from './admin/properties.js';
import {editContent} from './admin/content.js';

function showPage(load) {
  load().catch(error => { root.textContent = error.message; });
}

document.querySelector('#tab-projects').onclick = () => showPage(list);
document.querySelector('#tab-properties').onclick = () => showPage(listProperties);
document.querySelector('#tab-content').onclick = () => showPage(editContent);
showPage(list);
