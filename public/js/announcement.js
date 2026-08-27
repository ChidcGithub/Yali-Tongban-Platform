let user = null;
let currentId = null;
let comments = [];

async function init() {
  user = await checkAuth();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  currentId = id;
  if (!id) {
    const el = document.getElementById('announceDetail');
    if (el) el.innerHTML = EmptyState('', '未指定公告');
    return;
  }
  await loadAnnouncement(id);
  loadComments('announcement', id);
}

async function loadAnnouncement(id) {
  try {
    let found = null;
    await fetchWithCache('/api/announcements',
      () => apiGet('/api/announcements'),
      data => {
        found = data.find(a => a.id === Number(id));
        if (found) { renderAnnouncement(found); setTimeout(() => checkTimeTraveler(found.created_at), 200); }
      }
    );
  } catch (err) {
    // fallback: direct fetch
    try {
      const a = await apiGet(`/api/announcements/${id}`);
      renderAnnouncement(a);
      setTimeout(() => checkTimeTraveler(a.created_at), 200);
    } catch (e) {
      const el = document.getElementById('announceDetail');
      if (el) el.innerHTML = EmptyState('', '加载失败：' + e.message);
    }
  }
  // track reading
  let rc = Number(localStorage.getItem('_rd') || 0) + 1;
  localStorage.setItem('_rd', rc);
  if (rc >= 50) { localStorage.removeItem('_rd'); unlockAchievement('reader').then(d => { if (d) showAchievementToast('reader'); }); }
}

function renderAnnouncement(a) {
  const imgs = parseImages(a.image_url);
  const canEdit = user && (user.name === a.created_by || user.role === 'admin' || user.role === 'owner');
  const el = document.getElementById('announceDetail');
  if (!el) return;

  const statusBadge = a.status && a.status !== '已通过' ? Badge(a.status + (a.reject_reason ? `：${escapeHtml(a.reject_reason)}` : ''), a.status === '待审核' ? 'pending' : 'reject') : '';
  const imgsList = JSON.stringify(imgs.map(s => ({ src: dataUrlToBlobUrl(s) })));
  const headerHtml = `<strong style="font-size:1.2rem">${escapeHtml(a.title)}</strong>
    <div style="display:flex;gap:6px">
      ${canEdit ? `<button class="btn btn-sm btn-outline" style="color:var(--md-primary)" data-action="editAnnouncement" data-id="${a.id}">编辑</button>` : ''}
      ${canEdit ? `<button class="btn btn-sm btn-outline" style="color:var(--accent);border-color:var(--accent)" data-action="deleteAnnouncement" data-id="${a.id}">删除</button>` : ''}
    </div>`;
  const bodyHtml = `<div class="announce-byline" style="margin:4px 0 16px;font-size:.85rem;color:var(--md-on-surface-variant)">
    <span>BY ${escapeHtml(a.created_by)}</span>
    <span style="margin-left:12px">${formatTime(a.created_at)}</span>
    ${statusBadge}
  </div>
  <div class="announce-article-text" style="white-space:pre-wrap;font-size:1rem;line-height:1.8">${escapeHtml(a.content)}</div>
  ${imgs.length > 0 ? `<div class="np-article-images" style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center">${imgs.map(url => `<img class="img-clickable" src="${attrEscape(url)}" alt="公告图片" style="max-width:100%;max-height:500px;border-radius:var(--md-shape-xs);cursor:pointer" data-action="openLightbox" data-url="${attrEscape(dataUrlToBlobUrl(url))}" data-images='${imgsList.replace(/'/g, '&#39;')}' onerror="this.style.display='none'">`).join('')}</div>` : ''}`;
  el.innerHTML = Card(headerHtml, bodyHtml) + '\n    <div id="commentSection" style="margin-top:24px"></div>';

  if (comments.length) renderComments();
}

async function loadComments(type, id) {
  try {
    await fetchWithCache(`/api/comments/${type}/${id}`,
      () => apiGet(`/api/comments/${type}/${id}`),
      data => { comments = data; renderComments(); }
    );
  } catch {}
}

function renderComments() {
  const el = document.getElementById('commentSection');
  let html = '<div class="section-title"><span>评论</span></div>';

  if (comments.length === 0) {
    html += '<p style="color:var(--md-on-surface-variant);margin-bottom:12px">暂无评论</p>';
  } else {
    html += '<div style="margin-bottom:16px">';
    for (const c of comments) {
      const canEdit = user && user.name === c.created_by;
      const canDelete = user && (user.name === c.created_by || user.role === 'admin' || user.role === 'owner');
      var actions = [];
      if (canEdit) actions.push({ text: '\u7F16\u8F91', action: 'editComment' });
      if (canDelete) actions.push({ text: '\u5220\u9664', action: 'deleteComment' });
      html += CommentItem({ id: c.id, author: c.created_by, text: c.content, time: formatTime(c.created_at), actions: actions });
    }
    html += '</div>';
  }

  if (user) {
    html += `
      <form data-action="postComment" class="comment-form">
        <textarea class="form-textarea" id="commentInput" placeholder="写下你的评论…" required maxlength="500" style="min-height:60px"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button type="submit" class="btn btn-primary" id="commentBtn">发表评论</button>
        </div>
      </form>`;
  } else {
    html += `<p style="color:var(--md-on-surface-variant);font-size:.9rem">请<a href="login.html" style="color:var(--md-primary)">登录</a>后评论</p>`;
  }

  el.innerHTML = html;
}

async function editComment(dataset) {
  var id = Number(dataset.commentId);
  const item = document.querySelector(`.comment-item[data-comment-id="${id}"]`);
  if (!item) return;
  const textEl = item.querySelector('.comment-text');
  const actionsEl = item.querySelector('.comment-actions');
  const currentText = comments.find(c => c.id === id)?.content || '';
  textEl.innerHTML = `<textarea class="form-textarea" id="comment-edit-input-${id}" maxlength="500" placeholder="编辑评论..." style="min-height:48px">${escapeHtml(currentText)}</textarea>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn btn-sm btn-primary" data-action="saveEditComment" data-comment-id="${id}">保存</button>
      <button class="btn btn-sm btn-outline" data-action="cancelEditComment" data-comment-id="${id}">取消</button>
    </div>`;
  if (actionsEl) actionsEl.style.display = 'none';
}

async function saveEditComment(dataset) {
  var id = Number(dataset.commentId);
  const input = document.getElementById(`comment-edit-input-${id}`);
  const content = input.value.trim();
  if (!content || content.length > 500) return toast('评论内容为1-500字', 'error');
  try {
    const updated = await apiPut(`/api/comments/${id}`, { content });
    const idx = comments.findIndex(c => c.id === id);
    if (idx >= 0) comments[idx] = updated;
    renderComments();
    toast('评论已更新', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function cancelEditComment(dataset) {
  renderComments();
}

async function deleteComment(dataset) {
  var id = Number(dataset.commentId);
  const item = document.querySelector(`.comment-item[data-comment-id="${id}"]`);
  if (!item) return;
  const actions = item.querySelector('.comment-actions');
  if (!actions) return;
  if (actions.dataset.confirming === 'true') {
    try {
      await apiDel(`/api/comments/${id}`);
      comments = comments.filter(c => c.id !== id);
      renderComments();
      toast('评论已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  actions.dataset.confirming = 'true';
  actions.innerHTML = `
    <span style="font-size:.8rem;color:var(--md-on-surface-variant)">确认删除？</span>
    <button class="btn btn-sm btn-primary" data-action="deleteComment" data-comment-id="${id}">确认</button>
    <button class="btn btn-sm btn-outline" data-action="cancelDeleteComment" data-comment-id="${id}">取消</button>
  `;
}

function cancelDeleteComment(dataset) {
  renderComments();
}

async function postComment(dataset, target) {
  const input = document.getElementById('commentInput');
  const btn = document.getElementById('commentBtn');
  const content = input.value.trim();
  if (!content) return;
  btn.disabled = true; btn.textContent = '发表中…';
  try {
    const c = await apiPost('/api/comments', {
      target_type: 'announcement',
      target_id: Number(currentId),
      content,
    });
    comments.push(c);
    renderComments();
    toast('评论已发表', 'success');
    setTimeout(checkCountAchievements, 100);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '发表评论';
  }
}

async function editAnnouncement(dataset) {
  location.href = `/announcements.html?edit=${dataset.id}`;
}

async function deleteAnnouncement(dataset) {
  confirmAction('确定要删除此公告吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/announcements/${dataset.id}`);
      toast('公告已删除', 'success');
      location.href = '/announcements.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// 所有 data-action 由 api.js 全局 handler 处理；openLightbox 已适配 dataset 调用

init();
