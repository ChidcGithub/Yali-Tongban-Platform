import { json, error, safeParse, checkRateLimit, parseBody, getClientIP, verifyCaptcha, isValidImageUrl, isAdmin, DEPARTMENTS, insertChatSystemMessage, insertNotification, updateChatSystemStatus, createNotification, getUserIdByName } from './_utils.js';

export async function handleGetFinance(env, user, department) {
  if (!user) return error('需要登录', 401);
  try {
    await env.DB.prepare("UPDATE finance SET fund_type = '流动资金库' WHERE fund_type IS NULL").run();
  } catch {}
  let sql = 'SELECT * FROM finance';
  const params = [];
  if (user && !isAdmin(user)) {
    sql += ' WHERE department = ?';
    params.push(user.department || '');
  } else if (user && isAdmin(user) && department && DEPARTMENTS.includes(department)) {
    sql += ' WHERE department = ?';
    params.push(department);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json(rows.results);
}

export async function handleCreateFinance(request, env, user) {
  if (!user) return error('请先登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'createFinance', 20, 60000)) return error('提交过于频繁', 429);
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  if (!body.captcha_token) return error('请完成人机验证', 400);
  if (!await verifyCaptcha(body.captcha_token, body.captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
  const { image_url, tags, notes, type, amount, department, internal_activity } = body;
  if (!image_url) return error('图片不能为空');
  if (image_url.length > 2000000) return error('图片过大');
  if (!isValidImageUrl(image_url)) return error('无效图片格式');
  if (notes && notes.length > 500) return error('备注不能超过500字');
  if (!['收入', '支出'].includes(type)) return error('类型必须为收入或支出');
  if (amount === undefined || amount === null || isNaN(amount) || Number(amount) < 0 || !isFinite(Number(amount))) return error('金额无效');
  const dept = isAdmin(user) && department && DEPARTMENTS.includes(department) ? department : (user.department || '');
  const isInternal = !!internal_activity;
  const fundType = type === '收入' ? '流动资金库' : isInternal ? '流动资金库' : '基金账单';
  let r;
  try {
    r = await env.DB.prepare(
      'INSERT INTO finance (image_url, tags, notes, type, amount, created_by, department, fund_type, internal_activity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(image_url, JSON.stringify(tags || []), notes || '', type, Number(amount), user.name, dept, fundType, isInternal ? 1 : 0).run();
  } catch (dbErr) {
    console.error('finance INSERT failed:', dbErr.message);
    return error('数据库写入失败，请联系管理员', 500);
  }
  const row = await env.DB.prepare('SELECT * FROM finance WHERE id = ?').bind(r.meta.last_row_id).first();
  if (row) row.tags = safeParse(row.tags || '[]', []);
  if (row && dept && user.department && dept !== user.department) {
    try {
      await insertChatSystemMessage(env, {
        action: '报销申请', from_dept: user.department, to_dept: dept,
        title: notes || '', status: '待处理', ref_type: 'finance', ref_id: row.id,
      });
    } catch {}
  }
  return json(row, 201);
}

export async function handleCompleteFinance(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'completeFinance', 20, 60000)) return error('操作过于频繁', 429);
  const f = await env.DB.prepare('SELECT id, created_by, notes, type, amount FROM finance WHERE id = ?').bind(id).first();
  if (!f) return error('记录不存在', 404);
  await env.DB.prepare(
    "UPDATE finance SET status = '已完成', completed_by = ?, completed_at = datetime('now') WHERE id = ?"
  ).bind(user.name, id).run();
  try { await updateChatSystemStatus(env, 'finance', Number(id), '已完成'); } catch {}
  // 通知提交者
  const creatorId = await getUserIdByName(env, f.created_by);
  if (creatorId) {
    try { await createNotification(env, creatorId, 'finance_update', '财务记录已完成', `您提交的财务记录「${f.notes || '无备注'}」（${f.type === '收入' ? '+' : '-'}¥${Number(f.amount).toFixed(2)}）已标记为已完成。`, `finance.html`, 'check-circle'); } catch {}
  }
  return json({ message: '已标记完成' });
}

export async function handleReimburseFinance(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'reimburseFinance', 20, 60000)) return error('操作过于频繁', 429);
  const f = await env.DB.prepare('SELECT * FROM finance WHERE id = ?').bind(id).first();
  if (!f) return error('记录不存在', 404);
  await env.DB.prepare(
    "UPDATE finance SET status = '已报销', completed_by = ?, completed_at = datetime('now') WHERE id = ?"
  ).bind(user.name, id).run();
  try {
    await insertChatSystemMessage(env, {
      action: '报销完成', from_dept: f.department || '未知', to_dept: '财务',
      title: f.notes || '', status: '已完成', ref_type: 'finance', ref_id: Number(id),
    });
  } catch {}
  try { await updateChatSystemStatus(env, 'finance', Number(id), '已报销'); } catch {}
  // 通知提交者
  const creatorId = await getUserIdByName(env, f.created_by);
  if (creatorId) {
    try { await createNotification(env, creatorId, 'finance_update', '报销已完成', `您提交的财务记录「${f.notes || '无备注'}」（${f.type === '收入' ? '+' : '-'}¥${Number(f.amount).toFixed(2)}）已报销。`, `finance.html`, 'wallet'); } catch {}
  }
  return json({ message: '已标记报销' });
}

export async function handleUnreimburseFinance(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'unreimburseFinance', 20, 60000)) return error('操作过于频繁', 429);
  const f = await env.DB.prepare('SELECT id FROM finance WHERE id = ?').bind(id).first();
  if (!f) return error('记录不存在', 404);
  await env.DB.prepare(
    "UPDATE finance SET status = '待完成', completed_by = NULL, completed_at = NULL WHERE id = ? AND status = '已报销'"
  ).bind(id).run();
  try { await updateChatSystemStatus(env, 'finance', Number(id), '待完成'); } catch {}
  return json({ message: '已取消报销' });
}

export async function handleDeleteFinance(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'deleteFinance', 10, 60000)) return error('操作过于频繁', 429);
  const row = await env.DB.prepare('SELECT * FROM finance WHERE id = ?').bind(id).first();
  if (!row) return error('财务记录不存在', 404);
  await env.DB.prepare('DELETE FROM finance WHERE id = ?').bind(id).run();
  await insertNotification(env, `财务记录已删除：${row.notes || '无备注'} ${row.type === '收入' ? '+' : '-'}¥${Number(row.amount).toFixed(2)}（${row.created_by}）`);
  return json({ message: '财务记录已删除' });
}
