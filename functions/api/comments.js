import { rateLimit, json, error, parseBody, isAdmin, createNotification, getUserIdByName } from './_utils.js';

export async function handleGetComments(env, type, id) {
  if (!['announcement', 'issue'].includes(type)) return error('无效的类型');
  const rows = await env.DB.prepare(
    'SELECT * FROM comments WHERE target_type = ? AND target_id = ? ORDER BY created_at ASC'
  ).bind(type, Number(id)).all();
  return json(rows.results);
}

export async function handleCreateComment(request, env, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'comment', 10, 60000, '评论过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { target_type, target_id, content } = body;
  if (!['announcement', 'issue'].includes(target_type)) return error('无效的类型');
  if (!target_id) return error('目标ID不能为空');
  if (!content || content.length < 1 || content.length > 500) return error('评论内容为1-500字');
  const r = await env.DB.prepare(
    'INSERT INTO comments (target_type, target_id, content, created_by) VALUES (?, ?, ?, ?)'
  ).bind(target_type, Number(target_id), content, user.name).run();
  const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(r.meta.last_row_id).first();
  // 通知原内容作者（公告作者 / 问题提交者）
  try {
    let authorName = '';
    if (target_type === 'announcement') {
      const ann = await env.DB.prepare('SELECT title, created_by FROM announcements WHERE id = ?').bind(Number(target_id)).first();
      authorName = ann?.created_by || '';
      if (authorName && authorName !== user.name) {
        const authorId = await getUserIdByName(env, authorName);
        if (authorId) {
          await createNotification(env, authorId, 'comment_reply', '收到新评论', `${user.name} 评论了您的公告「${ann?.title || ''}」`, `announcements.html`, 'message-square');
        }
      }
    } else if (target_type === 'issue') {
      const issue = await env.DB.prepare('SELECT location, submitted_by FROM issues WHERE id = ?').bind(Number(target_id)).first();
      authorName = issue?.submitted_by || '';
      if (authorName && authorName !== user.name) {
        const authorId = await getUserIdByName(env, authorName);
        if (authorId) {
          await createNotification(env, authorId, 'comment_reply', '收到新评论', `${user.name} 评论了您的报修「${issue?.location || ''}」`, `issues.html`, 'message-square');
        }
      }
    }
  } catch {}
  return json(row, 201);
}

export async function handleUpdateComment(request, env, id, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'updateComment', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(Number(id)).first();
  if (!comment) return error('评论不存在', 404);
  if (user.name !== comment.created_by) return error('无权编辑此评论', 403);
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { content } = body;
  if (!content || content.length < 1 || content.length > 500) return error('评论内容为1-500字');
  await env.DB.prepare("UPDATE comments SET content = ? WHERE id = ?").bind(content, Number(id)).run();
  const updated = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(Number(id)).first();
  return json(updated);
}

export async function handleDeleteComment(request, env, id, user) {
  if (!user) return error('请先登录', 401);
  const rl = rateLimit(request, 'deleteComment', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(Number(id)).first();
  if (!comment) return error('评论不存在', 404);
  if (user.name !== comment.created_by && !isAdmin(user)) return error('无权删除此评论', 403);
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(Number(id)).run();
  return json({ message: '评论已删除' });
}
