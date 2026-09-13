async function checkAuth() {
  try {
    const user = await apiGet('/api/auth/me');
    localStorage.setItem('user', JSON.stringify(user));
    if (!user.class_name) requireClass(user);
    return user;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

function _pageName() {
  const p = window.location.pathname.replace(/\.html$/, '');
  const map = {
    '/admin': '管理面板',
    '/settings': '个人设置',
    '/finance': '财务管理',
    '/announcements': '公告管理',
    '/announcement': '公告详情',
  };
  return map[p] || '';
}

function _go404() {
  const n = _pageName();
  location.href = '/404.html' + (n ? '?from=' + encodeURIComponent(n) : '');
}

async function requireAuth() {
  const user = await checkAuth();
  if (!user) {
    _go404();
    return null;
  }
  return user;
}

async function requireMember() {
  const user = await requireAuth();
  if (!user) return null;
  if (user.role !== 'member' && user.role !== 'admin' && user.role !== 'owner' && user.role !== 'teacher') {
    _go404();
    return null;
  }
  return user;
}


async function requireClass(user) {
  if (!user || user.class_name) return;
  const overlay = document.createElement('div');
  overlay.id = 'classPromptOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:var(--md-surface);border-radius:var(--md-shape-lg);padding:32px 24px;max-width:380px;width:100%;box-shadow:var(--md-elevation-4)">
      <h2 style="font-size:1.2rem;margin:0 0 8px">填写班级</h2>
      <p style="font-size:.85rem;color:var(--md-on-surface-variant);margin:0 0 20px">请填写你的班级以继续使用</p>
      <div class="form-group">
        <label class="form-label">班级 <span class="required">*</span></label>
        <input class="form-input" id="promptClassInput" placeholder="如 2501" required maxlength="4" inputmode="numeric" style="font-size:1rem">
        <p id="promptClassMsg" style="font-size:.78rem;margin-top:4px;display:none"></p>
      </div>
      <div class="form-group">
        <label class="form-label">密码 <span class="required">*</span></label>
        <input class="form-input" id="promptPwdInput" type="password" placeholder="输入密码确认" required style="font-size:1rem">
      </div>
      <button class="btn btn-primary btn-block" id="promptClassBtn" style="margin-top:8px">保存</button>
      <p id="promptClassError" style="font-size:.82rem;color:var(--accent);margin-top:8px;display:none"></p>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('promptClassBtn').onclick = async () => {
    const val = document.getElementById('promptClassInput').value.trim();
    if (!isValidClass(val)) {
      document.getElementById('promptClassMsg').textContent = '班级格式无效，请输入4位班级编号（如2501）';
      document.getElementById('promptClassMsg').style.color = 'var(--accent)';
      document.getElementById('promptClassMsg').style.display = '';
      return;
    }
    const pwd = document.getElementById('promptPwdInput').value;
    if (!pwd) {
      document.getElementById('promptClassMsg').textContent = '请输入密码确认';
      document.getElementById('promptClassMsg').style.color = 'var(--accent)';
      document.getElementById('promptClassMsg').style.display = '';
      return;
    }
    const btn = document.getElementById('promptClassBtn');
    btn.disabled = true; btn.textContent = '保存中...';
    try {
      const data = await apiPost('/api/auth/change-class', { class_name: val, password: pwd });
      localStorage.setItem('user', JSON.stringify(data.user));
      user.class_name = data.user.class_name;
      overlay.remove();
    } catch (err) {
      document.getElementById('promptClassMsg').textContent = err.message;
      document.getElementById('promptClassMsg').style.color = 'var(--accent)';
      document.getElementById('promptClassMsg').style.display = '';
    } finally {
      btn.disabled = false; btn.textContent = '保存';
    }
  };
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user || (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'teacher')) {
    _go404();
    return null;
  }
  return user;
}
