const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Revisa los datos del formulario.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (name.length < 2 || name.length > 120 || /[\r\n]/.test(name)) throw new Error('Introduce tu nombre (entre 2 y 120 caracteres).');
  if (email.length > 254 || !emailPattern.test(email)) throw new Error('Introduce una dirección de correo válida.');
  if (message.length < 10 || message.length > 5000) throw new Error('Escribe un mensaje de entre 10 y 5000 caracteres.');
  if (input.consent !== true) throw new Error('Acepta el uso de tus datos para responder a tu consulta.');
  return {name,email,message};
}

export async function handleContact(request, env, send = fetch) {
  const response = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return response({error:'Método no permitido.'},405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return response({error:'Origen no permitido.'},403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return response({error:'Formato no válido.'},415);
  if (Number(request.headers.get('Content-Length') || 0) > 16384) return response({error:'El mensaje es demasiado largo.'},413);
  let data;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 16384) return response({error:'El mensaje es demasiado largo.'},413);
    data = JSON.parse(raw);
  } catch { return response({error:'Formato no válido.'},400); }
  if (typeof data?.website === 'string' && data.website.trim()) return response({ok:true});
  let contact;
  try { contact = validateContact(data); } catch (error) { return response({error:error.message},400); }
  let propertyContext = '';
  if (data.propertySlug) {
    if (typeof data.propertySlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.propertySlug) || data.propertySlug.length > 180) return response({error:'Inmueble no válido.'},400);
    const property = await env.DB.prepare('SELECT title,slug FROM properties WHERE slug=? AND published=1').bind(data.propertySlug).first();
    if (!property) return response({error:'Este inmueble ya no está disponible. Contacta con nosotros para más información.'},400);
    propertyContext = `Inmueble: ${property.title} (${property.slug})\n\n`;
  }
  const url = new URL(request.url);
  if (env.LOCAL_DEVELOPMENT === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return response({ok:true,simulated:true});
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) return response({error:'El formulario no está disponible en este momento. Puedes escribirnos por correo.'},503);
  try {
    const result = await send('https://api.resend.com/emails',{
      method:'POST',headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.CONTACT_FROM_EMAIL,to:[env.CONTACT_TO_EMAIL],reply_to:contact.email,subject:'Nueva consulta desde la web de GHT',text:`${propertyContext}Nombre: ${contact.name}\nCorreo: ${contact.email}\n\nMensaje:\n${contact.message}`})
    });
    if (!result.ok) return response({error:'No se ha podido enviar el mensaje. Inténtalo de nuevo o escríbenos por correo.'},502);
    return response({ok:true});
  } catch { return response({error:'No se ha podido enviar el mensaje. Inténtalo de nuevo o escríbenos por correo.'},502); }
}
