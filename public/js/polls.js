let polls = [];
let _pollDirty = false;

function markPollDirty() { _pollDirty = true; setPageDirty(true); }

async function init() {
  loadPolls();
}

function showFabIfAdmin() {
  const u = getUser();
  if (u && (u.role === 'admin' || u.role === 'owner')) {
    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = '';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { showFabIfAdmin(); init(); });
} else {
  showFabIfAdmin();
  init();
}

async function loadPolls() {
  try {
    await fetchWithCache('/api/polls',
      () => apiGet('/api/polls'),
      data => { polls = data; renderPolls(); }
    );
  } catch (err) {
    document.getElementById('pollList').innerHTML =
      EmptyState('', '加载失败：' + err.message);
  }
}

function renderPollCard(p, u) {
  const statusBadge = p.status === 'open' ? 'badge-pending' : 'badge-done';
  const statusText = p.status === 'open' ? '进行中' : '已结束';
  const roleText = p.min_role ? (p.min_role === 'member' ? '仅登录用户' : p.min_role === 'admin' ? '仅管理员' : '') : '所有人';
  const canManage = u && (u.name === p.created_by || u.role === 'owner');
  return `
    <div class="card poll-card" data-id="${p.id}" style="cursor:pointer" data-action="gotoPoll">
      <div class="card-header">
        <div>
          <strong>${escapeHtml(p.title)}</strong>
          <span style="margin-left:8px">${Badge(statusText, statusBadge)}</span>
        </div>
      </div>
      ${p.description ? `<div class="card-body">${escapeHtml(p.description)}</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:12px;font-size:.82rem;color:var(--md-on-surface-variant);flex-wrap:wrap">
        <span>${icon('person')} ${escapeHtml(p.created_by)}</span>
        <span>${icon('barrier')} ${roleText}</span>
        <span>${icon('clipboard')} ${p.total_votes} 人参与</span>
        ${p.require_name ? `<span>${icon('paperclip')} 需留名</span>` : ''}
      </div>
      ${canManage ? `
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-sm btn-outline" data-action="gotoPoll" data-id="${p.id}">查看结果</button>
        <button class="btn btn-sm btn-outline" data-action="exportPoll" data-id="${p.id}">导出CSV</button>
        <button class="btn btn-sm btn-danger" data-action="deletePoll" data-id="${p.id}">删除</button>
      </div>` : ''}
    </div>`;
}

async function renderPolls() {
  const u = getUser();
  const el = document.getElementById('pollList');
  if (!polls || polls.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px 56px">
        <div style="font-size:3.2rem;margin-bottom:16px;opacity:.3;display:flex;align-items:center;justify-content:center;position:relative">
          ${icon('clipboard')}
          <div style="position:absolute;width:3.2rem;height:3.2rem;display:flex;align-items:center;justify-content:center">
            <div style="width:3px;height:3.8rem;background:var(--md-on-surface-variant);transform:rotate(45deg);border-radius:2px"></div>
          </div>
        </div>
        <p style="font-size:.95rem;color:var(--md-on-surface-variant)">暂无投票</p>
        <p style="font-size:.82rem;color:var(--md-outline);margin-top:6px">还没有投票活动，敬请期待</p>
      </div>`;
    return;
  }
  const roleWeight = { member: 2, admin: 3, owner: 4 };
  const userWeight = u ? (roleWeight[u.role] || 0) : 0;
  const visible = polls.filter(p => {
    if (p.min_role === 'admin' && userWeight < 3) return false;
    if (p.min_role === 'member' && !u) return false;
    if (p.allowed_classes) {
      let classes = p.allowed_classes;
      if (typeof classes === 'string') { try { classes = JSON.parse(classes); } catch { classes = []; } }
      if (Array.isArray(classes) && classes.length > 0 && (!u || !u.class_name || !classes.includes(u.class_name))) return false;
    }
    return true;
  });
  if (visible.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px 56px">
        <div style="font-size:3.2rem;margin-bottom:16px;opacity:.3">${icon('clipboard')}</div>
        <p style="font-size:.95rem;color:var(--md-on-surface-variant)">暂无你可参与的投票</p>
      </div>`;
    return;
  }
  await progressiveRender(el, visible, p => renderPollCard(p, u));
}

function gotoPoll(dataset) { location.href = 'poll.html?id=' + dataset.id; }

function triggerFileInput(dataset) { document.getElementById('pq-file-' + dataset.idx).click(); }

function removeOption(dataset, el) { el.parentElement.remove(); }

async function exportPoll(dataset) {
  var id = dataset.id;
  try {
    const res = await fetch(`/api/polls/${id}/export`);
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || '导出失败'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `投票_${id}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('导出成功', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deletePoll(dataset) {
  var id = dataset.id;
  confirmAction('确定删除此投票？所有数据将丢失', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/polls/${id}`);
      polls = polls.filter(p => p.id !== id);
      const card = document.querySelector(`.poll-card[data-id="${id}"]`);
      if (card) card.remove();
      if (polls.length === 0) renderPolls();
      toast('投票已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ─── Create Poll Modal ───
function openPollModal() {
  _pollDirty = false;
  openModal({
    title: '发起投票',
    body: '<form id="pollCreateForm" data-action="createPoll"><div class="form-group"><label class="form-label">标题 <span class="required">*</span></label><input class="form-input" id="pollTitle" placeholder="投票标题" required maxlength="200" oninput="markPollDirty()"></div><div class="form-group"><label class="form-label">描述</label><textarea class="form-textarea" id="pollDesc" placeholder="投票说明" style="min-height:60px" maxlength="1000" oninput="markPollDirty()"></textarea></div><div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"><div class="form-group" style="flex:1;min-width:140px"><label class="form-label" for="pollMinRole">参与范围</label><select class="form-select" id="pollMinRole" onchange="markPollDirty()"><option value="">所有人</option><option value="member">仅登录用户</option><option value="admin">仅管理员</option></select></div><div class="form-group" style="flex:1;min-width:140px"><label class="form-label" for="pollRequireName">留名要求</label><select class="form-select" id="pollRequireName" onchange="markPollDirty()"><option value="0">匿名投票</option><option value="1">需要留名</option></select></div></div><div class="form-group" style="margin-bottom:16px"><label class="form-label">班级限定（可选，留空则不限制）</label><input class="form-input" id="pollAllowedClasses" placeholder="如 2501,2502,2503" maxlength="200" oninput="markPollDirty()"><p style="font-size:.75rem;color:var(--md-on-surface-variant);margin-top:4px">仅允许指定班级参与，多个班级用逗号分隔</p></div><div class="form-group"><label class="form-label">题目</label><div id="pollQuestions"></div><button type="button" class="btn btn-sm btn-outline" style="margin-top:8px" data-action="addPollQuestion">+ 添加题目</button></div><div class="modal-actions"><button type="button" class="btn btn-outline" id="pollCancelBtn">取消</button><button type="submit" class="btn btn-primary" id="createPollBtn">发起投票</button></div></form>',
    maxWidth: '600px',
    dirtyCheck: function() {
      if (_pollDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _pollDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return true; }
      return false;
    }
  });
  document.getElementById('pollCancelBtn').onclick = function() {
    if (_pollDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _pollDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return; }
    closeModal(document.getElementById('modalContainer'));
  };
  addPollQuestion();
}

let _pollQIdx = 0;
function addPollQuestion() {
  markPollDirty();
  _pollQIdx++;
  const idx = _pollQIdx;
  const el = document.getElementById('pollQuestions');
  const div = document.createElement('div');
  div.className = 'poll-question-card';
  div.id = `pq-${idx}`;
  div.style.cssText = 'border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);padding:12px;margin-bottom:10px';
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input class="form-input" placeholder="题目内容" id="pq-title-${idx}" style="flex:1" required oninput="markPollDirty()">
      <select class="form-select" id="pq-type-${idx}" aria-label="题目类型" style="width:auto" onchange="markPollDirty();togglePollOptions(${idx})">
        <option value="single">单选</option>
        <option value="multiple">多选</option>
        <option value="text">主观题</option>
      </select>
      <button type="button" class="btn btn-sm btn-danger" data-action="removePollQuestion" data-idx="${idx}">${icon('x')}</button>
    </div>
    <div id="pq-media-${idx}" style="margin-bottom:8px">
      <div class="upload-zone" style="padding:8px;font-size:.82rem" data-action="triggerFileInput" data-idx="${idx}">
        <p style="color:var(--md-on-surface-variant)">点击添加配图（选填）</p>
        <img id="pq-preview-${idx}" class="upload-preview" alt="" style="display:none;max-height:120px">
      </div>
      <input type="file" id="pq-file-${idx}" accept="image/*" aria-label="上传配图" style="display:none" onchange="markPollDirty();previewPollQuestionFile(${idx})">
    </div>
    <div id="pq-text-options-${idx}" style="display:none">
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:.82rem" for="pq-maxlen-${idx}">字数限制</label>
        <input class="form-input" type="number" id="pq-maxlen-${idx}" value="1000" min="1" max="10000" style="width:120px" oninput="markPollDirty()">
      </div>
    </div>
    <div id="pq-options-${idx}">
      <div style="display:flex;gap:6px;margin-bottom:4px">
        <input class="form-input" placeholder="选项 A" id="pq-opt-${idx}-0" style="flex:1" oninput="markPollDirty()">
        <input class="form-input" placeholder="选项 B" id="pq-opt-${idx}-1" style="flex:1" oninput="markPollDirty()">
      </div>
      <button type="button" class="btn btn-sm btn-outline poll-add-option" data-action="addPollOption" data-idx="${idx}">+ 添加选项</button>
    </div>`;
  el.appendChild(div);
}

function removePollQuestion(dataset) {
  markPollDirty();
  const el = document.getElementById(`pq-${dataset.idx}`);
  if (el) el.remove();
}

function togglePollOptions(idx) {
  const type = document.getElementById(`pq-type-${idx}`).value;
  const optsEl = document.getElementById(`pq-options-${idx}`);
  const textOptsEl = document.getElementById(`pq-text-options-${idx}`);
  optsEl.style.display = type === 'text' ? 'none' : '';
  if (textOptsEl) textOptsEl.style.display = type === 'text' ? '' : 'none';
}

function addPollOption(dataset) {
  markPollDirty();
  const idx = dataset.idx;
  const optsEl = document.getElementById(`pq-options-${idx}`);
  const count = optsEl.querySelectorAll('input').length;
  if (count >= 26) { toast('最多26个选项', 'error'); return; }
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
  const letter = String.fromCharCode(65 + count);
  div.innerHTML = `<input class="form-input" placeholder="选项 ${letter}" id="pq-opt-${idx}-${count}" style="flex:1">
    <button type="button" class="btn btn-sm btn-outline" style="color:var(--accent);border-color:var(--accent);padding:2px 8px" data-action="removeOption">${icon('x')}</button>`;
  const addBtn = optsEl.querySelector('.poll-add-option');
  if (addBtn) optsEl.insertBefore(div, addBtn);
  else optsEl.appendChild(div);
}

function previewPollQuestionFile(idx) {
  const fileInput = document.getElementById(`pq-file-${idx}`);
  const file = fileInput.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { toast('图片不能超过 25MB', 'error'); fileInput.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = document.getElementById(`pq-preview-${idx}`);
    img.src = ev.target.result;
    img.style.display = '';
    fileInput.parentElement.querySelector('p').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

async function createPoll(dataset, target) {
  const btn = document.getElementById('createPollBtn');
  btn.disabled = true; btn.textContent = '创建中...';
  try {
    const title = document.getElementById('pollTitle').value.trim();
    const description = document.getElementById('pollDesc').value.trim();
    const require_name = document.getElementById('pollRequireName').value === '1';
    const min_role = document.getElementById('pollMinRole').value || null;

    const questions = [];
    const seen = new Set();
    for (const card of document.querySelectorAll('.poll-question-card')) {
      const id = card.id.replace('pq-', '');
      if (seen.has(id)) continue; seen.add(id);
      const type = document.getElementById(`pq-type-${id}`).value;
      const titleEl = document.getElementById(`pq-title-${id}`);
      if (!titleEl || !titleEl.value.trim()) { toast('请填写所有题目内容', 'error'); btn.disabled = false; btn.textContent = '发起投票'; return; }
      let image_url = '';
      const preview = document.getElementById(`pq-preview-${id}`);
      if (preview && preview.src && preview.style.display !== 'none') {
        image_url = await compressImage(preview.src);
      }
      const q = { type, title: titleEl.value.trim(), image_url };
      if (type === 'single' || type === 'multiple') {
        const opts = [];
        let optIdx = 0;
        while (true) {
          const optEl = document.getElementById(`pq-opt-${id}-${optIdx}`);
          if (!optEl) break;
          if (optEl.value.trim()) opts.push(optEl.value.trim());
          optIdx++;
        }
        if (opts.length < 2) { toast('选择题至少需要2个选项', 'error'); btn.disabled = false; btn.textContent = '发起投票'; return; }
        q.options = opts;
      } else {
        const maxLenEl = document.getElementById(`pq-maxlen-${id}`);
        if (!maxLenEl) { toast('请设置主观题字数限制', 'error'); btn.disabled = false; btn.textContent = '发起投票'; return; }
        q.max_length = Math.min(Math.max(parseInt(maxLenEl.value, 10) || 1000, 1), 10000);
      }
      questions.push(q);
    }
    if (questions.length === 0) { toast('至少需要一个题目', 'error'); btn.disabled = false; btn.textContent = '发起投票'; return; }
    const allowedClasses = document.getElementById('pollAllowedClasses').value.trim()
      .split(/[,，\s]+/).filter(Boolean).filter(c => /^\d{4}$/.test(c));
    const data = await apiPost('/api/polls', { title, description, require_name, min_role, allowed_classes: allowedClasses, questions });
    _pollDirty = false; setPageDirty(false);
    closeModal(document.getElementById('modalContainer'));
    const pollObj = { id: data.id, title, description, require_name, min_role, allowed_classes: allowedClasses, created_by: getUser().name, status: 'open', total_votes: 0 };
    if (polls.length === 0) {
      polls = [pollObj];
      renderPolls();
    } else {
      polls.unshift(pollObj);
      document.getElementById('pollList').insertAdjacentHTML('afterbegin', renderPollCard(pollObj, getUser()));
    }
    toast('投票已创建', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '发起投票';
  }
}

