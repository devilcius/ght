// Enhance public links without replacing the shared header. Direct navigation
// and server-rendered pages remain the fallback when JavaScript cannot run.
const publicPath = path => path === '/' ||
  /^\/(?:estudio|contacto|inmobiliaria)\/?$/.test(path) ||
  /^\/(?:proyectos|inmobiliaria)\/[a-z0-9-]+\/?$/.test(path);

if (publicPath(location.pathname) && document.querySelector('main')) {
  let renderedUrl = new URL(location.href);
  let pending = null;
  let navigating = false;
  let scrollTimer = null;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function savePosition() {
    if (navigating || location.pathname !== renderedUrl.pathname || location.search !== renderedUrl.search) return;
    history.replaceState({...history.state, ghtScroll: {x: scrollX, y: scrollY}}, '', location.href);
  }

  function scrollToLocation(url, saved) {
    if (saved && Number.isFinite(saved.y)) {
      window.scrollTo({left: saved.x || 0, top: saved.y, behavior: 'instant'});
      return;
    }
    if (url.hash) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { id = url.hash.slice(1); }
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({block: 'start', behavior: 'instant'});
        return;
      }
    }
    window.scrollTo({left: 0, top: 0, behavior: 'instant'});
  }

  function updateMetadata(next) {
    document.title = next.title;
    const selector = 'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';
    document.head.querySelectorAll(selector).forEach(node => node.remove());
    next.head.querySelectorAll(selector).forEach(node => document.head.append(document.importNode(node, true)));
  }

  async function initializePage() {
    const tasks = [];
    if (document.querySelector('#contact-form')) tasks.push(import('/contact.js').then(module => module.initContact()));
    if (document.querySelector('.project-gallery')) tasks.push(import('/gallery.js').then(module => module.initGallery()));
    await Promise.all(tasks);
  }

  async function navigate(url, {historyMode = 'push', saved = null} = {}) {
    pending?.abort();
    // Stop any smooth scroll still running on the old page before restoring a position.
    window.scrollTo({left: scrollX, top: scrollY, behavior: 'instant'});
    const controller = new AbortController();
    pending = controller;
    navigating = true;
    try {
      const response = await fetch(url.href, {signal: controller.signal, headers: {'Accept': 'text/html'}});
      if (!response.ok || response.redirected || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Page unavailable');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      const newMain = next.querySelector('main');
      const oldMain = document.querySelector('main');
      if (!newMain || !oldMain) throw new Error('Page content unavailable');
      if (controller.signal.aborted) return;
      oldMain.replaceWith(document.importNode(newMain, true));
      updateMetadata(next);
      if (historyMode === 'push') history.pushState({ghtScroll: {x: 0, y: 0}}, '', url.href);
      renderedUrl = new URL(url.href);
      scrollToLocation(url, saved);
      const main = document.querySelector('main');
      main.setAttribute('tabindex', '-1');
      main.focus({preventScroll: true});
      await initializePage();
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return;
      // The browser performs the usual navigation if enhancement cannot complete.
      if (historyMode === 'pop' || location.href === url.href) location.reload();
      else location.assign(url.href);
    } finally {
      if (pending === controller) {
        pending = null;
        navigating = false;
      }
    }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.relList.contains('external')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !publicPath(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.pathname !== renderedUrl.pathname || url.search !== renderedUrl.search) {
        event.preventDefault();
        navigate(url, {historyMode: 'pop', saved: history.state?.ghtScroll});
        return;
      }
      if (pending) { pending.abort(); pending = null; navigating = false; }
      if (url.hash === location.hash) {
        event.preventDefault();
        scrollToLocation(url, null);
      }
      return;
    }
    event.preventDefault();
    savePosition();
    navigate(url);
  });

  window.addEventListener('scroll', () => {
    if (scrollTimer !== null || navigating) return;
    scrollTimer = setTimeout(() => { scrollTimer = null; savePosition(); }, 500);
  }, {passive: true});

  window.addEventListener('popstate', event => {
    const url = new URL(location.href);
    if (!publicPath(url.pathname)) { location.reload(); return; }
    if (url.pathname === renderedUrl.pathname && url.search === renderedUrl.search) {
      if (pending) { pending.abort(); pending = null; navigating = false; }
      renderedUrl = url;
      scrollToLocation(url, event.state?.ghtScroll);
      return;
    }
    navigate(url, {historyMode: 'pop', saved: event.state?.ghtScroll});
  });
  window.addEventListener('hashchange', () => {
    const url = new URL(location.href);
    if (url.pathname === renderedUrl.pathname && url.search === renderedUrl.search) renderedUrl = url;
  });
}
