export function initGallery() {
  const gallery = document.querySelector('.project-gallery');
  const viewer = document.querySelector('.gallery-viewer');

  if (gallery && viewer && !gallery.dataset.initialized && typeof viewer.showModal === 'function') {
    gallery.dataset.initialized = 'true';
    const items = [...gallery.querySelectorAll('.project-gallery-item')];
    const image = viewer.querySelector('.gallery-viewer-image');
    const count = viewer.querySelector('.gallery-viewer-count');
    const caption = viewer.querySelector('.gallery-viewer-caption');
    const previous = viewer.querySelector('.gallery-viewer-prev');
    const next = viewer.querySelector('.gallery-viewer-next');
    const close = viewer.querySelector('.gallery-viewer-close');
    let index = 0;
    let opener;
    let touchStart;

    function show(position) {
      index = (position + items.length) % items.length;
      const thumbnail = items[index].querySelector('img');
      image.removeAttribute('srcset');
      image.src = thumbnail.hasAttribute('srcset') ? thumbnail.src : items[index].href;
      if (thumbnail.hasAttribute('srcset')) {
        image.srcset = thumbnail.srcset;
        image.sizes = '95vw';
      }
      image.alt = thumbnail.alt;
      caption.textContent = thumbnail.alt;
      count.textContent = `${index + 1} / ${items.length}`;
      previous.hidden = next.hidden = items.length < 2;
    }

    gallery.addEventListener('click', event => {
      const item = event.target.closest('.project-gallery-item');
      if (!item || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = item;
      show(items.indexOf(item));
      viewer.showModal();
      close.focus();
    });
    close.addEventListener('click', () => viewer.close());
    previous.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    viewer.addEventListener('close', () => opener?.focus());
    viewer.addEventListener('keydown', event => {
      if (items.length < 2) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });
    viewer.addEventListener('touchstart', event => { touchStart = [event.changedTouches[0].clientX, event.changedTouches[0].clientY]; }, {passive:true});
    viewer.addEventListener('touchend', event => {
      if (!touchStart || items.length < 2) return;
      const dx = event.changedTouches[0].clientX - touchStart[0];
      const dy = event.changedTouches[0].clientY - touchStart[1];
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, {passive:true});
  }
}

initGallery();
