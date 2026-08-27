import { json, error, parseBody } from './_utils.js';

// GET /api/messages — 获取消息列表
// 查询参数: type=, unread=1, limit=20, offset=0
export async function handleGetMessages(env, user, url) {
  if (!user || !user.userId) return json({ messages: [], total: 0 });
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const type = url.searchParams.get('type');
  const unreadOnly = url.searchParams.get('unread') === '1';

  let sql = "SELECT id, type, title, body, link, icon, is_read, created_at FROM notifications WHERE user_id = ?";
  const args = [user.userId];
  if (type && type !== 'all') {
    sql += " AND type = ?";
    args.push(type);
  }
  if (unreadOnly) sql += " AND is_read = 0";
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const rows = await env.DB.prepare(sql).bind(...args).all();

  // 总数和未读数
  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread FROM notifications WHERE user_id = ?"
    + (type && type !== 'all' ? " AND type = ?" : "")
  ).bind(...(type && type !== 'all' ? [user.userId, type] : [user.userId])).first();

  return json({
    messages: rows.results,
    total: totalRow?.total || 0,
    unread: totalRow?.unread || 0,
  });
}

// GET /api/messages/unread-count — 仅获取未读数量
export async function handleGetUnreadCount(env, user) {
  if (!user || !user.userId) return json({ count: 0 });
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0"
  ).bind(user.userId).first();
  return json({ count: row?.cnt || 0 });
}

// POST /api/messages/:id/read — 标记单条已读
export async function handleMarkRead(env, user, id) {
  if (!user || !user.userId) return error('需要登录', 401);
  await env.DB.prepare(
    "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
  ).bind(id, user.userId).run();
  return json({ message: '已标记已读' });
}

// POST /api/messages/read-all — 全部标记已读（可选 type 过滤）
export async function handleMarkAllRead(request, env, user) {
  if (!user || !user.userId) return error('需要登录', 401);
  const body = await parseBody(request) || {};
  if (body.type) {
    await env.DB.prepare(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND type = ?"
    ).bind(user.userId, body.type).run();
  } else {
    await env.DB.prepare(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0"
    ).bind(user.userId).run();
  }
  return json({ message: '全部已读' });
}

// DELETE /api/messages/:id — 删除单条
export async function handleDeleteMessage(env, user, id) {
  if (!user || !user.userId) return error('需要登录', 401);
  await env.DB.prepare(
    "DELETE FROM notifications WHERE id = ? AND user_id = ?"
  ).bind(id, user.userId).run();
  return json({ message: '已删除' });
}

// DELETE /api/messages — 清空已读消息
export async function handleClearRead(env, user) {
  if (!user || !user.userId) return error('需要登录', 401);
  await env.DB.prepare(
    "DELETE FROM notifications WHERE user_id = ? AND is_read = 1"
  ).bind(user.userId).run();
  return json({ message: '已清空已读消息' });
}
