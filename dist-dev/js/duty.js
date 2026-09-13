let _dutyTimers = {};
let _dutyData = null;

function _dutyAdminLink(el) {
  const _u = getUser();
  if (!_u || (_u.role !== 'admin' && _u.role !== 'owner' && _u.role !== 'teacher')) return;
  const _a = document.createElement('a');
  _a.href = 'duty-admin.html';
  _a.className = 'btn btn-outline btn-sm';
  _a.style.marginTop = '12px';
  _a.innerHTML = icon('settings') + ' 排班管理';
  el.appendChild(_a);
}

async function loadDutyDashboard() {
  const el = document.getElementById('dutyDashboard');
  if (!el) return;
  showNavLoading('加载中...');

  try {
    _dutyData = await apiGet('/api/duty/attendance/today');
  } catch (e) {
    hideNavLoading();
    el.innerHTML = EmptyState(icon('alert-circle'), '加载失败：' + escapeHtml(e.message));
    _dutyAdminLink(el);
    return;
  }

  if (!_dutyData || !_dutyData.staff_a) {
    hideNavLoading();
    el.innerHTML = EmptyState(icon('calendar'), '今日无排班');
    _dutyAdminLink(el);
    return;
  }

  if (!_dutyData.periods || !Array.isArray(_dutyData.periods)) {
    hideNavLoading();
    el.innerHTML = EmptyState(icon('alert-circle'), '数据异常');
    _dutyAdminLink(el);
    return;
  }

  hideNavLoading();
  renderDutyDashboard(el);
}

function renderDutyDashboard(el) {
  const d = _dutyData;

  let html = Card('', `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:.85rem;color:var(--md-on-surface-variant)">${d.date} · 值日干事</div>
          <div style="margin-top:4px">
            <span class="badge badge-processing">${escapeHtml(d.staff_a.department)}${escapeHtml(d.staff_a.class)} ${escapeHtml(d.staff_a.name)}</span>
            <span style="margin:0 8px;color:var(--md-on-surface-variant)">/</span>
            <span class="badge badge-processing">${escapeHtml(d.staff_b.department)}${escapeHtml(d.staff_b.class)} ${escapeHtml(d.staff_b.name)}</span>
          </div>
        </div>
        <div style="font-size:.8rem;color:var(--md-on-surface-variant);text-align:right">
          ${d.periods.filter(p => p.a.status === 'signed_in' || p.b.status === 'signed_in').length > 0 ? '🟡 签到中...' : ''}
        </div>
      </div>`);

  let tableContent = `<div class="duty-table">
        <div class="duty-table-header">
          <span class="duty-col-period">时段</span>
          <span class="duty-col-name">${escapeHtml(d.staff_a.department)}${escapeHtml(d.staff_a.class)} ${escapeHtml(d.staff_a.name)}</span>
          <span class="duty-col-name">${escapeHtml(d.staff_b.department)}${escapeHtml(d.staff_b.class)} ${escapeHtml(d.staff_b.name)}</span>
          <span class="duty-col-score">计分</span>
        </div>`;

  for (const p of d.periods) {
    const deadline = new Date(d.date + 'T' + p.start_time);
    deadline.setMinutes(deadline.getMinutes() + p.auto_absent_min);
    const past = Date.now() > deadline.getTime();

    tableContent += `
      <div class="duty-table-row">
        <span class="duty-col-period duty-period-label">${escapeHtml(p.label)}</span>
        <span class="duty-col-name">${renderDutyButton(p, 'a', d.schedule_id, d.staff_a.id)}</span>
        <span class="duty-col-name">${renderDutyButton(p, 'b', d.schedule_id, d.staff_b.id)}</span>
        <span class="duty-col-score duty-score-cell">${renderDutyScore(p, d.staff_a.name, d.staff_b.name)}</span>
      </div>
    `;
  }

  tableContent += `</div>`;
  html += Card('', tableContent);

  html += `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <span class="badge" style="background:var(--md-surface-container-high);color:var(--md-on-surface-variant)">未签到</span>
      <span class="badge" style="background:#FFF3CD;color:#856404">签到中</span>
      <span class="badge" style="background:#D4F5E2;color:#1B7D4A">已完成</span>
      <span class="badge" style="background:#FFDAD6;color:#BA1A1A">在岗不足</span>
      <span class="badge" style="background:#F5F5F5;color:#999;border:1px solid #ddd">缺岗</span>
    </div>
  `;

  el.innerHTML = html;
  _dutyAdminLink(el);

  // Event delegation for sign-in/sign-out buttons
  el.addEventListener('click', function(e) {
    const btn = e.target.closest('.duty-btn[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'signin') {
      dutySignIn(parseInt(btn.dataset.sid, 10), parseInt(btn.dataset.staff, 10), btn.dataset.period, btn);
    } else if (btn.dataset.action === 'signout') {
      dutySignOut(parseInt(btn.dataset.aid, 10), btn);
    }
  });

  // Start timers for signed-in buttons
  for (const p of d.periods) {
    for (const side of ['a', 'b']) {
      const st = p[side];
      if (st.status === 'signed_in' && st.attendance_id) {
        startDutyTimer(st.attendance_id, st.sign_in_time);
      }
    }
  }
}

function renderDutyButton(p, side, scheduleId, staffId) {
  const st = p[side];
  let cls = 'btn duty-btn';
  let label = '签到';
  let attrs = '';

  if (st.status === 'pending') {
    cls += ' duty-btn-pending';
    attrs = `data-action="signin" data-sid="${scheduleId}" data-staff="${staffId}" data-period="${attrEscape(p.label)}"`;
  } else if (st.status === 'signed_in') {
    cls += ' duty-btn-active';
    attrs = `data-action="signout" data-aid="${st.attendance_id}"`;
    label = `<span class="duty-timer" data-att-id="${st.attendance_id}">签退</span>`;
  } else if (st.status === 'completed') {
    cls += st.total < 0 ? ' duty-btn-warn' : ' duty-btn-done';
    label = st.total < 0 ? `签退 ${icon('check')} ${st.total}` : `签退 ${icon('check')}`;
  } else if (st.status === 'absent') {
    cls += ' duty-btn-absent';
    label = '✕ 缺岗';
  }

  return `<button class="${cls}" ${attrs}>${label}</button>`;
}

function renderDutyScore(p, nameA, nameB) {
  const a = p.a, b = p.b;
  if (a.status === 'pending' && b.status === 'pending') return '-';
  const at = a.total || 0, bt = b.total || 0;
  if (at === 0 && bt === 0) return '<span style="color:var(--success)">0</span>';
  const parts = [];
  const mobile = window.innerWidth <= 768;
  const shortA = mobile ? nameA.charAt(0) : nameA;
  const shortB = mobile ? nameB.charAt(0) : nameB;
  if (at !== 0) parts.push(`${escapeHtml(shortA)}${at > 0 ? '+' : ''}${at}`);
  if (bt !== 0) parts.push(`${escapeHtml(shortB)}${bt > 0 ? '+' : ''}${bt}`);
  return parts.join(' ') || '<span style="color:var(--success)">0</span>';
}

// ========== Sign In/Out ==========

async function dutySignIn(scheduleId, staffId, period, btn) {
  btn.disabled = true;
  btn.textContent = '签到中...';
  try {
    const res = await apiPost('/api/duty/attendance/sign-in', { schedule_id: scheduleId, staff_id: staffId, period });
    btn.className = 'btn duty-btn duty-btn-active';
    btn.dataset.action = 'signout';
    btn.dataset.aid = res.attendance_id;
    btn.innerHTML = '<span class="duty-timer" data-att-id="' + res.attendance_id + '">签退</span>';
    btn.removeAttribute('data-sid');
    btn.removeAttribute('data-staff');
    btn.removeAttribute('data-period');
    btn.disabled = false;
    startDutyTimer(res.attendance_id, res.sign_in_time);
    if (typeof spawnParticles === 'function') spawnParticles(btn);
    toast('签到成功', 'success');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '签到';
    toast(e.message, 'error');
  }
}

async function dutySignOut(attendanceId, btn) {
  btn.disabled = true;
  btn.textContent = '签退中...';
  try {
    const res = await apiPost('/api/duty/attendance/sign-out', { attendance_id: attendanceId });
    const cls = res.color === 'pink' ? 'btn duty-btn duty-btn-warn' : 'btn duty-btn duty-btn-done';
    btn.className = cls;
    btn.innerHTML = res.score ? `签退 ${icon('check')} ${res.score}` : `签退 ${icon('check')}`;
    btn.onclick = null;
    if (typeof spawnParticles === 'function') spawnParticles(btn);
    toast('签退成功', 'success');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '签退';
    toast(e.message, 'error');
  }
}

// ========== Timer ==========

function startDutyTimer(attId, signInTime) {
  if (_dutyTimers[attId]) clearInterval(_dutyTimers[attId]);
  const start = signInTime ? new Date(signInTime.includes('T') ? signInTime : signInTime.replace(' ', 'T') + 'Z').getTime() : Date.now();
  // 注：后端 datetime('now') 与 toISOString() 均返回 UTC，'Z' 后缀正确

  _dutyTimers[attId] = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    document.querySelectorAll(`.duty-timer[data-att-id="${attId}"]`).forEach(el => {
      el.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    });
  }, 1000);
}

// ========== Department Stats (Public) ==========

async function loadPublicDeptStats() {
  const el = document.getElementById('publicDeptStats');
  if (!el) return;
  try {
    const data = await apiGet('/api/duty/department-stats?weeks=2');
    if (!data || !data.length) {
      el.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.88rem">近两周无扣分记录</p>';
      return;
    }
    el.innerHTML = `<div class="dept-stats">
      ${data.map((d, i) => {
        return `<div class="dept-stat-row">
          <span class="dept-stat-label">${escapeHtml(d.department)}</span>
          <div class="dept-stat-track"><div class="dept-stat-fill" style="animation-delay:${i * 0.08}s"></div></div>
          <span class="dept-stat-score">${d.total_score}</span>
          <span class="dept-stat-count">${d.record_count}次</span>
        </div>`;
      }).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--md-primary);font-size:.88rem">加载失败：${escapeHtml(e.message)}</p>`;
  }
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dutyDashboard')) loadDutyDashboard();
  if (document.getElementById('publicDeptStats')) loadPublicDeptStats();
});
