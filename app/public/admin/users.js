import {api, esc, notice, root} from './common.js';

export async function listUsers(isCurrent = () => true) {
  const {users} = await api('/api/admin/users');
  if (!isCurrent()) return;
  root.innerHTML = `<h2>Usuarios</h2><p>Gestiona las personas que pueden administrar la web.</p><p>Para acceder, cada persona también debe estar autorizada en Cloudflare Access.</p><div id="notice" role="status" aria-live="polite" tabindex="-1"></div><form id="new-user" class="user-create"><label>Correo electrónico<input name="email" type="email" maxlength="254" required autocomplete="off" placeholder="nombre@ejemplo.com"></label><button type="submit">Añadir usuario</button></form><div class="user-list">${users.map(user => `<div class="user-row" data-user="${esc(user.id || '')}"><div><strong>${esc(user.email)}</strong><small>${user.owner ? 'Cuenta principal' : user.active ? 'Activo' : 'Desactivado'}${user.current ? ' · Tu cuenta' : ''}</small></div>${user.owner || user.current ? '' : `<div class="user-actions"><button type="button" data-user-active="${esc(user.id)}" data-active="${user.active}">${user.active ? 'Desactivar' : 'Activar'}</button><button type="button" class="remove-image" data-user-delete="${esc(user.id)}">Eliminar</button></div>`}</div>`).join('')}</div>`;
  const refresh = async message => {
    await listUsers(isCurrent);
    if (isCurrent()) notice(message,{focus:false});
  };
  const form = root.querySelector('#new-user');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button'), email = form.elements.email.value.trim();
    button.disabled = true; button.textContent = 'Añadiendo…';
    try {
      await api('/api/admin/users', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      await refresh('Usuario añadido. Comprueba que tenga acceso en Cloudflare.');
    } catch (error) { if (isCurrent()) notice(error.message,{focus:false}); }
    finally { if (button.isConnected) { button.disabled = false; button.textContent = 'Añadir usuario'; } }
  };
  root.querySelectorAll('[data-user-active]').forEach(button => button.onclick = async () => {
    const active = button.dataset.active !== 'true';
    button.disabled = true;
    try {
      await api(`/api/admin/users/${encodeURIComponent(button.dataset.userActive)}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active})});
      await refresh(active ? 'Usuario activado.' : 'Usuario desactivado.');
    } catch (error) { if (isCurrent()) notice(error.message,{focus:false}); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  root.querySelectorAll('[data-user-delete]').forEach(button => button.onclick = async () => {
    if (!window.confirm('¿Eliminar este usuario? Perderá el acceso a la administración.')) return;
    button.disabled = true;
    try {
      await api(`/api/admin/users/${encodeURIComponent(button.dataset.userDelete)}`, {method:'DELETE'});
      await refresh('Usuario eliminado.');
    } catch (error) { if (isCurrent()) notice(error.message,{focus:false}); }
    finally { if (button.isConnected) button.disabled = false; }
  });
}
