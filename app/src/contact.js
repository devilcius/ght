import {contactEmail} from './contact-email.js';

const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Revisa los datos del formulario.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const enquiryType = input.enquiryType;
  if (!['project','real-estate'].includes(enquiryType)) throw new Error('Selecciona el tipo de consulta.');
  if (name.length < 2 || name.length > 120 || /[\r\n]/.test(name)) throw new Error('Introduce tu nombre (entre 2 y 120 caracteres).');
  if (email.length > 254 || !emailPattern.test(email)) throw new Error('Introduce una dirección de correo válida.');
  if (message.length < 10 || message.length > 5000) throw new Error('Escribe un mensaje de entre 10 y 5000 caracteres.');
  if (input.consent !== true) throw new Error('Acepta el uso de tus datos para responder a tu consulta.');
  return {name,email,message,enquiryType};
}

export async function handleContact(request, env, send = fetch) {
  const response = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return response({error:'Método no permitido.'},405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return response({error:'Origen no permitido.'},403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return response({error:'Formato no válido.'},415);
  const url = new URL(request.url);
  const local = env.LOCAL_DEVELOPMENT === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (!local) {
    if (!env.CONTACT_RATE_LIMITER) return response({error:'El formulario no está disponible en este momento. Puedes escribirnos por correo.'},503);
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const limit = await env.CONTACT_RATE_LIMITER.limit({key:ip});
      if (!limit.success) return response({error:'Has enviado demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.'},429);
    } catch { return response({error:'El formulario no está disponible en este momento. Puedes escribirnos por correo.'},503); }
  }
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
  let property = null;
  if (data.propertySlug && contact.enquiryType !== 'real-estate') return response({error:'El inmueble solo puede asociarse a una consulta inmobiliaria.'},400);
  if (data.propertySlug) {
    if (typeof data.propertySlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.propertySlug) || data.propertySlug.length > 180) return response({error:'Inmueble no válido.'},400);
    property = await env.DB.prepare('SELECT title,slug FROM properties WHERE slug=? AND published=1').bind(data.propertySlug).first();
    if (!property) return response({error:'Este inmueble ya no está disponible. Contacta con nosotros para más información.'},400);
  }
  const testTurnstile = local && env.LOCAL_TURNSTILE_TEST === 'true';
  if (local && !testTurnstile) return response({ok:true,simulated:true});
  if (!testTurnstile && (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY)) return response({error:'El formulario no está disponible en este momento. Puedes escribirnos por correo.'},503);
  if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) return response({error:'Completa la verificación de seguridad e inténtalo de nuevo.'},400);
  try {
    const verification = await send('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:testTurnstile ? '1x0000000000000000000000000000000AA' : env.TURNSTILE_SECRET_KEY, response:data.turnstileToken, remoteip:request.headers.get('CF-Connecting-IP') || undefined}),
      signal:AbortSignal.timeout(10000)
    });
    if (!verification.ok) throw new Error('Verification unavailable');
    const result = await verification.json();
    if (!result.success || (testTurnstile ? result.hostname !== 'example.com' : result.hostname !== url.hostname || result.action !== 'contact')) return response({error:'No se ha podido verificar la solicitud. Inténtalo de nuevo.'},400);
  } catch { return response({error:'La verificación de seguridad no está disponible. Inténtalo de nuevo o escríbenos por correo.'},503); }
  if (local) return response({ok:true,simulated:true});
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) return response({error:'El formulario no está disponible en este momento. Puedes escribirnos por correo.'},503);
  try {
    const result = await send('https://api.resend.com/emails',{
      method:'POST',headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.CONTACT_FROM_EMAIL,to:[env.CONTACT_TO_EMAIL],reply_to:contact.email,subject:contact.enquiryType === 'real-estate' ? 'Nueva consulta inmobiliaria · GHT' : 'Nueva consulta de arquitectura · GHT',...contactEmail(contact, property)})
    });
    if (!result.ok) return response({error:'No se ha podido enviar el mensaje. Inténtalo de nuevo o escríbenos por correo.'},502);
    return response({ok:true});
  } catch { return response({error:'No se ha podido enviar el mensaje. Inténtalo de nuevo o escríbenos por correo.'},502); }
}
