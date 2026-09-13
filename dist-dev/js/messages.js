// messages.js — 消息页面逻辑
(function() {
  const TYPE_META = {
    system: { label: '系统', color: 'var(--md-primary)', defaultIcon: 'shield' },
    announcement: { label: '公告', color: 'var(--md-tertiary, var(--md-primary))', defaultIcon: 'megaphone' },
    review_result: { label: '审核', color: 'var(--success, #4caf50)', defaultIcon: 'check-circle' },
    issue_status: { label: '报修', color: 'var(--warning, #ff9800)', defaultIcon: 'wrench' },
    finance_update: { label: '财务', color: 'var(--md-primary)', defaultIcon: 'wallet' },
    comment_reply: { label: '评论', color: 'var(--md-tertiary, var(--md-primary))', defaultIcon: 'message-square' },
    activity_invite: { label: '活动', color: 'var(--md-primary)', defaultIcon: 'calendar' },
    duty: { label: '值日', color: 'var(--md-primary)', defaultIcon: 'clock' },
  };

  let _currentType = 'all';
  let _offset = 0;
  const _limit = 20;
  let _total = 0;
  let _unread = 0;
  let _loading = false;

  function relativeTime(t) {
    if (!t) return '';
    const d = new Date(t.replace(' ', 'T') + (t.endsWith('Z') ? '' : '+08:00'));
    if (isNaN(d.getTime())) return t;
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 0) return '刚刚';
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小时前';
    const day = Math.floor(hr / 24);
    if (day === 1) return '昨天';
    if (day < 7) return day + ' 天前';
    return formatTime(t).slice(5, 16);
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderMessage(msg) {
    const meta = TYPE_META[msg.type] || { label: msg.type, color: 'var(--md-primary)', defaultIcon: 'bell' };
    const iconName = msg.icon || meta.defaultIcon;
    const unread = !msg.is_read;
    const link = msg.link ? ' data-link="' + escapeAttr(msg.link) + '"' : '';
    return `
      <div class="msg-item${unread ? ' unread' : ''}" data-id="${msg.id}"${link}>
        <div class="msg-item-icon" style="background:color-mix(in srgb,${meta.color} 18%,transparent);color:${meta.color}">
          ${icon(iconName)}
        </div>
        <div class="msg-item-content">
          <div class="msg-item-header">
            <span class="msg-item-title">${escapeHtml(msg.title)}</span>
            ${unread ? '<span class="msg-dot"></span>' : ''}
          </div>
          ${msg.body ? `<p class="msg-item-body">${escapeHtml(msg.body)}</p>` : ''}
          <div class="msg-item-meta">
            <span class="msg-type-tag" style="color:${meta.color}">${meta.label}</span>
            <span class="msg-item-time">${relativeTime(msg.created_at)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmpty() {
    const list = document.getElementById('msgList');
    list.innerHTML = '<div class="msg-empty">' + icon('inbox') + '<p>暂无消息</p></div>';
  }

  async function loadMessages(append) {
    if (_loading) return;
    _loading = true;
    try {
      const params = new URLSearchParams({ limit: _limit, offset: _offset });
      if (_currentType !== 'all') params.set('type', _currentType);
      const data = await apiGet('/api/messages?' + params.toString());
      const messages = (data && data.messages) || [];
      _total = (data && data.total) || 0;
      _unread = (data && data.unread) || 0;

      const list = document.getElementById('msgList');
      if (!append) {
        if (messages.length === 0) {
          renderEmpty();
        } else {
          list.innerHTML = messages.map(renderMessage).join('');
        }
      } else {
        if (messages.length === 0) {
          document.getElementById('msgLoadMore').style.display = 'none';
        } else {
          list.insertAdjacentHTML('beforeend', messages.map(renderMessage).join(''));
        }
      }

      // 显示/隐藏加载更多
      const loadMore = document.getElementById('msgLoadMore');
      loadMore.style.display = (_offset + messages.length < _total) ? 'block' : 'none';

      // 操作栏
      const toolbar = document.getElementById('msgToolbar');
      toolbar.style.display = _total > 0 ? 'flex' : 'none';

      // 未读提示
      const hint = document.getElementById('msgUnreadHint');
      if (_unread > 0) {
        hint.textContent = _unread + ' 条未读消息';
      } else if (_total > 0) {
        hint.textContent = '全部消息已读';
      } else {
        hint.textContent = '还没有消息';
      }

      _offset += messages.length;
    } catch (e) {
      const list = document.getElementById('msgList');
      list.innerHTML = '<div class="msg-empty">加载失败：' + escapeHtml(e.message) + '</div>';
    } finally {
      _loading = false;
    }
  }

  window.loadMore = function() {
    loadMessages(true);
  };

  window.markAllRead = async function() {
    try {
      await apiPost('/api/messages/read-all', _currentType !== 'all' ? { type: _currentType } : {});
      toast('已全部标记为已读', 'success');
      _offset = 0;
      await loadMessages(false);
      // 更新导航栏铃铛
      if (typeof updateMsgBadge === 'function') updateMsgBadge();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.clearRead = async function() {
    if (!confirm('确定清空所有已读消息？')) return;
    try {
      await apiDel('/api/messages');
      toast('已清空已读消息', 'success');
      _offset = 0;
      await loadMessages(false);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // 标签切换
  document.getElementById('msgTabs').addEventListener('click', function(e) {
    const tab = e.target.closest('.msg-tab');
    if (!tab) return;
    document.querySelectorAll('.msg-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _currentType = tab.dataset.type;
    _offset = 0;
    loadMessages(false);
  });

  // 点击消息：标记已读 + 跳转
  document.getElementById('msgList').addEventListener('click', async function(e) {
    const item = e.target.closest('.msg-item');
    if (!item) return;
    const id = item.dataset.id;
    const link = item.dataset.link;
    // 标记已读
    if (item.classList.contains('unread')) {
      try {
        await apiPost('/api/messages/' + id + '/read');
        item.classList.remove('unread');
        const dot = item.querySelector('.msg-dot');
        if (dot) dot.remove();
        _unread = Math.max(0, _unread - 1);
        const hint = document.getElementById('msgUnreadHint');
        if (_unread > 0) hint.textContent = _unread + ' 条未读消息';
        else hint.textContent = '全部消息已读';
        if (typeof updateMsgBadge === 'function') updateMsgBadge();
      } catch {}
    }
    // 跳转
    if (link) {
      setTimeout(() => { window.location.href = link; }, 200);
    }
  });

  // 长按删除（移动端）/ 右键删除（桌面端）
  let _pressTimer = null;
  document.getElementById('msgList').addEventListener('touchstart', function(e) {
    const item = e.target.closest('.msg-item');
    if (!item) return;
    _pressTimer = setTimeout(() => {
      _pressTimer = null;
      deleteMessage(item);
    }, 600);
  });
  document.getElementById('msgList').addEventListener('touchend', function() {
    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
  });
  document.getElementById('msgList').addEventListener('touchmove', function() {
    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
  });

  async function deleteMessage(item) {
    const id = item.dataset.id;
    if (!confirm('删除这条消息？')) return;
    try {
      await apiDel('/api/messages/' + id);
      item.style.transition = 'opacity .2s, transform .2s';
      item.style.opacity = '0';
      item.style.transform = 'translateX(100%)';
      setTimeout(() => {
        item.remove();
        // 如果列表空了，显示空状态
        const list = document.getElementById('msgList');
        if (!list.querySelector('.msg-item')) renderEmpty();
      }, 200);
      toast('已删除', 'info');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // 初始加载
  loadMessages(false);
})();
