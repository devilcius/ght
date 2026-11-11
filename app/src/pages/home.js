import {renderHome} from '../page-views.js';
import {escapeHtml as e} from '../domain.js';
import {projects, siteContent} from '../content-repository.js';

export async function homePage(env, url, origin, indexable) {
  const allProjects = await projects(env);
  const categories = [...new Set(allProjects.map(p => p.category.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const selectedCategory = url.searchParams.get('categoria') || '';
  const list = selectedCategory ? allProjects.filter(p=>p.category.trim() === selectedCategory).sort((a,b)=>(a.category_display_order ?? Number.MAX_SAFE_INTEGER)-(b.category_display_order ?? Number.MAX_SAFE_INTEGER)) : allProjects;
  const filters = `<nav class="category-filters" aria-label="Filtrar proyectos por categoría"><a href="/#proyectos" ${selectedCategory ? '' : 'aria-current="page"'}>Todos</a>${categories.map(category=>`<a href="/?categoria=${encodeURIComponent(category)}#proyectos" ${selectedCategory===category ? 'aria-current="page"' : ''}>${e(category)}</a>`).join('')}</nav>`;
  const content = await siteContent(env);
  return renderHome({filters, list, content, origin, indexable, selectedCategory});
}
