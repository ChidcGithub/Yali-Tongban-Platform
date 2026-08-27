import { json, error, safeParse, checkRateLimit, parseBody, getClientIP, isValidClass, isAdmin, getUserFromRequest, insertChatSystemMessage, verifyCaptcha } from './_utils.js';

export async function handleGetPolls(env) {
  const rows = await env.DB.prepare('SELECT * FROM polls ORDER BY created_at DESC LIMIT 200').all();
  return json(rows.results);
}

export async function handleGetPoll(env, id) {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  const questions = await env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(Number(id)).all();
  poll.questions = questions.results.map(q => ({ ...q, options: safeParse(q.options || '[]', []) }));
  if (poll.allowed_classes) poll.allowed_classes = safeParse(poll.allowed_classes);
  return json(poll);
}

export async function handleCreatePoll(request, env, user) {
  if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'createPoll', 10, 60000)) return error('提交过于频繁', 429);
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { title, description, require_name, min_role, allowed_classes, questions } = body;
  if (!title || title.length > 200) return error('标题字数在1-200之间');
  if (!questions || !Array.isArray(questions) || questions.length === 0) return error('至少需要一个题目');
  const allowedClasses = allowed_classes && Array.isArray(allowed_classes) ? allowed_classes.filter(c => isValidClass(c)) : [];
  const r = await env.DB.prepare(
    'INSERT INTO polls (title, description, require_name, min_role, allowed_classes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(title, description || '', require_name ? 1 : 0, min_role || null, JSON.stringify(allowedClasses), user.name).run();
  const pollId = r.meta.last_row_id;
  const qStmts = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.title || q.title.length > 500) return error('题目内容字数需在1-500之间');
    if (!['single', 'multiple', 'text'].includes(q.type)) return error('题目类型无效');
    if ((q.type === 'single' || q.type === 'multiple') && (!q.options || !Array.isArray(q.options) || q.options.length < 2)) return error('选择题至少需要2个选项');
    if ((q.type === 'single' || q.type === 'multiple') && q.options.length > 26) return error('选择题最多26个选项');
    const options = q.type === 'text' ? '[]' : JSON.stringify(q.options || []);
    if (q.image_url && q.image_url.length > 2000000) return error('图片过大');
    let maxLength = 1000;
    if (q.type === 'text') {
      maxLength = Math.min(Math.max(q.max_length || 1000, 1), 10000);
    }
    qStmts.push(env.DB.prepare(
      'INSERT INTO poll_questions (poll_id, type, title, options, image_url, sort_order, max_length) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(pollId, q.type, q.title, options, q.image_url || '', i, maxLength));
  }
  if (qStmts.length > 0) await env.DB.batch(qStmts);
  try { await insertChatSystemMessage(env, { action: '发起投票', from_dept: user.department || user.name || '', to_dept: '', title: title, status: 'open', ref_type: 'poll', ref_id: pollId }); } catch {}
  return json({ id: pollId, message: '投票已创建' }, 201);
}

export async function handleVotePoll(request, env, id) {
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'vote', 3, 3600000)) return error('投票过于频繁，每小时最多提交3次', 429);
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  if (poll.status !== 'open') return error('投票已结束', 400);
  const user = await getUserFromRequest(request, env);
  if (poll.min_role) {
    const roleWeight = { member: 2, admin: 3, owner: 4 };
    const userWeight = user ? (roleWeight[user.role] || 0) : 0;
    const minWeight = roleWeight[poll.min_role] || 0;
    if (userWeight < minWeight) return error('您没有权限参与此投票', 403);
  }
  if (poll.allowed_classes) {
    const allowed = safeParse(poll.allowed_classes, []);
    if (Array.isArray(allowed) && allowed.length > 0) {
      if (!user || !user.class_name || !allowed.includes(user.class_name)) return error('您的班级不在本次投票范围内', 403);
    }
  }
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { answers, voter_name, turnstile_token } = body;
  if (!body.captcha_token) return error('请完成人机验证', 400);
  if (!await verifyCaptcha(body.captcha_token, body.captcha_code, env)) return error('人机验证失败，请刷新后重试', 403);
  const questions = await env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(Number(id)).all();
  const questionsMap = {};
  questions.results.forEach(q => { questionsMap[q.id] = q; });
  for (const ans of answers) {
    const q = questionsMap[ans.question_id];
    if (!q) return error('题目不存在');
    if (q.type === 'single') {
      const opts = safeParse(q.options || '[]', []);
      if (typeof ans.answer !== 'number' || ans.answer < 0 || ans.answer >= opts.length) return error('选项无效');
    } else if (q.type === 'multiple') {
      const opts = safeParse(q.options || '[]', []);
      if (!Array.isArray(ans.answer) || ans.answer.length === 0) return error('多选题至少选一个');
      for (const idx of ans.answer) {
        if (typeof idx !== 'number' || idx < 0 || idx >= opts.length) return error('选项无效');
      }
    } else if (q.type === 'text') {
      const maxLen = q.max_length || 1000;
      if (!ans.answer || typeof ans.answer !== 'string' || ans.answer.length > maxLen) return error(`主观题回答字数超过限制（最多${maxLen}字）`);
    }
  }

  const clientIp = getClientIP(request);
  let vn = '';
  if (user) {
    const existing = await env.DB.prepare('SELECT id FROM poll_responses WHERE poll_id = ? AND user_id = ? LIMIT 1').bind(Number(id), user.userId).first();
    if (existing) return error('您已参与过此投票', 400);
    vn = user.name;
  } else {
    const existing = await env.DB.prepare("SELECT id FROM poll_responses WHERE poll_id = ? AND ip = ? AND user_id IS NULL LIMIT 1").bind(Number(id), clientIp).first();
    if (existing) return error('您已参与过此投票', 400);
    if (poll.require_name) vn = voter_name || '匿名';
  }
  const resp = await env.DB.prepare(
    'INSERT INTO poll_responses (poll_id, user_id, voter_name, ip) VALUES (?, ?, ?, ?)'
  ).bind(Number(id), user ? user.userId : null, vn, clientIp).run();
  const responseId = resp.meta.last_row_id;
  const aStmts = [];
  for (const ans of answers) {
    aStmts.push(env.DB.prepare(
      'INSERT INTO poll_answers (response_id, question_id, answer) VALUES (?, ?, ?)'
    ).bind(responseId, ans.question_id, JSON.stringify(ans.answer)));
  }
  if (aStmts.length > 0) await env.DB.batch(aStmts);
  await env.DB.prepare('UPDATE polls SET total_votes = total_votes + 1 WHERE id = ?').bind(Number(id)).run();
  return json({ message: '投票成功' }, 201);
}

export async function handleGetPollResults(env, id, user) {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  if (!user || (user.name !== poll.created_by && !isAdmin(user))) return error('无权查看结果', 403);
  const [questions, responses, answers] = await Promise.all([
    env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(Number(id)).all(),
    env.DB.prepare('SELECT * FROM poll_responses WHERE poll_id = ? ORDER BY created_at ASC').bind(Number(id)).all(),
    env.DB.prepare(`SELECT pa.* FROM poll_answers pa JOIN poll_responses pr ON pa.response_id = pr.id WHERE pr.poll_id = ? ORDER BY pa.id ASC`).bind(Number(id)).all(),
  ]);
  const qResults = [];
  const answersByQ = {};
  for (const a of answers.results) {
    (answersByQ[a.question_id] || (answersByQ[a.question_id] = [])).push(safeParse(a.answer));
  }
  for (const q of questions.results) {
    const qAnswers = answersByQ[q.id] || [];
    const opts = safeParse(q.options || '[]', []);
    let result;
    if (q.type === 'single') {
      const counts = new Array(opts.length).fill(0);
      for (const a of qAnswers) { if (typeof a === 'number' && a >= 0 && a < opts.length) counts[a]++; }
      result = { type: 'single', options: opts, counts, total: qAnswers.length };
    } else if (q.type === 'multiple') {
      const counts = new Array(opts.length).fill(0);
      for (const arr of qAnswers) { if (Array.isArray(arr)) for (const idx of arr) { if (typeof idx === 'number' && idx >= 0 && idx < opts.length) counts[idx]++; } }
      result = { type: 'multiple', options: opts, counts, total: qAnswers.length };
    } else {
      result = { type: 'text', answers: qAnswers.map(a => String(a)) };
    }
    qResults.push({ id: q.id, title: q.title, type: q.type, image_url: q.image_url, result });
  }
  return json({ poll: { ...poll, allowed_classes: poll.allowed_classes ? safeParse(poll.allowed_classes, []) : undefined }, questions: questions.results.map(q => ({ ...q, options: safeParse(q.options || '[]', []) })), responses: responses.results, questionResults: qResults });
}

export async function handleExportPollResults(env, id, user) {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  if (!user || (user.name !== poll.created_by && !isAdmin(user))) return error('无权导出', 403);
  const [questions, responses, answers] = await Promise.all([
    env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(Number(id)).all(),
    env.DB.prepare('SELECT * FROM poll_responses WHERE poll_id = ? ORDER BY created_at ASC').bind(Number(id)).all(),
    env.DB.prepare(`SELECT pa.* FROM poll_answers pa JOIN poll_responses pr ON pa.response_id = pr.id WHERE pr.poll_id = ? ORDER BY pa.id ASC`).bind(Number(id)).all(),
  ]);
  const headerRow = ['序号', '投票人', '投票时间'];
  for (const q of questions.results) headerRow.push(q.title);
  const answersByKey = {};
  for (const a of answers.results) {
    answersByKey[a.response_id + ':' + a.question_id] = a;
  }
  const rows = responses.results.map((resp, idx) => {
    const row = [String(idx + 1), resp.voter_name || '匿名', resp.created_at];
    for (const q of questions.results) {
      const a = answersByKey[resp.id + ':' + q.id];
      if (!a) { row.push(''); continue; }
      const val = safeParse(a.answer);
      const opts = safeParse(q.options || '[]', []);
      if (q.type === 'single') row.push(opts[val] || String(val));
      else if (q.type === 'multiple') row.push(Array.isArray(val) ? val.map(v => opts[v]).join('; ') : '');
      else row.push(String(val));
    }
    return row.map(v => {
      let s = String(v || '');
      if (/^[=+\-@\t]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    }).join(',');
  });
  const csv = '\uFEFF' + headerRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n' + rows.join('\n');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="poll_${id}_results.csv"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "frame-ancestors 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:;",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-cache',
    },
  });
}

export async function handleDeletePoll(request, env, id, user) {
  if (!user) return error('请先登录', 401);
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, 'deletePoll', 10, 60000)) return error('操作过于频繁', 429);
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  if (user.name !== poll.created_by && !isAdmin(user)) return error('无权删除此投票', 403);
  await env.DB.prepare('DELETE FROM poll_answers WHERE response_id IN (SELECT id FROM poll_responses WHERE poll_id = ?)').bind(Number(id)).run();
  await env.DB.prepare('DELETE FROM poll_responses WHERE poll_id = ?').bind(Number(id)).run();
  await env.DB.prepare('DELETE FROM poll_questions WHERE poll_id = ?').bind(Number(id)).run();
  await env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(Number(id)).run();
  return json({ message: '投票已删除' });
}

export async function handleGetMyVote(env, id, request) {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(Number(id)).first();
  if (!poll) return error('投票不存在', 404);
  const user = await getUserFromRequest(request, env);
  let response;
  if (user) {
    response = await env.DB.prepare('SELECT * FROM poll_responses WHERE poll_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').bind(Number(id), user.userId).first();
  } else {
    const ip = getClientIP(request);
    response = await env.DB.prepare("SELECT * FROM poll_responses WHERE poll_id = ? AND ip = ? AND user_id IS NULL ORDER BY created_at DESC LIMIT 1").bind(Number(id), ip).first();
  }
  if (!response) return json({ voted: false });
  const answers = await env.DB.prepare('SELECT * FROM poll_answers WHERE response_id = ? ORDER BY id ASC').bind(response.id).all();
  return json({ voted: true, response, answers: answers.results.map(a => ({ ...a, answer: safeParse(a.answer) })) });
}
