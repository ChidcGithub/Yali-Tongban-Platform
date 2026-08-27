import { json, error, checkRateLimit, parseBody, getClientIP, isAdmin } from './_utils.js';

export async function handleGetFeedMessages(env, user, url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 20, 50);
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  let query = "SELECT * FROM chat_messages WHERE type IN ('system', 'notification')";
  const params = [];

  if (after) {
    query += " AND id > ? ORDER BY id ASC LIMIT ?";
    params.push(Number(after), limit);
  } else if (before) {
    query += " AND id < ? ORDER BY id DESC LIMIT ?";
    params.push(Number(before), limit + 1);
  } else {
    query += " ORDER BY id DESC LIMIT ?";
    params.push(limit + 1);
  }

  const rows = await env.DB.prepare(query).bind(...params).all();
  let messages = after ? rows.results.reverse() : rows.results;
  let hasMore;
  if (after) {
    hasMore = messages.length === limit;
  } else {
    hasMore = messages.length > limit;
    if (hasMore) messages.pop();
  }
  const nextCursor = messages.length === 0 ? null : messages[messages.length - 1].id;
  return json({ messages, nextCursor, hasMore });
}

export async function handleDeleteChatMessage(env, id, request, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'deleteChatMessage', 10, 60000)) return error('操作过于频繁', 429);
  const msg = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(Number(id)).first();
  if (!msg) return error('消息不存在', 404);
  await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(Number(id)).run();
  return json({ message: '已删除' });
}

export async function handleAddFeedComment(request, env, feedId, user) {
  if (!user) return error('请先登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'addFeedComment', 5, 10000)) return error('操作过于频繁', 429);
  const body = await parseBody(request);
  if (!body || !body.content || body.content.trim().length < 1 || body.content.length > 200) return error('评论内容为1-200字');
  const feed = await env.DB.prepare('SELECT id FROM chat_messages WHERE id = ? AND type = ?').bind(Number(feedId), 'system').first();
  if (!feed) return error('动态不存在', 404);
  await env.DB.prepare(
    'INSERT INTO feed_comments (feed_id, user_name, content) VALUES (?, ?, ?)'
  ).bind(Number(feedId), user.name, body.content.trim()).run();
  return json({ message: '评论成功' }, 201);
}

export async function handleGetFeedComments(env, feedId) {
  const rows = await env.DB.prepare(
    'SELECT * FROM feed_comments WHERE feed_id = ? ORDER BY created_at ASC'
  ).bind(Number(feedId)).all();
  return json(rows.results);
}
