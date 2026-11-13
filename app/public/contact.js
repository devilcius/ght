let turnstileLoader;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader) {
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Verification unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Verification unavailable')); };
      document.head.append(script);
    }).catch(error => { turnstileLoader = null; throw error; });
  }
  return turnstileLoader;
}

export function initContact() {
  const form = document.querySelector('#contact-form');
  const status = document.querySelector('#contact-status');
  if (!form || !status || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const local = form.dataset.turnstileMode === 'local';
  const retry = form.querySelector('#contact-verification-retry');
  let token = '', widgetId = null, turnstile;
  const showVerificationError = () => {
    if (!form.isConnected) return;
    token = '';
    status.dataset.state = 'error';
    status.textContent = 'No se ha podido cargar la verificación de seguridad. Inténtalo de nuevo o escríbenos por correo.';
    if (retry) retry.hidden = false;
  };
  const setupVerification = async () => {
    if (!form.dataset.turnstileSiteKey) { showVerificationError(); return; }
    if (retry) retry.hidden = true;
    try {
      turnstile = await loadTurnstile();
      if (!form.isConnected) return;
      if (widgetId !== null) turnstile.remove(widgetId);
      widgetId = turnstile.render(form.querySelector('#contact-verification'), {
        sitekey: form.dataset.turnstileSiteKey,
        action: 'contact',
        'response-field': false,
        callback: value => { token = value; if (status.dataset.state === 'verification') status.textContent = ''; },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { showVerificationError(); return true; }
      });
      if (status.dataset.state === 'error') { status.textContent = ''; delete status.dataset.state; }
    } catch { showVerificationError(); }
  };
  if (!local) {
    setupVerification();
    retry?.addEventListener('click', setupVerification);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.sending || !form.reportValidity()) return;
    if (!local && !token) {
      status.dataset.state = 'verification';
      status.textContent = 'Completa la verificación de seguridad antes de enviar el mensaje.';
      status.focus({preventScroll:true});
      return;
    }
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
      const response = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),email:data.get('email'),message:data.get('message'),website:data.get('website'),propertySlug:data.get('propertySlug') || '',consent:data.get('consent') === 'on',turnstileToken:token})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se ha podido enviar el mensaje.');
      form.reset();
      status.dataset.state = 'success';
      status.textContent = result.simulated ? 'Formulario de prueba: no se ha enviado ningún mensaje.' : 'Tu mensaje se ha enviado. Gracias por contactar con nosotros.';
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = error instanceof TypeError ? 'No se ha podido conectar. Inténtalo de nuevo o escríbenos por correo.' : error.message;
    } finally {
      if (!local && widgetId !== null) {
        token = '';
        try { turnstile.reset(widgetId); } catch { showVerificationError(); }
      }
      controls.forEach(control => { control.disabled = false; });
      delete form.dataset.sending;
      form.removeAttribute('aria-busy');
      submit.innerHTML = buttonContent;
      if (status.isConnected) status.focus({preventScroll:true});
    }
  });
}

initContact();
