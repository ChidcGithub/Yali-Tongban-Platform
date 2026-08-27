import { json, error, checkRateLimit, parseBody, getClientIP, isAdmin, isHallReviewer, insertNotification, createNotification } from './_utils.js';

export async function handleGetHallBookings(env, user) {
  if (!user) return error('需要登录', 401);
  try { await env.DB.prepare("DELETE FROM hall_bookings WHERE date < date('now', '-14 days')").run(); } catch {}
  const rows = await env.DB.prepare(
    "SELECT * FROM hall_bookings WHERE status IN ('approved', 'cancelled') OR (user_id = ? AND status IN ('pending', 'rejected')) ORDER BY date, start_time"
  ).bind(user.userId).all();
  return json(rows.results);
}

export async function handleCreateHallBooking(request, env, user) {
  if (!user) return error('需要登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'hallBooking', 5, 60000)) return error('操作过于频繁', 429);
  const body = await parseBody(request);
  if (!body || !body.date || !body.start_time || !body.end_time || !body.purpose) return error('请填写完整信息');
  if (body.purpose.length > 200) return error('用途不超过200字');
  const r = await env.DB.prepare(
    'INSERT INTO hall_bookings (date, start_time, end_time, purpose, applicant, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(body.date, body.start_time, body.end_time, body.purpose.trim(), user.name, user.userId).run();
  const row = await env.DB.prepare('SELECT * FROM hall_bookings WHERE id = ?').bind(r.meta.last_row_id).first();
  await insertNotification(env, `千报告厅预约已提交：${row.applicant}的${row.date} ${row.start_time}─${row.end_time}「${row.purpose}」`);
  return json(row, 201);
}

export async function handleWithdrawHallBooking(request, env, id, user) {
  if (!user) return error('需要登录', 401);
  const row = await env.DB.prepare('SELECT * FROM hall_bookings WHERE id = ?').bind(Number(id)).first();
  if (!row) return error('预约不存在', 404);
  if (Number(row.user_id) !== Number(user.userId)) return error('只能撤回自己的预约', 403);
  if (row.status !== 'pending') return error('只能撤回待审核的预约', 400);
  await env.DB.prepare("UPDATE hall_bookings SET status = 'cancelled' WHERE id = ?").bind(Number(id)).run();
  return json({ message: '已撤回' });
}

export async function handleDeleteHallBooking(request, env, id, user) {
  if (!user) return error('需要登录', 401);
  const row = await env.DB.prepare('SELECT * FROM hall_bookings WHERE id = ?').bind(Number(id)).first();
  if (!row) return error('预约不存在', 404);
  if (Number(row.user_id) !== Number(user.userId) && !isAdmin(user)) return error('无权删除', 403);
  await env.DB.prepare('DELETE FROM hall_bookings WHERE id = ?').bind(Number(id)).run();
  return json({ message: '已删除' });
}

export async function handleReviewHallBooking(request, env, id, user) {
  if (!user || !isHallReviewer(user)) return error('需要审核权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'reviewHall', 20, 60000)) return error('操作过于频繁', 429);
  const body = await parseBody(request);
  if (!body || !body.action || !['approve', 'reject'].includes(body.action)) return error('参数错误');
  const row = await env.DB.prepare('SELECT * FROM hall_bookings WHERE id = ?').bind(Number(id)).first();
  if (!row) return error('预约不存在', 404);
  if (row.status !== 'pending') return error('已审核，不可重复操作', 400);

  if (body.action === 'reject') {
    await env.DB.prepare("UPDATE hall_bookings SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").bind(user.name, Number(id)).run();
    await insertNotification(env, `千报告厅预约已拒绝：${row.applicant}的${row.date} ${row.start_time}─${row.end_time}「${row.purpose}」`);
    try { await createNotification(env, Number(row.user_id), 'review_result', '预约已拒绝', `您${row.date} ${row.start_time}─${row.end_time}的千报告厅预约「${row.purpose}」已被拒绝。`, `halls.html`, 'x-circle'); } catch {}
    return json({ message: '已拒绝' });
  }

  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sM = toMin(row.start_time), eM = toMin(row.end_time);
  const approveStmt = env.DB.prepare("UPDATE hall_bookings SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'").bind(user.name, Number(id));
  const conflictStmt = env.DB.prepare(
    "SELECT * FROM hall_bookings WHERE id != ? AND date = ? AND start_time < ? AND end_time > ? AND status IN ('approved', 'pending') ORDER BY start_time"
  ).bind(Number(id), row.date, row.end_time, row.start_time);
  const [approveResult, conflictRows] = await env.DB.batch([approveStmt, conflictStmt]);
  if (approveResult.meta.changes === 0) return error('已审核，不可重复操作', 400);

  let totalOverlap = 0;
  const toCancel = [], toDelete = [];
  for (const b of conflictRows.results) {
    const bs = toMin(b.start_time), be = toMin(b.end_time);
    const o = Math.min(eM, be) - Math.max(sM, bs);
    if (o > 0) {
      totalOverlap += o;
      if (b.status === 'approved') toCancel.push(b);
      else toDelete.push(b);
    }
  }

  if (totalOverlap > 10) {
    const conflictOps = [];
    for (const b of toCancel) {
      conflictOps.push(env.DB.prepare("UPDATE hall_bookings SET status = 'cancelled' WHERE id = ?").bind(b.id));
    }
    for (const b of toDelete) {
      conflictOps.push(env.DB.prepare("DELETE FROM hall_bookings WHERE id = ?").bind(b.id));
    }
    if (conflictOps.length > 0) await env.DB.batch(conflictOps);
    for (const b of toCancel) {
      try { await insertNotification(env, `千报告厅预约冲突：${b.applicant}的${b.date} ${b.start_time}─${b.end_time}「${b.purpose}」已被取消（与新批准预约${row.applicant}${row.start_time}─${row.end_time}重叠）`); } catch {}
    }
    for (const b of toDelete) {
      try { await insertNotification(env, `千报告厅预约冲突：${b.applicant}的${b.date} ${b.start_time}─${b.end_time}「${b.purpose}」因重叠已被删除`); } catch {}
    }
    try { await insertNotification(env, `千报告厅预约已批准：${row.applicant}的${row.date} ${row.start_time}─${row.end_time}「${row.purpose}」，共处理${toCancel.length + toDelete.length}个冲突预约`); } catch {}
  } else {
    try { await insertNotification(env, `千报告厅预约已批准：${row.applicant}的${row.date} ${row.start_time}─${row.end_time}「${row.purpose}」`); } catch {}
  }
  try { await createNotification(env, Number(row.user_id), 'review_result', '预约已批准', `您${row.date} ${row.start_time}─${row.end_time}的千报告厅预约「${row.purpose}」已批准。`, `halls.html`, 'check-circle'); } catch {}
  return json({ message: '已批准' });
}

export async function handleGetHallPendingWithConflicts(env, user) {
  if (!user || !isHallReviewer(user)) return error('需要审核权限', 403);
  const pending = await env.DB.prepare("SELECT * FROM hall_bookings WHERE status = 'pending' ORDER BY date, start_time").all();
  if (pending.results.length === 0) return json([]);
  const conflicts = await env.DB.prepare(
    "SELECT c.*, p.id AS p_id FROM hall_bookings c JOIN hall_bookings p ON c.date = p.date AND c.id != p.id AND c.start_time < p.end_time AND c.end_time > p.start_time AND c.status IN ('pending', 'approved') WHERE p.status = 'pending' ORDER BY c.start_time"
  ).all();
  const conflictMap = {};
  for (const c of conflicts.results) {
    const pid = c.p_id;
    if (!conflictMap[pid]) conflictMap[pid] = [];
    delete c.p_id;
    conflictMap[pid].push(c);
  }
  const results = pending.results.map(p => ({ booking: p, conflicts: conflictMap[p.id] || [] }));
  return json(results);
}
