import { json, error, checkRateLimit, parseBody, getClientIP, isValidImageUrl, isAdmin, attachAnnounceImages, replaceAnnounceImages, insertChatSystemMessage, createNotification, createNotificationBatch, getUserIdByName } from './_utils.js';

export async function handleGetAnnouncements(env, id) {
  try {
    if (id) {
      const row = await env.DB.prepare("SELECT a.*, COALESCE(c.cnt, 0) AS comment_count FROM announcements a LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM comments WHERE target_type='announcement' GROUP BY target_id) c ON a.id = c.target_id WHERE a.id = ?").bind(id).first();
      if (!row) return error('公告不存在', 404);
      await attachAnnounceImages(env, [row]);
      return json(row);
    }
    const rows = await env.DB.prepare("SELECT a.*, COALESCE(c.cnt, 0) AS comment_count FROM announcements a LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM comments WHERE target_type='announcement' GROUP BY target_id) c ON a.id = c.target_id WHERE a.status IS NULL OR a.status != ? ORDER BY a.created_at DESC LIMIT 200").bind('已拒绝').all();
    await attachAnnounceImages(env, rows.results);
    return json(rows.results);
  } catch {
    return error('获取公告失败', 500);
  }
}

export async function handleCreateAnnouncement(request, env, user) {
  try {
    if (!user) return error('请先登录', 401);
    const ip = getClientIP(request);
    if (!checkRateLimit(ip, 'createAnnouncement', 5, 60000)) return error('操作过于频繁，请稍后再试', 429);
    const body = await parseBody(request);
    if (!body) return error('请求格式错误');
    const { title, content, image_urls } = body;
    if (!title || !content) return error('标题和内容不能为空');
    if (title.length > 200) return error('标题不能超过200字');
    if (content.length > 5000) return error('内容不能超过5000字');
    const r = await env.DB.prepare(
      "INSERT INTO announcements (title, content, image_url, created_by) VALUES (?, ?, '', ?)"
    ).bind(title, content, user.name).run();
    if (!r || !r.meta) return error('数据库写入失败', 500);
    const id = r.meta.last_row_id;
    const urls = Array.isArray(image_urls) ? image_urls : [];
    const imgStmts = [];
    for (let i = 0; i < urls.length; i++) {
      if (urls[i].length > 1000000) return error('单张图片过大');
      imgStmts.push(env.DB.prepare('INSERT INTO announcement_images (announcement_id, image_url, sort_order) VALUES (?, ?, ?)').bind(id, urls[i], i));
    }
    if (imgStmts.length > 0) await env.DB.batch(imgStmts);
    const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
    if (!row) return error('公告创建后未找到', 500);
    await attachAnnounceImages(env, [row]);
    try { await insertChatSystemMessage(env, { action: '发布公告', from_dept: user.department || user.name || '', to_dept: '', title: row.title, status: '待审核', ref_type: 'announcement', ref_id: row.id }); } catch {}
    return json(row, 201);
  } catch {
    return error('创建公告失败', 500);
  }
}

export async function handleDeleteAnnouncement(request, env, id, user) {
  if (!user) return error('请先登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'deleteAnnouncement', 10, 60000)) return error('操作过于频繁', 429);
  const row = await env.DB.prepare('SELECT created_by FROM announcements WHERE id = ?').bind(id).first();
  if (!row) return error('公告不存在', 404);
  if (user.name !== row.created_by && !isAdmin(user)) return error('无权删除此公告', 403);
  await env.DB.prepare('DELETE FROM announcement_images WHERE announcement_id = ?').bind(id).run();
  await env.DB.prepare("DELETE FROM comments WHERE target_type = 'announcement' AND target_id = ?").bind(Number(id)).run();
  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  return json({ message: '公告已删除' });
}

export async function handleUpdateAnnouncement(request, env, id, user) {
  try {
    if (!user) return error('请先登录', 401);
    const ip = getClientIP(request);
    if (!checkRateLimit(ip, 'updateAnnouncement', 10, 60000)) return error('操作过于频繁', 429);
    const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
    if (!row) return error('公告不存在', 404);
    if (user.name !== row.created_by && !isAdmin(user)) return error('无权编辑此公告', 403);
    const body = await parseBody(request);
    if (!body) return error('请求格式错误');
    const { title, content, image_urls } = body;
    if (!title || !content) return error('标题和内容不能为空');
    if (title.length > 200) return error('标题不能超过200字');
    if (content.length > 5000) return error('内容不能超过5000字');
    await env.DB.prepare(
      "UPDATE announcements SET title = ?, content = ?, status = '待审核', reviewed_by = '', reviewed_at = NULL, reject_reason = '' WHERE id = ?"
    ).bind(title, content, id).run();
    if (image_urls !== undefined) {
      await replaceAnnounceImages(env, Number(id), Array.isArray(image_urls) ? image_urls : []);
    }
    const updated = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
    await attachAnnounceImages(env, [updated]);
    return json(updated);
  } catch {
    return error('编辑公告失败', 500);
  }
}

export async function handleReviewAnnouncement(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'reviewAnnouncement', 20, 60000)) return error('操作过于频繁', 429);
  const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
  if (!row) return error('公告不存在', 404);
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { status, reject_reason } = body;
  if (!['已通过', '已拒绝'].includes(status)) return error('状态必须为已通过或已拒绝');
  if (status === '已拒绝' && !reject_reason) return error('拒绝时请填写理由');
  if (reject_reason && reject_reason.length > 500) return error('拒绝理由不能超过500字');
  await env.DB.prepare(
    "UPDATE announcements SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), reject_reason = ? WHERE id = ?"
  ).bind(status, user.name, reject_reason || '', id).run();
  if (status === '已通过') {
    const ann = await env.DB.prepare('SELECT title FROM announcements WHERE id = ?').bind(id).first();
    try { await insertChatSystemMessage(env, { action: '公告已通过', from_dept: user.department || user.name || '', to_dept: '', title: ann?.title || '', status: '已通过', ref_type: 'announcement', ref_id: Number(id) }); } catch {}
    // 通知公告作者审核通过
    const authorId = await getUserIdByName(env, row.created_by);
    if (authorId) {
      try { await createNotification(env, authorId, 'review_result', '公告已通过', `您的公告「${row.title}」已审核通过。`, `announcements.html`, 'check-circle'); } catch {}
    }
    // 全员通知新公告
    try {
      const users = await env.DB.prepare("SELECT id FROM users WHERE role IN ('member','admin','owner','teacher')").all();
      const userIds = users.results.map(u => u.id);
      await createNotificationBatch(env, userIds, 'announcement', '新公告', row.title, `announcements.html`, 'megaphone');
    } catch {}
  } else {
    // 拒绝时通知作者
    const authorId = await getUserIdByName(env, row.created_by);
    if (authorId) {
      try { await createNotification(env, authorId, 'review_result', '公告未通过', `您的公告「${row.title}」未通过审核。原因：${reject_reason || '未提供'}`, `announcements.html`, 'x-circle'); } catch {}
    }
  }
  return json({ message: `审核结果: ${status === '已通过' ? '已通过' : '已拒绝'}` });
}

export async function handleAddAnnouncementImage(request, env, id, user) {
  try {
    if (!user) return error('请先登录', 401);
    const ip = getClientIP(request);
    if (!checkRateLimit(ip, 'addAnnouncementImage', 10, 60000)) return error('操作过于频繁', 429);
    const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
    if (!row) return error('公告不存在', 404);
    if (user.name !== row.created_by && !isAdmin(user)) return error('无权修改此公告', 403);
    const body = await parseBody(request);
    if (!body || !body.image_url) return error('请提供图片');
    if (typeof body.image_url !== 'string' || body.image_url.length > 1000000 || !isValidImageUrl(body.image_url)) return error('图片数据异常');
    const maxSort = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS mx FROM announcement_images WHERE announcement_id = ?').bind(id).first();
    const nextSort = (maxSort?.mx ?? -1) + 1;
    await env.DB.prepare('INSERT INTO announcement_images (announcement_id, image_url, sort_order) VALUES (?, ?, ?)').bind(id, body.image_url, nextSort).run();
    const updated = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
    await attachAnnounceImages(env, [updated]);
    return json(updated);
  } catch {
    return error('图片上传失败', 500);
  }
}
