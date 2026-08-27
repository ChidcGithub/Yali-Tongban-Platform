let user = null;
// 当前打开的列表模态框类型：'members'/'issues'/'announce'/'finance'/'reviews'/'feedback'/null
// 用于 load 函数判断是否需要刷新模态框 body
let _activeListModal = null;

async function init() {
  user = await requireAdmin();
  if (!user) return;
  if (user.role === 'owner') {
    document.getElementById('ownerSection').style.display = '';
    document.getElementById('storageSection').style.display = '';
    document.getElementById('dangerSection').style.display = '';
    document.getElementById('featuresSection').style.display = '';
    loadFeatures();
  }
  document.getElementById('syncIcon').innerHTML = icon('refresh');
  document.getElementById('batchImportBtn')?.addEventListener('click', openBatchImportModal);
  loadAll();
}

async function syncAll() {
  showNavLoading('同步中...');
  const btn = document.getElementById('syncBtn');
  const iconEl = document.getElementById('syncIcon');
  const label = document.getElementById('syncLabel');
  btn.disabled = true;
  iconEl.style.transform = 'rotate(360deg)';
  cacheDel('/api/admin/settings');
  cacheDel('/api/admin/storage');
  cacheDel('/api/admin/registrations');
  cacheDel('/api/admin/members');
  cacheDel('/api/admin/users');
  cacheDel('/api/admin/issues');
  cacheDel('/api/admin/announcements');
  cacheDel('/api/admin/finance');
  await loadAll();
  iconEl.style.transform = '';
  label.textContent = '已同步';
  btn.disabled = false;
  setTimeout(() => { label.textContent = '同步'; }, 2000);
}

async function loadAll() {
    const total = 9;
    showNavLoading('加载中...');
    let done = 0;
    const fns = [
      loadRegistrations, loadMembers,
      loadAdminIssues,
      loadAdminAnnouncements, loadAdminFinance,
      loadAdminReviews,
      loadSiteStatus, loadStorageInfo, loadAdminFeedback,
    ];
    await Promise.allSettled(fns.map(async fn => {
      await fn();
      done++;
      showNavLoadingProgress(done, total);
    }));
    hideNavLoading();
  }

// ──────── Site Status ────────
async function loadSiteStatus() {
  try {
    const settings = await apiGet('/api/admin/settings');
    const closed = settings.site_closed === 'true';
    const closedBy = settings.site_closed_by || '';
    _siteClosedMessage = settings.site_closed_message || '';
    document.getElementById('siteToggle').checked = closed;
    document.getElementById('siteStatusLabel').innerHTML = closed ? `${icon('barrier')} 已关闭` : `${icon('check-circle')} 运行中`;
    document.getElementById('siteStatusLabel').style.color = closed ? 'var(--accent)' : 'var(--success)';
    const dot = document.getElementById('siteStatusDot');
    if (dot) dot.style.background = closed ? 'var(--accent)' : 'var(--success)';
    const details = document.getElementById('siteClosedDetails');
    if (details) details.style.display = closed ? '' : 'none';
    const by = document.getElementById('siteClosedBy');
    if (by) by.textContent = closedBy || '-';
    const d = document.getElementById('siteClosedMsgDisplay');
    if (d) {
      d.textContent = closed ? (_siteClosedMessage || '默认提示：雅礼团委-通办暂时关闭，请稍后再访问') : '';
      d.style.color = closed ? 'var(--md-on-surface-variant)' : '';
    }
    const hint = document.getElementById('statusHint');
    if (hint) hint.textContent = closed ? '关闭中，仅管理员可访问' : '关闭后仅管理员可访问';
    const check = document.getElementById('lastStatusCheck');
    if (check) check.textContent = formatTime(new Date().toISOString());
    const cleanup = document.getElementById('lastCleanupInfo');
    if (cleanup) {
      const t = settings.last_cleanup;
      cleanup.textContent = t ? formatTime(t) : '未执行';
    }
  } catch {}
}

async function loadStorageInfo() {
  try {
    await fetchWithCache('/api/admin/storage', () => apiGet('/api/admin/storage'), (data) => {
      const limitGB = 5;
      function fmtMB(bytes) { return (bytes / 1024 / 1024).toFixed(2) + ' MB'; }
      function bar(pct) { const c = pct > 80 ? 'var(--accent)' : pct > 50 ? 'var(--warning)' : 'var(--success)'; return `<div style="margin-top:4px;height:6px;background:var(--md-outline-variant);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.min(pct,100)}%;background:${c};border-radius:4px;transition:width .6s"></div></div>`; }
      document.getElementById('storageInfo').innerHTML = `
        <div style="margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;font-size:.82rem">
            <span>${icon('camera')} 图片</span>
            <span><strong>${fmtMB(data.imageBytes)}</strong> / ${limitGB} GB</span>
          </div>
          ${bar(data.percent)}
          <div style="font-size:.72rem;color:var(--md-on-surface-variant);text-align:right;margin-top:2px">${data.percent}%</div>
        </div>
        <div style="margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;font-size:.82rem">
            <span>${icon('file-text')} 文本</span>
            <span><strong>${fmtMB(data.textBytes)}</strong> / ${limitGB} GB</span>
          </div>
          ${bar(data.textBytes / (limitGB * 1024 * 1024 * 1024) * 100)}
          <div style="font-size:.72rem;color:var(--md-on-surface-variant);text-align:right;margin-top:2px">${(data.textBytes / (limitGB * 1024 * 1024 * 1024) * 100).toFixed(1)}%</div>
        </div>
        <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:.78rem;color:var(--md-on-surface-variant)">
          <span>${icon('camera')} 财务 ${data.financeCount}</span>
          <span>${icon('message-circle')} 反馈 ${data.issueCount}</span>
          <span>${icon('megaphone')} 公告 ${data.announceCount}</span>
          <span>${icon('check')} 审核 ${data.reviewCount}</span>
          <span>${icon('message-square')} 动态 ${data.chatCount}</span>
          <span>${icon('calendar')} 千报 ${data.hallCount}</span>
          <span>${icon('barrier')} 投票 ${data.pollCount}</span>
          <span>${icon('messages-square')} 评论 ${data.commentCount}</span>
          <span>${icon('users')} 用户 ${data.userCount}</span>
          <span>${icon('zap')} 志愿 ${data.volunteerCount}</span>
        </div>`;
    });
  } catch {
    document.getElementById('storageInfo').innerHTML = '<p style="font-size:.85rem;color:var(--md-on-surface-variant)">加载失败</p>';
  }
}

async function toggleSiteClosed() {
  const closed = document.getElementById('siteToggle').checked;
  if (closed) {
    const bodyHtml = '<p style="color:var(--md-on-surface-variant);margin:0 0 12px">关闭后仅管理员和站长可访问，访客和成员将看到维护提示。</p>' +
      '<div style="margin:12px 0"><label style="font-size:.85rem;color:var(--md-on-surface-variant);display:block;margin-bottom:6px">关闭提示（可选，留空则显示默认文案）</label>' +
      '<textarea id="siteClosedMessageInput" class="form-input" style="width:100%;min-height:80px;resize:vertical" placeholder="雅礼团委-通办暂时关闭，请稍后再访问">' + escapeHtml(_siteClosedMessage) + '</textarea></div>';
    openModal({
      title: '\u26A0 确认关闭网站',
      body: bodyHtml,
      maxWidth: '380px',
      countdown: { seconds: 5, hint: '请等待 {n} 秒后确认' },
      footer: [
        { text: '取消', variant: 'outline', onClick: function() { document.getElementById('siteToggle').checked = false; closeModal(document.getElementById('modalContainer')); } },
        { text: '确认关闭', variant: 'danger', countdownBtn: true, onClick: function() {
          var c = document.getElementById('modalContainer');
          const input = document.getElementById('siteClosedMessageInput');
          const msg = input ? input.value.trim() : '';
          c._onClose = null;
          closeModal(c);
          (async () => {
            try {
              await apiPut('/api/admin/settings', { site_closed: 'true', site_closed_by: user?.name, site_closed_message: msg });
              cacheDel('/api/admin/settings');
              document.getElementById('siteStatusLabel').innerHTML = `${icon('barrier')} 已关闭`;
              document.getElementById('siteStatusLabel').style.color = 'var(--accent)';
              const dot = document.getElementById('siteStatusDot');
              if (dot) dot.style.background = 'var(--accent)';
              const details = document.getElementById('siteClosedDetails');
              if (details) details.style.display = '';
              const by = document.getElementById('siteClosedBy');
              if (by) by.textContent = user?.name || '-';
              const d = document.getElementById('siteClosedMsgDisplay');
              if (d) { d.textContent = msg || '默认提示：雅礼团委-通办暂时关闭，请稍后再访问'; d.style.color = 'var(--md-on-surface-variant)'; }
              const hint = document.getElementById('statusHint');
              if (hint) hint.textContent = '关闭中，仅管理员可访问';
              const check = document.getElementById('lastStatusCheck');
              if (check) check.textContent = formatTime(new Date().toISOString());
              toast('网站已关闭', 'error');
            } catch (err) {
              document.getElementById('siteToggle').checked = false;
              toast(err.message, 'error');
            }
          })();
        } }
      ],
      onClose: function() { document.getElementById('siteToggle').checked = false; }
    });
  } else {
    try {
      await apiPut('/api/admin/settings', { site_closed: 'false', site_closed_by: user?.name });
      cacheDel('/api/admin/settings');
      document.getElementById('siteStatusLabel').innerHTML = `${icon('check-circle')} 运行中`;
      document.getElementById('siteStatusLabel').style.color = 'var(--success)';
      const dot = document.getElementById('siteStatusDot');
      if (dot) dot.style.background = 'var(--success)';
      const details = document.getElementById('siteClosedDetails');
      if (details) details.style.display = 'none';
      const d = document.getElementById('siteClosedMsgDisplay');
      if (d) { d.textContent = ''; }
      const hint = document.getElementById('statusHint');
      if (hint) hint.textContent = '关闭后仅管理员可访问';
      const check = document.getElementById('lastStatusCheck');
      if (check) check.textContent = formatTime(new Date().toISOString());
      toast('网站已开放', 'success');
    } catch (err) {
      document.getElementById('siteToggle').checked = true;
      toast(err.message, 'error');
    }
  }
}

// ──────── Registrations ────────
async function loadRegistrations() {
  try {
    const el = document.getElementById('registrationList');
    await fetchWithCache('/api/admin/registrations', () => apiGet('/api/admin/registrations'), (list) => {
      if (!list || list.length === 0) {
        el.innerHTML = EmptyState('', '暂无待审批的注册');
        return;
      }
      el.innerHTML = `
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer">
            <input type="checkbox" id="batchSelectAll" onchange="toggleAllReg()"> 全选
          </label>
          <button class="btn btn-sm btn-primary" data-action="batchApproveReg">批量通过</button>
        </div>
        <div id="regListItems">${list.map(r => `
          <div class="admin-reg-item">
            <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer" data-action="clickRegCheckbox">
              <input type="checkbox" class="regCheckbox" value="${r.id}" onchange="updateBatchBtn()" style="width:16px;height:16px;cursor:pointer">
              <div>
                <strong>${escapeHtml(r.name)}</strong>
                <div style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:2px">${formatTime(r.created_at)}${r.class_name ? ` · ${escapeHtml(r.class_name)}` : ''}${r.department ? ` · ${escapeHtml(r.department)}` : ''}</div>
              </div>
            </label>
            <div class="btn-group">
              <button class="btn btn-sm btn-success" data-action="approveReg" data-id="${r.id}">通过</button>
              <button class="btn btn-sm btn-danger" data-action="rejectReg" data-id="${r.id}">拒绝</button>
            </div>
          </div>
        `).join('')}</div>`;
    });
  } catch {
    document.getElementById('registrationList').innerHTML = EmptyState('', '加载失败');
  }
}

async function approveReg(dataset) {
  try {
    await apiPost(`/api/admin/registrations/${dataset.id}/approve`);
    toast('已通过注册', 'success');
    loadRegistrations();
  } catch (err) { toast(err.message, 'error'); }
}

async function rejectReg(dataset) {
  try {
    await apiPost(`/api/admin/registrations/${dataset.id}/reject`);
    toast('已拒绝注册', 'info');
    loadRegistrations();
  } catch (err) { toast(err.message, 'error'); }
}

function clickRegCheckbox(dataset, target) {
  target.closest('.admin-reg-item').querySelector('.regCheckbox').click();
}

function toggleAllReg() {
  const checked = document.getElementById('batchSelectAll').checked;
  document.querySelectorAll('.regCheckbox').forEach(cb => cb.checked = checked);
  updateBatchBtn();
}

function updateBatchBtn() {
  const count = document.querySelectorAll('.regCheckbox:checked').length;
  const btn = document.querySelector('[data-action="batchApproveReg"]');
  if (btn) btn.textContent = count > 0 ? `批量通过 (${count})` : '批量通过';
}

async function batchApproveReg() {
  const ids = Array.from(document.querySelectorAll('.regCheckbox:checked')).map(cb => Number(cb.value));
  if (ids.length === 0) { toast('请选择要批准的注册', 'error'); return; }
  try {
    await apiPost('/api/admin/users/batch-approve', { ids });
    toast(`已通过 ${ids.length} 个注册申请`, 'success');
    loadRegistrations();
  } catch (err) { toast(err.message, 'error'); }
}

// ──────── Members ────────
let _memberList = [];
let _hasPublic = false;
let _memberRoleFilter = '';
let _memberOffset = 0;
let _memberHasMore = false;
let _memberLoading = false;
async function loadMembers() {
  _memberOffset = 0;
  _memberHasMore = false;
  try {
    const data = await apiGet('/api/admin/users?offset=0');
    _memberList = data.results || data;
    _hasPublic = _memberList.some(m => m.role === 'public');
    _memberHasMore = data.hasMore || false;
    _updateMemberSummary();
    if (_activeListModal === 'members') {
      const q = document.getElementById('memberSearchInput');
      const container = document.getElementById('memberListContainer');
      if (container) container.innerHTML = renderMemberList(q ? q.value : '', _memberRoleFilter);
    }
  } catch {
    document.getElementById('memberSummary').textContent = '加载失败';
  }
}
function _updateMemberSummary() {
  if (!_memberList) return;
  const count = _memberList.length;
  const admins = _memberList.filter(u => u.role === 'admin' || u.role === 'owner').length;
  document.getElementById('memberCount').textContent = `（${count} 人）`;
  document.getElementById('memberSummary').innerHTML = count ? `<span>共 ${count} 名成员</span><span style="font-size:.8rem;color:var(--md-primary)">管理员 ${admins} 人</span>` : '暂无成员';
}

function renderMemberList(query = '', roleFilter = '') {
  if (!_memberList || _memberList.length === 0) {
    return EmptyState('', '暂无成员');
  }
  const roleWeight = { owner: 0, admin: 1, teacher: 2, member: 3, public: 4 };
  const sorted = [..._memberList].sort((a, b) => (roleWeight[a.role] ?? 9) - (roleWeight[b.role] ?? 9));
  let filtered = query ? sorted.filter(m => m.name.includes(query)) : sorted;
  if (roleFilter) filtered = filtered.filter(m => m.role === roleFilter);
  if (!filtered.length) {
    return EmptyState('', '未找到匹配的成员');
  }
  const roleLabel = { admin: '管理', owner: '网站管理者', teacher: '老师', member: '成员', public: '公共' };
  const roleBadge = { admin: 'badge-processing', owner: 'badge-expiring', teacher: 'badge-review', member: 'badge-pass', public: 'badge-public' };
  return filtered.map(m => {
    const isSelf = m.id === user?.userId;
    const isOwner = user?.role === 'owner';
    const isAdmin = window.isAdmin(user);
    const canDelete = !isSelf && m.role !== 'owner';

    let actionItems = [];
    const add = (label, action, data) => actionItems.push({ label, action, data });

    if (!isSelf && m.role !== 'owner') {
      if (m.role === 'member' || m.role === 'teacher') add('任管理', 'promoteToAdmin', { id: m.id });
      if (m.role === 'member' || m.role === 'admin') add('任老师', 'promoteToTeacher', { id: m.id });
      if ((m.role === 'admin' || m.role === 'teacher') && (isOwner || isAdmin) && !isSelf) add('降成员', 'demoteToMember', { id: m.id });
      if (isOwner && m.role === 'owner' && !isSelf) add('降管理', 'demoteOwnerToAdmin', { id: m.id });
      if ((m.role === 'member' || m.role === 'teacher') && !_hasPublic) add('设为公共账号', 'setAsPublic', { id: m.id });
      add('重置密码', 'resetPwdPrompt', { id: m.id, name: m.name });
      add('改名', 'renamePrompt', { id: m.id, name: m.name });
      add('部门', 'changeDeptPrompt', { id: m.id, name: m.name });
    }

    return `
    <div class="admin-user-item">
      <div>
        <a href="settings.html?userId=${m.id}" style="font-weight:600;color:inherit;text-decoration:none">${escapeHtml(m.name)}</a>
        ${m.class_name ? `<span style="font-size:.8rem;color:var(--md-on-surface-variant);margin-left:6px">(${escapeHtml(m.class_name)})</span>` : ''}
        ${m.department ? `<span style="font-size:.8rem;color:var(--md-primary);margin-left:6px">[${escapeHtml(m.department)}]</span>` : ''}
        ${m.achievement_count ? `<span style="display:inline-flex;align-items:center;gap:2px;margin-left:6px;font-size:.78rem;color:var(--md-on-surface-variant)"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>${m.achievement_count}</span>` : ''}
        <span style="margin-left:8px">${Badge(roleLabel[m.role] || m.role, (roleBadge[m.role] || 'badge-pass').replace('badge-', ''))}</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;position:relative">
        ${actionItems.length > 0 ? `
        <div style="position:relative">
          <button class="btn btn-sm btn-outline" data-action="toggleActionMenu" style="font-size:.8rem">操作</button>
          <div class="action-menu" style="display:none">
            ${actionItems.map(a => {
              const dataAttrs = Object.entries(a.data).map(([k, v]) => ` data-${k}="${attrEscape(String(v))}"`).join('');
              return `<button class="action-menu-item" data-action="${a.action}"${dataAttrs}>${a.label}</button>`;
            }).join('')}
          </div>
        </div>` : ''}
        ${canDelete ? `<button class="btn btn-sm btn-danger" data-action="confirmDeleteUser" data-id="${m.id}" data-name="${attrEscape(m.name)}">删除</button>` : ''}
      </div>
    </div>`;
  }).join('') + (_memberHasMore ? `<button class="btn btn-outline" style="width:100%;margin-top:8px" data-action="loadMoreMembers">加载更多成员</button>` : '');
}

async function loadMoreMembers() {
  if (_memberLoading) return;
  _memberLoading = true;
  try {
    _memberOffset += 200;
    const data = await apiGet(`/api/admin/users?offset=${_memberOffset}`);
    const newMembers = data.results || data;
    _memberList.push(...newMembers);
    _memberHasMore = data.hasMore || false;
    _updateMemberSummary();
    if (_activeListModal === 'members') {
      const q = document.getElementById('memberSearchInput');
      const container = document.getElementById('memberListContainer');
      if (container) container.innerHTML = renderMemberList(q ? q.value : '', _memberRoleFilter);
    }
  } catch { toast('加载失败', 'error'); }
  _memberLoading = false;
}

function toggleActionMenu(dataset, target) {
  const menu = target.nextElementSibling;
  if (!menu) return;
  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    menu.classList.add('closing');
    setTimeout(() => { menu.classList.remove('closing'); }, 200);
  } else {
    closeAllActionMenus();
    menu.style.display = '';
    requestAnimationFrame(() => menu.classList.add('open'));
  }
}

function closeAllActionMenus() {
  document.querySelectorAll('.action-menu.open').forEach(m => {
    m.classList.remove('open');
    m.classList.add('closing');
    setTimeout(() => { m.classList.remove('closing'); }, 200);
  });
}

// click anywhere to close menus
document.addEventListener('click', closeAllActionMenus);

function openMemberModal() {
  _activeListModal = 'members';
  const filterHtml = `
    <input class="form-input" id="memberSearchInput" placeholder="搜索成员姓名..." oninput="filterMemberList(this.value)" style="margin-bottom:8px">
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-sm ${_memberRoleFilter === '' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="" style="font-size:.8rem">全部</button>
      <button class="btn btn-sm ${_memberRoleFilter === 'admin' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="admin" style="font-size:.8rem">管理员</button>
      <button class="btn btn-sm ${_memberRoleFilter === 'member' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="member" style="font-size:.8rem">成员</button>
      <button class="btn btn-sm ${_memberRoleFilter === 'owner' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="owner" style="font-size:.8rem">网站管理者</button>
      <button class="btn btn-sm ${_memberRoleFilter === 'teacher' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="teacher" style="font-size:.8rem">老师</button>
      <button class="btn btn-sm ${_memberRoleFilter === 'public' ? 'btn-primary' : 'btn-outline'}" data-action="setMemberRoleFilter" data-role="public" style="font-size:.8rem">公共</button>
    </div>`;
  openModal({
    title: '成员管理',
    body: filterHtml + '<div id="memberListContainer">' + renderMemberList('', _memberRoleFilter) + '</div>',
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

function setMemberRoleFilter(dataset) {
  _memberRoleFilter = dataset.role;
  const q = document.getElementById('memberSearchInput');
  openMemberModal();
  if (q && q.value) {
    document.getElementById('memberSearchInput').value = q.value;
    filterMemberList(q.value);
  }
}

let _searchDebounce;
function filterMemberList(query) {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    const container = document.getElementById('memberListContainer');
    if (container) container.innerHTML = renderMemberList(query, _memberRoleFilter);
  }, 200);
}

async function promoteToAdmin(dataset) {
  try {
    await apiPut(`/api/admin/users/${dataset.id}/role`, { role: 'admin' });
    toast('已任命为管理员', 'success');
    loadMembers();
  } catch (err) { toast(err.message, 'error'); }
}

async function promoteToTeacher(dataset) {
  try {
    await apiPut(`/api/admin/users/${dataset.id}/role`, { role: 'teacher' });
    toast('已任命为老师', 'success');
    loadMembers();
  } catch (err) { toast(err.message, 'error'); }
}

function resetPwdPrompt(dataset) {
  const decoded = dataset.name;
  confirmAction(`确定重置「${decoded}」的密码为 Yali@1234 吗？`, async ok => {
    if (!ok) return;
    try {
      const data = await apiPut(`/api/admin/users/${dataset.id}/reset-password`, { password: 'Yali@1234' });
      toast(data.message || '密码已重置', 'success');
      loadMembers();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function renamePrompt(dataset) {
  const decoded = dataset.name;
  openModal({
    title: '修改姓名 - ' + escapeHtml(decoded),
    body: '<div class="form-group"><label class="form-label" for="renameInput">新姓名 <span class="required">*</span></label><input class="form-input" id="renameInput" value="' + escapeHtml(decoded) + '" required maxlength="20"></div>',
    maxWidth: '380px',
    footer: [
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } },
      { text: '确认改名', variant: 'primary', onClick: function() {
        const newName = document.getElementById('renameInput').value.trim();
        if (!newName || newName.length < 2) { toast('姓名至少2个字', 'error'); return; }
        apiPut('/api/admin/users/' + dataset.id + '/name', { name: newName }).then(function() {
          toast('姓名已更新', 'success');
          closeModal(document.getElementById('modalContainer'));
          loadMembers();
        }).catch(function(err) { toast(err.message, 'error'); });
      }}
    ]
  });
}

function changeDeptPrompt(dataset) {
  const decoded = dataset.name;
  openModal({
    title: '修改部门 - ' + escapeHtml(decoded),
    body: '<div class="form-group"><label class="form-label" for="deptChangeSelect">部门</label><select class="form-input" id="deptChangeSelect" style="appearance:auto"><option value="">未选择</option>' + DEPARTMENTS.map(function(d) { return '<option value="' + d + '">' + d + '</option>'; }).join('') + '</select></div>',
    maxWidth: '380px',
    footer: [
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } },
      { text: '确认修改', variant: 'primary', onClick: function() {
        const dept = document.getElementById('deptChangeSelect').value;
        apiPut('/api/admin/users/' + dataset.id + '/department', { department: dept }).then(function() {
          toast('部门已更新', 'success');
          closeModal(document.getElementById('modalContainer'));
          loadMembers();
        }).catch(function(err) { toast(err.message, 'error'); });
      }}
    ]
  });
}

function openBatchImportModal() {
  let importMode = 'csv';
  let parsedUsers = [];
  var container = document.getElementById('modalContainer');
  openModal({
    title: '批量导入成员',
    body: '<div style="display:flex;gap:8px;margin-bottom:16px"><button class="btn btn-sm btn-primary" id="csvModeBtn" data-action="setImportMode" data-mode="csv">CSV</button><button class="btn btn-sm btn-outline" id="jsonModeBtn" data-action="setImportMode" data-mode="json">JSON</button><button class="btn btn-sm btn-outline" id="manualModeBtn" data-action="setImportMode" data-mode="manual">手动输入</button></div><div id="importCsvArea"><div class="form-group"><label class="form-label" for="csvFileInput">上传 CSV 文件</label><input class="form-input" type="file" id="csvFileInput" accept=".csv" onchange="parseCsvImport(event)"><p style="font-size:.78rem;color:var(--md-on-surface-variant);margin-top:4px">格式：姓名,密码,班级,部门（每行一条，部门可选）</p></div></div><div id="importJsonArea" style="display:none"><div class="form-group"><label class="form-label" for="jsonFileInput">上传 JSON 文件</label><input class="form-input" type="file" id="jsonFileInput" accept=".json" onchange="parseJsonImport(event)"><p style="font-size:.78rem;color:var(--md-on-surface-variant);margin-top:4px">格式：[{"name":"...","password":"...","class_name":"...","department":"..."}]</p></div></div><div id="importManualArea" style="display:none"><div class="form-group"><label class="form-label">手动输入</label><textarea class="form-textarea" id="manualInput" rows="6" placeholder="每行一条：姓名 密码 班级 部门&#10;例如：张三 abc123 2501 宣传部" style="width:100%"></textarea></div><button class="btn btn-sm btn-outline" data-action="parseManualImport">解析</button></div><div id="importPreview" style="margin-top:12px;display:none"><p style="font-size:.85rem;font-weight:500;margin-bottom:8px" id="importPreviewCount"></p><div id="importPreviewTable" style="max-height:200px;overflow-y:auto;font-size:.82rem"></div><button class="btn btn-primary" id="importConfirmBtn" style="margin-top:12px" data-action="confirmBatchImport">确认导入</button></div>',
    maxWidth: '600px',
    footer: [
      { text: '关闭', variant: 'outline', onClick: function() { closeModal(container); } }
    ]
  });

  window.setImportMode = function(dataset) {
    var mode = dataset.mode;
    importMode = mode;
    document.getElementById('csvModeBtn').className = 'btn btn-sm ' + (mode === 'csv' ? 'btn-primary' : 'btn-outline');
    document.getElementById('jsonModeBtn').className = 'btn btn-sm ' + (mode === 'json' ? 'btn-primary' : 'btn-outline');
    document.getElementById('manualModeBtn').className = 'btn btn-sm ' + (mode === 'manual' ? 'btn-primary' : 'btn-outline');
    document.getElementById('importCsvArea').style.display = mode === 'csv' ? '' : 'none';
    document.getElementById('importJsonArea').style.display = mode === 'json' ? '' : 'none';
    document.getElementById('importManualArea').style.display = mode === 'manual' ? '' : 'none';
    document.getElementById('importPreview').style.display = 'none';
    parsedUsers = [];
  };
  window.parseCsvImport = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      const lines = ev.target.result.split(/\r?\n/).filter(Boolean);
      parsedUsers = lines.map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', password: parts[1] || '', class_name: parts[2] || '', department: parts[3] || '' };
      }).filter(u => u.name && u.password);
      showImportPreview();
    };
    reader.readAsText(file);
  };
  window.parseJsonImport = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        parsedUsers = JSON.parse(ev.target.result);
        if (!Array.isArray(parsedUsers)) throw new Error('格式错误');
        showImportPreview();
      } catch (err) { toast('JSON 解析失败: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
  };
  window.parseManualImport = function() {
    const text = document.getElementById('manualInput').value.trim();
    if (!text) { toast('请输入数据', 'error'); return; }
    const lines = text.split('\n').filter(Boolean);
    parsedUsers = lines.map(line => {
      const parts = line.split(/\s+/);
      return { name: parts[0] || '', password: parts[1] || '', class_name: parts[2] || '', department: parts[3] || '' };
    }).filter(u => u.name && u.password);
    if (parsedUsers.length === 0) { toast('未解析到有效数据', 'error'); return; }
    showImportPreview();
  };
  window.showImportPreview = function() {
    if (parsedUsers.length === 0) { toast('无有效数据', 'error'); return; }
    document.getElementById('importPreview').style.display = '';
    document.getElementById('importPreviewCount').textContent = '共 ' + parsedUsers.length + ' 条记录';
    document.getElementById('importPreviewTable').innerHTML = parsedUsers.map(function(u, i) {
      return '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--md-outline-variant);font-size:.8rem"><span style="width:30px;flex-shrink:0">' + (i + 1) + '.</span><span style="width:80px;flex-shrink:0">' + escapeHtml(u.name) + '</span><span style="width:80px;flex-shrink:0">' + escapeHtml(u.class_name || '-') + '</span><span style="width:80px;flex-shrink:0">' + escapeHtml(u.department || '-') + '</span></div>';
    }).join('');
  };
  window.confirmBatchImport = async function() {
    if (parsedUsers.length === 0) { toast('无有效数据', 'error'); return; }
    try {
      const result = await apiPost('/api/admin/users/batch-import', { users: parsedUsers });
      closeModal(container);
      if (result.failed.length > 0) {
        toast('导入完成：成功 ' + result.success + '，跳过 ' + (result.skipped || 0) + '，失败 ' + result.failed.length, 'error');
        openModal({
          title: '导入失败详情',
          body: result.failed.map(function(f, i) {
            return '<div style="padding:6px 8px;color:var(--md-error);border-bottom:1px solid var(--md-outline-variant);font-size:.85rem">' + (i + 1) + '. ' + escapeHtml(f.name || '未知') + '：' + escapeHtml(f.reason) + '</div>';
          }).join(''),
          footer: [{ text: '关闭', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } }]
        });
      } else {
        toast('导入完成：成功 ' + result.success + '，跳过 ' + (result.skipped || 0), 'success');
      }
      loadMembers();
    } catch (err) { toast(err.message, 'error'); }
  };
}

async function demoteToMember(dataset) {
  confirmAction('确定将此管理员降为普通成员吗？', async ok => {
    if (!ok) return;
    try {
      await apiPut(`/api/admin/users/${dataset.id}/role`, { role: 'member' });
      toast('已降为成员', 'success');
      loadMembers();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function demoteOwnerToAdmin(dataset) {
  confirmAction('确定将此站长降级为管理员吗？', async ok => {
    if (!ok) return;
    try {
      await apiPut(`/api/admin/users/${dataset.id}/role`, { role: 'admin' });
      toast('已降级为管理员', 'success');
      loadMembers();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function setAsPublic(dataset) {
  confirmAction('确定将此账号设为公共账号？公共账号可查看值日页面，且不会自动退出登录。', async ok => {
    if (!ok) return;
    try {
      await apiPut(`/api/admin/users/${dataset.id}/role`, { role: 'public' });
      toast('已设为公共账号', 'success');
      loadMembers();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ─── Accordion toggle ───
window.toggleSetting = function(header) {
  const body = header.nextElementSibling;
  const expanded = body.classList.toggle('expanded');
  header.classList.toggle('expanded', expanded);
  body.style.maxHeight = expanded ? body.scrollHeight + 'px' : '0';
  body.style.opacity = expanded ? '1' : '0';
};

// ──────── Confirmations ────────
// showConfirmWithCountdown 基于 openModal + countdown 配置实现
// 倒计时期间主按钮禁用，结束后启用；cancelCallback 仅在取消/背景点击时触发
function showConfirmWithCountdown(title, msg, btnText, callback, cancelCallback, seconds = 5) {
  openModal({
    title: title,
    body: '<p style="color:var(--md-on-surface-variant);margin:0">' + escapeHtml(msg) + '</p>',
    maxWidth: '380px',
    countdown: { seconds: seconds, hint: '请等待 {n} 秒后确认' },
    footer: [
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } },
      { text: btnText, variant: 'danger', countdownBtn: true, onClick: function() { var c = document.getElementById('modalContainer'); c._onClose = null; closeModal(c); callback(); } }
    ],
    onClose: function() { if (cancelCallback) cancelCallback(); }
  });
}

function confirmDeleteUser(dataset) {
  showConfirmWithCountdown(
    `确认删除成员「${dataset.name}」？`,
    '该成员的所有记录将被一并删除，此操作不可撤销。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/admin/users/${dataset.id}`);
        toast('成员已删除', 'success');
        loadMembers();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

function confirmClearAll() {
  const steps = [
    { title: '\u26A0 第1次确认', msg: '你正在尝试清空全部数据，包括所有问题、公告、财务记录、审核记录和成员账号。此操作不可撤销！' },
    { title: '\u26A0\u26A0 第2次确认', msg: '请再次确认：所有数据将被永久删除，无法恢复。你确定要继续吗？' },
    { title: '\u26A0\u26A0\u26A0 最终确认', msg: '最后一次确认！一旦执行，全部数据将彻底消失。是否继续？', seconds: 300 },
  ];
  let i = 0;
  function nextStep() {
    if (i >= steps.length) {
      executeClearAll();
      return;
    }
    showConfirmWithCountdown(steps[i].title, steps[i].msg, i < 2 ? '下一步' : '确认清空', nextStep, null, steps[i].seconds || 5);
    i++;
  }
  nextStep();
}

async function executeClearAll() {
  try {
    await apiPost('/api/admin/clear-all');
    toast('全部数据已清除', 'success');
    loadAll();
  } catch (err) { toast(err.message, 'error'); }
}

// ──────── Admin Issues ────────
let _issueList = [];

async function loadAdminIssues() {
  try {
    await fetchWithCache('/api/issues',
      () => apiGet('/api/issues'),
      data => {
        _issueList = data;
        const count = _issueList.length;
        const pending = data.filter(i => i.status === '待处理').length;
        document.getElementById('issueCount').textContent = `（${count} 个）`;
        document.getElementById('issueSummary').innerHTML = count ? `<span>共 ${count} 个问题</span><span style="font-size:.8rem;color:var(--accent)">待处理 ${pending}</span>` : '暂无问题';
      }
    );
  } catch { document.getElementById('issueSummary').textContent = '加载失败'; }
}

function renderIssueList() {
  if (!_issueList || _issueList.length === 0) {
    return EmptyState('', '暂无问题反馈');
  }
  return _issueList.map(iss => `
    <div class="admin-user-item">
      <div>
        <div style="font-weight:500;font-size:.9rem">${escapeHtml(iss.description.slice(0, 80))}${iss.description.length > 80 ? '...' : ''}</div>
        <div style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:2px">${escapeHtml(iss.submitted_by)} · ${iss.status} · ${formatTime(iss.created_at)}</div>
      </div>
      <button class="btn btn-sm btn-danger" data-action="confirmDeleteIssue" data-id="${iss.id}">删除</button>
    </div>
  `).join('');
}

function openIssueModal() {
  _activeListModal = 'issues';
  openModal({
    title: '问题反馈管理（全部）',
    body: renderIssueList(),
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

function confirmDeleteIssue(dataset) {
  showConfirmWithCountdown(
    '确认删除此问题反馈？',
    '删除后不可恢复。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/issues/${dataset.id}`);
        toast('问题反馈已删除', 'success');
        loadAdminIssues();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

let _announceList = [];
let _announceFilter = 'all';

async function loadAdminAnnouncements() {
  try {
    await fetchWithCache('/api/announcements',
      () => apiGet('/api/announcements'),
      data => {
        _announceList = data;
        const count = _announceList.length;
        const pending = data.filter(a => a.status === '待审核').length;
        document.getElementById('announceCount').textContent = `（${count} 条）`;
        document.getElementById('announceSummary').innerHTML = count ? `<span>共 ${count} 条公告</span><span style="font-size:.8rem;color:var(--warning)">待审核 ${pending}</span>` : '暂无公告';
        if (_activeListModal === 'announce') {
          document.getElementById('modalBody').innerHTML = renderAnnounceList();
        }
      }
    );
  } catch { document.getElementById('announceSummary').textContent = '加载失败'; }
}

function setAnnounceFilter(dataset) {
  _announceFilter = dataset.filter;
  const container = document.getElementById('announceListContainer');
  if (container) container.innerHTML = renderAnnounceList();
}

function renderReviewImages(imgs) {
  if (!imgs || imgs.length === 0) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${imgs.map(url =>
    `<img src="${attrEscape(dataUrlToBlobUrl(url))}" alt="" style="max-width:120px;max-height:90px;border-radius:var(--md-shape-sm);cursor:pointer;object-fit:cover" data-action="openLightbox" data-src="${attrEscape(dataUrlToBlobUrl(url))}" onerror="this.style.display='none'">`
  ).join('')}</div>`;
}

function renderAnnounceList() {
  const filtered = _announceFilter === 'all' ? _announceList : _announceList.filter(a => (a.status || '已通过') === _announceFilter);
  const filterHtml = `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${['待审核', '已通过', '已拒绝', 'all'].map(f =>
    `<button class="btn btn-sm ${_announceFilter === f ? 'btn-primary' : 'btn-outline'}" data-action="setAnnounceFilter" data-filter="${f}">${f === 'all' ? '全部' : f}</button>`
  ).join('')}</div>`;
  const bodyHtml = filtered.length === 0 ? EmptyState('', '暂无公告') :
    filtered.map(a => {
      const status = a.status || '已通过';
      const badgeClass = status === '已通过' ? 'badge-done' : status === '已拒绝' ? 'badge-reject' : 'badge-pending';
      const imgs = [];
    if (a._images && Array.isArray(a._images)) imgs.push(...a._images);
    else if (a.image_url) { try { const p = JSON.parse(a.image_url); if (Array.isArray(p)) imgs.push(...p); } catch { if (typeof a.image_url === 'string') imgs.push(a.image_url); else if (Array.isArray(a.image_url)) imgs.push(...a.image_url); } }
      return `
    <div class="admin-user-item" style="align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;font-size:.9rem">${escapeHtml(a.title)} <span style="margin-left:4px">${Badge(status, badgeClass.replace('badge-', ''))}</span></div>
        <div style="font-size:.82rem;color:var(--md-on-surface-variant);margin-top:4px;white-space:pre-wrap">${escapeHtml(a.content)}</div>
        ${renderReviewImages(imgs)}
        <div style="font-size:.78rem;color:var(--md-on-surface-variant);margin-top:6px">${escapeHtml(a.created_by)} · ${formatTime(a.created_at)}${a.reviewed_by ? ' · 审核：' + escapeHtml(a.reviewed_by) : ''}${a.reject_reason ? `<span style="color:var(--accent)">（${escapeHtml(a.reject_reason)}）</span>` : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        ${status === '待审核' ? `<button class="btn btn-sm btn-success" data-action="approveAnnounce" data-id="${a.id}">通过</button><button class="btn btn-sm btn-danger" data-action="rejectAnnounce" data-id="${a.id}">拒绝</button>` : ''}
        <button class="btn btn-sm btn-outline" data-action="confirmDeleteAnnounce" data-id="${a.id}">删除</button>
      </div>
    </div>`;
  }).join('');
  return filterHtml + bodyHtml;
}

function openAnnounceModal() {
  _activeListModal = 'announce';
  openModal({
    title: '公告审核',
    body: '<div id="announceListContainer">' + renderAnnounceList() + '</div>',
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

async function approveAnnounce(dataset) {
  try {
    await apiPut(`/api/announcements/${dataset.id}/status`, { status: '已通过' });
    toast('公告已通过', 'success');
    cacheDel('/api/announcements');
    await loadAdminAnnouncements();
    const container = document.getElementById('announceListContainer');
    if (container) container.innerHTML = renderAnnounceList();
  } catch (err) { toast(err.message, 'error'); }
}

function rejectAnnounce(dataset) {
  openModal({
    title: '拒绝公告',
    body: '<div class="form-group"><label class="form-label" for="rejectReasonInput">拒绝理由 <span class="required">*</span></label><textarea class="form-input" id="rejectReasonInput" rows="3" style="width:100%;resize:vertical" placeholder="请输入拒绝理由" required></textarea></div>',
    maxWidth: '380px',
    footer: [
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } },
      { text: '确认拒绝', variant: 'danger', onClick: function() {
        const reason = document.getElementById('rejectReasonInput').value.trim();
        if (!reason) { toast('请输入拒绝理由', 'error'); return; }
        var c = document.getElementById('modalContainer');
        c._onClose = null;
        closeModal(c);
        (async () => {
          try {
            await apiPut(`/api/announcements/${dataset.id}/status`, { status: '已拒绝', reject_reason: reason });
            toast('公告已拒绝', 'success');
            cacheDel('/api/announcements');
            await loadAdminAnnouncements();
            const container = document.getElementById('announceListContainer');
            if (container) container.innerHTML = renderAnnounceList();
          } catch (err) { toast(err.message, 'error'); }
        })();
      }}
    ]
  });
}

function confirmDeleteAnnounce(dataset) {
  showConfirmWithCountdown(
    '确认删除此公告？',
    '删除后不可恢复。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/announcements/${dataset.id}`);
        toast('公告已删除', 'success');
        cacheDel('/api/announcements');
        await loadAdminAnnouncements();
        const container = document.getElementById('announceListContainer');
        if (container) container.innerHTML = renderAnnounceList();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

// ──────── Admin Finance ────────
let _financeList = [];

async function loadAdminFinance() {
  try {
    await fetchWithCache('/api/finance', () => apiGet('/api/finance'), (data) => {
      _financeList = data;
      const count = _financeList.length;
      const income = data.filter(f => f.type === '收入').reduce((s, f) => s + Number(f.amount || 0), 0);
      const expense = data.filter(f => f.type !== '收入').reduce((s, f) => s + Number(f.amount || 0), 0);
      document.getElementById('financeCount').textContent = `（${count} 条）`;
      document.getElementById('financeSummary').innerHTML = count ? `<span style="color:var(--success)">+¥${income.toFixed(2)}</span><span style="color:var(--accent)">-¥${expense.toFixed(2)}</span>` : '暂无记录';
    });
  } catch { document.getElementById('financeSummary').textContent = '加载失败'; }
}

function renderFinanceList() {
  if (!_financeList || _financeList.length === 0) {
    return EmptyState('', '暂无财务记录');
  }
  return _financeList.map(f => {
    const tags = (() => { try { return JSON.parse(f.tags || '[]'); } catch { return []; } })();
    return `
    <div class="admin-user-item" style="align-items:flex-start">
      ${f.image_url && f.image_url.startsWith('data:') ? `<img class="admin-finance-thumb img-clickable" src="${attrEscape(f.image_url)}" alt="" data-action="openLightbox" data-src="${attrEscape(dataUrlToBlobUrl(f.image_url))}" onerror="this.style.display='none'">` : ''}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${Badge(f.type || '支出', f.type === '收入' ? 'done' : 'pending')}
          <strong style="font-size:.95rem;color:${f.type === '收入' ? 'var(--success)' : 'var(--accent)'}">${f.type === '收入' ? '+' : '-'}¥${Number(f.amount || 0).toFixed(2)}</strong>
        </div>
        ${tags.length > 0 ? `<div style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:2px">${tags.map(t => escapeHtml(t)).join(' · ')}</div>` : ''}
        <div style="font-size:.85rem;color:var(--md-on-surface-variant);margin-top:2px">${escapeHtml(f.notes || '无备注')} · ${escapeHtml(f.created_by)}${f.department ? ` · ${escapeHtml(f.department)}` : ''}</div>
        <div style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:2px">${Badge(f.status, f.status === '已完成' ? 'done' : 'pending')}</div>
      </div>
      <button class="btn btn-sm btn-danger" data-action="confirmDeleteFinance" data-id="${f.id}">删除</button>
    </div>`;
  }).join('');
}

function openFinanceModal() {
  _activeListModal = 'finance';
  openModal({
    title: '财务记录管理（全部）',
    body: renderFinanceList(),
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

function confirmDeleteFinance(dataset) {
  showConfirmWithCountdown(
    '确认删除此财务记录？',
    '删除后不可恢复。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/admin/finance/${dataset.id}`);
        toast('财务记录已删除', 'success');
        loadAdminFinance();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

// ──────── Admin Reviews ────────
let _reviewList = [];

async function loadAdminReviews() {
  try {
    await fetchWithCache('/api/reviews', () => apiGet('/api/reviews'), (data) => {
      _reviewList = data;
      const count = _reviewList.length;
      document.getElementById('reviewCount').textContent = `（${count} 条）`;
      document.getElementById('reviewSummary').textContent = count ? `共 ${count} 条记录 · 点击查看` : '暂无记录';
    });
  } catch { document.getElementById('reviewSummary').textContent = '加载失败'; }
}

function renderReviewList() {
  if (!_reviewList || _reviewList.length === 0) {
    return EmptyState('', '暂无审核记录');
  }
  return _reviewList.map(r => {
    const badgeClass = r.status === '待审核' ? 'badge-pending' : r.status === '通过' ? 'badge-done' : 'badge-reject';
    return `
    <div class="admin-user-item">
      <div style="flex:1;min-width:0">
        <div style="font-size:.9rem">${escapeHtml(r.created_by)} · ${Badge(r.status, badgeClass.replace('badge-', ''))}</div>
        <div style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:2px">${r.reviewed_by ? `审核人：${escapeHtml(r.reviewed_by)}` : '未审核'}</div>
      </div>
      <button class="btn btn-sm btn-danger" data-action="confirmDeleteReview" data-id="${r.id}">删除</button>
    </div>`;
  }).join('');
}

function openReviewModal() {
  _activeListModal = 'reviews';
  openModal({
    title: '审核记录管理（全部）',
    body: renderReviewList(),
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

function confirmDeleteReview(dataset) {
  showConfirmWithCountdown(
    '确认删除此审核记录？',
    '删除后不可恢复。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/reviews/${dataset.id}`);
        toast('审核记录已删除', 'success');
        loadAdminReviews();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

async function loadAdminFeedback() {
  try {
    const rows = await apiGet('/api/admin/feedback');
    window._feedbackData = rows;
    const el = document.getElementById('feedbackCount');
    if (el) el.textContent = `（${rows.length} 条）`;
  } catch (err) { console.error('反馈加载失败', err); }
}

function renderFeedbackList() {
  const rows = window._feedbackData || [];
  if (!rows.length) return '<p style="text-align:center;color:var(--md-on-surface-variant);padding:32px">暂无反馈</p>';
  return rows.map(f => `
    <div class="feedback-row" style="padding:12px;border-bottom:1px solid var(--md-outline-variant, #CAC4D0)">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px">
        <span style="font-size:.75rem;color:var(--md-on-surface-variant)">${escapeHtml(f.created_at)}${f.page ? ' · ' + escapeHtml(f.page) : ''}${f.section ? ' · ' + escapeHtml(f.section) : ''}${f.version ? ' · v' + escapeHtml(f.version) : ''}</span>
        <span style="font-size:.75rem;color:var(--md-on-surface-variant)">${f.contact ? escapeHtml(f.contact) : '匿名'}</span>
      </div>
      <div style="white-space:pre-wrap;word-break:break-word">${escapeHtml(f.content)}</div>
      <div style="margin-top:6px"><button class="btn btn-sm btn-danger" data-action="deleteFeedback" data-id="${f.id}">删除</button></div>
    </div>
  `).join('');
}

function openFeedbackModal() {
  _activeListModal = 'feedback';
  openModal({
    title: '用户反馈',
    body: '<div id="feedbackListContainer">' + renderFeedbackList() + '</div>',
    maxWidth: '600px',
    footer: [{ text: '关闭', variant: 'outline', onClick: function() { _activeListModal = null; closeModal(document.getElementById('modalContainer')); } }],
    onClose: function() { _activeListModal = null; }
  });
}

function deleteFeedback(dataset) {
  showConfirmWithCountdown(
    '确认删除此反馈？',
    '删除后不可恢复。',
    '确认删除',
    async () => {
      try {
        await apiDel(`/api/admin/feedback/${dataset.id}`);
        toast('反馈已删除', 'success');
        window._feedbackData = (window._feedbackData || []).filter(f => f.id !== Number(dataset.id));
        const el = document.getElementById('feedbackCount');
        if (el) el.textContent = `（${window._feedbackData.length} 条）`;
        const container = document.getElementById('feedbackListContainer');
        if (container) container.innerHTML = renderFeedbackList();
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

// ── 功能开关管理 ──

let _featuresCache = null;

async function loadFeatures() {
  try {
    const data = await apiGet('/api/admin/features');
    const features = (data && data.features) || [];
    _featuresCache = features;
    document.getElementById('featuresCount').textContent = features.length + ' 个';
    const list = document.getElementById('featuresList');
    if (features.length === 0) {
      list.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.85rem">暂无可用功能</p>';
      return;
    }
    list.innerHTML = features.map(f => {
      const stats = f.stats || {};
      const accepted = stats.accepted || 0;
      const pending = stats.pending || 0;
      const later = stats.later || 0;
      const never = stats.never || 0;
      const enabled = !!f.globally_enabled;
      return `
        <div class="feature-card" data-key="${attrEscape(f.key)}">
          <div class="feature-card-header">
            <div class="feature-card-icon">${icon(f.icon || 'bell')}</div>
            <div class="feature-card-info">
              <div class="feature-card-name">${escapeHtml(f.name)}</div>
              <div class="feature-card-key">key: ${escapeHtml(f.key)}</div>
            </div>
            <label class="admin-toggle" title="${enabled ? '已启用' : '未启用'}">
              <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleFeature('${attrEscape(f.key)}', this.checked)">
              <span class="admin-toggle-slider"></span>
            </label>
          </div>
          ${f.description ? `<p class="feature-card-desc">${escapeHtml(f.description)}</p>` : ''}
          <div class="feature-card-stats">
            <span title="已接受" class="badge badge-pass">${icon('check-circle')} ${accepted}</span>
            <span title="待响应" class="badge badge-processing">${icon('hourglass')} ${pending}</span>
            <span title="稍后" class="badge badge-review">${icon('clock')} ${later}</span>
            <span title="永不" class="badge badge-public">${icon('x-circle')} ${never}</span>
          </div>
          <div class="feature-card-actions">
            <button class="btn btn-sm btn-outline" onclick="inviteAllUsers('${attrEscape(f.key)}')" ${!enabled ? 'disabled' : ''}>全员邀请</button>
            <button class="btn btn-sm btn-outline" onclick="openInviteUserModal('${attrEscape(f.key)}')" ${!enabled ? 'disabled' : ''}>邀请用户</button>
            <button class="btn btn-sm btn-outline" onclick="openInvitationsModal('${attrEscape(f.key)}')">邀请详情</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleFeature(key, enable) {
  try {
    await apiPost('/api/admin/features', { key, globally_enabled: enable });
    toast(enable ? '已启用' : '已禁用', 'success');
    loadFeatures();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function inviteAllUsers(key) {
  // 从当前 features 列表中查找功能名称
  const feat = (_featuresCache || []).find(f => f.key === key);
  const featName = feat ? feat.name : key;
  if (!confirm('确定邀请全部成员参与「' + featName + '」功能？')) return;
  try {
    const data = await apiPost('/api/admin/features/' + key + '/invite', { all: true });
    const invited = data.invited || 0;
    const skipped = data.skipped || 0;
    if (invited === 0) {
      toast('所有用户已被邀请（' + skipped + ' 位已存在）', 'info');
    } else if (skipped > 0) {
      toast('已邀请 ' + invited + ' 位用户，' + skipped + ' 位已被跳过', 'success');
    } else {
      toast('已邀请 ' + invited + ' 位用户', 'success');
    }
    loadFeatures();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── 单人/多人邀请弹窗 ──
let _inviteUserList = [];      // 用户列表缓存
let _inviteSelected = new Set(); // 选中的 user_id 集合
let _inviteFeatureKey = '';     // 当前邀请的 feature key
let _inviteInvitedMap = {};     // 已邀请用户的 status 映射 { user_id: status }
let _inviteOffset = 0;         // 分页偏移
let _inviteHasMore = false;    // 是否还有更多用户
let _inviteLoading = false;    // 是否正在加载

async function openInviteUserModal(key) {
  _inviteFeatureKey = key;
  _inviteSelected = new Set();
  _inviteUserList = [];
  _inviteOffset = 0;
  _inviteHasMore = false;
  _inviteLoading = false;
  const feat = (_featuresCache || []).find(f => f.key === key);
  const featName = feat ? feat.name : key;

  // 先显示加载态
  openModal({
    title: '邀请用户参与「' + featName + '」',
    maxWidth: '600px',
    body: '<p style="text-align:center;color:var(--md-on-surface-variant);padding:20px">加载中...</p>',
    footer: [
      { text: '取消', variant: 'text', onClick: () => closeModal(document.getElementById('modalContainer')) },
      { text: '邀请选中', variant: 'primary', id: 'inviteSubmitBtn', onClick: () => submitInviteUsers(key) },
    ],
  });

  try {
    // 并发拉取用户列表（首页）+ 当前 feature 的邀请详情
    const [usersRes, invitationsRes] = await Promise.all([
      apiGet('/api/admin/users?offset=0'),
      apiGet('/api/admin/features/' + key + '/invitations'),
    ]);
    _inviteUserList = (usersRes.results || usersRes || []).filter(u => u.role !== 'public');
    _inviteHasMore = usersRes.hasMore || false;
    _inviteOffset = _inviteUserList.length;
    const invitations = (invitationsRes.invitations) || [];
    _inviteInvitedMap = {};
    invitations.forEach(i => { _inviteInvitedMap[i.user_id] = i.status; });
    renderInviteUserList();
  } catch (e) {
    const body = document.getElementById('modalBody');
    if (body) body.innerHTML = '<p style="text-align:center;color:var(--md-error);padding:20px">加载失败：' + escapeHtml(e.message || '') + '</p>';
  }
}

// 加载更多用户（滚动到底部触发）
async function loadMoreInviteUsers() {
  if (_inviteLoading || !_inviteHasMore) return;
  _inviteLoading = true;
  try {
    const data = await apiGet('/api/admin/users?offset=' + _inviteOffset);
    const newUsers = (data.results || data || []).filter(u => u.role !== 'public');
    _inviteUserList.push(...newUsers);
    _inviteHasMore = data.hasMore || false;
    _inviteOffset = _inviteUserList.length;
    renderInviteUserList();
  } catch {}
  _inviteLoading = false;
}

function renderInviteUserList() {
  const body = document.getElementById('modalBody');
  if (!body) return;
  const statusLabel = { pending: '待响应', accepted: '已接受', later: '稍后', never: '已选永不' };
  const statusBadge = { pending: 'badge-processing', accepted: 'badge-pass', later: 'badge-review', never: 'badge-public' };

  body.innerHTML = `
    <input class="form-input" id="inviteSearchInput" placeholder="搜索用户名..." oninput="filterInviteUserList(this.value)" style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:.85rem;color:var(--md-on-surface-variant)">
      <span id="inviteCount">共 ${_inviteUserList.length} 位用户</span>
      <span id="inviteSelectedCount">已选 0 位</span>
    </div>
    <div id="inviteUserListContainer" style="max-height:360px;overflow-y:auto;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm)" onscroll="onInviteListScroll(this)">
      ${_inviteUserList.length === 0
        ? '<p style="text-align:center;color:var(--md-on-surface-variant);padding:20px">暂无可邀请用户</p>'
        : _inviteUserList.map(u => {
          const invited = _inviteInvitedMap[u.id];
          const isNever = invited === 'never';
          // 已选永不：需先重置
          const disabled = isNever;
          return `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--md-outline-variant);cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '.6' : '1'}" data-uid="${u.id}" data-name="${attrEscape(u.name || '')}">
              <input type="checkbox" data-uid="${u.id}" style="flex-shrink:0" ${disabled ? 'disabled' : ''} onchange="toggleInviteSelection(${u.id}, this.checked)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:500">${escapeHtml(u.name || '用户#' + u.id)}</div>
                <div style="font-size:.78rem;color:var(--md-on-surface-variant)">${escapeHtml(u.class_name || '')} ${u.department ? '· ' + escapeHtml(u.department) : ''}</div>
              </div>
              ${invited ? `<span class="badge ${statusBadge[invited] || ''}" style="font-size:.72rem">${statusLabel[invited] || invited}</span>` : ''}
              ${isNever ? `<button class="btn btn-xs btn-text" style="margin-left:4px;font-size:.72rem" onclick="resetUserResponse('${attrEscape(_inviteFeatureKey)}', ${u.id})">重置</button>` : ''}
            </label>
          `;
        }).join('')
      }
      ${_inviteHasMore ? '<p id="inviteLoadMore" style="text-align:center;color:var(--md-on-surface-variant);padding:8px;font-size:.8rem">向下滚动加载更多...</p>' : ''}
    </div>
    <p style="font-size:.78rem;color:var(--md-on-surface-variant);margin-top:8px">提示：已选「永不」的用户需先点击「重置」才能重新邀请</p>
  `;
}

function onInviteListScroll(container) {
  if (!_inviteHasMore || _inviteLoading) return;
  // 滚动到距底部 50px 时触发加载
  if (container.scrollHeight - container.scrollTop - container.clientHeight < 50) {
    loadMoreInviteUsers();
  }
}

function filterInviteUserList(query) {
  const container = document.getElementById('inviteUserListContainer');
  if (!container) return;
  const labels = container.querySelectorAll('label[data-uid]');
  let visibleCount = 0;
  labels.forEach(label => {
    const name = label.dataset.name || '';
    const match = !query || name.includes(query);
    label.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });
  const countEl = document.getElementById('inviteCount');
  if (countEl) countEl.textContent = '共 ' + visibleCount + ' 位用户';
}

function toggleInviteSelection(userId, checked) {
  if (checked) {
    _inviteSelected.add(userId);
  } else {
    _inviteSelected.delete(userId);
  }
  const counter = document.getElementById('inviteSelectedCount');
  if (counter) counter.textContent = '已选 ' + _inviteSelected.size + ' 位';
}

async function submitInviteUsers(key) {
  const userIds = [..._inviteSelected];
  if (userIds.length === 0) {
    toast('请至少选择一位用户', 'info');
    return;
  }
  const submitBtn = document.getElementById('inviteSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '邀请中...'; }
  try {
    const data = await apiPost('/api/admin/features/' + key + '/invite', { user_ids: userIds });
    const invited = data.invited || 0;
    const skipped = data.skipped || 0;
    if (invited === 0) {
      toast('所有选中用户已被邀请（' + skipped + ' 位已存在）', 'info');
    } else if (skipped > 0) {
      toast('已邀请 ' + invited + ' 位，' + skipped + ' 位已被跳过', 'success');
    } else {
      toast('已邀请 ' + invited + ' 位用户', 'success');
    }
    closeModal(document.getElementById('modalContainer'));
    loadFeatures();
  } catch (e) {
    toast(e.message || '邀请失败', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '邀请选中'; }
  }
}

async function openInvitationsModal(key) {
  try {
    const data = await apiGet('/api/admin/features/' + key + '/invitations');
    const invitations = (data && data.invitations) || [];
    const statusLabel = { pending: '待响应', accepted: '已接受', later: '稍后', never: '永不提醒' };
    const statusBadge = { pending: 'badge-processing', accepted: 'badge-pass', later: 'badge-review', never: 'badge-public' };
    openModal({
      title: '邀请详情',
      maxWidth: '600px',
      body: invitations.length === 0
        ? '<p style="text-align:center;color:var(--md-on-surface-variant);padding:20px">暂无邀请记录</p>'
        : '<div style="max-height:400px;overflow-y:auto">' + invitations.map(i => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--md-outline-variant)">
              <div>
                <span>${escapeHtml(i.name || '用户#' + i.user_id)}</span>
                ${i.status === 'never' ? `<button class="btn btn-xs btn-text" style="margin-left:6px" onclick="resetUserResponse('${attrEscape(key)}', ${i.user_id})">重置</button>` : ''}
              </div>
              <span class="badge ${statusBadge[i.status] || ''}">${statusLabel[i.status] || i.status}</span>
            </div>
          `).join('') + '</div>',
      footer: [
        { text: '关闭', variant: 'text', onClick: () => closeModal(document.getElementById('modalContainer')) },
      ],
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function resetUserResponse(key, userId) {
  try {
    await apiPost('/api/admin/features/' + key + '/reset', { user_id: userId });
    toast('已重置，可重新邀请', 'success');
    // 判断当前是否在单人邀请弹窗（通过检查 inviteSearchInput 是否存在）
    const inInviteModal = document.getElementById('inviteSearchInput');
    if (inInviteModal) {
      // 从 _inviteInvitedMap 中移除该用户，重新渲染列表
      if (_inviteInvitedMap[userId]) delete _inviteInvitedMap[userId];
      // 从选中集合中移除（避免提交时包含已重置但未重新勾选的）
      _inviteSelected.delete(userId);
      renderInviteUserList();
    } else {
      // 从邀请详情弹窗调用：关闭当前并重新打开邀请详情
      closeModal(document.getElementById('modalContainer'));
      openInvitationsModal(key);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

init();
