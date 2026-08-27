import { json, error, computeHash, safeParse, parseBody, getUserFromRequest, isAdmin, getBannerData, attachAnnounceImages, getStorageStats } from './_utils.js';

export async function handleSync(request, env) {
  const body = await parseBody(request);
  if (!body) return error('请求格式错误');
  const { pages } = body;
  if (!pages || typeof pages !== 'object') return error('缺少 pages');

  const user = await getUserFromRequest(request, env);
  const result = {};
  const ops = [];

  for (const [key, hash] of Object.entries(pages)) {
    ops.push((async () => {
      let data;
      try {
        switch (key) {
          case '/api/announcements': {
            const rows = await env.DB.prepare("SELECT * FROM announcements WHERE status IS NULL OR status != ? ORDER BY created_at DESC").bind('已拒绝').all();
            await attachAnnounceImages(env, rows.results);
            data = rows.results;
            break;
          }
          case '/api/banner': {
            data = await getBannerData(env);
            break;
          }
          case '/api/issues': {
            if (!user) return;
            const rows = await env.DB.prepare(`
              SELECT issues.*, COALESCE(c.cnt, 0) AS comment_count
              FROM issues
              LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM comments WHERE target_type = 'issue' GROUP BY target_id) c ON issues.id = c.target_id
              ORDER BY issues.created_at DESC
            `).all();
            data = rows.results;
            break;
          }
          case '/api/finance': {
            if (!user) return;
            let fSql = 'SELECT * FROM finance';
            const fParams = [];
            if (user && !isAdmin(user) && user.department) {
              fSql += ' WHERE department = ?';
              fParams.push(user.department);
            }
            fSql += ' ORDER BY created_at DESC LIMIT 200';
            const fRows = await env.DB.prepare(fSql).bind(...fParams).all();
            data = fRows.results;
            break;
          }
          case '/api/reviews': {
            if (!user) return;
            const rows = await env.DB.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200').all();
            data = rows.results;
            break;
          }
          case '/api/polls': {
            if (!user) return;
            const rows = await env.DB.prepare('SELECT * FROM polls ORDER BY created_at DESC LIMIT 200').all();
            data = rows.results;
            break;
          }
          case '/api/admin/members': {
            if (!user || !isAdmin(user)) return;
            const rows = await env.DB.prepare("SELECT id, name, role, class_name, department FROM users WHERE role IN ('member', 'admin', 'owner', 'teacher') ORDER BY role DESC, name ASC").all();
            data = rows.results;
            break;
          }
          case '/api/admin/registrations': {
            if (!user || !isAdmin(user)) return;
            const rows = await env.DB.prepare("SELECT id, name, class_name, department, created_at FROM users WHERE role = 'pending' ORDER BY created_at ASC").all();
            data = rows.results;
            break;
          }
          case '/api/admin/storage': {
            if (!user || !isAdmin(user)) return;
            data = await getStorageStats(env);
            break;
          }
          case '/api/settings': {
            try {
              const rows = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('site_closed', 'site_closed_message')").all();
              const s = {};
              rows.results.forEach(r => { s[r.key] = r.value; });
              data = { site_closed: s.site_closed === 'true', site_closed_message: s.site_closed_message || '' };
            } catch { data = { site_closed: false, site_closed_message: '' }; }
            break;
          }
          case '/api/admin/settings': {
            if (!user || !isAdmin(user)) return;
            try {
              const rows = await env.DB.prepare('SELECT * FROM settings').all();
              const s = {};
              rows.results.forEach(r => { s[r.key] = r.value; });
              data = s;
            } catch { data = {}; }
            break;
          }
          default: {
            const announceCommentMatch = key.match(/^\/api\/comments\/announcement\/(\d+)$/);
            const issueCommentMatch = key.match(/^\/api\/comments\/issue\/(\d+)$/);
            const pollResultsMatch = key.match(/^\/api\/polls\/(\d+)\/results$/);
            const pollDetailMatch = key.match(/^\/api\/polls\/(\d+)$/);
            if (pollResultsMatch) {
              const pid = Number(pollResultsMatch[1]);
              const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pid).first();
              if (!poll) { data = null; return; }
              if (!user || (user.name !== poll.created_by && !isAdmin(user))) { return; }
              const [questions, responses, answers] = await Promise.all([
                env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(pid).all(),
                env.DB.prepare('SELECT * FROM poll_responses WHERE poll_id = ? ORDER BY created_at ASC').bind(pid).all(),
                env.DB.prepare('SELECT pa.* FROM poll_answers pa JOIN poll_responses pr ON pa.response_id = pr.id WHERE pr.poll_id = ?').bind(pid).all(),
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
              data = { poll: { ...poll, allowed_classes: poll.allowed_classes ? safeParse(poll.allowed_classes) : undefined }, questions: questions.results.map(q => ({ ...q, options: safeParse(q.options || '[]', []) })), responses: responses.results, questionResults: qResults };
            } else if (pollDetailMatch) {
              const pid = Number(pollDetailMatch[1]);
              const p = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pid).first();
              if (!p) { data = null; return; }
              const questions = await env.DB.prepare('SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY sort_order ASC').bind(pid).all();
              data = { ...p, questions: questions.results.map(q => ({ ...q, options: safeParse(q.options || '[]', []) })), allowed_classes: p.allowed_classes ? safeParse(p.allowed_classes) : undefined };
            } else if (announceCommentMatch) {
              const rows = await env.DB.prepare("SELECT * FROM comments WHERE target_type='announcement' AND target_id=? ORDER BY created_at ASC LIMIT 200").bind(Number(announceCommentMatch[1])).all();
              data = rows.results;
            } else if (issueCommentMatch) {
              const rows = await env.DB.prepare("SELECT * FROM comments WHERE target_type='issue' AND target_id=? ORDER BY created_at ASC LIMIT 200").bind(Number(issueCommentMatch[1])).all();
              data = rows.results;
            }
          }
        }
      } catch {}
      if (data !== undefined) {
        const newHash = await computeHash(data);
        result[key] = hash === newHash ? { changed: false } : { changed: true, data, hash: newHash };
      }
    })());
  }

  await Promise.all(ops);
  return json({ pages: result });
}
