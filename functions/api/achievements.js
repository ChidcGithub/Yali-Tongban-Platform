import { json, error, safeParse, parseBody, signTokenForUser, respondWithToken, addAchievementBatchEntry } from './_utils.js';

const ACH_DEFS = ['read_all_changelog', 'color_freak', 'night_owl', 'early_bird', 'high_five', 'collector', 'chatty', 'commenter', 'proposer', 'time_traveler', 'intruder', 'reset_master', 'locked_out', 'reader', 'power', 'extrovert', 'introvert', 'lightning', 'archaeologist', 'ocd', 'night_owl2', 'novice', 'pigeon', 'dev', 'easter_egg', 'screenshot', 'frequent_404', 'attendance', 'moonlight', 'anniversary', 'super_graphic', 'cookie_monster', 'feedback_first', 'feedback_tenth', 'green_bubble'];

// 计数型成就仅能通过 handleCheckCounts 自动解锁，禁止客户端手动解锁
const COUNT_BASED = ['chatty', 'commenter', 'proposer', 'extrovert'];
const MANUAL_UNLOCKABLE = ACH_DEFS.filter(id => !COUNT_BASED.includes(id));

export async function handleUnlockAchievement(request, env, user) {
  if (!user) return error('需要登录', 401);
  const body = await parseBody(request);
  if (!body || !body.id) return error('缺少成就ID', 400);
  if (!MANUAL_UNLOCKABLE.includes(body.id)) return error('该成就无法手动解锁', 400);
  const row = await env.DB.prepare('SELECT achievements FROM users WHERE id = ?').bind(user.userId).first();
  const current = (() => { try { return JSON.parse((row?.achievements) || '[]'); } catch { return []; } })();
  if (current.includes(body.id)) return json({ achievements: current, already: true });
  current.push(body.id);
  const jsonStr = JSON.stringify(current);
  await env.DB.prepare('UPDATE users SET achievements = ? WHERE id = ?').bind(jsonStr, user.userId).run();
  try { await addAchievementBatchEntry(env, user.name, body.id); } catch {}
  const token = await signTokenForUser(user.userId, env);
  return respondWithToken({ achievements: current, token }, token);
}

export async function handleCheckCounts(request, env, user) {
  if (!user) return error('需要登录', 401);
  const row = await env.DB.prepare('SELECT achievements FROM users WHERE id = ?').bind(user.userId).first();
  const current = (() => { try { return JSON.parse((row?.achievements) || '[]'); } catch { return []; } })();
  const unlocked = [];
  const chatRow = await env.DB.prepare('SELECT COUNT(*) c FROM chat_messages WHERE user_id = ?').bind(user.userId).first();
  if (chatRow && Number(chatRow.c) >= 50 && !current.includes('chatty')) { current.push('chatty'); unlocked.push('chatty'); }
  if (chatRow && Number(chatRow.c) >= 100 && !current.includes('extrovert')) { current.push('extrovert'); unlocked.push('extrovert'); }
  const commentRow = await env.DB.prepare("SELECT COUNT(*) c FROM comments WHERE created_by = ?").bind(user.name).first();
  const issueRow = await env.DB.prepare('SELECT COUNT(*) c FROM issues WHERE submitted_by = ?').bind(user.name).first();
  const commentCount = Number(commentRow?.c || 0) + Number(issueRow?.c || 0);
  if (commentCount >= 10 && !current.includes('commenter')) { current.push('commenter'); unlocked.push('commenter'); }
  if (Number(issueRow?.c || 0) >= 5 && !current.includes('proposer')) { current.push('proposer'); unlocked.push('proposer'); }
  if (unlocked.length) {
    const jsonStr = JSON.stringify(current);
    await env.DB.prepare('UPDATE users SET achievements = ? WHERE id = ?').bind(jsonStr, user.userId).run();
    for (const achId of unlocked) { try { await addAchievementBatchEntry(env, user.name, achId); } catch {} }
    const token = await signTokenForUser(user.userId, env);
    return respondWithToken({ achievements: current, token, unlocked }, token);
  }
  return json({ achievements: current, unlocked: [] });
}
