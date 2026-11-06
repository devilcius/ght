export function validateProject(input) {
  const title = String(input.title ?? '').trim();
  const slug = String(input.slug ?? '').trim().toLowerCase();
  if (!title || title.length > 180) throw new Error('El título es obligatorio (máximo 180 caracteres).');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) throw new Error('El slug solo admite letras minúsculas, números y guiones.');
  return {title, slug, category: String(input.category ?? '').trim().slice(0,100), location: String(input.location ?? '').trim().slice(0,150), year: String(input.year ?? '').trim().slice(0,50), description: String(input.description ?? '').trim().slice(0,10000), published: input.published === true || input.published === 1 ? 1 : 0};
}
export function validateProjectOrder(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('El orden debe ser un número entero positivo.');
  if (!/^[0-9]+$/.test(String(value))) throw new Error('El orden debe ser un número entero positivo.');
  const order = Number(value);
  if (!Number.isSafeInteger(order) || order < 1 || order > 1000000) throw new Error('El orden debe estar entre 1 y 1000000.');
  return order;
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
