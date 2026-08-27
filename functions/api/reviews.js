import { rateLimit, json, error, parseBody, isValidImageUrl, isAdmin, insertChatSystemMessage } from './_utils.js';

export async function handleGetReviews(env, user) {
  if (!user) return error('需要登录', 401);
  const rows = await env.DB.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200').all();
  return json(rows.results);
}

export async function handleCreateReview(request, env, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'createReview', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { image_url } = body;
  if (!image_url) return error('图片不能为空');
  if (image_url.length > 2000000) return error('图片过大');
  if (!isValidImageUrl(image_url)) return error('无效图片格式');
  const r = await env.DB.prepare(
    'INSERT INTO reviews (image_url, created_by) VALUES (?, ?)'
  ).bind(image_url, user.name).run();
  const row = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?').bind(r.meta.last_row_id).first();
  try { await insertChatSystemMessage(env, { action: '提交审核', from_dept: user.department || user.name || '', to_dept: '', title: '', status: '待审核', ref_type: 'review', ref_id: row.id }); } catch {}
  return json(row, 201);
}

export async function handleReviewItem(request, env, id, user) {
  if (!user) return error('请先登录', 401);
  if (!isAdmin(user)) return error('无权限', 403);
  const rl = rateLimit(request, 'reviewItem', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { status, reject_reason } = body;
  if (!['通过', '拒绝'].includes(status)) return error('状态必须为通过或拒绝');
  if (status === '拒绝' && !reject_reason) return error('拒绝时请填写理由');
  if (reject_reason && reject_reason.length > 500) return error('拒绝理由不能超过500字');
  await env.DB.prepare(
    "UPDATE reviews SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).bind(status, reject_reason || '', user.name, id).run();
  const reviewAction = status === '通过' ? '审核已通过' : '审核未通过';
  const reviewStatus = status === '通过' ? '已通过' : '未通过';
  try { await insertChatSystemMessage(env, { action: reviewAction, from_dept: user.department || user.name || '', to_dept: '', title: '', status: reviewStatus, ref_type: 'review', ref_id: Number(id) }); } catch {}
  return json({ message: `审核结果: ${status}` });
}

export async function handleDeleteReview(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const rl = rateLimit(request, 'deleteReview', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run();
  return json({ message: '审核记录已删除' });
}
