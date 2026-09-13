(function() {
  var c = document.createElement('div');
  c.id = 'modalContainer';
  c.className = 'modal-overlay';
  c.style.display = 'none';
  c.innerHTML = '<div class="modal"><div class="modal-title" id="modalTitle"></div><div id="modalBody"></div><div class="modal-actions" id="modalActions"></div></div>';
  document.body.appendChild(c);

  c.onclick = function(e) {
    if (window.innerWidth > 768 || e.target !== c) return;
    if (typeof c._dirtyCheck === 'function' && c._dirtyCheck()) return;
    closeModal(c);
  };

  window.openModal = function(config) {
    // 取消挂起的关闭动画（链式调用场景：confirmClearAll 连续打开多个确认框）
    if (c._closeTimer) { clearTimeout(c._closeTimer); c._closeTimer = null; }
    c.classList.remove('closing');
    var modalEl = c.querySelector('.modal');
    if (modalEl) modalEl.classList.remove('closing');
    document.getElementById('modalTitle').textContent = config.title || '';
    var bodyEl = document.getElementById('modalBody');
    if (typeof config.body === 'function') { bodyEl.innerHTML = ''; config.body(bodyEl); }
    else { bodyEl.innerHTML = config.body || ''; }
    var footerEl = document.getElementById('modalActions');
    footerEl.innerHTML = '';
    // 倒计时按钮引用（config.countdown 启用时，footer 中标记 countdownBtn: true 的按钮会受其控制）
    var countdownBtnRef = null;
    var countdownTimerRef = null;
    (config.footer || []).forEach(function(btn) {
      var b = document.createElement('button');
      b.className = 'btn btn-' + (btn.variant || 'outline') + (btn.size ? ' btn-' + btn.size : '');
      b.textContent = btn.text;
      b.disabled = !!btn.disabled;
      if (btn.onClick) b.onclick = btn.onClick;
      if (btn.countdownBtn) countdownBtnRef = b;
      footerEl.appendChild(b);
    });
    var modal = c.querySelector('.modal');
    if (config.maxWidth) modal.style.maxWidth = config.maxWidth;
    else modal.style.maxWidth = '';
    c._dirtyCheck = config.dirtyCheck || null;
    c._onClose = config.onClose || null;
    // 清理上一次的倒计时
    if (c._countdownTimer) { clearInterval(c._countdownTimer); c._countdownTimer = null; }
    // 启动倒计时：config.countdown = { seconds, hint }，hint 中的 {n} 会被替换为剩余秒数
    if (config.countdown && countdownBtnRef) {
      var cd = config.countdown;
      var hintEl = document.createElement('p');
      hintEl.style.cssText = 'font-size:.85rem;color:var(--accent);text-align:center;margin:8px 0 0';
      hintEl.textContent = (cd.hint || '请等待 {n} 秒').replace('{n}', cd.seconds);
      bodyEl.appendChild(hintEl);
      countdownBtnRef.disabled = true;
      var sec = cd.seconds;
      c._countdownTimer = setInterval(function() {
        sec--;
        hintEl.textContent = (cd.hint || '请等待 {n} 秒').replace('{n}', sec);
        if (sec <= 0) {
          clearInterval(c._countdownTimer);
          c._countdownTimer = null;
          hintEl.style.display = 'none';
          countdownBtnRef.disabled = false;
        }
      }, 1000);
    }
    c.style.display = '';
    document.body.style.overflow = 'hidden';
    if (config.trapFocus !== false) trapFocus(c);
    if (config.onOpen) config.onOpen(c);
  };

  window.destroyModal = function() {
    closeModal(c);
    document.getElementById('modalBody').innerHTML = '';
    document.getElementById('modalActions').innerHTML = '';
    c._dirtyCheck = null;
    c._onClose = null;
  };
})();
