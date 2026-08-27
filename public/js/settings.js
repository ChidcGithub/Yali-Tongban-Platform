let user = null;

async function init() {
  user = await requireAuth();
  if (!user) return;
  const roleLabel = { admin: '管理员', owner: '网站管理者', member: '成员', teacher: '老师', public: '公共' };
  const userInfo = document.getElementById('userInfo');
  if (userInfo) userInfo.textContent =
    `当前账号：${user.name}  ·  身份：${roleLabel[user.role] || user.role}  ·  班级：${user.class_name || '未设置'}  ·  部门：${user.department || '未设置'}`;
  const cur = document.getElementById('currentClass');
  if (cur) cur.textContent = `当前班级：${user.class_name || '未设置'}`;
  const deptCur = document.getElementById('currentDepartment');
  if (deptCur) deptCur.textContent = `当前部门：${user.department || '未设置'}`;
  const deptSel = document.getElementById('deptSelect');
  if (deptSel) deptSel.value = user.department || '';
  if (user.role === 'owner') {
    const el = document.getElementById('nameForm');
    if (el) {
      const grp = el.closest('.set-group');
      if (grp) grp.style.display = 'none';
    }
  }
}


async function changeClass(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const cls = fd.get('class_name');
  if (!isValidClass(cls)) {
    document.getElementById('classChangeMsg').textContent = '班级格式无效，请输入4位班级编号（如2501）';
    document.getElementById('classChangeMsg').style.color = 'var(--accent)';
    document.getElementById('classChangeMsg').style.display = '';
    return;
  }
  const btn = document.getElementById('classBtn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const data = await apiPost('/api/auth/change-class', {
      class_name: cls,
      password: fd.get('password'),
    });
    localStorage.setItem('user', JSON.stringify(data.user));
    user = data.user;
    toast(data.message || '班级已更新', 'success');
    const cur = document.getElementById('currentClass');
    if (cur) cur.textContent = `当前班级：${cls}`;
    document.getElementById('classChangeMsg').style.display = 'none';
    e.target.reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '保存班级';
  }
}

async function changeName(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = document.getElementById('nameBtn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const data = await apiPost('/api/auth/change-name', {
      new_name: fd.get('new_name'),
      password: fd.get('password'),
    });
    localStorage.setItem('user', JSON.stringify(data.user));
    user = data.user;
    toast(data.message || '姓名已更改', 'success');
    const pcName = document.getElementById('pcName');
    if (pcName) pcName.textContent = data.user.name;
    const pcHeader = document.getElementById('pcHeader');
    if (pcHeader) pcHeader.setAttribute('data-name', data.user.name || '');
    e.target.reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '保存姓名';
  }
}

async function changeDepartment(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = document.getElementById('deptBtn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const data = await apiPost('/api/auth/change-department', {
      department: fd.get('department') || '',
      password: fd.get('password'),
    });
    localStorage.setItem('user', JSON.stringify(data.user));
    user = data.user;
    toast(data.message || '部门已更新', 'success');
    const deptCur = document.getElementById('currentDepartment');
    if (deptCur) deptCur.textContent = `当前部门：${fd.get('department') || '未设置'}`;
    e.target.reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '保存部门';
  }
}

async function changePassword(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('new_password') !== fd.get('confirm')) {
    toast('两次密码输入不一致', 'error');
    return;
  }
  const btn = document.getElementById('passwordBtn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const data = await apiPost('/api/auth/change-password', {
      old_password: fd.get('old_password'),
      new_password: fd.get('new_password'),
    });
    toast(data.message || '密码已更改', 'success');
    e.target.reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '保存密码';
  }
}

init();
