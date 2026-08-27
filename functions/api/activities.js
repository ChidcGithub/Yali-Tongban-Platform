import { json, error, checkRateLimit, parseBody, getClientIP, verifyCaptcha, isAdmin, insertChatSystemMessage, createNotificationBatch, DEPARTMENTS } from './_utils.js';

export async function handleGetActivities(env, user) {
  let sql = "SELECT a.*, (SELECT COUNT(*) FROM activity_volunteers WHERE activity_id = a.id) AS volunteer_count";
  const params = [];
  if (user) {
    sql += ", (SELECT COUNT(*) FROM activity_volunteers WHERE activity_id = a.id AND member_name = ?) AS signed_up";
    params.push(user.name);
  }
  sql += " FROM activities a ORDER BY a.created_at DESC";
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json(rows.results);
}

export async function handleDeleteActivity(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'deleteActivity', 10, 60000)) return error('操作过于频繁', 429);
  await env.DB.prepare('DELETE FROM activity_volunteers WHERE activity_id = ?').bind(id).run();
  const r = await env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) return error('活动不存在', 404);
  return json({ message: '活动已删除' });
}

export async function handleCreateActivity(request, env, user) {
  if (!user) return error('需要登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'createActivity', 10, 60000)) return error('提交过于频繁', 429);
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { name, location, time, departments, need_volunteers } = body;
  if (!name) return error('请填写活动名称');
  if (!time) return error('请填写活动时间');
  const r = await env.DB.prepare(
    'INSERT INTO activities (name, location, time, departments, need_volunteers, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(name, location || '', time, departments || '', need_volunteers ? 1 : 0, user.name).run();
  const row = await env.DB.prepare('SELECT * FROM activities WHERE id = ?').bind(r.meta.last_row_id).first();
  try { await insertChatSystemMessage(env, { action: '发布活动', from_dept: user.department || '团委', to_dept: '全体', title: name, status: '已完成', ref_type: 'activity', ref_id: row.id }); } catch {}
  // 通知相关部门成员（或全员）
  try {
    let userIds = [];
    const depts = (departments || '').split(',').map(d => d.trim()).filter(d => DEPARTMENTS.includes(d));
    if (depts.length > 0) {
      const placeholders = depts.map(() => '?').join(',');
      const users = await env.DB.prepare(
        `SELECT id FROM users WHERE role IN ('member','admin','owner','teacher') AND department IN (${placeholders})`
      ).bind(...depts).all();
      userIds = users.results.map(u => u.id);
    } else {
      const users = await env.DB.prepare("SELECT id FROM users WHERE role IN ('member','admin','owner','teacher')").all();
      userIds = users.results.map(u => u.id);
    }
    await createNotificationBatch(env, userIds, 'activity_invite', '新活动', `${name}${time ? ` · ${time}` : ''}${location ? ` · ${location}` : ''}`, `activities.html`, 'calendar');
  } catch {}
  return json({ ...row, volunteer_count: 0 }, 201);
}

export async function handleSignupVolunteer(request, env, id, user) {
  const ip = getClientIP(request);
  const body = await parseBody(request);
  let memberName, memberDept;
  if (user) {
    memberName = user.name;
    memberDept = user.department || '';
  } else {
    if (!checkRateLimit(ip, 'volunteerSignup', 3, 1800000)) return error('操作过于频繁，每30分钟最多报名3次', 429);
    if (!body || !body.name) return error('请填写姓名', 400);
    if (!body.captcha_token) return error('请完成人机验证', 400);
    if (!await verifyCaptcha(body.captcha_token, body.captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
    memberName = body.name;
    memberDept = '';
  }
  const activity = await env.DB.prepare('SELECT id, need_volunteers FROM activities WHERE id = ?').bind(id).first();
  if (!activity) return error('活动不存在', 404);
  if (!activity.need_volunteers) return error('该活动不需要志愿者', 400);
  const existing = await env.DB.prepare(
    'SELECT id FROM activity_volunteers WHERE activity_id = ? AND member_name = ?'
  ).bind(id, memberName).first();
  if (existing) return error('您已报名', 400);
  await env.DB.prepare(
    'INSERT INTO activity_volunteers (activity_id, member_name, department) VALUES (?, ?, ?)'
  ).bind(id, memberName, memberDept).run();
  return json({ message: '报名成功' }, 201);
}

export async function handleUnsignupVolunteer(request, env, id, user) {
  if (!user) return error('需要登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'unsignupVolunteer', 10, 60000)) return error('操作过于频繁', 429);
  const r = await env.DB.prepare(
    'DELETE FROM activity_volunteers WHERE activity_id = ? AND member_name = ?'
  ).bind(id, user.name).run();
  if (r.meta.changes === 0) return error('未找到报名记录', 404);
  return json({ message: '已取消报名' });
}

export async function handleGetActivityVolunteers(env, id) {
  const activity = await env.DB.prepare('SELECT name FROM activities WHERE id = ?').bind(id).first();
  if (!activity) return error('活动不存在', 404);
  const rows = await env.DB.prepare(
    'SELECT id, member_name, department, created_at FROM activity_volunteers WHERE activity_id = ? ORDER BY created_at ASC'
  ).bind(id).all();
  return json({ activity_name: activity.name, volunteers: rows.results });
}
