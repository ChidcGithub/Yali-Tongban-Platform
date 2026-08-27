import { rateLimit, json, error, parseBody, verifyCaptcha } from './_utils.js';

export async function handleCreateFeedback(request, env) {
  const rl = rateLimit(request, 'feedback', 5, 60000, '提交过于频繁，请稍后再试');
  if (rl) return rl;
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { content, contact, page, section, version, captcha_token, captcha_code } = body;
  if (!content || content.length < 1 || content.length > 2000) return error('反馈内容为1-2000字');
  if (contact && contact.length > 100) return error('联系方式不能超过100字');
  if (!captcha_token) return error('请完成人机验证', 400);
  if (!await verifyCaptcha(captcha_token, captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
  await env.DB.prepare(
    'INSERT INTO feedback (content, contact, page, section, version, turnstile_bypass) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(content, contact || '', page || '', section || '', version || '', 0).run();
  return json({ message: '反馈已发送，感谢你的意见' }, 201);
}

export async function handleGetFeedback(env) {
  const rows = await env.DB.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200').all();
  return json(rows.results);
}

export async function handleDeleteFeedback(env, id) {
  const r = await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) return error('反馈不存在', 404);
  return json({ message: '反馈已删除' });
}
