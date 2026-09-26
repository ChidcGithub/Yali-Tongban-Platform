import { rateLimit, json, error, parseBody, isAdmin, createNotification, getUserIdByName } from './_utils.js';

/**
 * 允许挂评论/备注的目标类型。
 *
 * `issue_note` 是「报修处理备注」——与 issue 的评论共用这张表，
 * 但语义不同：评论是讨论（折叠区里），备注是处理说明（列表上醒目展示，
 * 提交者与解决者都要能追加）。这样就不用为备注单开一张表、也不用做线上迁移。
 */
const COMMENT_TYPES = ['announcement', 'issue', 'issue_note'];

export async function handleGetComments(env, type, id, user) {
  if (!COMMENT_TYPES.includes(type)) return error('无效的类型');
  if (type === 'issue_note' && !isAdmin(user)) {
    if (!user) return error('需要登录', 401);
    const issue = await env.DB.prepare('SELECT submitted_by FROM issues WHERE id = ?').bind(Number(id)).first();
    if (!issue) return error('报修不存在', 404);
    if (!issue.submitted_by || issue.submitted_by !== user.name) return error('无权查看此备注', 403);
  }
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
  if (!COMMENT_TYPES.includes(target_type)) return error('无效的类型');
  if (!target_id) return error('目标ID不能为空');
  if (!content || content.length < 1 || content.length > 500) return error('评论内容为1-500字');
  /* 报修备注：只有**提交者本人**与**解决者（管理员）**能追加。
     注意 submitted_by 存的是姓名而不是 id（项目既有口径），
     所以这里是姓名比对 —— 与站点其它地方一致，同名冒充的窗口与既有实现相同。 */
  let noteIssue = null;
  if (target_type === 'issue_note') {
    noteIssue = await env.DB.prepare('SELECT location, submitted_by, updated_by FROM issues WHERE id = ?')
      .bind(Number(target_id))
      .first();
    if (!noteIssue) return error('报修不存在', 404);
    const isSubmitter = !!noteIssue.submitted_by && noteIssue.submitted_by === user.name;
    if (!isSubmitter && !isAdmin(user)) return error('只有提交者或管理员可以添加备注', 403);
  }

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
    } else if (target_type === 'issue_note') {
      /* 对方视角的通知：解决者写备注 → 提交者收到；提交者写备注 → 处理人收到 */
      const isAdminNote = isAdmin(user);
      const target = isAdminNote ? noteIssue?.submitted_by : noteIssue?.updated_by;
      if (target && target !== user.name) {
        const targetId = await getUserIdByName(env, target);
        if (targetId) {
          await createNotification(
            env,
            targetId,
            'issue_note',
            isAdminNote ? '报修有新备注' : '提交者补充了备注',
            `${user.name} 在报修「${noteIssue?.location || ''}」下添加了备注。`,
            'issues.html',
            'wrench'
          );
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
