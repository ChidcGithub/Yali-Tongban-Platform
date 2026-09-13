// features.js — 功能开关邀请弹窗 + 已启用功能查询
(function() {
  const SESSION_KEY = '_feat_later'; // 本次会话中点了"稍后"的 feature key

  function getLaterSet() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function addLater(key) {
    try {
      const s = getLaterSet();
      s.add(key);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s]));
    } catch {}
  }

  // 已启用功能缓存
  let _enabledCache = null;
  let _enabledPromise = null;

  window.getEnabledFeatures = function() {
    if (_enabledCache) return Promise.resolve(_enabledCache);
    if (_enabledPromise) return _enabledPromise;
    _enabledPromise = apiGet('/api/features/enabled')
      .then(d => { _enabledCache = (d && d.enabled) || []; return _enabledCache; })
      .catch(() => { _enabledCache = []; return []; });
    return _enabledPromise;
  };

  window.isFeatureEnabled = function(key) {
    return getEnabledFeatures().then(list => list.some(f => f.key === key));
  };

  // 刷新已启用功能缓存（接受邀请后调用）
  window.refreshEnabledFeatures = function() {
    _enabledCache = null;
    _enabledPromise = null;
    return getEnabledFeatures();
  };

  // 显示邀请弹窗
  function showInvitation(feature) {
    const iconSvg = icon(feature.icon || 'bell');
    openModal({
      title: '新功能邀请',
      body: `
        <div style="text-align:center;padding:8px 0 4px">
          <div style="width:56px;height:56px;margin:0 auto 12px;border-radius:var(--md-shape-full);background:var(--md-primary-container);color:var(--md-on-primary-container);display:flex;align-items:center;justify-content:center;font-size:1.5rem">${iconSvg}</div>
          <h3 style="margin:0 0 6px;font-size:1.2rem;color:var(--md-on-surface)">${escapeHtml(feature.name)}</h3>
          <p style="margin:0;color:var(--md-on-surface-variant);font-size:.9rem;line-height:1.5">${escapeHtml(feature.description || '体验全新功能')}</p>
        </div>
        <p style="font-size:.8rem;color:var(--md-on-surface-variant);text-align:center;margin:10px 0 0">您被邀请参与测试此功能</p>
      `,
      footer: [
        { text: '永不提醒', variant: 'text', onClick: () => respond(feature.key, 'never') },
        { text: '稍后', variant: 'outline', onClick: () => { addLater(feature.key); closeModal(document.getElementById('modalContainer')); } },
        { text: '接受', variant: 'primary', onClick: () => respond(feature.key, 'accepted') },
      ],
    });
  }

  async function respond(key, status) {
    try {
      await apiPost('/api/features/' + key + '/respond', { status });
      if (status === 'accepted') {
        await refreshEnabledFeatures();
        toast('已启用「' + key + '」功能', 'success');
        // 这些功能接受后需要刷新页面才能生效
        if (key === 'messages') {
          setTimeout(() => window.location.reload(), 800);
          return;
        }
      } else if (status === 'never') {
        toast('已记录，不再提醒', 'info');
      }
      closeModal(document.getElementById('modalContainer'));
    } catch (e) {
      toast(e.message || '操作失败', 'error');
    }
  }

  // 检查待响应邀请
  async function checkPending() {
    const user = getUser();
    if (!user) return;
    try {
      const data = await apiGet('/api/features/pending');
      const pending = (data && data.pending) || [];
      const laterSet = getLaterSet();
      // 过滤掉本次会话中已点"稍后"的
      const showable = pending.filter(f => !laterSet.has(f.key));
      if (showable.length > 0) {
        // 只显示第一个（避免弹窗轰炸）
        setTimeout(() => showInvitation(showable[0]), 1500);
      }
    } catch {}
  }

  // 页面加载后检查
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkPending, 800));
  } else {
    setTimeout(checkPending, 800);
  }
})();
