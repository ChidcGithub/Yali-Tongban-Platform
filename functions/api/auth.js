import bcrypt from 'bcryptjs';
import { rateLimit, json, error, safeParse, signToken, signTokenForUser, respondWithToken, setTokenCookie, parseBody, verifyCaptcha, isValidClass, validatePassword, requireMember, isAdmin, insertNotification, SALT_ROUNDS, NAME_MIN, NAME_MAX, DEPARTMENTS } from './_utils.js';

export async function handleLogin(request, env) {
  const rl = rateLimit(request, 'login', 5, 60000, '登录尝试过于频繁，请稍后再试');
  if (rl) return rl;

  let body;
  try { body = await request.json(); } catch { return error('请求格式错误'); }
  const { name, password, captcha_token, captcha_code } = body;
  if (!name || !password) return error('姓名和密码不能为空');

  if (!await verifyCaptcha(captcha_token, captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);

  try {
    const row = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
    if (!row) return error('用户名或密码错误', 401);
    if (row.role === 'pending') return error('用户名或密码错误', 401);
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return error('用户名或密码错误', 401);

    const payload = { userId: row.id, name: row.name, role: row.role, class_name: row.class_name || '', department: row.department || '', achievements: row.achievements || '[]', token_version: row.token_version || 0 };
    const token = await signToken(payload, env);
    const passwordReset = row.password_reset === 1;
    if (passwordReset) {
      await env.DB.prepare('UPDATE users SET password_reset = 0 WHERE id = ?').bind(row.id).run();
    }
    return json({ token, user: { id: row.id, name: row.name, role: row.role, class_name: row.class_name || '', department: row.department || '', created_at: row.created_at || '', achievements: safeParse(row.achievements) || [] }, password_reset: passwordReset }, 200, { 'Set-Cookie': setTokenCookie(token) });
  } catch {
    return error('服务器内部错误', 500);
  }
}

export async function handleRegister(request, env) {
  const rl = rateLimit(request, 'register', 3, 60000, '注册尝试过于频繁，请稍后再试');
  if (rl) return rl;

  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { name, password, captcha_token, captcha_code, class_name, department } = body;
  if (!name || !password) return error('姓名和密码不能为空');
  if (!class_name) return error('请填写班级');
  if (!isValidClass(class_name)) return error('班级格式无效，请输入4位班级编号');
  if (name.length < NAME_MIN || name.length > NAME_MAX) return error(`姓名长度需在${NAME_MIN}-${NAME_MAX}字之间`);
  const pwdErr = validatePassword(password);
  if (pwdErr) return error(pwdErr);
  if (!await verifyCaptcha(captcha_token, captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind(name).first();
  if (exists) return error('该姓名已被注册');
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await env.DB.prepare('INSERT INTO users (name, password_hash, role, class_name, department) VALUES (?, ?, ?, ?, ?)').bind(name, hash, 'pending', class_name, department || '').run();
  try { await insertNotification(env, `新成员注册：${name}`); } catch {}
  return json({ message: '注册成功，请等待管理员审核' });
}

export async function handleMe(request, env) {
  const user = await requireMember(request, env);
  if (!user) return error('未登录', 401);
  const row = await env.DB.prepare('SELECT id, name, role, class_name, department, created_at, achievements FROM users WHERE id = ?').bind(user.userId).first();
  if (!row) return error('用户不存在');
  return json({ ...row, class_name: row.class_name || '', department: row.department || '', achievements: safeParse(row.achievements) || [] });
}

export async function handleCheckName(request, env) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name || name.length < 1 || name.length > 50) return error('姓名不能为空且不超过50字');
  const row = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind(name).first();
  return json({ available: !row });
}

export async function handleChangePassword(request, env, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'changePassword', 5, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { old_password, new_password } = body;
  if (!old_password || !new_password) return error('旧密码和新密码不能为空');
  const pwdErr = validatePassword(new_password);
  if (pwdErr) return error(pwdErr);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.userId).first();
  if (!row) return error('操作失败');
  const ok = await bcrypt.compare(old_password, row.password_hash);
  if (!ok) return error('旧密码错误', 401);
  const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
  await env.DB.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').bind(hash, user.userId).run();
  return json({ message: '密码已更改' });
}

export async function handleChangeName(request, env, user) {
  if (!user) return error('请先登录', 401);
  if (user.role === 'owner') return error('站长不可更改姓名', 403);
  const rl = rateLimit(request, 'changeName', 10, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { new_name, password } = body;
  if (!new_name || !password) return error('新姓名和密码不能为空');
  if (new_name.length < NAME_MIN || new_name.length > NAME_MAX) return error(`姓名长度需在${NAME_MIN}-${NAME_MAX}字之间`);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.userId).first();
  if (!row) return error('操作失败');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return error('密码错误', 401);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE name = ? AND id != ?').bind(new_name, user.userId).first();
  if (exists) return error('该姓名已被使用');
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(new_name, user.userId).run();
  const token = await signTokenForUser(user.userId, env, { name: new_name });
  return respondWithToken({ token, user: { id: user.userId, name: new_name, role: user.role, class_name: user.class_name || '', department: user.department || '' }, message: '姓名已更改' }, token);
}

export async function handleChangeClass(request, env, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'changeClass', 10, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { class_name, password } = body;
  if (!class_name) return error('请填写班级');
  if (!isValidClass(class_name)) return error('班级格式无效，请输入4位班级编号');
  const row = await env.DB.prepare('SELECT password_hash, class_name FROM users WHERE id = ?').bind(user.userId).first();
  if (!row) return error('操作失败');
  if (!password) return error('请输入密码确认');
  if (password) {
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return error('密码错误', 401);
  }
  await env.DB.prepare('UPDATE users SET class_name = ? WHERE id = ?').bind(class_name, user.userId).run();
  const token = await signTokenForUser(user.userId, env);
  return respondWithToken({ token, user: { id: user.userId, name: user.name, role: user.role, class_name, department: user.department || '' }, message: '班级已更新' }, token);
}

export async function handleChangeOwnDepartment(request, env, user) {
  if (!user) return error('请先登录', 401);
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const rl = rateLimit(request, 'changeDepartment', 10, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { department, password } = body;
  const dept = department && DEPARTMENTS.includes(department) ? department : '';
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.userId).first();
  if (!row) return error('操作失败');
  if (!password) return error('请输入密码确认');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return error('密码错误', 401);
  await env.DB.prepare('UPDATE users SET department = ? WHERE id = ?').bind(dept, user.userId).run();
  const token = await signTokenForUser(user.userId, env);
  return respondWithToken({ token, user: { id: user.userId, name: user.name, role: user.role, class_name: user.class_name || '', department: dept }, message: '部门已更新' }, token);
}
