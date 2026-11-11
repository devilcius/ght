import {renderProperties} from '../page-views.js';
import {listProperties} from '../property.js';

export async function propertiesPage(env, url, origin, indexable) {
  const all = await listProperties(env), selected = url.searchParams.get('operacion') || '';
  const list = selected ? all.filter(p=>p.operation===selected) : all;
  const filters = `<nav class="category-filters" aria-label="Filtrar inmuebles por operación"><a href="/inmobiliaria" ${selected?'':'aria-current="page"'}>Todos</a><a href="/inmobiliaria?operacion=sale" ${selected==='sale'?'aria-current="page"':''}>Venta</a><a href="/inmobiliaria?operacion=rent" ${selected==='rent'?'aria-current="page"':''}>Alquiler</a></nav>`;
  return renderProperties({filters, list, origin, indexable, selected});
}
