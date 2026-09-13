let _feedPollTimer = null;
let _feedItems = [];
let _nextCursor = null;
let _hasMore = true;
let _isLoadingFeed = false;
let _newestId = null;
let _feedObserver = null;
let _openComments = {};
let _commentsCount = {};
let user = null;

const FEED_ICONS = {
  finance: 'wallet',
  activity: 'calendar',
  issue: 'clipboard',
  announcement: 'megaphone',
  poll: 'check-circle',
  achievement: 'award',
  user: 'person',
};

function getFeedIcon(data) {
  if (!data || !data.ref_type) return 'zap';
  return FEED_ICONS[data.ref_type] || 'zap';
}

const FEED_LINKS = {
  finance: 'finance.html',
  activity: 'activities.html',
  issue: 'services.html',
  announcement: id => `announcement.html?id=${id}`,
  poll: id => `poll.html?id=${id}`,
  user: 'admin.html',
};

function getFeedLink(data) {
  if (!data || !data.ref_type) return null;
  const entry = FEED_LINKS[data.ref_type];
  if (!entry) return null;
  return typeof entry === 'function' ? entry(data.ref_id) : entry;
}

function _saveOpenComments() {
  try { sessionStorage.setItem('feed_openComments', JSON.stringify(_openComments)); } catch {}
}

function _renderFeed(data) {
  const el = document.getElementById('feedList');
  const messages = (data && data.messages) || [];
  _feedItems = messages;
  _nextCursor = data?.nextCursor ?? null;
  _hasMore = data?.hasMore ?? true;
  _newestId = messages.length > 0 ? messages[0].id : null;

  if (messages.length === 0) {
    el.innerHTML = EmptyState(icon('zap'), '暂无动态');
    return;
  }

  el.innerHTML = messages.map(m => renderFeedItem(m)).join('');
  el.insertAdjacentHTML('beforeend', '<div id="feedSentinel"></div>');
  _initInfiniteScroll();

  Object.keys(_openComments).forEach(id => {
    if (_openComments[id]) loadComments(Number(id));
  });
}

async function loadFeed() {
  const el = document.getElementById('feedList');

  const cached = cacheGet('/api/chat/messages');
  if (cached) _renderFeed(cached.data);

  try {
    const data = await apiGet('/api/chat/messages?limit=20');
    cacheSet('/api/chat/messages', data);
    _renderFeed(data);
  } catch (err) {
    if (!cached) el.innerHTML = EmptyState('', '加载失败：' + err.message);
  }
}

async function _loadMoreFeed() {
  if (_isLoadingFeed || !_hasMore || !_nextCursor) return;
  _isLoadingFeed = true;
  try {
    const data = await apiGet(`/api/chat/messages?before=${_nextCursor}&limit=20`);
    const messages = data.messages || [];
    if (messages.length === 0) { _hasMore = false; return; }
    _feedItems.push(...messages);
    _nextCursor = data.nextCursor;
    _hasMore = data.hasMore;

    const sentinel = document.getElementById('feedSentinel');
    if (!sentinel) return;
    for (const m of messages) {
      sentinel.insertAdjacentHTML('beforebegin', renderFeedItem(m));
    }
  } catch {} finally {
    _isLoadingFeed = false;
  }
}

function _initInfiniteScroll() {
  if (_feedObserver) _feedObserver.disconnect();
  const sentinel = document.getElementById('feedSentinel');
  if (!sentinel) return;
  _feedObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && _hasMore && !_isLoadingFeed) {
      _loadMoreFeed();
    }
  }, { rootMargin: '200px' });
  _feedObserver.observe(sentinel);
}

function renderFeedItem(m) {
  if (m.type === 'notification') {
    return renderNotificationItem(m);
  }
  if (m.type === 'system') {
    const sysData = parseSystemData(m.system_data);
    if (sysData && sysData.action === '任命') return renderNotificationItem(m);
  }
  const data = parseSystemData(m.system_data);
  const isAdminUser = user && isAdmin(user);
  const commentsOpen = _openComments[m.id];
  const count = _commentsCount[m.id] || 0;
  const feedIcon = getFeedIcon(data);
  const linkable = getFeedLink(data) ? ' feed-item-linkable' : '';
  return `<div class="feed-item${linkable}" data-id="${m.id}">
    <div class="feed-item-icon">${icon(feedIcon)}</div>
    <div class="feed-item-body">
      <div class="feed-item-content">${escapeHtml(m.content)}</div>
      <div class="feed-item-meta">
        <span class="feed-item-time">${formatTime(m.created_at)}</span>
        ${data?.status ? `<span class="chat-status ${statusClass(data.status)}">${escapeHtml(data.status)}</span>` : ''}
      </div>
      <div class="feed-item-actions">
        <button class="feed-comment-btn" data-action="toggleComments" data-id="${m.id}">
          ${icon('message-square')} <span>评论${count ? ` (${count})` : ''}</span>
        </button>
        ${isAdminUser ? `<button class="feed-del-btn" data-action="deleteFeedItem" data-id="${m.id}">删除</button>` : ''}
      </div>
      <div class="feed-comments-section" id="feedComments_${m.id}" style="display:${commentsOpen ? '' : 'none'}">
        <div class="feed-comments-list" id="feedCommentsList_${m.id}">

        </div>
        ${user ? `
        <div class="feed-comment-input-wrap">
          <input class="feed-comment-input" id="feedCommentInput_${m.id}" placeholder="写下你的评论..." maxlength="200">
          <button class="feed-comment-submit" data-action="submitComment" data-id="${m.id}">发送</button>
        </div>` : `
        <div style="font-size:.8rem;color:var(--md-on-surface-variant);padding:8px;text-align:center">请<a href="/login.html" style="color:var(--md-primary)">登录</a>后评论</div>`}
      </div>
    </div>
  </div>`;
}

function renderNotificationItem(m) {
  return `<div class="feed-item feed-item-notification" data-id="${m.id}">
    <div class="feed-item-body">
      <div class="feed-item-content">${escapeHtml(m.content)}</div>
      <div class="feed-item-meta">
        <span class="feed-item-time">${formatTime(m.created_at)}</span>
      </div>
    </div>
  </div>`;
}

function statusClass(s) {
  if (s === '待处理' || s === '待完成') return 'chat-status-pending';
  if (s === '已完成' || s === '已报销') return 'chat-status-done';
  return 'chat-status-progress';
}

function parseSystemData(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function toggleComments(dataset) {
  var id = Number(dataset.id);
  const section = document.getElementById(`feedComments_${id}`);
  if (!section) return;
  if (section.style.display === 'none') {
    section.style.display = '';
    _openComments[id] = true;
    _saveOpenComments();
    loadComments(id);
  } else {
    section.style.display = 'none';
    _openComments[id] = false;
    _saveOpenComments();
  }
}

async function loadComments(id) {
  const listEl = document.getElementById(`feedCommentsList_${id}`);
  if (!listEl) return;
  showNavLoading('加载中...');
  try {
    const comments = await apiGet(`/api/feed/${id}/comments`);
    hideNavLoading();
    _commentsCount[id] = comments.length;
    const btn = document.querySelector(`.feed-item[data-id="${id}"] .feed-comment-btn span`);
    if (btn) btn.textContent = `评论${comments.length ? ` (${comments.length})` : ''}`;
    if (comments.length === 0) {
      listEl.innerHTML = '<div style="font-size:.8rem;color:var(--md-on-surface-variant);padding:8px;text-align:center">暂无评论</div>';
      return;
    }
    listEl.innerHTML = comments.map(c => CommentItem({
      id: c.id,
      author: c.user_name,
      text: c.content,
      time: formatTime(c.created_at),
      actions: []
    })).join('');
  } catch (err) {
    hideNavLoading();
    listEl.innerHTML = `<div style="font-size:.8rem;color:var(--md-error);padding:8px">加载失败</div>`;
  }
}

async function submitComment(dataset) {
  var id = Number(dataset.id);
  const input = document.getElementById(`feedCommentInput_${id}`);
  if (!input || !input.value.trim()) return;
  const btn = input.nextElementSibling;
  btn.disabled = true;
  try {
    await apiPost(`/api/feed/${id}/comment`, { content: input.value.trim() });
    input.value = '';
    loadComments(id);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteFeedItem(dataset) {
  var id = Number(dataset.id);
  confirmAction('确定删除此动态吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/chat/messages/${id}`);
      _feedItems = _feedItems.filter(m => m.id !== id);
      const card = document.querySelector(`.feed-item[data-id="${id}"]`);
      if (card) card.remove();
      if (_feedItems.length === 0) {
        document.getElementById('feedList').innerHTML =
          EmptyState(icon('zap'), '暂无动态');
      }
      toast('已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function _scheduleFeedPoll() {
  if (_feedPollTimer) clearTimeout(_feedPollTimer);
  _feedPollTimer = setTimeout(async () => {
    try {
      if (!_newestId) return;
      const data = await apiGet(`/api/chat/messages?after=${_newestId}&limit=20`);
      const newItems = data.messages || [];
      if (newItems.length > 0) {
        _feedItems.unshift(...newItems);
        _newestId = newItems[0].id;
        const el = document.getElementById('feedList');
        const emptyState = el.querySelector('.empty-state');
        if (emptyState) { emptyState.remove(); }
        const firstItem = el.querySelector('.feed-item');
        for (let i = newItems.length - 1; i >= 0; i--) {
          if (firstItem) {
            firstItem.insertAdjacentHTML('beforebegin', renderFeedItem(newItems[i]));
          } else {
            el.insertAdjacentHTML('afterbegin', renderFeedItem(newItems[i]));
          }
        }
      }
    } catch {}
    _scheduleFeedPoll();
  }, 30000);
}

function initFeed() {
  user = getUser();
  try {
    const saved = sessionStorage.getItem('feed_openComments');
    if (saved) _openComments = JSON.parse(saved);
  } catch {}
  loadFeed();
  _scheduleFeedPoll();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (_feedPollTimer) { clearTimeout(_feedPollTimer); _feedPollTimer = null; }
    } else if (!_feedPollTimer) {
      _scheduleFeedPoll();
    }
  });
  document.getElementById('feedList').addEventListener('click', e => {
    const item = e.target.closest('.feed-item');
    if (!item) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.feed-comments-section')) return;
    const id = Number(item.dataset.id);
    const feedItem = _feedItems.find(m => m.id === id);
    if (!feedItem || feedItem.type === 'notification') return;
    const data = parseSystemData(feedItem.system_data);
    const url = getFeedLink(data);
    if (!url) return;
    window.location.href = url;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFeed);
} else {
  initFeed();
}
