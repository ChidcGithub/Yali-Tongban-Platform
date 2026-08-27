let user = null;
let allActivities = [];
let _currentVolunteerActivityId = null;
let _signupActivityId = null;
let _volunteerCaptcha = null;

async function init() {
  user = await checkAuth();
  if (user) {
    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = '';
  }
  loadActivities();
}

function openActivityModal() {
  openModal({
    title: '发布活动',
    body: '<form id="activityForm" data-action="uploadActivity"><div class="form-group"><label class="form-label">活动名称 <span class="required">*</span></label><input class="form-input" name="name" placeholder="如：元旦晚会" required maxlength="100"></div><div class="form-group"><label class="form-label">地点</label><input class="form-input" name="location" placeholder="如：千人报告厅" maxlength="200"></div><div class="form-group"><label class="form-label">时间 <span class="required">*</span></label><input class="form-input" name="time" type="datetime-local" required></div><div class="form-group"><label class="form-label">涉及部门</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px" id="deptCheckboxes"><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="书记处"> 书记处</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="团总支"> 团总支</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="社团部"> 社团部</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="记者站"> 记者站</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="宣传部"> 宣传部</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="组织部"> 组织部</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="青志协"> 青志协</label><label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="departments" value="办公室"> 办公室</label></div></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.9rem"><input type="checkbox" id="needVolunteers" name="need_volunteers" style="width:18px;height:18px;cursor:pointer"><span>需要志愿者</span></label></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="closeActiveModal">取消</button><button type="submit" class="btn btn-primary" id="activityUploadBtn">发布</button></div></form>'
  });
}

async function uploadActivity(dataset, target) {
  const btn = document.getElementById('activityUploadBtn');
  btn.disabled = true; btn.textContent = '发布中...';
  const fd = new FormData(target);
  const deptCheckboxes = document.querySelectorAll('#deptCheckboxes input[type="checkbox"]:checked');
  const departments = Array.from(deptCheckboxes).map(cb => cb.value).join(',');
  try {
    const data = await apiPost('/api/activities', {
      name: fd.get('name'),
      location: fd.get('location') || '',
      time: fd.get('time'),
      departments,
      need_volunteers: fd.get('need_volunteers') === 'on',
    });
    allActivities.unshift(data);
    renderActivities();
    target.reset();
    closeModal(document.getElementById('modalContainer'));
    toast('发布成功', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '发布';
  }
}

async function loadActivities() {
  try {
    const data = await apiGet('/api/activities');
    allActivities = data.map(a => ({ ...a, _signedUp: !!a.signed_up }));
    renderActivities();
  } catch (err) {
    const el = document.getElementById('activityList');
    if (el) el.innerHTML = `<div style="grid-column:1/-1">${EmptyState('', '加载失败：' + err.message)}</div>`;
  }
}

async function renderActivities() {
  const el = document.getElementById('activityList');
  if (!el) return;
  const countEl = document.getElementById('activityCount');
  if (countEl) countEl.textContent = `共 ${allActivities.length} 项`;

  if (allActivities.length === 0) {
    el.innerHTML = `<div style="grid-column:1/-1">${EmptyState(icon('calendar'), '暂无活动')}</div>`;
    return;
  }

  await progressiveRender(el, allActivities, a => {
    const needVol = a.need_volunteers;
    const hasSignedUp = needVol && user && allActivities.some(act =>
      act.id === a.id && act._signedUp
    );
    return `
    <div class="activity-card" data-id="${a.id}">
      <div class="activity-card-header">
        <h3 class="activity-title">${escapeHtml(a.name)}</h3>
        ${needVol ? Badge('需志愿者', 'pending') : ''}
      </div>
      <div class="activity-meta">
        ${a.location ? `<span class="activity-meta-item">${icon('map-pin')} ${escapeHtml(a.location)}</span>` : ''}
        <span class="activity-meta-item">${icon('clock')} ${formatTime(a.time)}</span>
        ${a.departments ? `<span class="activity-meta-item">${icon('users')} ${escapeHtml(a.departments)}</span>` : ''}
      </div>
      <div class="activity-footer">
        <span class="activity-author">发布人：${escapeHtml(a.created_by)}</span>
        <div class="activity-actions">
          ${needVol ? `
            <button class="btn btn-sm ${hasSignedUp ? 'btn-outline' : 'btn-primary'}" ${hasSignedUp ? 'disabled' : `data-action="signupVolunteer" data-id="${a.id}"`}>
              ${hasSignedUp ? '已报名' : '报名志愿者'}
            </button>
            <button class="btn btn-sm btn-outline" data-action="viewVolunteers" data-id="${a.id}">
              ${icon('users')} ${a.volunteer_count || 0}人
            </button>
          ` : ''}
          ${user && isAdmin(user) ? `<button class="btn btn-sm btn-danger-outline" data-action="deleteActivity" data-id="${a.id}">删除</button>` : ''}
        </div>
      </div>
    </div>`;
  });

  allActivities.forEach(a => {
    if (a._signedUp) {
      const card = el.querySelector(`.activity-card[data-id="${a.id}"]`);
      if (!card) return;
      const btn = card.querySelector('.btn-primary, .btn-outline');
      if (btn) {
        btn.className = 'btn btn-sm btn-outline';
        btn.textContent = '已报名';
        btn.disabled = true;
        btn.onclick = null;
      }
    }
  });
}

function signupVolunteer(dataset) {
  if (user) {
    doSignup(dataset.id);
  } else {
    _signupActivityId = dataset.id;
    openModal({
      title: '报名志愿者',
      body: '<div class="form-group"><label class="form-label">你的姓名 <span class="required">*</span></label><input class="form-input" id="volunteerName" placeholder="请输入你的姓名" maxlength="50"></div><div class="form-group" id="volunteerCaptchaBox"></div><div class="modal-actions"><button type="button" class="btn btn-outline" id="volunteerSignupCancelBtn">取消</button><button type="button" class="btn btn-primary" id="volunteerSignupBtn" data-action="confirmVolunteerSignup">报名</button></div>'
    });
    document.getElementById('volunteerSignupCancelBtn').onclick = function() { closeVolunteerSignupModal(); };
    _volunteerCaptcha = new CaptchaWidget('volunteerCaptchaBox');
  }
}

async function doSignup(id, name) {
  try {
    const body = {};
    if (name) body.name = name;
    if (!user && _volunteerCaptcha) {
      Object.assign(body, _volunteerCaptcha.getData());
    }
    await apiPost(`/api/activities/${id}/volunteer`, body);
    const a = allActivities.find(x => x.id === id);
    if (a) {
      a._signedUp = true;
      a.volunteer_count = (a.volunteer_count || 0) + 1;
    }
    renderActivities();
    toast('报名成功', 'success');
  } catch (err) {
    toast(err.message, 'error');
    if (_volunteerCaptcha) _volunteerCaptcha.refresh();
  }
}

async function confirmVolunteerSignup(dataset) {
  const name = document.getElementById('volunteerName').value.trim();
  if (!name) {
    toast('请填写姓名', 'error');
    return;
  }
  const btn = document.getElementById('volunteerSignupBtn');
  btn.disabled = true; btn.textContent = '报名中...';
  try {
    await doSignup(_signupActivityId, name);
    closeVolunteerSignupModal();
  } finally {
    btn.disabled = false; btn.textContent = '报名';
  }
}

function closeVolunteerSignupModal() {
  _signupActivityId = null;
  _volunteerCaptcha = null;
  closeModal(document.getElementById('modalContainer'));
}

async function unsignupVolunteer(id) {
  try {
    await apiDel(`/api/activities/${id}/volunteer`);
    const a = allActivities.find(x => x.id === id);
    if (a) {
      a._signedUp = false;
      a.volunteer_count = Math.max(0, (a.volunteer_count || 0) - 1);
    }
    renderActivities();
    toast('已取消报名', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteActivity(dataset) {
  confirmAction('确定删除此活动及其所有志愿者报名吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/activities/${dataset.id}`);
      allActivities = allActivities.filter(a => a.id !== dataset.id);
      renderActivities();
      toast('活动已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function viewVolunteers(dataset) {
  _currentVolunteerActivityId = dataset.id;
  var listEl;
  openModal({
    title: '志愿者列表',
    body: '<div id="volunteerList" style="max-height:300px;overflow-y:auto;margin-bottom:12px"></div>',
    footer: [
      { text: '关闭', variant: 'outline', onClick: function() { _currentVolunteerActivityId = null; closeModal(document.getElementById('modalContainer')); } },
      { text: '导出表格', variant: 'primary', onClick: function() { exportVolunteers(); } }
    ]
  });
  listEl = document.getElementById('volunteerList');
  showNavLoading('加载中...');

  try {
    const data = await apiGet('/api/activities/' + dataset.id + '/volunteers');
    var titleEl = document.querySelector('#modalContainer .modal-title');
    titleEl.textContent = escapeHtml(data.activity_name) + ' - 志愿者列表';

    if (!data.volunteers || data.volunteers.length === 0) {
      hideNavLoading();
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--md-on-surface-variant)">暂无志愿者报名</div>';
      return;
    }

    listEl.innerHTML = '<table class="volunteer-table"><thead><tr><th>序号</th><th>姓名</th><th>部门</th><th>报名时间</th></tr></thead><tbody>' + data.volunteers.map(function(v, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(v.member_name) + '</td><td>' + escapeHtml(v.department || '-') + '</td><td>' + formatTime(v.created_at) + '</td></tr>';
    }).join('') + '</tbody></table>';
    hideNavLoading();
  } catch (err) {
    hideNavLoading();
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--accent)">加载失败：' + err.message + '</div>';
  }
}

function exportVolunteers() {
  const table = document.querySelector('.volunteer-table');
  if (!table) { toast('没有数据可导出', 'error'); return; }

  let csv = '\uFEFF序号,姓名,部门,报名时间\n';
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    csv += Array.from(cells).map(c => `"${c.textContent.trim()}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `志愿者报名表_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

// ──────── HALL BOOKINGS ────────
const HALL_START = 6, HALL_END = 24;
const HALL_PX_PER_HOUR = 48;
const HALL_PAD_TOP = 14, HALL_PAD_BOTTOM = 14;
let _hallBookings = [];
let _hallPending = [];
let _hallSelectedDate = null;
let _hallReviewOpen = false;

function isHallReviewer(user) {
  return user && (isAdmin(user) || user.department === '社团部');
}

function getHallDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function getHallDateRange() {
  const days = [];
  const now = new Date();
  for (let i = -1; i < 13; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatHallDate(d) {
  const weekdays = ['日','一','二','三','四','五','六'];
  return `${d.getMonth()+1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
}

async function loadHallBookings() {
  try {
    const data = await apiGet('/api/hall/bookings');
    _hallBookings = data || [];
  } catch {}
}

async function loadHallPending() {
  try {
    const data = await apiGet('/api/hall/bookings/pending');
    _hallPending = data || [];
    const badge = document.getElementById('hallReviewBadge');
    if (badge) badge.textContent = _hallPending.length;
    const panel = document.getElementById('hallReviewPanel');
    if (panel) panel.style.display = _hallPending.length ? '' : 'none';
  } catch {}
}

function renderHallCal() {
  const el = document.getElementById('hallCal');
  if (!el) return;
  const days = getHallDateRange();
  const today = getHallDateStr(new Date());
  if (!_hallSelectedDate) _hallSelectedDate = getHallDateStr(days[1]); // default = today
  el.innerHTML = days.map(d => {
    const ds = getHallDateStr(d);
    const active = ds === _hallSelectedDate ? ' hall-cal-active' : '';
    const isToday = ds === today ? ' hall-cal-today' : '';
    const weekdays = ['日','一','二','三','四','五','六'];
    return `<div class="hall-cal-day${active}${isToday}" data-action="selectHallDate" data-hdate="${ds}">
      <div class="hall-cal-weekday">${weekdays[d.getDay()]}</div>
      <div class="hall-cal-date">${d.getDate()}</div>
      <div class="hall-cal-month">${d.getMonth()+1}月</div>
    </div>`;
  }).join('');
}

function selectHallDate(dataset) {
  _hallSelectedDate = dataset.hdate;
  renderHallCal();
  renderHallSlots();
}

// ────── Hall timeline drag/click ──────
const HALL_SNAP = 10;
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
let _hallDragStartY = null;
let _hallDragLastY = null;
let _hallIsDragging = false;
let _hallSelEl = null;

function timeFromY(y, isEnd) {
  const totalMin = ((y - HALL_PAD_TOP) / HALL_PX_PER_HOUR) * 60;
  const snapped = Math.round(totalMin / HALL_SNAP) * HALL_SNAP;
  let h = HALL_START + Math.floor(snapped / 60);
  let m = snapped % 60;
  if (h >= HALL_END) {
    if (isEnd) return '24:00';
    h = HALL_END - 1; m = 0;
  }
  if (h < HALL_START) { h = HALL_START; m = 0; }
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function addHoursToTime(t, addH) {
  const [h, m] = t.split(':').map(Number);
  const totalM = (h + m / 60 + addH) * 60;
  const snapped = Math.round(totalM / HALL_SNAP) * HALL_SNAP;
  let nh = Math.floor(snapped / 60);
  let nm = snapped % 60;
  if (nh >= 24) return '24:00';
  return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
}

function getHallGridY(e) {
  const grid = document.querySelector('.hall-timeline-grid');
  if (!grid) return 0;
  const rect = grid.getBoundingClientRect();
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const maxY = (HALL_END - HALL_START) * HALL_PX_PER_HOUR + HALL_PAD_TOP + HALL_PAD_BOTTOM;
  return Math.max(0, Math.min(cy - rect.top, maxY));
}

function showHallSelection(startY, endY) {
  const grid = document.querySelector('.hall-timeline-grid');
  if (!grid) return;
  if (!_hallSelEl) {
    _hallSelEl = document.createElement('div');
    _hallSelEl.className = 'hall-timeline-selection';
    grid.appendChild(_hallSelEl);
    const lbl = document.createElement('div');
    lbl.className = 'hall-timeline-selection-label';
    _hallSelEl.appendChild(lbl);
  }
  const top = Math.min(startY, endY);
  const ht = Math.max(Math.abs(endY - startY), 8);
  _hallSelEl.style.top = top + 'px';
  _hallSelEl.style.height = ht + 'px';
  _hallSelEl.style.opacity = '1';

  const t1 = timeFromY(startY);
  const t2 = timeFromY(endY);
  const label = _hallSelEl.querySelector('.hall-timeline-selection-label');
  if (label) {
    const lt = t1 < t2 ? t1 : t2;
    const rt = t1 < t2 ? t2 : t1;
    label.textContent = lt === rt ? `${lt} (1h)` : `${lt} – ${rt}`;
  }
}

function hideHallSelection() {
  if (_hallSelEl) {
    _hallSelEl.style.opacity = '0';
  }
}

function onHallGridMouseDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest('.hall-timeline-card')) return;
  _hallDragStartY = getHallGridY(e);
  _hallDragLastY = _hallDragStartY;
  _hallIsDragging = false;
  document.addEventListener('mousemove', onHallDocMouseMove);
  document.addEventListener('mouseup', onHallDocMouseUp);
}

function onHallDocMouseMove(e) {
  const y = getHallGridY(e);
  _hallDragLastY = y;
  if (Math.abs(y - _hallDragStartY) > 5) _hallIsDragging = true;
  showHallSelection(_hallDragStartY, _hallDragLastY);
}

function onHallDocMouseUp(e) {
  document.removeEventListener('mousemove', onHallDocMouseMove);
  document.removeEventListener('mouseup', onHallDocMouseUp);
  const endY = _hallDragLastY !== null ? _hallDragLastY : _hallDragStartY;
  const ds = _hallSelectedDate || getHallDateStr(new Date());
  const y1 = Math.min(_hallDragStartY, endY);
  const y2 = Math.max(_hallDragStartY, endY);

  if (!_hallIsDragging || Math.abs(y2 - y1) < 6) {
    // Click → default 1 hour
    const t = timeFromY(_hallDragStartY);
    const endT = addHoursToTime(t, 1);
    hideHallSelection();
    openHallBookingModal(ds, t, endT);
  } else {
    const startT = timeFromY(y1);
    const endT = timeFromY(y2, true);
    if (startT === endT) {
      // Edge case: dragged less than snap unit
      const t = timeFromY(y1);
      const endT2 = addHoursToTime(t, 1);
      openHallBookingModal(ds, t, endT2);
    } else {
      openHallBookingModal(ds, startT, endT);
    }
    hideHallSelection();
  }
  _hallDragStartY = null;
  _hallDragLastY = null;
}

// Touch
function onHallGridTouchStart(e) {
  if (e.target.closest('.hall-timeline-card')) return;
  _hallDragStartY = getHallGridY(e);
  _hallDragLastY = _hallDragStartY;
  _hallIsDragging = false;
  document.addEventListener('touchmove', onHallDocTouchMove, { passive: false });
  document.addEventListener('touchend', onHallDocTouchEnd);
}

function onHallDocTouchMove(e) {
  e.preventDefault();
  const y = getHallGridY(e);
  _hallDragLastY = y;
  if (Math.abs(y - _hallDragStartY) > 5) _hallIsDragging = true;
  showHallSelection(_hallDragStartY, _hallDragLastY);
}

function onHallDocTouchEnd(e) {
  document.removeEventListener('touchmove', onHallDocTouchMove);
  document.removeEventListener('touchend', onHallDocTouchEnd);
  const endY = _hallDragLastY !== null ? _hallDragLastY : _hallDragStartY;
  const ds = _hallSelectedDate || getHallDateStr(new Date());
  const y1 = Math.min(_hallDragStartY, endY);
  const y2 = Math.max(_hallDragStartY, endY);

  if (!_hallIsDragging || Math.abs(y2 - y1) < 6) {
    const t = timeFromY(_hallDragStartY);
    const endT = addHoursToTime(t, 1);
    hideHallSelection();
    openHallBookingModal(ds, t, endT);
  } else {
    const startT = timeFromY(y1);
    const endT = timeFromY(y2, true);
    if (startT === endT) {
      const t = timeFromY(y1);
      const endT2 = addHoursToTime(t, 1);
      openHallBookingModal(ds, t, endT2);
    } else {
      openHallBookingModal(ds, startT, endT);
    }
    hideHallSelection();
  }
  _hallDragStartY = null;
  _hallDragLastY = null;
}

function assignOverlapColumns(bookings) {
  if (bookings.length < 2) {
    for (const b of bookings) { b._col = 0; b._numCols = 1; }
    return;
  }
  const sorted = [...bookings].sort((a, b) =>
    a.start_time.localeCompare(b.start_time) || b.end_time.localeCompare(a.end_time)
  );
  // Build overlap clusters
  const clusters = [];
  let cur = [], curEnd = '00:00';
  for (const b of sorted) {
    if (cur.length === 0 || b.start_time < curEnd) {
      cur.push(b);
      if (b.end_time > curEnd) curEnd = b.end_time;
    } else {
      clusters.push(cur);
      cur = [b];
      curEnd = b.end_time;
    }
  }
  if (cur.length > 0) clusters.push(cur);

  // Assign columns per cluster
  for (const cluster of clusters) {
    const cols = [];
    for (const b of cluster) {
      let placed = false;
      for (let i = 0; i < cols.length; i++) {
        if (b.start_time >= cols[i].end) {
          cols[i].end = b.end_time;
          b._col = i;
          b._numCols = cols.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        b._col = cols.length;
        cols.push({ end: b.end_time });
      }
    }
    const nc = cols.length;
    for (const b of cluster) b._numCols = nc;
  }
}

function renderHallSlots() {
  const el = document.getElementById('hallSlots');
  const title = document.getElementById('hallDateTitle');
  if (!el || !title) return;
  const ds = _hallSelectedDate || getHallDateStr(new Date());
  title.textContent = formatHallDate(new Date(ds));
  const dayBookings = _hallBookings.filter(b => b.date === ds && b.status !== 'rejected');

  const pH = HALL_PX_PER_HOUR;
  const hours = HALL_END - HALL_START;
  const totalPx = hours * pH + HALL_PAD_TOP + HALL_PAD_BOTTOM;

  let ruler = '';
  for (let h = HALL_START; h <= HALL_END; h++) {
    const t = (h - HALL_START) * pH + HALL_PAD_TOP;
    ruler += `<div class="hall-timeline-ruler-hour" style="top:${t}px">${String(h).padStart(2,'0')}:00</div>`;
  }

  let lines = '';
  for (let h = HALL_START; h <= HALL_END; h++) {
    const t = (h - HALL_START) * pH + HALL_PAD_TOP;
    lines += `<div class="hall-timeline-line" style="top:${t}px"></div>`;
    if (h < HALL_END) {
      lines += `<div class="hall-timeline-line-half" style="top:${t + pH/2}px"></div>`;
    }
  }

  // Assign overlap columns
  assignOverlapColumns(dayBookings);

  let cards = '';
  const colSorted = [...dayBookings].sort((a, b) =>
    a._col - b._col || a.start_time.localeCompare(b.start_time)
  );
  for (const b of colSorted) {
    const [sh, sm] = b.start_time.split(':').map(Number);
    const [eh, em] = b.end_time.split(':').map(Number);
    const top = (sh - HALL_START + sm / 60) * pH + HALL_PAD_TOP;
    const durH = (eh + em / 60) - (sh + sm / 60);
    const ht = Math.max(durH * pH, 24);

    const nc = b._numCols || 1;
    const col = b._col || 0;
    const mine = Number(b.user_id) === Number(user?.userId);

    let cls = 'hall-timeline-card';
    if (nc > 1) {
      if (col > 0) cls += ' hall-timeline-card-touch-left';
      if (col < nc - 1) cls += ' hall-timeline-card-touch-right';
    }
    let tag = '';
    if (b.status === 'approved') {
      cls += mine ? ' hall-timeline-card-self' : ' hall-timeline-card-others';
      tag = '<span class="hall-timeline-tag hall-timeline-tag-approved">已通过</span>';
    } else if (b.status === 'pending') {
      cls += ' hall-timeline-card-pending';
      tag = '<span class="hall-timeline-tag hall-timeline-tag-pending">待审核</span>';
    } else if (b.status === 'cancelled') {
      cls += ' hall-timeline-card-cancelled';
      tag = '<span class="hall-timeline-tag hall-timeline-tag-cancelled">已作废</span>';
    }

    let body = `<div class="hall-timeline-card-body">
      <div class="hall-timeline-title">${escapeHtml(b.applicant)} ${tag}</div>
      <div class="hall-timeline-time">${b.start_time}─${b.end_time}</div>
      <div class="hall-timeline-purpose">${escapeHtml(b.purpose)}</div>`;
    if (mine && b.status === 'pending') {
      body += `<div class="hall-timeline-btn-row"><button data-action="withdrawHallBooking" data-id="${b.id}">撤回</button></div>`;
    }
    body += '</div>';

    let actions = '';
    if (b.status !== 'cancelled' && (mine || isAdmin(user) || (user && user.role === 'teacher'))) {
      actions = `<div class="hall-timeline-card-actions">
        <button class="hall-timeline-card-del" data-action="deleteHallBooking" data-id="${b.id}" title="删除">✕</button>
      </div>`;
    }

    const left = nc > 1 ? `calc(8px + (100% - 16px) * ${col} / ${nc})` : '8px';
    const width = nc > 1 ? `calc((100% - 16px) / ${nc})` : `calc(100% - 16px)`;
    cards += `<div class="${cls}" data-id="${b.id}" style="top:${top}px;height:${ht}px;left:${left};width:${width};z-index:${2 + col}">${body}${actions}</div>`;
  }

  // Save scroll ratio before re-render
  const oldTl = el.querySelector('.hall-timeline');
  const scrollRatio = oldTl ? oldTl.scrollTop / oldTl.scrollHeight : 0;
  const scrollTop = oldTl ? oldTl.scrollTop : 0;

  el.innerHTML = `<div class="hall-timeline" style="height:${totalPx}px">
    <div class="hall-timeline-ruler">${ruler}</div>
    <div class="hall-timeline-grid">${lines}${cards}</div>
  </div>`;

  _hallSelEl = null;

  const newTl = el.querySelector('.hall-timeline');
  const grid = el.querySelector('.hall-timeline-grid');
  if (grid) {
    grid.addEventListener('mousedown', onHallGridMouseDown);
    grid.addEventListener('touchstart', onHallGridTouchStart, { passive: true });
    grid.addEventListener('click', e => {
      const card = e.target.closest('.hall-timeline-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const booking = _hallBookings.find(b => b.id === id);
      if (booking) showHallBookingDetail(booking);
    });
  }
  // Restore scroll position
  if (newTl) {
    if (newTl.scrollHeight > newTl.clientHeight) {
      newTl.scrollTop = scrollRatio > 0
        ? scrollRatio * newTl.scrollHeight
        : Math.min(scrollTop, newTl.scrollHeight - newTl.clientHeight);
    }
  }
}

var _hallBookingDateStr = '';

function openHallBookingModal(date, start, end) {
  if (!user) { toast('请先登录', 'error'); return; }
  _hallBookingDateStr = date;
  openModal({
    title: '预约千人报告厅',
    body: '<div style="font-size:.85rem;color:var(--md-on-surface-variant);margin-bottom:8px" id="hallBookingDate">' + formatHallDate(new Date(date)) + '</div><div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><label style="font-size:.78rem;color:var(--md-on-surface-variant);flex-shrink:0">开始</label><input type="time" id="hallBookingStart" step="600" value="' + start + '" style="flex:1;padding:6px 8px;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);background:var(--md-surface);color:var(--md-on-surface);font-size:.82rem"><label style="font-size:.78rem;color:var(--md-on-surface-variant);flex-shrink:0">结束</label><input type="time" id="hallBookingEnd" step="600" value="' + end + '" style="flex:1;padding:6px 8px;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);background:var(--md-surface);color:var(--md-on-surface);font-size:.82rem"></div><div class="form-group"><label class="form-label">用途 <span class="required">*</span></label><input class="form-input" id="hallBookingPurpose" placeholder="如：年级大会、讲座..." maxlength="200"></div>',
    maxWidth: '380px',
    footer: [
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } },
      { text: '提交预约', variant: 'primary', onClick: function() { confirmHallBooking(); } }
    ]
  });
  setTimeout(function() { document.getElementById('hallBookingPurpose').focus(); }, 100);
}

function showHallBookingDetail(b) {
  const statusMap = { approved: '已通过', pending: '待审核', cancelled: '已作废', rejected: '已拒绝' };
  openModal({
    title: '预约详情',
    body: MetaRow([{label:'提交人',value:escapeHtml(b.applicant)},{label:'状态',value:statusMap[b.status]||b.status},{label:'时间',value:b.start_time+' ─ '+b.end_time},{label:'用途',value:escapeHtml(b.purpose)},{label:'提交时间',value:b.created_at?b.created_at.slice(0,16):'—'},{label:'审核者',value:b.reviewed_by||'—'},{label:'审核时间',value:b.reviewed_at?b.reviewed_at.slice(0,16):'—'}]),
    maxWidth: '380px',
    footer: [{ text: '关闭', variant: 'primary', onClick: function() { closeModal(document.getElementById('modalContainer')); } }]
  });
}

async function confirmHallBooking() {
  const purpose = document.getElementById('hallBookingPurpose').value.trim();
  if (!purpose) { toast('请填写用途', 'error'); return; }
  const start = document.getElementById('hallBookingStart').value;
  const end = document.getElementById('hallBookingEnd').value;
  if (!start || !end) { toast('请选择时间', 'error'); return; }
  if (start >= end) { toast('结束时间必须晚于开始时间', 'error'); return; }

  // Conflict check
  const ds = _hallBookingDateStr;
  const sMin = timeToMin(start), eMin = timeToMin(end);
  const conflicts = [];
  let totalOverlap = 0;
  for (const b of _hallBookings) {
    if (Number(b.user_id) === Number(user?.userId)) continue;
    if (b.status === 'cancelled' || b.status === 'rejected') continue;
    if (b.date !== ds) continue;
    const bs = timeToMin(b.start_time), be = timeToMin(b.end_time);
    const overlap = Math.min(eMin, be) - Math.max(sMin, bs);
    if (overlap > 0) {
      conflicts.push({ ...b, overlap });
      totalOverlap += overlap;
    }
  }
  if (totalOverlap > 10) {
    let msg = `所选时间段（${start}─${end}）与他人预约重叠总计 ${totalOverlap} 分钟：\n`;
    for (const c of conflicts) {
      msg += `  · ${escapeHtml(c.applicant)} ${c.start_time}─${c.end_time}（重叠${c.overlap}分钟）\n`;
    }
    msg += '\n建议重新选择。仍要提交吗？';
    const ok = await new Promise(r => confirmAction(msg, r));
    if (!ok) return;
  }

  const btn = document.getElementById('hallBookingSubmit');
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    await apiPost('/api/hall/bookings', {
      date: ds,
      start_time: start,
      end_time: end,
      purpose,
    });
    closeModal(document.getElementById('modalContainer'));
    toast('预约已提交，等待审核', 'success');
    refreshHall();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '提交预约';
  }
}

async function withdrawHallBooking(dataset) {
  confirmAction('确定撤回此预约申请吗？', async ok => {
    if (!ok) return;
    try {
      await apiPost(`/api/hall/bookings/${dataset.id}/withdraw`);
      toast('已撤回', 'success');
      refreshHall();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function deleteHallBooking(dataset) {
  confirmAction('确定删除此预约记录吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/hall/bookings/${dataset.id}`);
      toast('已删除', 'success');
      refreshHall();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function reviewHallBooking(dataset) {
  try {
    await apiPost(`/api/hall/bookings/${dataset.id}/review`, { action: dataset.param });
    toast(dataset.param === 'approve' ? '已批准' : '已拒绝', 'success');
    refreshHall();
  } catch (err) { toast(err.message, 'error'); }
}

function toggleHallReview() {
  _hallReviewOpen = !_hallReviewOpen;
  const body = document.getElementById('hallReviewBody');
  const icon = document.getElementById('hallReviewToggleIcon');
  if (body) body.style.display = _hallReviewOpen ? '' : 'none';
  if (icon) icon.textContent = _hallReviewOpen ? '收起' : '展开';
  if (_hallReviewOpen) renderHallReview();
}

function renderHallReview() {
  const el = document.getElementById('hallReviewBody');
  if (!el) return;
  if (_hallPending.length === 0) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--md-on-surface-variant);text-align:center;padding:12px">暂无待审核预约</div>';
    return;
  }
  el.innerHTML = _hallPending.map(({ booking, conflicts }) => {
    const hours = 22 - 7;
    const pxPerHour = 40;
    const totalPx = hours * pxPerHour;
    const toPx = t => { const [h,m] = t.split(':').map(Number); return (h - 7 + m/60) * pxPerHour; };

    let gantt = '';
    if (conflicts.length > 0) {
      const allBars = [booking, ...conflicts];
      const minT = Math.min(...allBars.map(b => toPx(b.start_time)));
      const maxT = Math.max(...allBars.map(b => toPx(b.end_time)));
      const range = Math.max(maxT - minT, pxPerHour * 0.5);
      const leftPad = 32;

      let scaleHtml = '';
      for (let hh = 7; hh <= 22; hh++) {
        scaleHtml += `<span style="font-size:.55rem;color:var(--md-on-surface-variant)">${String(hh).padStart(2,'0')}:00</span>`;
      }

      const bars = allBars.map(b => {
        const left = ((toPx(b.start_time) - minT) / range) * 100;
        const width = ((toPx(b.end_time) - toPx(b.start_time)) / range) * 100;
        let cls = 'hall-gantt-approved';
        if (b.id === booking.id) cls = 'hall-gantt-self';
        else if (b.status === 'pending') cls = 'hall-gantt-pending';
        const label = b.id === booking.id ? '本次申请' : `${escapeHtml(b.applicant)} (${b.status === 'approved' ? '已通过' : '待审核'})`;
        return `<div class="hall-gantt-bar ${cls}" style="left:${left}%;width:${width}%"><span class="hall-gantt-label">${label}</span></div>`;
      }).join('');

      gantt = `<div style="margin:8px 0"><div style="display:flex;gap:2px;margin-bottom:4px" class="hall-gantt-scale">${scaleHtml}</div>
        <div class="hall-gantt" style="height:${Math.max(conflicts.length + 1, 2) * 24}px;background:var(--md-surface-container)">${bars}</div></div>`;
    }

    return `<div class="hall-review-item">
      <div class="hall-review-item-header">
        <strong style="font-size:.85rem">${escapeHtml(booking.applicant)}</strong>
        <span style="font-size:.78rem;color:var(--md-on-surface-variant)">${booking.date} ${booking.start_time}-${booking.end_time}</span>
      </div>
      <div class="hall-review-meta">用途：${escapeHtml(booking.purpose)}</div>
      ${gantt}
      <div class="hall-review-actions">
        <button class="btn btn-sm btn-primary" data-action="reviewHallBooking" data-id="${booking.id}" data-param="approve">批准</button>
        <button class="btn btn-sm btn-danger-outline" data-action="reviewHallBooking" data-id="${booking.id}" data-param="reject">拒绝</button>
      </div>
    </div>`;
  }).join('');
}

function renderHallCustomRow() {
  const el = document.getElementById('hallCustomRow');
  if (!el) return;
  const hrs = Array.from({length:15},(_,i)=>String(i+7).padStart(2,'0'));
  const optH = hrs.map(h => `<option value="${h}">${h}</option>`).join('');
  const optM = `<option value="00">00</option><option value="30">30</option>`;
  el.innerHTML = `<span style="font-size:.82rem;color:var(--md-on-surface-variant);flex-shrink:0">自定义</span>
    <select id="hallCustomStartH">${optH}</select>
    <span style="color:var(--md-on-surface-variant)">:</span>
    <select id="hallCustomStartM">${optM}</select>
    <span style="color:var(--md-on-surface-variant)">至</span>
    <select id="hallCustomEndH">${optH}</select>
    <span style="color:var(--md-on-surface-variant)">:</span>
    <select id="hallCustomEndM">${optM}</select>
    <button class="btn btn-primary btn-sm" data-action="submitHallBooking">预约</button>`;
}

async function submitHallBooking(dataset) {
  const ds = _hallSelectedDate || getHallDateStr(new Date());
  const sh = document.getElementById('hallCustomStartH').value;
  const sm = document.getElementById('hallCustomStartM').value;
  const eh = document.getElementById('hallCustomEndH').value;
  const em = document.getElementById('hallCustomEndM').value;
  const st = `${sh}:${sm}`;
  const et = `${eh}:${em}`;
  if (st >= et) { toast('结束时间必须晚于开始时间', 'error'); return; }
  openHallBookingModal(ds, st, et);
}

async function refreshHall() {
  await Promise.all([loadHallBookings(), loadHallPending()]);
  renderHallSlots();
  if (_hallReviewOpen) renderHallReview();
}

function initHall() {
  const tabs = document.getElementById('hallSectionTabs');
  const sections = ['activitySection', 'hallSection'];
  tabs?.addEventListener('click', e => {
    const btn = e.target.closest('.hall-section-tab');
    if (!btn) return;
    tabs.querySelectorAll('.hall-section-tab').forEach(t => t.classList.remove('hall-tab-active'));
    btn.classList.add('hall-tab-active');
    const show = btn.dataset.htab === 'hall';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === 'hallSection') === show ? '' : 'none';
    });
    if (show) {
      renderHallCustomRow();
      loadHallBookings().then(() => {
        renderHallCal();
        renderHallSlots();
      });
      if (isHallReviewer(user)) loadHallPending();
    }
  });
}

// Patch init
const _origInit = init;
init = function() {
  _origInit();
  initHall();
};
// ──────── END HALL BOOKINGS ────────

init();