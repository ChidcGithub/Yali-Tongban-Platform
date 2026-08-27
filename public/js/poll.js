let poll = null;
let myVote = null;
let pollCaptcha = null;

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { document.getElementById('pollDetail').innerHTML = EmptyState('', '缺少投票ID'); return; }
  try {
    await fetchWithCache(`/api/polls/${id}`, () => apiGet(`/api/polls/${id}`), (data) => { poll = data; });
    myVote = await apiGet(`/api/polls/${id}/my-vote`);
    renderPoll();
  } catch (err) {
    document.getElementById('pollDetail').innerHTML = EmptyState('', escapeHtml(err.message));
  }
}

function renderPoll() {
  const u = getUser();
  const el = document.getElementById('pollDetail');
  const canViewResults = u && (u.name === poll.created_by || u.role === 'admin' || u.role === 'owner');
  const closed = poll.status !== 'open';
  const voted = myVote && myVote.voted;

  let showForm = poll.status === 'open' && !voted;
  const roleWeight = { member: 2, admin: 3, owner: 4 };
  const userWeight = u ? (roleWeight[u.role] || 0) : 0;
  const minWeight = roleWeight[poll.min_role] || 0;
  if (poll.min_role && userWeight < minWeight) showForm = false;
  const allowedClasses = poll.allowed_classes ? (Array.isArray(poll.allowed_classes) ? poll.allowed_classes : JSON.parse(poll.allowed_classes || '[]')) : [];
  if (allowedClasses.length > 0 && (!u || !u.class_name || !allowedClasses.includes(u.class_name))) showForm = false;

  const statusBadge = poll.status === 'open' ? 'badge-pending' : 'badge-done';
  const statusText = poll.status === 'open' ? '进行中' : '已结束';

  let html = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h1 style="margin:0">${escapeHtml(poll.title)}</h1>
        ${Badge(statusText, statusBadge)}
        ${voted ? Badge('已参与', 'processing') : ''}
      </div>
      <p>${escapeHtml(poll.description || '')}</p>
      <div style="display:flex;gap:12px;font-size:.82rem;color:var(--md-on-surface-variant);flex-wrap:wrap;margin-top:4px">
        <span>${icon('person')} ${escapeHtml(poll.created_by)}</span>
        <span>${icon('clipboard')} ${poll.total_votes} 人参与</span>
        ${poll.min_role ? `<span>${icon('barrier')} ${poll.min_role === 'admin' ? '仅管理员' : '仅登录用户'}</span>` : ''}
        ${poll.require_name ? `<span>${icon('paperclip')} 需留名</span>` : ''}
        ${allowedClasses.length > 0 ? `<span>${icon('users')} 仅限 ${allowedClasses.join('、')}</span>` : ''}
      </div>
    </div>`;

  if (voted) {
    html += `<div id="myVoteResult"></div>`;
    if (canViewResults) html += `<div style="margin-top:24px"><hr style="border:none;border-top:1px solid var(--md-outline-variant);margin-bottom:16px"><h3 style="margin-bottom:12px">投票结果</h3><div id="pollResults"></div></div>`;
    el.innerHTML = html;
    renderMyVote();
    if (canViewResults) loadResults().catch(() => {});
    return;
  }

  if (closed) {
    html += canViewResults ? `<div id="pollResults"></div>` : EmptyState('', '投票已结束');
    el.innerHTML = html;
    if (canViewResults) loadResults().catch(() => {});
    return;
  }

  if (!showForm) {
    let reason = '您没有权限参与此投票';
    if (allowedClasses.length > 0 && (!u || !u.class_name || !allowedClasses.includes(u.class_name))) {
      reason = '您的班级不在本次投票范围内';
    } else if (poll.min_role && userWeight < minWeight) {
      reason = poll.min_role === 'admin' ? '仅管理员可参与' : '请登录后参与';
    }
    html += EmptyState('', reason);
    el.innerHTML = html;
    return;
  }

  // voting form
  const nameRequired = poll.require_name && !u;
  const nameDefault = u ? u.name : '';
  html += `
    <form id="pollVoteForm" data-action="submitVote">
      ${nameRequired ? `
      <div class="form-group">
        <label class="form-label">姓名 <span class="required">*</span></label>
        <input class="form-input" id="pollVoterName" placeholder="请输入姓名" required maxlength="20">
      </div>` : ''}
      <div id="pollQuestions"></div>
      <div id="pollCaptchaBox" style="margin-top:12px"></div>
      <div style="margin-top:16px">
        <button type="submit" class="btn btn-primary" id="voteBtn">提交投票</button>
      </div>
    </form>
    ${canViewResults ? '<div style="margin-top:24px"><hr style="border:none;border-top:1px solid var(--md-outline-variant);margin-bottom:16px"><h3 style="margin-bottom:12px">投票结果</h3><div id="pollResults"></div></div>' : ''}`;

  el.innerHTML = html;
  renderQuestions();
  pollCaptcha = new CaptchaWidget('pollCaptchaBox');

  if (canViewResults) loadResults().catch(() => {});
}

function renderQuestions() {
  const container = document.getElementById('pollQuestions');
  if (!container) return;
  container.innerHTML = poll.questions.map((q, qi) => {
    let inputHtml = '';
    if (q.type === 'single') {
      inputHtml = q.options.map((opt, oi) => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);margin-bottom:4px;cursor:pointer">
          <input type="radio" name="pq-${q.id}" value="${oi}" required>
          <span>${escapeHtml(opt)}</span>
        </label>`).join('');
    } else if (q.type === 'multiple') {
      inputHtml = q.options.map((opt, oi) => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);margin-bottom:4px;cursor:pointer">
          <input type="checkbox" name="pq-${q.id}" value="${oi}">
          <span>${escapeHtml(opt)}</span>
        </label>`).join('');
    } else {
      inputHtml = `<textarea class="form-textarea" name="pq-${q.id}" placeholder="请输入你的意见" maxlength="${q.max_length || 1000}" style="min-height:80px"></textarea>`;
    }

    const imageHtml = q.image_url && q.image_url.startsWith('data:')
      ? `<div style="margin-top:8px"><img src="${attrEscape(q.image_url)}" alt="配图" style="max-height:200px;width:auto;border-radius:var(--md-shape-sm);cursor:pointer" data-action="openImageLightbox" data-url="${attrEscape(dataUrlToBlobUrl(q.image_url))}"></div>`
      : '';

    const cardHeader = '<strong>' + (qi + 1) + '. ' + escapeHtml(q.title) + '</strong><span style="margin-left:8px;font-size:.75rem">' + Badge(q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '主观题', q.type === 'single' ? 'pending' : q.type === 'multiple' ? 'processing' : 'done') + '</span>';
    const cardBody = imageHtml ? imageHtml + '<div style="margin-top:8px">' + inputHtml + '</div>' : inputHtml;
    return '<div style="margin-bottom:16px">' + Card(cardHeader, cardBody) + '</div>';
  }).join('');
}

function openImageLightbox(dataset, el) {
  openLightbox(dataset.url, [{src: dataset.url}]);
}

function closeSuccessOverlay(dataset, el) {
  el.closest('.vote-success-overlay').remove();
  if (dataset.redirect) location.href = dataset.redirect;
}

async function submitVote(dataset, target) {
  const btn = document.getElementById('voteBtn');
  if (!btn) return;
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    const answers = [];
    for (const q of poll.questions) {
      if (q.type === 'single') {
        const selected = document.querySelector(`input[name="pq-${q.id}"]:checked`);
        if (!selected) { toast('请回答所有题目', 'error'); btn.disabled = false; btn.textContent = '提交投票'; return; }
        answers.push({ question_id: q.id, answer: Number(selected.value) });
      } else if (q.type === 'multiple') {
        const checked = [...document.querySelectorAll(`input[name="pq-${q.id}"]:checked`)].map(el => Number(el.value));
        if (checked.length === 0) { toast('请回答所有题目', 'error'); btn.disabled = false; btn.textContent = '提交投票'; return; }
        answers.push({ question_id: q.id, answer: checked });
      } else {
        const textarea = document.querySelector(`textarea[name="pq-${q.id}"]`);
        if (!textarea || !textarea.value.trim()) { toast('请回答所有题目', 'error'); btn.disabled = false; btn.textContent = '提交投票'; return; }
        answers.push({ question_id: q.id, answer: textarea.value.trim() });
      }
    }
    const voter_name = document.getElementById('pollVoterName')?.value.trim() || '';
    await apiPost(`/api/polls/${poll.id}/vote`, { answers, voter_name, ...(pollCaptcha ? pollCaptcha.getData() : {}) });
    checkNovice();
    poll.total_votes++;
    const overlay = document.createElement('div');
    overlay.className = 'vote-success-overlay';
    overlay.innerHTML = `
      <svg class="vote-success-icon" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" style="color:rgba(255,255,255,.15)"/>
        <path d="M7 12l3 3 7-7" stroke="#4caf50" stroke-width="2.5"/>
      </svg>
      <div class="vote-success-text">你已成功投票</div>
      <button class="btn btn-primary" data-action="closeSuccessOverlay" data-redirect="polls.html" style="margin-top:20px;padding:10px 28px;font-size:1rem">查看投票列表</button>
      <button class="btn btn-outline" data-action="closeSuccessOverlay" style="margin-top:8px;padding:8px 20px;font-size:.85rem;background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.2)">留在当前页面</button>
    `;
    document.body.appendChild(overlay);
  } catch (err) {
    toast(err.message, 'error');
    if (pollCaptcha) pollCaptcha.refresh();
  } finally {
    btn.disabled = false; btn.textContent = '提交投票';
  }
}

function renderMyVote() {
  const container = document.getElementById('myVoteResult');
  if (!container) return;
  const answersByQ = {};
  for (const a of myVote.answers) {
    answersByQ[a.question_id] = a;
  }
  let bodyHtml = '';
  for (const q of poll.questions) {
    const myAns = answersByQ[q.id];
    bodyHtml += `<div style="margin-bottom:12px"><strong>${escapeHtml(q.title)}</strong>`;
    if (q.type === 'single' && myAns) {
      const idx = myAns.answer;
      const opt = q.options[idx];
      bodyHtml += `<div style="margin-top:4px;padding:8px 12px;background:color-mix(in srgb, var(--md-primary) 10%, transparent);border-radius:var(--md-shape-sm);font-size:.9rem">${escapeHtml(opt)}</div>`;
    } else if (q.type === 'multiple' && myAns) {
      const idxs = myAns.answer;
      bodyHtml += `<div style="margin-top:4px">`;
      q.options.forEach((opt, oi) => {
        const checked = idxs.includes(oi);
        bodyHtml += `<div style="padding:6px 10px;margin-bottom:4px;border-radius:var(--md-shape-sm);font-size:.85rem;${checked ? 'background:color-mix(in srgb, var(--md-primary) 10%, transparent);border:1px solid var(--md-primary)' : 'border:1px solid var(--md-outline-variant);opacity:.5'}">${checked ? icon('check-circle') : '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>'} ${escapeHtml(opt)}</div>`;
      });
      bodyHtml += `</div>`;
    } else if (q.type === 'text' && myAns) {
      bodyHtml += `<div style="margin-top:4px;padding:8px 12px;background:var(--surface-alt,var(--bg-alt));border-radius:var(--md-shape-sm);font-size:.85rem;color:var(--md-on-surface-variant)">${escapeHtml(String(myAns.answer))}</div>`;
    } else {
      bodyHtml += `<div style="margin-top:4px;color:var(--md-on-surface-variant);font-size:.85rem">未回答</div>`;
    }
    bodyHtml += `</div>`;
  }
  const headerHtml = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--md-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><strong>你的投票</strong>';
  container.innerHTML = '<div style="margin-bottom:16px;border:1px solid var(--md-primary);background:color-mix(in srgb, var(--md-primary) 6%, transparent)">' + Card(headerHtml, bodyHtml) + '</div>';
}

async function loadResults() {
  const u = getUser();
  if (!u || (u.name !== poll.created_by && u.role !== 'admin' && u.role !== 'owner')) return;
  const container = document.getElementById('pollResults');
  if (!container) return;
  await fetchWithCache(`/api/polls/${poll.id}/results`, () => apiGet(`/api/polls/${poll.id}/results`), renderResults);
}

function renderResults(data) {
  const container = document.getElementById('pollResults');
  if (!container) return;
  let html = '';
  for (const qr of data.questionResults) {
    let bodyHtml = '';
    if (qr.type === 'single' || qr.type === 'multiple') {
      const maxCount = Math.max(...qr.result.counts, 1);
      bodyHtml += qr.result.options.map((opt, oi) => {
        const count = qr.result.counts[oi] || 0;
        const pct = qr.result.total > 0 ? (count / qr.result.total * 100).toFixed(1) : 0;
        const barWidth = (count / maxCount * 100).toFixed(1);
        return `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:2px">
            <span>${escapeHtml(opt)}</span>
            <span style="color:var(--md-on-surface-variant)">${count} 票 (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--surface-alt,var(--bg-alt));border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${barWidth}%;background:var(--md-primary);border-radius:4px;transition:width .3s"></div>
          </div>
        </div>`;
      }).join('');
      bodyHtml += `<p style="font-size:.82rem;color:var(--md-on-surface-variant);margin-top:4px">共 ${qr.result.total} 票</p>`;
    } else {
      bodyHtml += qr.result.answers.length > 0
        ? qr.result.answers.map(a => `<div style="padding:6px 10px;border:1px solid var(--md-outline-variant);border-radius:var(--md-shape-sm);margin-bottom:4px;font-size:.85rem">${escapeHtml(String(a))}</div>`).join('')
        : '<p style="color:var(--md-on-surface-variant);font-size:.85rem">暂无回答</p>';
    }
    html += '<div style="margin-bottom:16px">' + Card('<strong>' + escapeHtml(qr.title) + '</strong>', bodyHtml) + '</div>';
  }

  // voter list
  if (data.responses && data.responses.length > 0) {
    html += '<div style="margin-bottom:16px">' + Card('<strong>参与名单</strong>',
      '<p style="font-size:.85rem;color:var(--md-on-surface-variant)">共 ' + data.responses.length + ' 人参与</p>' +
      '<ul style="margin-top:8px;padding-left:16px">' +
      data.responses.map(r => '<li style="font-size:.85rem;margin-bottom:2px">' + escapeHtml(r.voter_name || '匿名') + ' · ' + formatTime(r.created_at) + '</li>').join('') +
      '</ul>') + '</div>';
  }
  container.innerHTML = html;
}


init();
