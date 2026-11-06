const form = document.querySelector('#contact-form');
const status = document.querySelector('#contact-status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const submit = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  status.textContent = 'Enviando mensaje…';
  try {
    const response = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),email:data.get('email'),message:data.get('message'),website:data.get('website'),propertySlug:data.get('propertySlug') || '',consent:data.get('consent') === 'on'})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se ha podido enviar el mensaje.');
    form.reset();
    status.textContent = result.simulated ? 'Formulario de prueba: no se ha enviado ningún mensaje.' : 'Tu mensaje se ha enviado. Gracias por contactar con nosotros.';
  } catch (error) {
    status.textContent = error instanceof TypeError ? 'No se ha podido conectar. Inténtalo de nuevo o escríbenos por correo.' : error.message;
  } finally {
    submit.disabled = false;
    status.focus();
  }
});
