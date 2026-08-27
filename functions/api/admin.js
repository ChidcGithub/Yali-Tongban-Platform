import bcrypt from 'bcryptjs';
import { rateLimit, json, error, safeParse, parseBody, isValidClass, isValidImageUrl, isAdmin, isOwner, signTokenForUser, respondWithToken, validatePassword, insertNotification, insertChatSystemMessage, createNotification, SALT_ROUNDS, NAME_MIN, NAME_MAX, DEPARTMENTS, getStorageStats } from './_utils.js';

export async function handleGetMembers(env, url) {
  const offset = Math.max(0, parseInt(url?.searchParams?.get('offset'), 10) || 0);
  const limit = 200;
  const [rows, total] = await Promise.all([
    env.DB.prepare("SELECT id, name, role, class_name, achievements FROM users WHERE role IN ('member', 'admin', 'owner', 'teacher') ORDER BY role DESC, name ASC LIMIT ? OFFSET ?").bind(limit, offset).all(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role IN ('member', 'admin', 'owner', 'teacher')").first(),
  ]);
  const results = rows.results.map(r => ({
    ...r,
    achievement_count: (() => { try { return JSON.parse(r.achievements || '[]').length; } catch { return 0; } })(),
  }));
  return json({ results, hasMore: offset + limit < Number(total?.c || 0) });
}

export async function handleGetRegistrations(env) {
  const rows = await env.DB.prepare("SELECT id, name, class_name, department, created_at FROM users WHERE role = 'pending' ORDER BY created_at ASC LIMIT 200").all();
  return json(rows.results);
}

export async function handleApproveRegistration(request, env, id) {
  const rl = rateLimit(request, 'approveRegistration', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  await env.DB.prepare("UPDATE users SET role = 'member' WHERE id = ? AND role = 'pending'").bind(id).run();
  const userRow = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first();
  try { await insertNotification(env, `通过注册：${userRow?.name || ''}`); } catch {}
  try { await createNotification(env, Number(id), 'system', '注册已通过', `欢迎加入雅礼团委·通办！您的账号已审核通过。`, '', 'user-check'); } catch {}
  return json({ message: '注册已通过' });
}

export async function handleRejectRegistration(request, env, id) {
  const rl = rateLimit(request, 'rejectRegistration', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  await env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'pending'").bind(id).run();
  return json({ message: '注册已拒绝' });
}

export async function handleDeleteUser(request, env, id, currentUserId) {
  const rl = rateLimit(request, 'deleteUser', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  const idNum = Number(id);
  if (idNum === Number(currentUserId)) return error('不能删除自己');
  const target = await env.DB.prepare('SELECT role, name FROM users WHERE id = ?').bind(id).first();
  if (!target) return error('用户不存在', 404);
  const userName = target.name;
  const deletableRoles = target.role === 'teacher' ? ['teacher'] : ['member', 'pending'];
  const result = await env.DB.prepare(`DELETE FROM users WHERE id = ? AND role IN (${deletableRoles.map(() => '?').join(',')})`).bind(id, ...deletableRoles).run();
  if (result.meta.changes === 0) return error('只能删除普通成员或老师', 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE created_by = ?').bind(userName),
    env.DB.prepare('DELETE FROM issues WHERE submitted_by = ?').bind(userName),
    env.DB.prepare('DELETE FROM poll_responses WHERE user_id = ? OR voter_name = ?').bind(idNum, userName),
    env.DB.prepare('DELETE FROM chat_messages WHERE user_id = ? OR user_name = ?').bind(idNum, userName),
    env.DB.prepare('DELETE FROM activity_volunteers WHERE member_name = ?').bind(userName),
    env.DB.prepare('DELETE FROM announcements WHERE created_by = ?').bind(userName),
    env.DB.prepare('DELETE FROM finance WHERE created_by = ?').bind(userName),
    env.DB.prepare('DELETE FROM reviews WHERE created_by = ?').bind(userName),
    env.DB.prepare('DELETE FROM feed_comments WHERE user_name = ?').bind(userName),
    env.DB.prepare('DELETE FROM polls WHERE created_by = ?').bind(userName),
  ]);
  return json({ message: '成员已删除' });
}

export async function handleClearAll(request, env) {
  const rl = rateLimit(request, 'clearAll', 3, 3600000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  await env.DB.prepare('DELETE FROM issues').run();
  await env.DB.prepare('DELETE FROM announcements').run();
  await env.DB.prepare('DELETE FROM finance').run();
  await env.DB.prepare('DELETE FROM reviews').run();
  await env.DB.prepare('DELETE FROM comments').run();
  await env.DB.prepare('DELETE FROM poll_responses').run();
  await env.DB.prepare('DELETE FROM poll_answers').run();
  await env.DB.prepare('DELETE FROM poll_questions').run();
  await env.DB.prepare('DELETE FROM chat_messages').run();
  await env.DB.prepare('DELETE FROM feed_comments').run();
  await env.DB.prepare('DELETE FROM activity_volunteers').run();
  await env.DB.prepare('DELETE FROM announcement_images').run();
  await env.DB.prepare("DELETE FROM users WHERE role = 'member'").run();
  await env.DB.prepare("DELETE FROM users WHERE role = 'pending'").run();
  return json({ message: '已清除全部数据' });
}

export async function handleGetAdminSettings(env) {
  const rows = await env.DB.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.results.forEach(r => { s[r.key] = r.value; });
  return json(s);
}

const ALLOWED_SETTINGS_KEYS = ['site_closed', 'site_closed_by', 'site_closed_message'];
export async function handleUpdateSettings(request, env) {
  const rl = rateLimit(request, 'updateSettings', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  const data = await parseBody(request);
  if (!data) return error('请求格式错误');
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_SETTINGS_KEYS.includes(key)) continue;
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, String(value)).run();
  }
  return json({ message: '设置已更新' });
}

export async function handleGetStorage(env) {
  return json(await getStorageStats(env));
}

export async function handleUpdateRole(request, env, id, user) {
  const rl = rateLimit(request, 'updateRole', 20, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { role } = body;
  if (!['member', 'admin', 'owner', 'teacher', 'public'].includes(role)) return error('无效角色');
  if (role === 'owner' && !isOwner(user)) return error('需要网站管理者权限', 403);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!target) return error('用户不存在', 404);
  if (target.role === 'owner') return error('不能修改站长的角色', 403);
  if (target.role === 'owner' && !isOwner(user)) return error('需要网站管理者权限', 403);
  if (role === 'public') {
    const existing = await env.DB.prepare("SELECT id FROM users WHERE role='public' AND id != ?").bind(id).first();
    if (existing) return error('已存在公共账号', 400);
  }
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run();
  const roleLabels = { admin: '管理员', teacher: '老师', member: '成员', owner: '站长', public: '公共' };
  const adminPrefix = user.department ? user.department + '的' : '';
  const targetPrefix = target.department ? target.department + '的' : '';
  try { await insertChatSystemMessage(env, { action: '任命', from_dept: '', to_dept: '', title: `${adminPrefix}${user.name}任命${targetPrefix}${target.name}为${roleLabels[role] || role}` }); } catch {}
  try { await createNotification(env, Number(id), 'system', '角色已变更', `您的角色已被变更为「${roleLabels[role] || role}」。`, '', 'shield'); } catch {}
  return json({ message: `角色已更新为 ${role}` });
}

export async function handleGetAllUsers(env, url) {
  const offset = Math.max(0, parseInt(url?.searchParams?.get('offset'), 10) || 0);
  const limit = 200;
  const [rows, total] = await Promise.all([
    env.DB.prepare("SELECT id, name, role, class_name, department, created_at, achievements FROM users WHERE role IN ('member', 'admin', 'owner', 'teacher', 'public') ORDER BY role DESC, name ASC LIMIT ? OFFSET ?").bind(limit, offset).all(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role IN ('member', 'admin', 'owner', 'teacher', 'public')").first(),
  ]);
  return json({ results: rows.results.map(r => ({ ...r, achievement_count: (safeParse(r.achievements) || []).length })), hasMore: offset + limit < Number(total?.c || 0) });
}

export async function handleGetUser(env, id) {
  const row = await env.DB.prepare('SELECT id, name, role, class_name, department, created_at, achievements FROM users WHERE id = ?').bind(id).first();
  if (!row) return error('用户不存在', 404);
  return json({ ...row, class_name: row.class_name || '', department: row.department || '', achievements: safeParse(row.achievements) || [] });
}

export async function handleResetPassword(request, env, id) {
  const rl = rateLimit(request, 'resetPassword', 10, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body || !body.password) return error('请提供新密码');
  const password = body.password;
  const pwdErr = validatePassword(password);
  if (pwdErr) return error(pwdErr);
  const row = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(id).first();
  if (!row) return error('用户不存在', 404);
  if (row.role === 'owner') return error('不能重置站长密码', 403);
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_reset = 1 WHERE id = ?').bind(hash, id).run();
  return json({ message: '密码已重置' });
}

export async function handleAdminChangeName(request, env, id) {
  const rl = rateLimit(request, 'adminChangeName', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { name } = body;
  if (!name || name.length < NAME_MIN || name.length > NAME_MAX) return error(`姓名长度需在${NAME_MIN}-${NAME_MAX}字之间`);
  const target = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(id).first();
  if (!target) return error('用户不存在', 404);
  if (target.role === 'owner') return error('不能修改站长姓名', 403);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE name = ? AND id != ?').bind(name, id).first();
  if (exists) return error('该姓名已被使用');
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id).run();
  return json({ message: '姓名已更新' });
}

export async function handleSetDepartment(request, env, id) {
  const rl = rateLimit(request, 'setDepartment', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { department } = body;
  const dept = department && DEPARTMENTS.includes(department) ? department : '';
  const target = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
  if (!target) return error('用户不存在', 404);
  await env.DB.prepare('UPDATE users SET department = ? WHERE id = ?').bind(dept, id).run();
  try { await insertChatSystemMessage(env, { action: '分配部门', from_dept: '', to_dept: '', title: `${target.name || ''} → ${dept || '未分配'}` }); } catch {}
  return json({ message: '部门已更新' });
}

export async function handleBatchImport(request, env) {
  try {
    const rl = rateLimit(request, 'batchImport', 5, 60000, '操作过于频繁，请稍后再试');
    if (rl) return rl;
    const body = await parseBody(request);
    if (!body || !body.users || !Array.isArray(body.users) || body.users.length === 0) return error('请提供用户列表');
    const results = { success: 0, skipped: 0, failed: [] };
    const seenNames = new Set();

    // Phase 1: validate all users (no DB/bcrypt)
    const validUsers = [];
    for (let i = 0; i < body.users.length; i++) {
      const u = body.users[i];
      try {
        const pwdErr = validatePassword(u.password);
        if (pwdErr) { results.failed.push({ index: i, name: u.name, reason: pwdErr }); continue; }
        if (!u.name || u.name.length < NAME_MIN || u.name.length > NAME_MAX) { results.failed.push({ index: i, name: u.name, reason: '姓名长度不合法' }); continue; }
        if (u.class_name && !isValidClass(u.class_name)) { results.failed.push({ index: i, name: u.name, reason: '班级格式无效' }); continue; }
        if (seenNames.has(u.name)) { results.skipped++; continue; }
        seenNames.add(u.name);
        validUsers.push(u);
      } catch (e) {
        results.failed.push({ index: i, name: u.name, reason: e.message || '未知错误' });
      }
    }

    // Phase 2: batch check existing users (single query instead of N)
    const toInsert = [];
    if (validUsers.length > 0) {
      const placeholders = validUsers.map(() => '?').join(',');
      const existing = await env.DB.prepare(`SELECT name FROM users WHERE name IN (${placeholders})`).bind(...validUsers.map(u => u.name)).all();
      const existingNames = new Set(existing.results.map(r => r.name));

      const pending = [];
      for (const u of validUsers) {
        if (existingNames.has(u.name)) { results.skipped++; continue; }
        pending.push(u);
      }

      // Phase 3: concurrent bcrypt hashing (limit 5 at a time)
      const CONCURRENCY = 5;
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        const chunk = pending.slice(i, i + CONCURRENCY);
        const hashed = await Promise.all(chunk.map(u =>
          bcrypt.hash(u.password, SALT_ROUNDS).then(hash => ({ ...u, hash }))
        ));
        for (const u of hashed) {
          const dept = u.department && DEPARTMENTS.includes(u.department) ? u.department : '';
          toInsert.push(env.DB.prepare('INSERT INTO users (name, password_hash, role, class_name, department) VALUES (?, ?, ?, ?, ?)').bind(u.name, u.hash, 'member', u.class_name || '', dept));
          results.success++;
        }
      }
    }

    if (toInsert.length > 0) await env.DB.batch(toInsert);
    try { await insertChatSystemMessage(env, { action: '批量导入', from_dept: '', to_dept: '', title: `${results.success} 名成员`, status: '已完成' }); } catch {}
    return json(results);
  } catch (e) {
    return error(`导入失败：${e.message || '服务器错误'}`, 500);
  }
}

export async function handleBatchApprove(request, env) {
  const rl = rateLimit(request, 'batchApprove', 10, 60000, '操作过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body || !body.ids || !Array.isArray(body.ids) || body.ids.length === 0) return error('请提供ID列表');
  for (const id of body.ids) {
    await env.DB.prepare("UPDATE users SET role = 'member' WHERE id = ? AND role = 'pending'").bind(id).run();
  }
  try { await insertChatSystemMessage(env, { action: '批量通过', from_dept: '', to_dept: '', title: `${body.ids.length} 名注册`, status: '已完成' }); } catch {}
  return json({ message: `已通过 ${body.ids.length} 个注册申请` });
}
