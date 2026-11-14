import {json} from './http.js';

const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export async function usersApi(request, env, path, actor) {
  if (path === '/api/admin/users' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,email,active,created_at FROM admin_users ORDER BY email COLLATE NOCASE').all();
    const ownerEmail = env.ADMIN_EMAIL?.trim().toLowerCase() || (actor.owner ? actor.email : null);
    const users = rows.results.filter(user => user.email.toLowerCase() !== ownerEmail).map(user => ({...user, active: Boolean(user.active), current: user.email.toLowerCase() === actor.email, owner:false}));
    if (ownerEmail) users.unshift({id:null, email:ownerEmail, active:true, current:actor.email === ownerEmail, owner:true});
    return json({users});
  }
  if (path === '/api/admin/users' && request.method === 'POST') {
    let data;
    try { data = await request.json(); } catch { return json({error:'Datos no válidos.'},400); }
    const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (email.length > 254 || !emailPattern.test(email)) return json({error:'Introduce un correo electrónico válido.'},400);
    if (email === env.ADMIN_EMAIL?.trim().toLowerCase() || email === actor.email) return json({error:'Este usuario ya existe.'},409);
    const id = crypto.randomUUID();
    try { await env.DB.prepare('INSERT INTO admin_users (id,email,active) VALUES (?,?,1)').bind(id,email).run(); }
    catch (error) { if (/UNIQUE/i.test(error.message)) return json({error:'Este usuario ya existe.'},409); throw error; }
    return json({id,email,active:true},201);
  }
  const match = path.match(/^\/api\/admin\/users\/([\w-]+)$/);
  if (!match) return json({error:'Usuario no encontrado.'},404);
  if (!['PATCH','DELETE'].includes(request.method)) return json({error:'Método no permitido.'},405);
  const user = await env.DB.prepare('SELECT id,email,active FROM admin_users WHERE id=?').bind(match[1]).first();
  if (!user) return json({error:'Usuario no encontrado.'},404);
  if (user.email.toLowerCase() === actor.email || user.email.toLowerCase() === env.ADMIN_EMAIL?.trim().toLowerCase()) return json({error:'No puedes modificar tu propia cuenta ni la cuenta principal.'},403);
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM admin_users WHERE id=?').bind(user.id).run();
    return json({ok:true});
  }
  let data;
  try { data = await request.json(); } catch { return json({error:'Datos no válidos.'},400); }
  if (typeof data?.active !== 'boolean') return json({error:'Estado no válido.'},400);
  await env.DB.prepare('UPDATE admin_users SET active=? WHERE id=?').bind(data.active ? 1 : 0,user.id).run();
  return json({ok:true});
}
