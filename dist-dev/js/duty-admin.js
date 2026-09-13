let _adminStaffList = [];

async function loadAdminStaff() {
  try {
    _adminStaffList = await apiGet('/api/duty/staff');
    updateStaffSummary();
    if (document.getElementById('staffModal').style.display === 'flex') renderStaffList();
  } catch (e) {
    const el = document.getElementById('staffCount');
    if (el) el.textContent = '加载失败';
  }
}

function updateStaffSummary() {
  const el = document.getElementById('staffCount');
  if (!el) return;
  el.textContent = `共 ${_adminStaffList.length} 名干事`;
}

function renderStaffList() {
  const el = document.getElementById('staffModalBody');
  if (!el) return;
  if (!_adminStaffList.length) {
    el.innerHTML = EmptyState(icon('users'), '暂无干事');
    return;
  }
  el.innerHTML = _adminStaffList.map(s => Card('', `<div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${escapeHtml(s.name)}</strong>
          <span style="font-size:.8rem;color:var(--md-on-surface-variant);margin-left:8px">${s.department} ${s.class}</span>
          ${s.user_id > 0 ? '' : Badge('未映射', 'warning')}
        </div>
        <button class="btn btn-xs btn-danger-outline" data-action="deleteAdminStaff" data-id="${s.id}">${icon('trash-2')} 移除</button>
      </div>`)).join('');
}

function showStaffModal() {
  renderStaffList();
  document.getElementById('staffModal').style.display = 'flex';
}

function closeStaffModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('staffModal'));
}

async function deleteAdminStaff(dataset) {
  var id = parseInt(dataset.id, 10);
  if (!await new Promise(r => confirmAction('确定移除该干事？', r))) return;
  try {
    await apiDel('/api/duty/staff/' + id);
    toast('已移除', 'success');
    loadAdminStaff();
  } catch (e) { toast(e.message, 'error'); }
}

// ========== Upload ==========

function showUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.style.display = 'flex';
}

function closeUploadModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('uploadModal'));
}

async function handleUpload(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const raw = fd.get('csv');
  const lines = raw.trim().split('\n').filter(Boolean);
  const staffList = [];

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 3) continue;
    staffList.push({ department: parts[0], class: parts[1], name: parts[2] });
  }

  if (!staffList.length) return toast('未解析到有效数据', 'error');

  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = '上传中...';

  try {
    const res = await apiPost('/api/duty/staff/upload', { staffList });
    let msg = `成功导入 ${res.inserted} 人`;
    if (res.warnings && res.warnings.length) {
      msg += '。' + res.warnings.map(w =>
        w.row + ' — ' + w.reason
      ).join('；');
    }
    toast(msg, res.warnings && res.warnings.length ? 'warning' : 'success');
    closeUploadModal();
    loadAdminStaff();
  } catch (e) {
    toast(e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = '导入';
}

// ========== Add Single ==========

async function addStaff() {
  const dep = document.getElementById('modalStaffDept').value.trim();
  const cls = document.getElementById('modalStaffClass').value.trim();
  const name = document.getElementById('modalStaffName').value.trim();
  if (!dep || !cls || !name) return toast('请填写完整信息', 'error');

  const btn = document.querySelector('#addStaffModal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '添加中...'; }
  try {
    const res = await apiPost('/api/duty/staff', { department: dep, class: cls, name });
    let msg = '已添加';
    toast(msg, 'success');
    closeAddStaffModal();
    loadAdminStaff();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '添加'; } }
}

function showAddStaffModal() {
  document.getElementById('modalStaffDept').value = '';
  document.getElementById('modalStaffClass').value = '';
  document.getElementById('modalStaffName').value = '';
  document.getElementById('addStaffModal').style.display = 'flex';
}

function closeAddStaffModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('addStaffModal'));
}

async function submitAddStaff() {
  return addStaff();
}

// ========== Schedule ==========

async function generateSchedule() {
  const btn = document.getElementById('genScheduleBtn');
  btn.disabled = true;
  btn.textContent = '生成中...';
  try {
    const res = await apiPost('/api/duty/schedule/generate');
    toast('已生成 ' + res.generated + ' 天排班', 'success');
    renderDutyCalendar();
  } catch (e) { toast(e.message, 'error'); }
  btn.disabled = false;
  btn.textContent = '自动生成排班';
}

// ========== Calendar ==========

let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth() + 1;
let _scheduleData = [];

function initCalendar() {
  renderDutyCalendar();
}

function prevMonth() {
  _calMonth--;
  if (_calMonth < 1) { _calMonth = 12; _calYear--; }
  renderDutyCalendar();
}

function nextMonth() {
  _calMonth++;
  if (_calMonth > 12) { _calMonth = 1; _calYear++; }
  renderDutyCalendar();
}

async function renderDutyCalendar() {
  const el = document.getElementById('adminScheduleList');
  if (!el) return;

  document.getElementById('calTitle').textContent = _calYear + '年' + _calMonth + '月';

  const pad = n => String(n).padStart(2, '0');
  const firstDay = new Date(_calYear, _calMonth - 1, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth, 0).getDate();

  const startStr = _calYear + '-' + pad(_calMonth) + '-01';
  const endStr = _calYear + '-' + pad(_calMonth) + '-' + pad(daysInMonth);

  try {
    const rows = await apiGet('/api/duty/schedule?start=' + startStr + '&end=' + endStr);
    _scheduleData = rows || [];
  } catch {
    _scheduleData = [];
  }

  const scheduleMap = {};
  for (const s of _scheduleData) {
    scheduleMap[s.date] = s;
  }

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date().toISOString().slice(0, 10);

  let html = '<table class="cal-grid"><thead><tr>';
  for (const wd of weekdays) {
    html += '<th>' + wd + '</th>';
  }
  html += '</tr></thead><tbody>';

  let day = 1;
  for (let row = 0; row < 6; row++) {
    if (day > daysInMonth) break;
    html += '<tr>';
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < firstDay) {
        html += '<td></td>';
      } else if (day > daysInMonth) {
        html += '<td></td>';
        day++;
      } else {
        const dateStr = _calYear + '-' + pad(_calMonth) + '-' + pad(day);
        const s = scheduleMap[dateStr];
        const isToday = dateStr === today;
        const isWeekend = col === 0 || col === 6;
        const isPast = dateStr < today;

        let cls = 'cal-day';
        if (isPast) cls += ' cal-day-disabled';
        if (isWeekend && !isToday) cls += ' cal-day-weekend';
        if (isToday) cls += ' cal-day-today';

        html += '<td><button class="' + cls + '" data-action="openScheduleModal" data-date="' + dateStr + '"';
        if (isPast) html += ' disabled';
        html += '>';
        html += '<span>' + day + '</span>';
        if (s) {
          const aInit = (s.a_name || '').charAt(0);
          const bInit = (s.b_name || '').charAt(0);
          html += '<span class="cal-day-initials">' + escapeHtml(aInit) + escapeHtml(bInit) + '</span>';
        }
        html += '</button></td>';
        day++;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';

  el.innerHTML = html;
}

let _scheduleModalDate = '';

async function openScheduleModal(dataset) {
  var dateStr = dataset.date;
  _scheduleModalDate = dateStr;
  document.getElementById('scheduleModalDate').textContent = dateStr;

  const selA = document.getElementById('scheduleStaffA');
  const selB = document.getElementById('scheduleStaffB');
  const delBtn = document.getElementById('scheduleDeleteBtn');

  if (!_adminStaffList.length) {
    try { await loadAdminStaff(); } catch {}
  }

  selA.innerHTML = '<option value="">-- 选择干事 --</option>' + _adminStaffList.map(s =>
    '<option value="' + s.id + '">' + escapeHtml(s.department + s.class + ' ' + s.name) + '</option>'
  ).join('');
  selB.innerHTML = selA.innerHTML;

  const existing = _scheduleData.find(x => x.date === dateStr);
  if (existing) {
    selA.value = existing.staff_a_id;
    selB.value = existing.staff_b_id;
    delBtn.style.display = '';
  } else {
    selA.value = '';
    selB.value = '';
    delBtn.style.display = 'none';
  }

  document.getElementById('scheduleModal').style.display = 'flex';
}

function closeScheduleModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('scheduleModal'));
}

async function saveManualSchedule() {
  const a = document.getElementById('scheduleStaffA').value;
  const b = document.getElementById('scheduleStaffB').value;
  if (!a || !b) return toast('请选择两名干事', 'error');
  if (a === b) return toast('两名干事不能相同', 'error');

  const btn = document.querySelector('#scheduleModal .btn-primary');
  if (btn) btn.disabled = true;
  try {
    await apiPost('/api/duty/schedule/manual', { date: _scheduleModalDate, staff_a_id: parseInt(a, 10), staff_b_id: parseInt(b, 10) });
    toast('排班已保存', 'success');
    closeScheduleModal();
    renderDutyCalendar();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

async function deleteManualSchedule() {
  if (!await new Promise(r => confirmAction('确定删除该天的排班？', r))) return;

  const btn = document.getElementById('scheduleDeleteBtn');
  if (btn) btn.disabled = true;
  try {
    await apiDel('/api/duty/schedule/manual?date=' + _scheduleModalDate);
    toast('排班已删除', 'success');
    closeScheduleModal();
    renderDutyCalendar();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

async function clearAllSchedules() {
  if (!await new Promise(r => confirmAction('确定重置所有排班数据？这将清空所有排班、签到和扣分记录。', r))) return;

  const btn = document.querySelector('button[onclick*="clearAllSchedules"]');
  if (btn) btn.disabled = true;
  try {
    await apiPost('/api/duty/schedule/clear-all');
    toast('已重置', 'success');
    _scheduleData = [];
    _scoreData = [];
    renderDutyCalendar();
    updateScoreSummary();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ========== Scores ==========

let _scoreData = [];
let _scoreFiltered = [];
let _scoreSelected = new Set();
let _scorePeriods = [];

async function loadAdminScores() {
  try {
    const rows = await apiGet('/api/duty/scores?date_from=' + new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    _scoreData = rows || [];
    if (!_scorePeriods.length) {
      try { _scorePeriods = await apiGet('/api/duty/periods'); } catch {}
    }
    populateScoreDeptFilter();
    updateScoreSummary();
    if (document.getElementById('scoresModal').style.display === 'flex') applyScoreFilter();
  } catch (e) {
    const el = document.getElementById('scoreCount');
    if (el) el.textContent = '加载失败';
  }
}

function populateScoreDeptFilter() {
  const sel = document.getElementById('scoreFilterDept');
  if (!sel) return;
  const depts = [...new Set(_scoreData.map(r => r.department).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">全部部门</option>' + depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  sel.value = current;
}

function updateScoreSummary() {
  const el = document.getElementById('scoreCount');
  if (!el) return;
  const total = _scoreData.length;
  const active = _scoreData.filter(r => !r.is_cancelled);
  const negCount = active.filter(r => r.score < 0).length;
  const negSum = active.filter(r => r.score < 0).reduce((s, r) => s + r.score, 0);
  el.textContent = `共 ${total} 条（有效 ${active.length} 条，扣分 ${negCount} 条 ${negSum} 分）`;
}

function applyScoreFilter() {
  const dept = document.getElementById('scoreFilterDept')?.value || '';
  const cancelled = document.getElementById('scoreFilterCancelled')?.value || 'active';
  const nameQ = (document.getElementById('scoreFilterName')?.value || '').trim().toLowerCase();
  _scoreFiltered = _scoreData.filter(r => {
    if (dept && r.department !== dept) return false;
    if (cancelled === 'active' && r.is_cancelled) return false;
    if (cancelled === 'cancelled' && !r.is_cancelled) return false;
    if (nameQ && !(r.name || '').toLowerCase().includes(nameQ)) return false;
    return true;
  });
  renderScoresList();
}

function renderScoresList() {
  const el = document.getElementById('scoresModalBody');
  if (!el) return;
  const statsEl = document.getElementById('scoreStatsSummary');
  if (statsEl) {
    const negSum = _scoreFiltered.filter(r => !r.is_cancelled && r.score < 0).reduce((s, r) => s + r.score, 0);
    statsEl.textContent = `筛选 ${_scoreFiltered.length} 条 · 扣分合计 ${negSum}`;
  }
  if (!_scoreFiltered.length) {
    el.innerHTML = EmptyState(icon('file-text'), '暂无扣分记录');
    updateBatchBar();
    return;
  }
  const list = _scoreFiltered.slice(0, 200);
  el.innerHTML = list.map(r => {
    const checked = _scoreSelected.has(r.id) ? 'checked' : '';
    const canSelect = !r.is_cancelled && r.score < 0;
    return Card('', `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        ${canSelect ? `<input type="checkbox" class="score-checkbox" data-id="${r.id}" ${checked} onchange="toggleScoreSelection(${r.id}, this.checked)">` : ''}
        <div style="min-width:0">
          <strong>${escapeHtml(r.name)}</strong>
          ${r.department ? `<span class="badge badge-review" style="margin-left:4px">${escapeHtml(r.department)}</span>` : ''}
          <span style="font-size:.78rem;color:var(--md-on-surface-variant);margin-left:4px">${r.date} ${escapeHtml(r.period)}</span>
          ${r.is_cancelled ? Badge('已销分', 'done') : ''}
          ${r.recorder && r.recorder !== 'system' ? `<span style="font-size:.72rem;color:var(--md-on-surface-variant);margin-left:4px">记录人:${escapeHtml(r.recorder)}</span>` : ''}
          ${r.reason ? `<div style="font-size:.78rem;color:var(--md-on-surface-variant);margin-top:2px">${escapeHtml(r.reason)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span style="font-weight:600;color:${r.score < 0 ? 'var(--md-error)' : 'var(--success)'}">${r.score}</span>
        ${!r.is_cancelled && r.score < 0 ? `<button class="btn btn-xs btn-outline" data-action="showCancelModal" data-id="${r.id}">销分</button>` : ''}
      </div>
    </div>`);
  }).join('');
  updateBatchBar();
}

function toggleScoreSelection(id, checked) {
  if (checked) _scoreSelected.add(id); else _scoreSelected.delete(id);
  updateBatchBar();
}

function clearScoreSelection() {
  _scoreSelected.clear();
  document.querySelectorAll('.score-checkbox').forEach(cb => { cb.checked = false; });
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('scoreBatchBar');
  const countEl = document.getElementById('scoreSelectedCount');
  if (!bar || !countEl) return;
  const hasSelection = _scoreSelected.size > 0;
  bar.style.display = hasSelection ? 'flex' : 'none';
  countEl.textContent = `已选 ${_scoreSelected.size} 条`;
}

function selectAllVisibleScores() {
  document.querySelectorAll('.score-checkbox').forEach(cb => {
    cb.checked = true;
    _scoreSelected.add(parseInt(cb.dataset.id, 10));
  });
  updateBatchBar();
}

function showScoresModal() {
  applyScoreFilter();
  document.getElementById('scoresModal').style.display = 'flex';
}

function closeScoresModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  _scoreSelected.clear();
  closeModal(document.getElementById('scoresModal'));
}

// ========== Add Score ==========

async function showAddScoreModal() {
  if (!_adminStaffList.length) { toast('干事列表未加载，请稍候', 'error'); return; }
  if (!_scorePeriods.length) { try { _scorePeriods = await apiGet('/api/duty/periods'); } catch {} }
  const staffSel = document.getElementById('addScoreStaff');
  staffSel.innerHTML = '<option value="">-- 选择干事 --</option>' +
    _adminStaffList.map(s => `<option value="${s.id}">${escapeHtml(s.department)} ${escapeHtml(s.class)} ${escapeHtml(s.name)}</option>`).join('');
  const periodSel = document.getElementById('addScorePeriod');
  const periods = _scorePeriods.filter(p => p.slot_type !== 'no_duty');
  periodSel.innerHTML = '<option value="">-- 选择时段 --</option>' +
    periods.map(p => `<option value="${escapeHtml(p.label)}">${escapeHtml(p.label)}</option>`).join('');
  document.getElementById('addScoreDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('addScoreValue').value = '';
  document.getElementById('addScoreReason').value = '';
  document.getElementById('addScoreModal').style.display = 'flex';
}

function closeAddScoreModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('addScoreModal'));
}

async function submitAddScore() {
  const staffId = parseInt(document.getElementById('addScoreStaff').value, 10);
  const date = document.getElementById('addScoreDate').value;
  const period = document.getElementById('addScorePeriod').value;
  const score = parseFloat(document.getElementById('addScoreValue').value);
  const reason = document.getElementById('addScoreReason').value.trim();
  if (!staffId) return toast('请选择干事', 'error');
  if (!date) return toast('请选择日期', 'error');
  if (!period) return toast('请选择时段', 'error');
  if (Number.isNaN(score)) return toast('请输入有效分值', 'error');

  const btn = document.querySelector('#addScoreModal .btn-primary');
  if (btn) btn.disabled = true;
  try {
    await apiPost('/api/duty/scores/add', { staff_id: staffId, date, period, score, reason });
    toast(score < 0 ? `已记录扣分 ${score} 分` : `已记录加分 +${score} 分`, 'success');
    closeAddScoreModal();
    loadAdminScores();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ========== Batch Cancel ==========

async function showBatchCancelModal() {
  if (_scoreSelected.size === 0) return toast('请先选择记录', 'error');
  const hint = document.getElementById('batchCancelHint');
  if (hint) hint.textContent = `将销分 ${_scoreSelected.size} 条扣分记录，需管理员验证。`;
  if (!_adminUsers.length) await loadAdminUsers();
  const sel = document.getElementById('batchCancelAdminSelect');
  sel.innerHTML = '<option value="">-- 选择管理员 --</option>' +
    _adminUsers.map(u => '<option value="' + u.id + '">' + escapeHtml(u.name) + '（' + u.role + '）</option>').join('');
  document.getElementById('batchCancelReason').value = '';
  document.getElementById('batchCancelPassword').value = '';
  document.getElementById('batchCancelModal').style.display = 'flex';
}

function closeBatchCancelModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  closeModal(document.getElementById('batchCancelModal'));
}

async function submitBatchCancel() {
  const reason = document.getElementById('batchCancelReason').value.trim();
  const adminId = parseInt(document.getElementById('batchCancelAdminSelect').value, 10);
  const pwd = document.getElementById('batchCancelPassword').value;
  if (!reason) return toast('请填写销分理由', 'error');
  if (!adminId) return toast('请选择销分人', 'error');
  if (!pwd) return toast('请输入密码', 'error');
  if (_scoreSelected.size === 0) return toast('未选择记录', 'error');

  const btn = document.querySelector('#batchCancelModal .btn-primary');
  if (btn) btn.disabled = true;
  try {
    const ids = Array.from(_scoreSelected);
    const res = await apiPost('/api/duty/scores/batch-cancel', { score_record_ids: ids, reason, admin_id: adminId, password: pwd });
    toast(`已销分 ${res.cancelled || ids.length} 条`, 'success');
    closeBatchCancelModal();
    _scoreSelected.clear();
    loadAdminScores();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ========== Cancel Score ==========

let _cancelRecordId = 0;
let _adminUsers = [];

async function loadAdminUsers() {
  try {
    _adminUsers = await apiGet('/api/duty/admins');
    const sel = document.getElementById('cancelAdminSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- 选择管理员 --</option>' +
      _adminUsers.map(u => '<option value="' + u.id + '">' + escapeHtml(u.name) + '（' + u.role + '）</option>').join('');
  } catch {}
}

function showCancelModal(dataset) {
  var recordId = parseInt(dataset.id, 10);
  _cancelRecordId = recordId;
  loadAdminUsers();
  document.getElementById('cancelModal').style.display = 'flex';
}

function closeCancelModal(e) {
  if (e && (window.innerWidth > 768 || e.target !== e.currentTarget)) return;
  _cancelRecordId = 0;
  document.getElementById('cancelAdminSelect').value = '';
  document.getElementById('cancelPassword').value = '';
  closeModal(document.getElementById('cancelModal'));
}

async function submitCancel() {
  const reason = document.getElementById('cancelReason').value.trim();
  const adminId = parseInt(document.getElementById('cancelAdminSelect').value, 10);
  const pwd = document.getElementById('cancelPassword').value;
  if (!reason) return toast('请填写销分理由', 'error');
  if (!adminId) return toast('请选择销分人', 'error');
  if (!pwd) return toast('请输入密码', 'error');

  const btn = document.querySelector('#cancelModal .btn-primary');
  if (btn) btn.disabled = true;
  try {
    await apiPost('/api/duty/scores/cancel', { score_record_id: _cancelRecordId, reason, admin_id: adminId, password: pwd });
    toast('销分成功', 'success');
    closeCancelModal();
    document.getElementById('cancelReason').value = '';
    loadAdminScores();
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ========== Export ==========

async function downloadCSV(filename, apiUrl, headers, rowMapper) {
  try {
    const data = await apiGet(apiUrl);
    if (!data || !data.length) return toast('没有数据可导出', 'warning');
    const rows = data.map(rowMapper);
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已下载', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10)
  };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function showExportTimePicker(type) {
  openModal({
    title: '导出范围',
    body: `<p style="margin-bottom:16px;color:var(--md-on-surface-variant);font-size:.88rem">选择导出${type === 'schedule' ? '排班' : '扣分'}的时间范围</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-outline" onclick="doExport('${type}','week')" style="justify-content:center;padding:12px;font-size:.95rem">${icon('calendar')} 本周（${getWeekRange().start} ~ ${getWeekRange().end}）</button>
        <button class="btn btn-outline" onclick="doExport('${type}','month')" style="justify-content:center;padding:12px;font-size:.95rem">${icon('calendar')} 本月（${getMonthRange().start} ~ ${getMonthRange().end}）</button>
      </div>`,
    maxWidth: '420px',
    footer: [{ text: '取消', variant: 'ghost', onClick: function() { closeModal(document.getElementById('modalContainer')); } }]
  });
}

function doExport(type, range) {
  closeModal(document.getElementById('modalContainer'));
  const dateStr = new Date().toISOString().slice(0, 10);
  if (type === 'schedule') {
    const r = range === 'week' ? getWeekRange() : getMonthRange();
    downloadCSV(
      '排班_' + r.start + '_' + r.end + '.csv',
      '/api/duty/schedule?start=' + r.start + '&end=' + r.end,
      ['日期', '干事A', '干事B'],
      row => `${row.date},${row.a_dept}${row.a_class} ${row.a_name},${row.b_dept}${row.b_class} ${row.b_name}`
    );
  } else {
    const r = range === 'week' ? getWeekRange() : getMonthRange();
    downloadCSV(
      '扣分记录_' + r.start + '_' + r.end + '.csv',
      '/api/duty/scores?date_from=' + r.start + '&date_to=' + r.end + '&show_cancelled=false',
      ['姓名', '班级', '部门', '日期', '时段', '分数', '原因'],
      row => `${row.name},${row.class},${row.department},${row.date},${row.period},${row.score},${row.reason || ''}`
    );
  }
}

// ========== Department Stats ==========

async function loadDeptStats() {
  const el = document.getElementById('deptStatsContainer');
  if (!el) return;
  try {
    const data = await apiGet('/api/duty/department-stats?weeks=2');
    if (!data || !data.length) {
      el.innerHTML = EmptyState(icon('clipboard'), '近两周无扣分记录');
      return;
    }
    el.innerHTML = `<style>
      @keyframes deptBarGrow { from { width: 0; } to { width: 100%; } }
    </style><div style="display:flex;flex-direction:column;gap:8px">
      ${data.map((d, i) => {
        return `<div style="display:flex;align-items:center;gap:10px">
          <span style="min-width:64px;font-size:.85rem;font-weight:500;color:var(--md-on-surface)">${escapeHtml(d.department)}</span>
          <div style="flex:1;height:22px;background:var(--md-surface-variant);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:0;background:linear-gradient(90deg,var(--md-primary),var(--md-tertiary));border-radius:6px;animation:deptBarGrow .6s ease-out ${i * 0.08}s forwards"></div>
          </div>
          <span style="min-width:60px;text-align:right;font-size:.85rem;font-weight:600;color:var(--md-primary)">${d.total_score}</span>
          <span style="font-size:.75rem;color:var(--md-on-surface-variant)">${d.record_count}次</span>
        </div>`;
      }).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = EmptyState(icon('alert-circle'), '加载失败：' + escapeHtml(e.message));
  }
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('staffCount')) {
    const u = await requireAdmin();
    if (u) loadAdminStaff();
  }
  if (document.getElementById('adminScheduleList')) initCalendar();
  if (document.getElementById('scoreCount')) loadAdminScores();
  if (document.getElementById('deptStatsContainer')) loadDeptStats();
});
