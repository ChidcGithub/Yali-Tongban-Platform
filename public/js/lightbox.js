let lbCurrentItems = [];
let lbCurrentIndex = 0;
let lbScale = 1;
let lbTranslateX = 0;
let lbTranslateY = 0;
let lbDragging = false;
let lbDragStartX = 0;
let lbDragStartY = 0;
let lbStartTranslateX = 0;
let lbStartTranslateY = 0;
let _lbMouseMoveHandler = null;
let _lbMouseUpHandler = null;
let _navLock = false;

function openLightbox(src, items) {
  if (typeof src === 'object' && src !== null) {
    // 适配全局 data-action 委托：支持 data-url+data-images 与 data-src+data-items 两种模式
    if (src.url !== undefined) {
      try { items = src.images ? JSON.parse(src.images) : null; } catch (_) { items = null; }
      src = src.url;
    } else {
      try { items = src.items ? JSON.parse(src.items) : null; } catch (_) { items = null; }
      src = src.src;
    }
  }
  lbCurrentItems = items ? items.map(i => ({ ...i, src: dataUrlToBlobUrl(i.src) })) : [{ src: dataUrlToBlobUrl(src) }];
  // 用原始 src 在原始 items 中查找 index，避免 blob URL 每次转换不同导致匹配失败
  if (items) {
    lbCurrentIndex = items.findIndex(i => i.src === src);
  } else {
    lbCurrentIndex = 0;
  }
  if (lbCurrentIndex < 0) lbCurrentIndex = 0;
  lbScale = 1;
  lbTranslateX = 0;
  lbTranslateY = 0;
  document.addEventListener('keydown', lbKeyHandler);
  renderLightbox();
}

function resetTransform() {
  lbScale = 1;
  lbTranslateX = 0;
  lbTranslateY = 0;
  applyTransform();
}

function applyTransform() {
  const img = document.querySelector('.lightbox-img');
  if (!img) return;
  img.style.transform = `translate(${lbTranslateX}px, ${lbTranslateY}px) scale(${lbScale})`;
}

function zoomLightbox(dir, cx, cy) {
  const img = document.querySelector('.lightbox-img');
  if (!img) return;
  const oldScale = lbScale;
  lbScale = Math.max(0.5, Math.min(10, lbScale + dir * 0.25));
  if (cx !== undefined && cy !== undefined) {
    const rect = img.getBoundingClientRect();
    const ratio = lbScale / oldScale;
    lbTranslateX = cx - rect.width / 2 - ratio * (cx - rect.width / 2 - lbTranslateX);
    lbTranslateY = cy - rect.height / 2 - ratio * (cy - rect.height / 2 - lbTranslateY);
  }
  applyTransform();
}

function renderLightbox(dir) {
  const existing = document.querySelector('.lightbox');
  if (existing) existing.remove();

  const item = lbCurrentItems[lbCurrentIndex];
  const hasMultiple = lbCurrentItems.length > 1;

  const div = document.createElement('div');
  div.className = 'lightbox';
  div.onclick = (e) => { if (window.innerWidth > 768 || e.target !== div) return; closeLightbox(); };

  const enterClass = dir > 0 ? ' img-enter-right' : dir < 0 ? ' img-enter-left' : '';

  div.innerHTML = `
    <button class="lightbox-close" data-action="closeLightbox">${icon('x')}</button>
    <div class="lightbox-zoom-controls">
      <button class="lightbox-zoom-btn" data-action="zoomLightbox" data-dir="1" title="放大">+</button>
      <button class="lightbox-zoom-btn" data-action="zoomLightbox" data-dir="-1" title="缩小">-</button>
      <button class="lightbox-zoom-btn" data-action="resetTransform" title="重置">${icon('x')}</button>
    </div>
    ${hasMultiple ? `<button class="lightbox-nav lightbox-prev" data-action="navLightbox" data-dir="-1">${icon('chevron-left')}</button>` : ''}
    <img class="lightbox-img${enterClass}" src="${item.src}" alt="预览图片" draggable="false">
    ${hasMultiple ? `<button class="lightbox-nav lightbox-next" data-action="navLightbox" data-dir="1">${icon('chevron-right')}</button>` : ''}
    ${hasMultiple ? `<div class="lightbox-counter">${lbCurrentIndex + 1} / ${lbCurrentItems.length}</div>` : ''}
  `;

  document.body.appendChild(div);
  bindLightboxEvents(div);
  const focusables = div.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) {
    const first = focusables[0], last = focusables[focusables.length - 1];
    div.addEventListener('keydown', function ft(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    setTimeout(() => first.focus(), 50);
  }
}

function bindLightboxEvents(container) {
  const img = container.querySelector('.lightbox-img');

  // Scroll wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    zoomLightbox(e.deltaY < 0 ? 1 : -1, cx, cy);
  }, { passive: false });

  // Mouse drag
  img.addEventListener('mousedown', (e) => {
    if (lbScale <= 1) return;
    lbDragging = true;
    lbDragStartX = e.clientX;
    lbDragStartY = e.clientY;
    lbStartTranslateX = lbTranslateX;
    lbStartTranslateY = lbTranslateY;
    img.style.cursor = 'grabbing';
  });

  if (_lbMouseMoveHandler) document.removeEventListener('mousemove', _lbMouseMoveHandler);
  if (_lbMouseUpHandler) document.removeEventListener('mouseup', _lbMouseUpHandler);
  _lbMouseMoveHandler = (e) => {
    if (!lbDragging) return;
    lbTranslateX = lbStartTranslateX + (e.clientX - lbDragStartX);
    lbTranslateY = lbStartTranslateY + (e.clientY - lbDragStartY);
    applyTransform();
  };
  _lbMouseUpHandler = () => {
    if (!lbDragging) return;
    lbDragging = false;
    img.style.cursor = '';
  };
  document.addEventListener('mousemove', _lbMouseMoveHandler);
  document.addEventListener('mouseup', _lbMouseUpHandler);

  // Touch drag
  let touchStartX, touchStartY, touchStartTX, touchStartTY, touchDist = 0;

  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTX = lbTranslateX;
      touchStartTY = lbTranslateY;
    }
    if (e.touches.length === 2) {
      touchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && lbScale > 1) {
      e.preventDefault();
      lbTranslateX = touchStartTX + (e.touches[0].clientX - touchStartX);
      lbTranslateY = touchStartTY + (e.touches[0].clientY - touchStartY);
      applyTransform();
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const rect = img.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const dir = dist > touchDist ? 1 : -1;
      zoomLightbox(dir * 0.5, cx, cy);
      touchDist = dist;
    }
  }, { passive: false });

  img.addEventListener('touchend', () => {
    touchDist = 0;
  }, { passive: true });

  container.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    switch (btn.dataset.action) {
      case 'closeLightbox': closeLightbox(); break;
      case 'zoomLightbox': zoomLightbox(parseInt(btn.dataset.dir)); break;
      case 'resetTransform': resetTransform(); break;
      case 'navLightbox': navLightbox(parseInt(btn.dataset.dir)); break;
    }
  });
}

function closeLightbox() {
  _navLock = false;
  const el = document.querySelector('.lightbox');
  if (!el) return;
  el.classList.add('lightbox-closing');
  setTimeout(() => {
    el.remove();
    document.removeEventListener('keydown', lbKeyHandler);
    if (_lbMouseMoveHandler) { document.removeEventListener('mousemove', _lbMouseMoveHandler); _lbMouseMoveHandler = null; }
    if (_lbMouseUpHandler) { document.removeEventListener('mouseup', _lbMouseUpHandler); _lbMouseUpHandler = null; }
  }, 260);
}

function navLightbox(dir) {
  if (_navLock) return;
  const oldImg = document.querySelector('.lightbox-img');
  if (oldImg) {
    _navLock = true;
    oldImg.classList.add(dir > 0 ? 'lightbox-img-exit-left' : 'lightbox-img-exit-right');
  }
  setTimeout(() => {
    lbCurrentIndex = (lbCurrentIndex + dir + lbCurrentItems.length) % lbCurrentItems.length;
    const item = lbCurrentItems[lbCurrentIndex];
    if (!item.src.startsWith('blob:')) item.src = dataUrlToBlobUrl(item.src);
    lbScale = 1;
    lbTranslateX = 0;
    lbTranslateY = 0;
    renderLightbox(dir);
    _navLock = false;
  }, 230);
}

function lbKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
  if (e.key === '+' || e.key === '=') zoomLightbox(1);
  if (e.key === '-') zoomLightbox(-1);
  if (e.key === '0') resetTransform();
}