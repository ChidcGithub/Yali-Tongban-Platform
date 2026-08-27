let currentFilter = 'all';
let issues = [];

let bannerTimer = null;
let bannerItems = [];
let _bannerData = null;

function renderBannerFromFallback() {
  const el = document.getElementById('announceBanner');
  if (!el) return;
  const cached = cacheGet('/api/announcements');
  if (cached && cached.data && cached.data.length) {
    const approved = cached.data.filter(a => !a.status || a.status === '已通过');
    const latest = approved.slice(0, 3);
    if (latest.length === 0) return;
    _bannerData = { announcements: latest };
    renderBanner();
  }
}

async function loadBanner() {
  const cached = cacheGet('/api/banner');
  if (cached && cached.data) {
    _bannerData = cached.data;
    renderBanner();
  } else {
    renderBannerFromFallback();
  }
  try {
    await fetchWithCache('/api/banner',
      () => apiGet('/api/banner'),
      data => { _bannerData = data; renderBanner(); }
    );
  } catch (e) {
  }
}

function renderBanner() {
  const el = document.getElementById('announceBanner');
  if (!el) return;
  bannerItems = [];
  const data = _bannerData;
  if (!data) return;
  if (data.announcements && data.announcements.length) {
    data.announcements.forEach(a => bannerItems.push({ type: 'announcement', data: a }));
  }
  if (data.hallBookings && data.hallBookings.length) {
    data.hallBookings.forEach(h => bannerItems.push({ type: 'hall', data: h }));
  }
  if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
  if (bannerItems.length === 0) return;

  // pre-cache images as blob URLs
  for (const item of bannerItems) {
    const d = item.data;
    const imgs = Array.isArray(d.image_url) ? d.image_url : (d.image_url ? [d.image_url] : []);
    d._images = imgs;
    if (imgs.length > 0 && imgs[0] && imgs[0].startsWith('data:')) {
      d._cacheUrl = dataUrlToBlobUrl(imgs[0]);
    }
  }

  el.style.display = '';
  el.innerHTML = '<div class="announce-banner-track"></div>';
  const track = el.querySelector('.announce-banner-track');

  function slideHTML(itemData, idx) {
    const d = itemData;
    if (bannerItems[idx].type === 'hall') {
      return `<div class="announce-banner-slide">
        <div class="announce-banner-slide-inner" style="cursor:default">
          <div class="announce-banner-text">
            <div class="announce-banner-title">${icon('calendar')} 千人报告厅·预约情况</div>
            <div class="announce-banner-content">${icon('clock')} ${escapeHtml(d.date)}  ${escapeHtml(d.start_time)}-${escapeHtml(d.end_time)}</div>
            <div class="announce-banner-content" style="margin-top:4px">${icon('clipboard')} 用途：${escapeHtml(d.purpose)}</div>
            <div class="announce-banner-time">${icon('check')} 已审批 · 申请人：${escapeHtml(d.applicant)}</div>
          </div>
        </div></div>`;
    }
    return `<div class="announce-banner-slide">
      <div class="announce-banner-slide-inner" data-id="${d.id}">
        <div class="announce-banner-text">
          <div class="announce-banner-title">${icon('megaphone')} ${escapeHtml(d.title)}</div>
          <div class="announce-banner-content">${escapeHtml(d.content)}</div>
          <div class="announce-banner-time">${formatTime(d.created_at)} · ${escapeHtml(d.created_by)}</div>
        </div>
        ${d._images && d._images.length > 0 ? `<img class="announce-banner-img" src="${attrEscape(d._images[Math.floor(Math.random() * d._images.length)])}" alt="公告图片" data-action="openLightbox" data-src="${attrEscape(dataUrlToBlobUrl(d._images[0]))}" onerror="this.style.display='none'">` : ''}
      </div></div>`;
  }

  track.innerHTML = bannerItems.map((item, idx) => slideHTML(item.data, idx)).join('') +
    (bannerItems.length > 1 ? `<div class="announce-banner-dots">${bannerItems.map((_, j) => `<span class="announce-dot${j === 0 ? ' active' : ''}"></span>`).join('')}</div>` : '');
  const dots = el.querySelectorAll('.announce-dot');
  const slides = track.querySelectorAll('.announce-banner-slide');

  // click navigation (only if not dragged)
  slides.forEach((slide, i) => {
    const inner = slide.querySelector('.announce-banner-slide-inner');
    if (!inner) return;
    inner.addEventListener('click', function (e) {
      if (this.dataset._dragged) { delete this.dataset._dragged; return; }
      location.href = `/announcement.html?id=${bannerItems[i].data.id}`;
    });
  });

  function goTo(i) {
    if (isNaN(i) || slides.length === 0 || i < 0 || i >= slides.length) return;
    track.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
  }

  // dots
  dots.forEach((dot, i) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(i);
    });
  });

  // update active dot on scroll
  function updateActive() {
    if (slides.length === 0) return 0;
    let best = 0, bestDist = Infinity;
    const cx = track.scrollLeft + track.clientWidth / 2;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - cx);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === best));
    return best;
  }

  let _userDragging = false;

  // mouse drag
  let drag = { startX: 0, startScroll: 0, moved: false };
  track.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    drag.startX = e.clientX;
    drag.startScroll = track.scrollLeft;
    drag.moved = false;
    _userDragging = true;
    track.classList.add('dragging');
    const onMove = (me) => {
      const dx = me.clientX - drag.startX;
      if (Math.abs(dx) > 5) drag.moved = true;
      track.scrollLeft = drag.startScroll - dx;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      track.classList.remove('dragging');
      _userDragging = false;
      if (drag.moved) {
        slides.forEach(s => {
          const inner = s.querySelector('.announce-banner-slide-inner');
          if (inner) inner.dataset._dragged = '1';
        });
        // snap to nearest slide with easing
        const idx = updateActive();
        goTo(idx);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // touch: let native scroll handle inertia + snap
  track.addEventListener('touchstart', () => { _userDragging = true; }, { passive: true });
  track.addEventListener('touchend', () => {
    _userDragging = false;
    setTimeout(() => updateActive(), 100); // wait for snap to settle
  }, { passive: true });

  // scroll listener for passive dot update
  track.addEventListener('scroll', updateActive, { passive: true });
  updateActive();

  // auto-advance every 5s
  bannerTimer = setInterval(() => {
    if (_userDragging || slides.length === 0) return;
    const w = slides[0].offsetWidth;
    if (!w) return;
    const cur = Math.round(track.scrollLeft / w);
    const next = (cur + 1) % slides.length;
    goTo(next);
  }, 5000);
}

async function loadIssues() {
  try {
    await fetchWithCache('/api/issues',
      () => apiGet('/api/issues'),
      data => { issues = data; renderIssues(); }
    );
  } catch (err) {
    document.getElementById('issueList').innerHTML =
      EmptyState('', '加载失败：' + err.message);
  }
}

async function renderIssues() {
  const filtered = currentFilter === 'all'
    ? issues
    : issues.filter(i => i.status === currentFilter);

  const el = document.getElementById('issueList');
  if (filtered.length === 0) {
    el.innerHTML =
      EmptyState(icon('clipboard'), '暂无问题反馈');
    return;
  }

  el.innerHTML = '';
  const u = getUser();

  await progressiveRender(el, filtered, issue => {
    const badgeType = issue.status === '待处理' ? 'pending'
      : issue.status === '处理中' ? 'processing'
      : 'done';
    const hasImage = issue.image_url && issue.image_url.startsWith('data:');
    const commentCount = issue.comment_count || 0;

    let actionsHtml = '';
    if (u && u.role !== 'pending') {
      actionsHtml = `
        <div class="btn-group">
          <button class="btn btn-sm ${issue.status === '待处理' ? 'btn-warning' : 'btn-outline'}" data-action="updateStatus" data-id="${issue.id}" data-status="待处理">待处理</button>
          <button class="btn btn-sm ${issue.status === '处理中' ? 'btn-primary' : 'btn-outline'}" data-action="updateStatus" data-id="${issue.id}" data-status="处理中">处理中</button>
          <button class="btn btn-sm ${issue.status === '已完成' ? 'btn-success' : 'btn-outline'}" data-action="updateStatus" data-id="${issue.id}" data-status="已完成">已完成</button>
          ${u.role === 'admin' || u.role === 'owner' ? `<button class="btn btn-sm btn-danger" data-action="deleteIssue" data-id="${issue.id}">删除</button>` : ''}
        </div>`;
    }

    return `
      <div class="issue-item" id="issue-${issue.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <strong>${escapeHtml(issue.location)}</strong>
          ${Badge(issue.status, badgeType)}
        </div>
        <p style="margin-top:6px;color:var(--md-on-surface)">${escapeHtml(issue.description)}</p>
        ${issue.notes ? `<p style="margin-top:4px;padding:6px 10px;border-radius:var(--md-shape-sm);background:color-mix(in srgb, var(--md-error) 8%, transparent);border:1px solid color-mix(in srgb, var(--md-error) 20%, transparent);color:var(--md-error);font-size:.82rem">${escapeHtml(issue.notes)}</p>` : ''}
        ${hasImage ? `<div style="margin-top:8px"><img class="img-clickable img-lazy" src="${IMG_PLACEHOLDER}" alt="问题图片" style="max-height:200px;width:auto;border-radius:var(--md-shape-sm);cursor:pointer" data-action="openLightbox" data-src="${attrEscape(dataUrlToBlobUrl(issue.image_url))}"></div>` : ''}
        <div class="issue-meta">
          <span>提交人：${escapeHtml(issue.submitted_by)}</span>
          <span>${formatTime(issue.created_at)}</span>
          ${issue.updated_by ? `<span>最后处理：${escapeHtml(issue.updated_by)}</span>` : ''}
        </div>
        ${actionsHtml ? `<div class="issue-actions">${actionsHtml}</div>` : ''}
        <div class="issue-comments-toggle" data-action="toggleIssueComments" data-id="${issue.id}">
          ${icon('message-circle')} <span>评论 (${commentCount})</span>
        </div>
        <div class="issue-comments" id="issue-comments-${issue.id}" style="display:none">
          <div class="issue-comments-list" id="issue-comments-list-${issue.id}">
            <p style="color:var(--md-on-surface-variant);font-size:.85rem">加载中…</p>
          </div>
          ${u ? `
          <form class="comment-form" style="margin-top:8px">
            <textarea class="form-textarea" id="issue-comment-input-${issue.id}" placeholder="写下评论…" required maxlength="500" style="min-height:48px"></textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:6px">
              <button type="button" class="btn btn-sm btn-primary" data-action="postIssueComment" data-issue-id="${issue.id}">发表</button>
            </div>
          </form>` : '<p style="color:var(--md-on-surface-variant);font-size:.82rem;margin-top:8px">请<a href="login.html" style="color:var(--md-primary)">登录</a>后评论</p>'}
        </div>
      </div>`;
  });
  lazyLoadImages(el);
}

let issueCommentsCache = {};

async function toggleIssueComments(dataset, target) {
  const issueId = Number(dataset.id);
  const container = document.getElementById(`issue-comments-${issueId}`);
  const list = document.getElementById(`issue-comments-list-${issueId}`);
  const isOpen = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : '';
  if (!isOpen && !issueCommentsCache[issueId]) {
    try {
      await fetchWithCache(`/api/comments/issue/${issueId}`,
        () => apiGet(`/api/comments/issue/${issueId}`),
        data => { issueCommentsCache[issueId] = data; renderIssueComments(issueId, data); }
      );
    } catch {
      list.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.85rem">加载失败</p>';
    }
  }
}

function renderIssueComments(issueId, comments) {
  const list = document.getElementById(`issue-comments-list-${issueId}`);
  if (!comments || comments.length === 0) {
    list.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.85rem">暂无评论</p>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const cu = getUser();
    const canEdit = cu && cu.name === c.created_by;
    const canDelete = cu && (cu.name === c.created_by || cu.role === 'admin' || cu.role === 'owner');
    const actions = [];
    if (canEdit) actions.push({ action: 'editIssueComment', text: '编辑', data: { commentId: c.id, issueId: issueId } });
    if (canDelete) actions.push({ action: 'deleteIssueComment', text: '删除', data: { commentId: c.id, issueId: issueId } });
    return CommentItem({
      id: `issue-comment-${issueId}-${c.id}`,
      author: c.created_by,
      text: c.content,
      time: formatTime(c.created_at),
      actions: actions
    });
  }).join('');
}

async function editIssueComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const issueId = Number(dataset.issueId);
  const contentEl = document.getElementById(`issue-comment-content-${issueId}-${commentId}`);
  const cache = issueCommentsCache[issueId];
  const currentText = cache?.find(c => c.id === commentId)?.content || '';
  contentEl.innerHTML = `<textarea class="form-textarea" id="issue-comment-edit-input-${issueId}-${commentId}" maxlength="500" placeholder="编辑评论..." style="min-height:40px;font-size:.85rem">${escapeHtml(currentText)}</textarea>
    <div style="display:flex;gap:4px;margin-top:2px">
      <button class="btn btn-xs btn-primary" data-action="saveEditIssueComment" data-comment-id="${commentId}" data-issue-id="${issueId}">保存</button>
      <button class="btn btn-xs btn-outline" data-action="cancelEditIssueComment" data-comment-id="${commentId}" data-issue-id="${issueId}">取消</button>
    </div>`;
  const actions = document.getElementById(`issue-comment-actions-${issueId}-${commentId}`);
  if (actions) actions.style.display = 'none';
}

async function saveEditIssueComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const issueId = Number(dataset.issueId);
  const input = document.getElementById(`issue-comment-edit-input-${issueId}-${commentId}`);
  const content = input.value.trim();
  if (!content || content.length > 500) return toast('评论内容为1-500字', 'error');
  try {
    const updated = await apiPut(`/api/comments/${commentId}`, { content });
    if (!issueCommentsCache[issueId]) issueCommentsCache[issueId] = [];
    const idx = issueCommentsCache[issueId].findIndex(c => c.id === commentId);
    if (idx >= 0) issueCommentsCache[issueId][idx] = updated;
    renderIssueComments(issueId, issueCommentsCache[issueId]);
    toast('评论已更新', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function cancelEditIssueComment(dataset, target) {
  const issueId = Number(dataset.issueId);
  renderIssueComments(issueId, issueCommentsCache[issueId]);
}

async function deleteIssueComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const issueId = Number(dataset.issueId);
  const actions = document.getElementById(`issue-comment-actions-${issueId}-${commentId}`);
  if (!actions) return;
  if (actions.dataset.confirming === 'true') {
    try {
      await apiDel(`/api/comments/${commentId}`);
      if (issueCommentsCache[issueId]) {
        issueCommentsCache[issueId] = issueCommentsCache[issueId].filter(c => c.id !== commentId);
      }
      renderIssueComments(issueId, issueCommentsCache[issueId]);
      const toggle = document.querySelector(`#issue-${issueId} .issue-comments-toggle span`);
      if (toggle) toggle.textContent = `评论 (${(issueCommentsCache[issueId] || []).length})`;
      toast('评论已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  actions.dataset.confirming = 'true';
  actions.innerHTML = `
    <span style="font-size:.75rem;color:var(--md-on-surface-variant)">确认删除？</span>
    <button class="btn btn-xs btn-primary" data-action="deleteIssueComment" data-comment-id="${commentId}" data-issue-id="${issueId}">确认</button>
    <button class="btn btn-xs btn-outline" data-action="cancelDeleteIssueComment" data-comment-id="${commentId}" data-issue-id="${issueId}">取消</button>
  `;
}

function cancelDeleteIssueComment(dataset, target) {
  const issueId = Number(dataset.issueId);
  renderIssueComments(issueId, issueCommentsCache[issueId]);
}

async function postIssueComment(dataset, target) {
  const issueId = Number(dataset.issueId);
  const input = document.getElementById(`issue-comment-input-${issueId}`);
  const content = input.value.trim();
  if (!content) return;
  try {
    const c = await apiPost('/api/comments', {
      target_type: 'issue',
      target_id: issueId,
      content,
    });
    if (!issueCommentsCache[issueId]) issueCommentsCache[issueId] = [];
    issueCommentsCache[issueId].push(c);
    renderIssueComments(issueId, issueCommentsCache[issueId]);
    input.value = '';
    // update count
    const toggle = document.querySelector(`#issue-${issueId} .issue-comments-toggle span`);
    if (toggle) toggle.textContent = `评论 (${issueCommentsCache[issueId].length})`;
    toast('评论已发表', 'success');
    setTimeout(checkCountAchievements, 100);
    checkNovice();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function updateStatus(dataset, target) {
  const id = Number(dataset.id);
  const status = dataset.status;
  const issue = issues.find(i => i.id === id);
  if (issue && issue.status !== '待处理') {
    confirmAction(`当前状态为「${issue.status}」，确定要改为「${status}」吗？`, async ok => {
      if (!ok) return;
      try {
        await apiPut(`/api/issues/${id}/status`, { status });
        if (issue) {
          issue.status = status;
          issue.updated_by = (getUser() || {}).name || '未知';
        }
        renderIssues();
        toast(`状态已更新为「${status}」`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    return;
  }
  try {
    await apiPut(`/api/issues/${id}/status`, { status });
    if (issue) {
      issue.status = status;
      issue.updated_by = (getUser() || {}).name || '未知';
    }
    renderIssues();
    toast(`状态已更新为「${status}」`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteIssue(dataset, target) {
  const id = Number(dataset.id);
  confirmAction('确定删除此问题反馈吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/issues/${id}`);
      issues = issues.filter(i => i.id !== id);
      renderIssues();
      toast('问题已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

let _issueCaptcha = null;

function openIssueModal() {
  openModal({
    title: '提交问题',
    body: '<form id="issueForm" data-action="submitIssue"><div class="form-row"><div class="form-group"><label class="form-label">地点 <span class="required">*</span></label><input class="form-input" name="location" placeholder="如：教学楼3楼301" required maxlength="200"></div><div class="form-group"><label class="form-label">联系方式</label><input class="form-input" name="contact" placeholder="选填，方便反馈" maxlength="100"></div></div><div class="form-group"><label class="form-label">报修问题 <span class="required">*</span></label><textarea class="form-textarea" name="description" placeholder="请详细描述问题" required maxlength="2000"></textarea></div><div class="form-group" style="background:color-mix(in srgb, var(--md-error) 8%, transparent);padding:12px;border-radius:var(--md-shape-sm);border:1px solid color-mix(in srgb, var(--md-error) 20%, transparent)"><label class="form-label" style="color:var(--md-error);font-weight:600">备注 <span style="color:var(--md-error);font-weight:400">（选填）</span></label><textarea class="form-textarea" name="notes" placeholder="补充说明..." maxlength="50" style="border-color:color-mix(in srgb, var(--md-error) 30%, transparent)"></textarea></div><div class="form-group"><label class="form-label">你的姓名</label><input class="form-input" name="submitted_by" placeholder="选填，填写以便后续沟通" maxlength="50"></div><div class="form-group"><label class="form-label" for="issueFileInput">图片（选填）</label><div class="upload-zone" id="issueUploadZone" data-action="clickFileInput" data-target="issueFileInput"><p style="color:var(--text-secondary)">点击选择图片</p><img id="issuePreview" class="upload-preview" alt="" style="display:none"></div><input type="file" id="issueFileInput" accept="image/*" style="display:none" onchange="previewIssueFile(event)"></div><div class="form-group" id="issueCaptchaBox"></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="closeActiveModal">取消</button><button type="submit" class="btn btn-primary" id="submitBtn">提交问题</button></div></form>',
    maxWidth: '600px'
  });
  _issueCaptcha = new CaptchaWidget('issueCaptchaBox');
  const user = getUser();
  const nameField = document.querySelector('#issueForm [name="submitted_by"]');
  if (user && nameField && !nameField.value) nameField.value = user.name;
}

function previewIssueFile(e) {
  previewImageFile(e.target, document.getElementById('issuePreview'), document.getElementById('issueUploadZone').querySelector('p'), 25 * 1024 * 1024);
}

async function submitIssue(dataset, target) {
  const fd = new FormData(target);
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '提交中...';

  try {
    let image_url = '';
    const fileInput = document.getElementById('issueFileInput');
    if (fileInput.files && fileInput.files[0]) {
      const dataUrl = await fileToDataUrl(fileInput.files[0]);
      image_url = await compressImage(dataUrl);
    }
    const user = getUser();
    const data = await apiPost('/api/issues', {
        location: fd.get('location'),
        description: fd.get('description'),
        contact: fd.get('contact') || '',
        notes: fd.get('notes') || '',
        submitted_by: user ? user.name : (fd.get('submitted_by') || '匿名访客'),
        ...(_issueCaptcha ? _issueCaptcha.getData() : {}),
        image_url,
      });
    issues.unshift(data);
    renderIssues();
    target.reset();
    document.getElementById('issuePreview').style.display = 'none';
    document.getElementById('issueUploadZone').querySelector('p').textContent = '点击选择图片';
    closeModal(document.getElementById('modalContainer'));
    toast('问题提交成功！', 'success');
    setTimeout(checkCountAchievements, 100);
    checkNovice();
  } catch (err) {
    toast(err.message, 'error');
    if (_issueCaptcha) _issueCaptcha.refresh();
  } finally {
    btn.disabled = false; btn.textContent = '提交问题';
  }
}

function setFilter(dataset, target) {
  currentFilter = dataset.filter;
  document.querySelectorAll('.filter-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === currentFilter);
  });
  renderIssues();
}

loadBanner().catch(() => {});
loadIssues().catch(() => {});
