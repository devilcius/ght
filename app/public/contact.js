export function initContact() {
  const form = document.querySelector('#contact-form');
  const status = document.querySelector('#contact-status');
  if (!form || !status || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.sending || !form.reportValidity()) return;
    const submit = form.querySelector('button[type="submit"]');
    const buttonContent = submit.innerHTML;
    const data = new FormData(form);
    const controls = [...form.querySelectorAll('input, textarea, button')].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    form.dataset.sending = 'true';
    form.setAttribute('aria-busy', 'true');
    submit.textContent = 'Enviando mensaje…';
    status.dataset.state = 'sending';
    status.textContent = 'Estamos enviando tu mensaje. Un momento, por favor.';
    try {
      const response = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),email:data.get('email'),message:data.get('message'),website:data.get('website'),propertySlug:data.get('propertySlug') || '',consent:data.get('consent') === 'on'})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se ha podido enviar el mensaje.');
      form.reset();
      status.dataset.state = 'success';
      status.textContent = result.simulated ? 'Formulario de prueba: no se ha enviado ningún mensaje.' : 'Tu mensaje se ha enviado. Gracias por contactar con nosotros.';
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = error instanceof TypeError ? 'No se ha podido conectar. Inténtalo de nuevo o escríbenos por correo.' : error.message;
    } finally {
      controls.forEach(control => { control.disabled = false; });
      delete form.dataset.sending;
      form.removeAttribute('aria-busy');
      submit.innerHTML = buttonContent;
      if (status.isConnected) status.focus({preventScroll:true});
    }
  });
}

initContact();
