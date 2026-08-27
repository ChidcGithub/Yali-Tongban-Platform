// 动态加载 features.js（功能开关系统：邀请弹窗 + feature 校验）
// 所有加载 nav.js 的页面自动获得功能开关系统
(function() {
  if (document.querySelector('script[src*="/js/features.js"]')) return;
  var s = document.createElement('script');
  s.src = '/js/features.js';
  document.head.appendChild(s);
})();

function renderNav(currentPage) {
  const user = getUser();

  // 在 <html> 上标记当前页面
  if (currentPage) document.documentElement.setAttribute('data-page', currentPage);

  let rightHtml = '';
  if (user) {
    rightHtml += `<a href="personalize.html" class="nav-link${currentPage === 'personalize' ? ' active' : ''}" title="个性化">${icon('settings')}</a>`;
    rightHtml += `<a href="settings.html" class="nav-user${currentPage === 'settings' ? ' active' : ''}">${user.name}</a>`;
    rightHtml += `<button class="nav-link nav-logout" data-action="logout">登出</button>`;
  } else {
    rightHtml += `<a href="personalize.html" class="nav-link${currentPage === 'personalize' ? ' active' : ''}" title="个性化">${icon('settings')}</a>`;
    rightHtml += `<a href="login.html" class="nav-link${currentPage === 'login' ? ' active' : ''}">登录</a>`;
  }

  const html = `
<nav class="nav">
  <div class="nav-inner">
    <a href="about.html" class="nav-brand"><img src="/images/emblem.png" alt="" class="nav-emblem">雅礼团委 <small>· 通办</small></a>
    <div class="nav-links" id="navLinks">${rightHtml}</div>
  </div>
</nav>`;
  document.body.insertAdjacentHTML('afterbegin', html);

  document.querySelector('.nav').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.action === 'logout') logout();
  });

  // ── 消息铃铛图标（仅启用 messages 功能的用户）──
  if (user) {
    initMessagesIcon();
  }

  // ── Achievement: 击掌！──
  (function() {
    const brand = document.querySelector('.nav-brand');
    if (!brand || brand.dataset.achHighFive) return;
    brand.dataset.achHighFive = '1';
    let count = Number(localStorage.getItem('_hf') || 0);
    brand.addEventListener('click', function(e) {
      count++;
      localStorage.setItem('_hf', count);
      if (count >= 10) {
        localStorage.removeItem('_hf');
        count = 0;
        e.stopImmediatePropagation();
        e.preventDefault();
        unlockAchievement('high_five').then(d => { if (d) showAchievementToast('high_five'); });
      }
    });
  })();

  renderCapsuleBar(currentPage, user);
}

function renderCapsuleBar(currentPage, user) {
  if (currentPage) recordTabUsage(currentPage);
  const tabPages = [
    { id: 'services', label: '服务', icon: 'clipboard', href: 'services.html' },
    { id: 'moment', label: '动态', icon: 'zap', href: 'moment.html' },
    { id: 'announcements', label: '公告', icon: 'megaphone', href: 'announcements.html' },
    { id: 'polls', label: '投票', icon: 'check-circle', href: 'polls.html' },
    { id: 'finance', label: '财务', icon: 'wallet', href: 'finance.html', roleMin: 'member' },
    { id: 'activities', label: '活动', icon: 'calendar', href: 'activities.html' },
    { id: 'duty', label: '值日', icon: 'clock', href: 'duty.html', roleMin: 'public' },
    { id: 'admin', label: '管理', icon: 'shield', href: 'admin.html', adminOnly: true },
    { id: 'feedback', label: '反馈', icon: 'message-square', href: 'feedback.html' },
  ];

  const roleWeight = { member: 2, admin: 3, owner: 4, teacher: 3, public: 1 };

  let visible = tabPages.filter(p => {
    const role = user && user.role;
    const isAdmin = window.isAdmin(user);
    const isMember = role === 'member' || role === 'public' || isAdmin;
    if (p.adminOnly && !isAdmin) return false;
    if (p.roleMin) {
      if (p.roleMin === 'public' && !role) return false;
      else if (p.roleMin !== 'public' && (!isMember || (roleWeight[role] || 0) < (roleWeight[p.roleMin] || 99))) return false;
    }
    if (p.memberOnly && !user) return false;
    return true;
  });

  const usage = JSON.parse(localStorage.getItem('tabCapsuleUsage') || '{}');

  const servicesTab = visible.find(p => p.id === 'services');
  const others = visible.filter(p => p.id !== 'services');

  others.sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));

  visible = servicesTab ? [servicesTab, ...others] : others;

  const fbIdx = visible.findIndex(p => p.id === 'feedback');
  if (fbIdx >= 0) { const fb = visible.splice(fbIdx, 1)[0]; visible.push(fb); }

  const isDesktop = window.innerWidth > 768;
  const limit = isDesktop ? 6 : 4;

  const curIdx = visible.findIndex(p => p.id === currentPage);
  if (curIdx >= limit) {
    const swap = visible[limit - 1];
    visible[limit - 1] = visible[curIdx];
    visible[curIdx] = swap;
  }

  const hasExpand = visible.length > limit;

  const capsule = document.createElement('div');
  capsule.className = 'tab-capsule';
  capsule.id = 'tabCapsule';

  const body = document.createElement('div');
  body.className = 'tab-cap-body';

  const main = document.createElement('div');
  main.className = 'tab-cap-main';

  const extra = document.createElement('div');
  extra.className = 'tab-cap-extra';
  if (hasExpand) extra.style.display = 'none';

  visible.forEach((p, i) => {
    const active = p.id === currentPage ? ' active' : '';
    const el = document.createElement('a');
    el.href = p.href;
    el.className = 'tab-cap-item' + active;
    el.dataset.id = p.id;
    el.dataset.href = p.href;
    el.innerHTML = icon(p.icon) + '<span>' + p.label + '</span>';
    if (i < limit) {
      main.appendChild(el);
    } else {
      extra.appendChild(el);
    }
  });

  body.appendChild(main);
  if (hasExpand) {
    const btn = document.createElement('button');
    btn.className = 'tab-cap-expand';
    btn.id = 'tabExpandBtn';
    btn.innerHTML = icon('chevron-down');
    btn.setAttribute('aria-label', '展开');
    main.appendChild(btn);
  }
  if (hasExpand) body.appendChild(extra);
  capsule.appendChild(body);

  if (window.location.pathname.startsWith('/moment')) {
    capsule.classList.add('capsule-hidden');
    capsule.style.bottom = '-100px';
  }
  document.body.appendChild(capsule);

  const itemEls = capsule.querySelectorAll('.tab-cap-item');

  function navigateTo(href, id) {
    if (id) recordTabUsage(id);
    if (capsule.classList.contains('expanded')) {
      collapseCapsule(capsule, extra, () => {
        captureCapsuleFlip();
        window.location.href = href;
      });
    } else {
      captureCapsuleFlip();
      window.location.href = href;
    }
  }

  itemEls.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(a.dataset.href, a.dataset.id);
    });
  });

  const expandBtn = capsule.querySelector('#tabExpandBtn');
  if (expandBtn) {
    expandBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (capsule.classList.contains('expanded')) {
        collapseCapsule(capsule, extra);
      } else {
        expandCapsule(capsule, extra);
      }
    });
  }

  setTimeout(() => {
    document.addEventListener('click', e => {
      if (capsule.classList.contains('expanded') && !capsule.contains(e.target)) {
        collapseCapsule(capsule, extra);
      }
    });
  }, 100);

  runCapsuleFlip(capsule);
}

function recordTabUsage(id) {
  try {
    const usage = JSON.parse(localStorage.getItem('tabCapsuleUsage') || '{}');
    usage[id] = (usage[id] || 0) + 1;
    localStorage.setItem('tabCapsuleUsage', JSON.stringify(usage));
  } catch (_) {}
}

function expandCapsule(capsule, extraSection) {
  if (extraSection) extraSection.style.display = 'flex';
  capsule.classList.add('expanded');
  capsule.style.maxHeight = 'none';
  capsule.offsetHeight;
  const fullH = capsule.scrollHeight + 8;
  capsule.style.maxHeight = '';
  capsule.offsetHeight;
  capsule.style.maxHeight = fullH + 'px';
  const btn = capsule.querySelector('#tabExpandBtn');
  if (btn) btn.classList.add('expanded');
}

function collapseCapsule(capsule, extraSection, cb) {
  const btn = capsule.querySelector('#tabExpandBtn');
  if (btn) btn.classList.remove('expanded');
  capsule.style.maxHeight = '';
  setTimeout(() => {
    capsule.classList.remove('expanded');
    if (extraSection) extraSection.style.display = 'none';
    if (cb) cb();
  }, 350);
}

function captureCapsuleFlip() {
  try {
    const items = document.querySelectorAll('.tab-cap-item');
    const data = [];
    items.forEach(el => {
      const r = el.getBoundingClientRect();
      data.push({ id: el.dataset.id, left: r.left, top: r.top });
    });
    sessionStorage.setItem('capsuleFlip', JSON.stringify(data));
  } catch (_) {}
}

function runCapsuleFlip(capsule) {
  let oldData;
  try {
    oldData = JSON.parse(sessionStorage.getItem('capsuleFlip') || 'null');
    sessionStorage.removeItem('capsuleFlip');
  } catch (_) { return; }
  if (!oldData || oldData.length === 0) return;

  const items = capsule.querySelectorAll('.tab-cap-item');
  let hasAnim = false;

  items.forEach(el => {
    const old = oldData.find(d => d.id === el.dataset.id);
    if (!old) return;
    const nr = el.getBoundingClientRect();
    if (nr.width === 0 || nr.height === 0) return;
    const dx = old.left - nr.left;
    const dy = old.top - nr.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    hasAnim = true;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.opacity = '0';
    el.style.transition = 'none';
  });

  if (!hasAnim) return;

  requestAnimationFrame(() => {
    items.forEach(el => {
      if (!el.style.transform) return;
      el.style.opacity = '';
      el.style.transition = 'transform .5s cubic-bezier(.2,0,0,1), opacity .5s cubic-bezier(.2,0,0,1)';
    });
    requestAnimationFrame(() => {
      items.forEach(el => {
        if (!el.style.transform) return;
        el.style.transform = '';
        el.addEventListener('transitionend', function handler() {
          el.style.transition = '';
          el.style.transform = '';
          el.style.opacity = '';
          el.removeEventListener('transitionend', handler);
        });
      });
    });
  });
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  apiPost('/api/auth/logout').catch(() => {});
  window.location.href = 'services.html';
}

// Capsule auto-hide on scroll
let _capsuleLastScroll = window.scrollY;
let _capsuleLastTouchY = 0;
let _capsuleScrollTimer = null;
const _isChatPage = window.location.pathname.startsWith('/moment');

function _capsuleOnScroll() {
  const capsule = document.getElementById('tabCapsule');
  if (!capsule || capsule.classList.contains('expanded')) return;
  if (_isChatPage) return;
  const sy = window.scrollY;
  if (sy > _capsuleLastScroll && sy > 80) {
    capsule.classList.add('capsule-hidden');
  } else if (sy < _capsuleLastScroll) {
    capsule.classList.remove('capsule-hidden');
  }
  _capsuleLastScroll = sy;
}

window.addEventListener('scroll', () => {
  if (_capsuleScrollTimer) clearTimeout(_capsuleScrollTimer);
  _capsuleScrollTimer = setTimeout(_capsuleOnScroll, 40);
}, { passive: true });

let _mouseMoveRaf = null;
document.addEventListener('mousemove', e => {
  if (_mouseMoveRaf) return;
  _mouseMoveRaf = requestAnimationFrame(() => {
    _mouseMoveRaf = null;
    const capsule = document.getElementById('tabCapsule');
    if (!capsule) return;
    if (_isChatPage) {
      const zone = window.innerHeight / 4;
      if (e.clientY < zone || e.clientY > window.innerHeight - zone) {
        capsule.classList.remove('capsule-hidden');
        capsule.style.bottom = 'calc(20px + env(safe-area-inset-bottom, 0px))';
      } else {
        capsule.classList.add('capsule-hidden');
        capsule.style.bottom = '-100px';
      }
    } else if (e.clientY > window.innerHeight - 80 && capsule.classList.contains('capsule-hidden')) {
      capsule.classList.remove('capsule-hidden');
    }
  });
});

// Touch device: show/hide capsule based on scroll direction near bottom
document.addEventListener('touchstart', e => {
  _capsuleLastTouchY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!_isChatPage) return;
  const capsule = document.getElementById('tabCapsule');
  if (!capsule || capsule.classList.contains('expanded')) return;
  const dy = e.touches[0].clientY - _capsuleLastTouchY;
  const nearBottom = window.innerHeight - e.touches[0].clientY < window.innerHeight / 4;
  if (dy < -20 && !nearBottom) {
    capsule.classList.add('capsule-hidden');
    capsule.style.bottom = '-100px';
  } else if (dy > 20 || nearBottom) {
    capsule.classList.remove('capsule-hidden');
    capsule.style.bottom = 'calc(70px + env(safe-area-inset-bottom, 0px))';
  }
  _capsuleLastTouchY = e.touches[0].clientY;
}, { passive: true });

// ── Nav bar loading indicator ──
function showNavLoading(text) {
  let el = document.getElementById('navLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'navLoading';
    el.className = 'nav-loading';
    el.innerHTML = '<div class="spinner"></div><span class="nav-loading-text">加载中...</span>';
    const brand = document.querySelector('.nav-brand');
    if (brand) brand.parentNode.insertBefore(el, brand.nextSibling);
  }
  if (text) el.querySelector('.nav-loading-text').textContent = text;
}

function showNavLoadingProgress(done, total) {
  const el = document.getElementById('navLoading');
  if (!el) { showNavLoading(); }
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const txt = document.getElementById('navLoading')?.querySelector('.nav-loading-text');
  if (txt) txt.textContent = `加载中 ${done}/${total} 项 (${pct}%)`;
}

function hideNavLoading() {
  const el = document.getElementById('navLoading');
  if (el) el.remove();
}

// ── 消息铃铛图标 ──
function initMessagesIcon() {
  if (typeof isFeatureEnabled !== 'function') {
    // features.js 尚未加载，稍后重试
    setTimeout(initMessagesIcon, 500);
    return;
  }
  isFeatureEnabled('messages').then(enabled => {
    if (!enabled) return;
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    // 如果已存在则跳过
    if (document.getElementById('navMessagesBtn')) return;
    // 在设置图标前插入铃铛图标
    const settingsLink = navLinks.querySelector('a[href="personalize.html"]');
    if (!settingsLink) return;
    const bell = document.createElement('a');
    bell.href = 'messages.html';
    bell.id = 'navMessagesBtn';
    bell.className = 'nav-link nav-msg-bell';
    bell.title = '消息';
    bell.innerHTML = icon('bell') + '<span class="msg-badge" id="msgBadge" style="display:none">0</span>';
    navLinks.insertBefore(bell, settingsLink);
    // 获取未读数
    updateMsgBadge();
    // 每 60 秒刷新一次
    setInterval(updateMsgBadge, 60000);
    // 页面重新获得焦点时刷新
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateMsgBadge();
    });
  });
}

async function updateMsgBadge() {
  const badge = document.getElementById('msgBadge');
  if (!badge) return;
  try {
    const data = await apiGet('/api/messages/unread-count');
    const count = (data && data.count) || 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}
