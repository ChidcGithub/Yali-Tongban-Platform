import { rateLimit, json, error, parseBody, verifyCaptcha, isValidImageUrl, isAdmin, insertChatSystemMessage, createNotification, getUserIdByName } from './_utils.js';

// 列表瘦身：不返回 image_url 全文（单张可达数 MB），只返回 has_image 标记，
// 图片走 /api/issues/images?ids= 批量按需取。与 announcements / finance 的做法一致。
//
// 字段可见性：
// - 未登录：不含 submitted_by / contact
// - 已登录成员：只多给 submitted_by（页面上本来就展示「提交人」）
// - 联系方式 contact 属个人信息，仅管理员可见
const BASE_COLS = `issues.id, issues.location, issues.status, issues.description, issues.notes,
              issues.created_at, issues.updated_by, issues.updated_at`;
const HAS_IMAGE_COL = `CASE WHEN issues.image_url IS NOT NULL AND issues.image_url != '' THEN 1 ELSE 0 END AS has_image,
              COALESCE(c.cnt, 0) AS comment_count`;
const ISSUE_JOIN = `FROM issues
       LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM comments WHERE target_type = 'issue' GROUP BY target_id) c ON issues.id = c.target_id
       ORDER BY issues.created_at DESC LIMIT 200`;

export async function handleGetIssues(env, user) {
  let cols = BASE_COLS;
  if (user && isAdmin(user)) cols += ', issues.submitted_by, issues.contact';
  else if (user) cols += ', issues.submitted_by';
  const rows = await env.DB.prepare(
    `SELECT ${cols}, ${HAS_IMAGE_COL} ${ISSUE_JOIN}`
  ).all();
  return json(rows.results);
}

// 批量取报修图片（与列表同可见性：报修列表本就对外公开）
export async function handleGetIssueImages(env, idsStr) {
  try {
    const ids = [...new Set(String(idsStr || '').split(',').map(s => Number(String(s).trim())).filter(n => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return error('缺少报修 id');
    if (ids.length > 50) return error('一次最多查询 50 条报修的图片');
    const ph = ids.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT id, image_url FROM issues WHERE id IN (${ph})`).bind(...ids).all();
    const map = {};
    for (const r of rows.results) if (r.image_url) map[r.id] = r.image_url;
    return json(map);
  } catch {
    return error('获取图片失败', 500);
  }
}

export async function handleCreateIssue(request, env) {
  const rl = rateLimit(request, 'issue', 10, 60000, '提交过于频繁，请稍后再试');
  if (rl) return rl;

  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { location, description, contact, notes, submitted_by, captcha_token, captcha_code, image_url } = body;
  if (!location || !description) return error('地点和报修问题不能为空');
  if (location.length > 200) return error('地点不能超过200字');
  if (description.length > 2000) return error('问题描述不能超过2000字');
  if (contact && contact.length > 100) return error('联系方式不能超过100字');
  if (submitted_by && submitted_by.length > 50) return error('姓名不能超过50字');
  if (notes && notes.length > 50) return error('备注不能超过50字');
  if (image_url && image_url.length > 2000000) return error('图片过大');
  if (image_url && !isValidImageUrl(image_url)) return error('无效图片格式');
  if (!captcha_token) return error('请完成人机验证', 400);
  if (!await verifyCaptcha(captcha_token, captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
  const r = await env.DB.prepare(
    'INSERT INTO issues (location, description, status, submitted_by, contact, notes, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(location, description, '待处理', submitted_by || '访客', contact || '', notes || '', image_url || '').run();
  const row = await env.DB.prepare('SELECT * FROM issues WHERE id = ?').bind(r.meta.last_row_id).first();
  try { await insertChatSystemMessage(env, { action: '提交报修', from_dept: '', to_dept: '', title: row.location, status: '待处理', ref_type: 'issue', ref_id: row.id }); } catch {}
  return json(row, 201);
}

export async function handleUpdateIssueStatus(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const rl = rateLimit(request, 'updateIssueStatus', 20, 60000, '操作过于频繁');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { status } = body;
  if (!['待处理', '处理中', '已完成'].includes(status)) return error('无效状态');
  await env.DB.prepare(
    "UPDATE issues SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, user.name, id).run();
  const issue = await env.DB.prepare('SELECT location, submitted_by FROM issues WHERE id = ?').bind(id).first();
  if (status === '处理中' || status === '已完成') {
    const action = status === '处理中' ? '报修已处理' : '报修已完成';
    try { await insertChatSystemMessage(env, { action, from_dept: user.department || user.name || '', to_dept: '', title: issue?.location || '', status, ref_type: 'issue', ref_id: Number(id) }); } catch {}
  }
  // 通知提交者状态变更
  if (issue?.submitted_by) {
    const submitterId = await getUserIdByName(env, issue.submitted_by);
    if (submitterId) {
      const statusText = status === '处理中' ? '正在处理' : status === '已完成' ? '已完成' : status;
      try { await createNotification(env, submitterId, 'issue_status', '报修状态更新', `您提交的报修「${issue.location}」状态变更为：${statusText}。`, `issues.html`, 'wrench'); } catch {}
    }
  }
  return json({ message: '状态已更新' });
}

export async function handleDeleteIssue(request, env, id, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const rl = rateLimit(request, 'deleteIssue', 10, 60000, '操作过于频繁');
  if (rl) return rl;
  await env.DB.prepare("DELETE FROM comments WHERE target_type = 'issue' AND target_id = ?").bind(Number(id)).run();
  await env.DB.prepare('DELETE FROM issues WHERE id = ?').bind(id).run();
  return json({ message: '问题已删除' });
}
