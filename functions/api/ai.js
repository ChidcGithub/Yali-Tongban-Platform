/**
 * AI 助手后端（仅登录用户可用）
 * ═════════════════════════════════════════════════════════
 * 能力：流式对话（SSE）+ 工具调用 ——
 *   ① query_database：只读查询站点数据库（SELECT 白名单，LIMIT 规范化，截断提示）
 *   ② web_search：联网搜索（可选，需 TAVILY_API_KEY，返回 answer 摘要 + 来源）
 *   ③ save_memory / forget_memory：长期记忆的存与删（去重、按 id 引用）
 *   ④ get_my_notifications：查当前用户自己的站内通知（固定绑定 user_id）
 * 记忆：每次对话自动把该用户最近的记忆（带 #id）注入 system prompt。
 * 引擎：同一轮的多个工具调用并行执行；同名同参数的重复调用熔断；
 *       SSE 每 15s 发心跳，防长工具/长思考期间前端空闲超时误杀。
 *
 * 供应商配置（Cloudflare 环境变量，二选一）：
 *   AI_API_KEY (+ AI_BASE_URL / AI_MODEL)  → OpenAI 兼容接口
 *     （默认 DeepSeek：api.deepseek.com + deepseek-flash，支持工具调用，
 *      价格极低且无免费额度依赖；也可换成智谱 / Moonshot 等任意
 *      OpenAI 兼容服务。DeepSeek 思考模式默认关（快），前端「深度思考」
 *      开关可开 —— 打开时带 tools 的多轮请求会回传 reasoning_content
 *      （DeepSeek 的 400 陷阱，已处理））
 *   或在 Pages 项目设置里绑定 Workers AI（env.AI），零密钥但无工具调用。
 *
 * 安全边界：
 *   - 数据库工具只允许 SELECT、白名单表、禁 password 字样、自动加 LIMIT ≤ 20
 *   - users 表整体不可查（含密码哈希）；当前用户信息走 system prompt 注入
 *   - 对话与记忆都按 user_id 隔离，只能读写自己的
 *   - 每用户每小时 40 条消息
 */
import { json, error, parseBody, checkRateLimit, isAdmin } from './_utils.js';

/* ── 表（沿用站点「运行时建表」的惯例，零迁移） ── */
async function ensureTables(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning TEXT, created_at TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_messages(user_id, id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_memories_user ON ai_memories(user_id, id)').run();
  // 旧库升级：补思考内容列（列已存在会抛 duplicate column → 忽略）
  try {
    await env.DB.prepare('ALTER TABLE ai_messages ADD COLUMN reasoning TEXT').run();
  } catch {}
}

/* ── 供应商配置 ── */
export function getAIConfig(env) {
  if (env.AI_API_KEY) {
    return {
      provider: 'openai',
      key: env.AI_API_KEY,
      baseUrl: String(env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
      model: env.AI_MODEL || 'deepseek-flash',
      tools: true,
      webSearch: Boolean(env.TAVILY_API_KEY)
    };
  }
  if (env.AI) {
    return {
      provider: 'workers-ai',
      model: env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      tools: false,
      webSearch: false
    };
  }
  return null;
}

export async function handleAIStatus(env) {
  const cfg = getAIConfig(env);
  if (!cfg) return json({ configured: false });
  return json({ configured: true, provider: cfg.provider, model: cfg.model, tools: cfg.tools, webSearch: cfg.webSearch });
}

/* ── 对话历史 ── */
export async function handleAIMessagesGet(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  const r = await env.DB.prepare(
    'SELECT id, role, content, created_at FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  )
    .bind(user.userId)
    .all();
  return json({ messages: (r.results || []).reverse() });
}

export async function handleAIMessagesClear(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  await env.DB.prepare('DELETE FROM ai_messages WHERE user_id = ?').bind(user.userId).run();
  return json({ message: '对话已清空' });
}

/* ── 记忆 ── */
export async function handleAIMemoriesGet(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  const r = await env.DB.prepare(
    'SELECT id, content, created_at FROM ai_memories WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  )
    .bind(user.userId)
    .all();
  return json({ memories: r.results || [] });
}

export async function handleAIMemoriesClear(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  await env.DB.prepare('DELETE FROM ai_memories WHERE user_id = ?').bind(user.userId).run();
  return json({ message: '记忆已清空' });
}

/* ═════════════════════════════════════════════════════════
   数据库工具：只读、白名单、自动 LIMIT
   ═════════════════════════════════════════════════════════ */
const AI_TABLES = new Set([
  'activities',
  'activity_volunteers',
  'announcements',
  'announcement_images',
  'comments',
  'polls',
  'poll_questions',
  'poll_responses',
  'poll_answers',
  'duty_schedule',
  'duty_attendance',
  'duty_score_record',
  'duty_period_config',
  'duty_staff', // 白名单内但禁查 password 列（下方关键字拦截）
  'finance',
  'issues',
  'feedback',
  'hall_bookings',
  'ai_memories'
]);

/** 给模型看的表结构摘要（刻意不含 users / notifications / 密码列）
 *  前置「说明 / 时间 / 常用关联」三行比单列字段更省轮次：模型最常错的
 *  就是 join 关系和时区，先讲清楚再列字段。 */
const SCHEMA_HINT = [
  '说明：users 与 notifications 表不可查（凭据与私信受保护；查自己的站内通知请用 get_my_notifications 工具）。',
  '时间：created_at 等自动时间字段是 UTC（比北京时间晚 8 小时，比较「今天」时留意）；duty_schedule.date、finance 业务日期是本地日期字符串（YYYY-MM-DD）。',
  '常用关联：duty_schedule.staff_a_id/staff_b_id → duty_staff.id（姓名只在 duty_staff）；duty_attendance.schedule_id → duty_schedule.id、duty_attendance.staff_id → duty_staff.id；duty_score_record.staff_id → duty_staff.id；activity_volunteers.activity_id → activities.id；poll_questions.poll_id → polls.id、poll_responses.poll_id → polls.id、poll_answers.response_id → poll_responses.id；comments.target_type（issue/announcement 等）+ target_id 指向对应表的 id。',
  'activities(id, name 名称, location 地点, time 时间, departments 面向部门, need_volunteers 是否需要志愿者, created_by 发布人, created_at)',
  'activity_volunteers(id, activity_id, member_name 报名者, department, created_at)',
  'announcements(id, title 标题, content 内容, status 状态, created_by 发布人, created_at)',
  'comments(id, target_type 目标类型, target_id 目标id, content, created_by, created_at)',
  'polls(id, title 标题, description, status 状态, total_votes 票数, created_by, created_at)',
  'poll_questions(id, poll_id, type 题型, title 题目, options 选项JSON)',
  'poll_responses(id, poll_id, voter_name 投票人, created_at)',
  'poll_answers(id, response_id, question_id, answer)',
  'duty_schedule(id, date 日期, staff_a_id 值日生A, staff_b_id 值日生B)',
  'duty_staff(id, name 姓名, department 部门, class 班级, is_active 在职)',
  'duty_attendance(id, schedule_id, staff_id, period 时段, sign_in_time 签到, sign_out_time 签退, duration_sec 时长秒, status)',
  'duty_score_record(id, staff_id, date, period, score 分数, reason 事由, is_cancelled)',
  'duty_period_config(id, label 时段名, slot_type, start_time)',
  'finance(id, type 收入/支出, amount 金额, status 待完成/已完成, notes 摘要, department 部门, fund_type, created_by, created_at)',
  'issues(id, location 地点, description 描述, status 状态, submitted_by 提交人, notes 备注, created_at)',
  'feedback(id, content 反馈内容, page 页面, created_at)',
  'hall_bookings(id, date, start_time, end_time, purpose 用途, applicant 申请人, status)',
  'ai_memories(id, user_id, content 记忆内容, created_at)'
].join('\n');

const QUERY_DEFAULT_ROWS = 20;
const QUERY_MAX_ROWS = 50;

async function toolQueryDatabase(env, sql) {
  const q = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!/^select\b/i.test(q)) return '拒绝执行：只允许 SELECT 查询';
  if (/;/.test(q)) return '拒绝执行：只允许单条语句';
  if (/\b(insert|update|delete|drop|alter|create|attach|pragma|vacuum|replace)\b/i.test(q)) {
    return '拒绝执行：包含写操作关键字';
  }
  if (/password|token|secret/i.test(q)) return '拒绝执行：包含凭据类关键字';
  const tables = [...q.matchAll(/(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  if (!tables.length) return '拒绝执行：没有可识别的目标表';
  for (const t of tables) {
    if (!AI_TABLES.has(t)) return `拒绝执行：表 ${t} 不在允许范围内`;
  }
  // LIMIT 规范化：缺省补 20；过大压到 50（一次拉太多既费 context 又没必要）
  let finalSql = q;
  let limit = QUERY_DEFAULT_ROWS;
  const limMatch = /\blimit\s+(\d+)/i.exec(q);
  if (limMatch) {
    limit = Math.min(parseInt(limMatch[1], 10) || QUERY_DEFAULT_ROWS, QUERY_MAX_ROWS);
    if (String(limit) !== limMatch[1]) finalSql = q.replace(limMatch[0], `LIMIT ${limit}`);
  } else {
    finalSql = `${q} LIMIT ${QUERY_DEFAULT_ROWS}`;
  }
  try {
    const r = await env.DB.prepare(finalSql).all();
    const rows = r.results || [];
    const out = JSON.stringify({
      rows,
      rowCount: rows.length,
      // 顶到上限 → 大概率没查全，明确告诉模型怎么继续，别让它以为就这些
      ...(limit > 0 && rows.length >= limit
        ? { truncated: true, hint: `结果达到 ${limit} 行上限，可能未列全。可加 WHERE 收窄，或用 LIMIT ${limit} OFFSET ${limit} 翻页。` }
        : {})
    });
    return out.length > 4000 ? out.slice(0, 4000) + '…(已截断)' : out;
  } catch (e) {
    return `查询出错：${String(e.message || e).slice(0, 200)}`;
  }
}

async function toolWebSearch(env, query) {
  if (!env.TAVILY_API_KEY) return '（联网搜索未配置，无法使用。请基于已有知识回答，并说明无法联网。）';
  const q = String(query || '').trim();
  if (!q) return '搜索词为空';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // include_answer：Tavily 直接给一段综合摘要，比 5 条散装片段好用得多
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: q, max_results: 5, search_depth: 'basic', include_answer: true })
    });
    if (!res.ok) return `搜索失败（HTTP ${res.status}）`;
    const data = await res.json();
    const items = (data.results || []).map((x) => ({ title: x.title, url: x.url, snippet: String(x.content || '').slice(0, 280) }));
    const out = JSON.stringify({ answer: data.answer || '', results: items });
    return out.length > 3000 ? out.slice(0, 3000) + '…(已截断)' : out;
  } catch (e) {
    return `搜索出错：${String(e.message || e).slice(0, 160)}`;
  }
}

/* ── 记忆：上限 50 条/人；保存前去重；删除只能删自己的 ── */
const MEMORY_MAX = 50;

async function toolSaveMemory(env, user, content) {
  const text = String(content || '').trim();
  if (!text) return '记忆内容为空';
  if (text.length > 200) return '记忆内容过长（≤200 字）';
  await ensureTables(env);
  const dup = await env.DB.prepare('SELECT id FROM ai_memories WHERE user_id = ? AND content = ? LIMIT 1')
    .bind(user.userId, text)
    .first();
  if (dup) return `已有相同记忆（#${dup.id}），无需重复保存`;
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM ai_memories WHERE user_id = ?').bind(user.userId).first();
  if (Number(cnt?.c || 0) >= MEMORY_MAX) {
    return `记忆已满（${MEMORY_MAX} 条上限）。先用 forget_memory 删掉过时记忆再保存。`;
  }
  await env.DB.prepare('INSERT INTO ai_memories (user_id, content) VALUES (?, ?)').bind(user.userId, text).run();
  return '已记住';
}

async function toolForgetMemory(env, user, id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n) || n <= 0) return '参数 id 无效（应为用户记忆前的 #数字）';
  await ensureTables(env);
  const r = await env.DB.prepare('DELETE FROM ai_memories WHERE id = ? AND user_id = ?').bind(n, user.userId).run();
  return r.meta?.changes ? `已删除记忆 #${n}` : `记忆 #${n} 不存在或不属于当前用户`;
}

/** 站内通知：固定绑定当前 user_id —— 这就是它存在而不开放 notifications 表的原因 */
async function toolGetMyNotifications(env, user, limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
  try {
    const r = await env.DB.prepare(
      'SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    )
      .bind(user.userId, n)
      .all();
    const rows = (r.results || []).map((x) => ({ ...x, body: String(x.body || '').slice(0, 160) }));
    return JSON.stringify({ rows, rowCount: rows.length });
  } catch (e) {
    return `查询出错：${String(e.message || e).slice(0, 160)}`;
  }
}

/* ═════════════════════════════════════════════════════════
   对话（SSE 流式 + 工具循环）
   ═════════════════════════════════════════════════════════ */
function buildSystemPrompt(user, memories, cfg, useWeb, canQueryDatabase) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}（星期${'日一二三四五六'[now.getDay()]}）`;
  const lines = [
    '你是「雅礼团委 · 通办」站点的 AI 助手——一个中学团委线上办事平台。用简体中文回答：简洁、准确、友好。',
    `今天是 ${dateStr}。`,
    `当前用户：${user.name}（角色 ${user.role}${user.class_name ? '，班级 ' + user.class_name : ''}${user.department ? '，部门 ' + user.department : ''}）。与其个人相关的问题以此为准。`,
    '站点功能：服务（报修与意见反馈）、公告、投票、活动（含志愿者报名）、值日（排班/签到/评分）、财务、动态、消息、个性化设置、管理面板（仅管理员）。',
    '',
    '你可以调用工具：',
  ];
  if (canQueryDatabase) {
    lines.push('- query_database：只读查询站点数据库。数据库表结构（SQLite）：', SCHEMA_HINT);
  }
  lines.push(
    '- get_my_notifications：查看当前用户自己的站内通知（最近的，含未读状态）。',
    '- save_memory：当用户表达长期偏好、或让你「记住」什么时，把要点存成一句独立、自包含的话（≤200 字）。保存前先对照下方记忆列表，别存重复内容。',
    '- forget_memory：记忆过时或用户要求忘掉时，按下方列表里的 #id 删除。',
    useWeb ? '- web_search：联网搜索公开信息（返回 answer 摘要 + 来源列表）。站点数据优先用 query_database，公开信息才联网。' : '- web_search 本次对话未启用，不要调用。',
    '',
    '回答规则：',
    '1. 涉及站点数据（活动/公告/值日/财务/报修/通知等）时先用工具查询，再口头总结；不要把大段 JSON 原样贴给用户。',
    '2. 相互独立的查询尽量在同一轮一次性发出（比如同时查活动和公告），减少往返等待。',
    '3. 同名同参数的工具调用不要重复——结果就在上文，直接用它回答。',
    '4. 查询结果带 truncated=true 时表示达到行数上限，总结时须注明「只统计了部分记录」，或加 WHERE / OFFSET 继续查。',
    '5. 不确定的信息就说不确定；不编造数据。',
    '6. 回复保持简短，用短段落或列表，不要长篇大论。'
  );
  if (memories.length) {
    lines.push('', '你记住的关于该用户的信息（#id 可供 forget_memory 使用，按时间新→旧）：');
    for (const m of memories) lines.push(`- [#${m.id}] ${m.content}`);
  }
  return lines.join('\n');
}

/**
 * 上游调用封装：
 * - 90s 超时（首包/读流整体；思考模式长回答也够用，超了就是该重试了）
 * - 客户端断开（request.signal）联动取消上游 —— 用户点「停止」/关页面后
 *   不再白烧上游 token
 * - 429/5xx 自动重试 1 次（1.2s 退避）。只在本阶段重试：此刻还没向客户端
 *   发出任何字节，重发安全；流开始后绝不重试（防重复扣费/重复消息）
 */
async function fetchUpstream(cfg, bodyObj, outerSignal) {
  const doFetch = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('上游超时')), 90000);
    const relay = () => ctrl.abort();
    if (outerSignal) {
      if (outerSignal.aborted) ctrl.abort();
      else outerSignal.addEventListener('abort', relay, { once: true });
    }
    try {
      return await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(bodyObj),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', relay);
    }
  };
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await doFetch();
    if (res.ok) break;
    const retryable = attempt === 0 && [429, 500, 502, 503, 504].includes(res.status);
    if (!retryable) break;
    await res.text().catch(() => '');
    await new Promise((r) => setTimeout(r, 1200));
  }
  return res;
}

/** 上游（OpenAI 兼容）一次流式调用。返回 { content, toolCalls }；增量已转发给客户端 */
async function streamUpstream(cfg, messages, useTools, send, thinking, outerSignal) {
  const res = await fetchUpstream(
    cfg,
    {
      model: cfg.model,
      messages,
      stream: true,
      max_tokens: thinking ? 4000 : 1500, // 思考模式的思维链也占输出预算
      temperature: 0.6,
      // DeepSeek 思考模式默认打开（effort=high）——默认显式关（快），
      // 前端勾「深度思考」才开。参数仅 DeepSeek 认识（其它上游拒未知字段），
      // 所以只在模型名以 deepseek 开头时携带
      ...(String(cfg.model).startsWith('deepseek') ? { thinking: { type: thinking ? 'enabled' : 'disabled' } } : {}),
      ...(useTools ? { tools: cfg.toolDefs } : {})
    },
    outerSignal
  );
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`上游服务错误（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  let reasoning = '';
  const toolCalls = []; // 按 index 聚合：{ id, type, function: { name, arguments } }
  let sawToolCall = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta || {};
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        send({ reasoning: delta.reasoning_content }); // 思考过程实时转发（前端折叠展示）
      }
      if (delta.content) {
        content += delta.content;
        // 若本轮回合里已经出现 tool_calls，就不再把零散 content 发给客户端（最终轮会重答）
        if (!sawToolCall) send({ delta: delta.content });
      }
      for (const tc of delta.tool_calls || []) {
        sawToolCall = true;
        const idx = tc.index || 0;
        if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || `call_${idx}`, type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) toolCalls[idx].id = tc.id;
        if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
      }
    }
  }

  if (sawToolCall) send({ reset: true }); // 客户端清掉本轮可能已流出的部分文本
  return { content, reasoning, toolCalls: sawToolCall ? toolCalls.filter(Boolean) : [] };
}

/** workers-ai（无工具）：一次性返回全文 */
async function callWorkersAI(env, cfg, messages) {
  const res = await env.AI.run(cfg.model, { messages, max_tokens: 1200 });
  const text = typeof res === 'string' ? res : res?.result || res?.response || '';
  return String(text);
}

export async function handleAIChat(request, env, user) {
  if (!user) return error('需要登录', 401);
  const cfg = getAIConfig(env);
  if (!cfg) return error('AI 服务尚未配置（需要 AI_API_KEY 或 Workers AI 绑定）', 503);
  if (!checkRateLimit(user.name, 'aiChat', 40, 3600000)) {
    return error('AI 助手每小时最多 40 条消息，请稍后再试', 429);
  }

  const body = await parseBody(request);
  const wantThink = body?.thinking === true; // 深度思考（仅 DeepSeek 生效）
  const wantWeb = body?.webSearch === true && cfg.webSearch === true; // 联网（配置了才真正开）
  // 页内浮窗的场景说明（如「值日」）：前端传固定文案，这里只做清洗与截断
  const pageCtx = String(body?.context || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 100);
  const message = String(body?.message || '').trim();
  if (!message) return error('消息不能为空', 400);
  if (message.length > 2000) return error('消息过长（最多 2000 字）', 400);

  await ensureTables(env);

  const hist = await env.DB.prepare(
    'SELECT role, content, reasoning FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT 16'
  )
    .bind(user.userId)
    .all();
  const memories = await env.DB.prepare(
    'SELECT id, content FROM ai_memories WHERE user_id = ? ORDER BY id DESC LIMIT 10'
  )
    .bind(user.userId)
    .all();

  // 数据库工具仅面向管理角色开放（教师/管理员/站长）。
  // 白名单里的表（finance、feedback、ai_memories、poll_responses 等）
  // 并不区分行级权限，普通成员可借此绕过各模块接口的字段控制，
  // 直接读出联系方式、他人投票答案与其他人的记忆。
  const canQueryDatabase = isAdmin(user);

  const system =
    buildSystemPrompt(user, memories.results || [], cfg, wantWeb, canQueryDatabase) +
    (pageCtx ? `\n\n用户当前正在站点的「${pageCtx}」相关页面，回答优先贴近这个场景。` : '');
  // 历史按字符预算裁剪（而不再按条数）：近者优先，装不下就整条舍弃，
  // 避免长对话把上下文撑爆。最近一条无论如何都带上。
  const HISTORY_BUDGET = 6000;
  const histRows = (hist.results || []).reverse(); // 旧 → 新
  const pickedHist = [];
  let histChars = 0;
  for (let i = histRows.length - 1; i >= 0; i -= 1) {
    const len = String(histRows[i].content || '').length;
    if (pickedHist.length && histChars + len > HISTORY_BUDGET) break;
    pickedHist.unshift(histRows[i]);
    histChars += len;
  }
  // 传给模型的消息（本轮用户消息稍后追加）
  const convo = [
    { role: 'system', content: system },
    ...pickedHist.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
      // 思考模式下带 tools 的请求必须回传历史 reasoning_content（DeepSeek 400 陷阱）
      ...(wantThink && h.role === 'assistant' && h.reasoning ? { reasoning_content: h.reasoning } : {})
    }))
  ];

  // 工具清单按配置动态生成
  if (cfg.provider === 'openai') {
    cfg.toolDefs = [];
    if (canQueryDatabase) {
      cfg.toolDefs.push({
        type: 'function',
        function: {
          name: 'query_database',
          description: '只读查询站点数据库（SQLite）。用于回答活动/公告/值日/财务/报修等站点数据问题。',
          parameters: {
            type: 'object',
            properties: { sql: { type: 'string', description: '单条 SELECT 语句；无 LIMIT 自动补 20，上限 50' } },
            required: ['sql']
          }
        }
      });
    }
    cfg.toolDefs.push(
      {
        type: 'function',
        function: {
          name: 'get_my_notifications',
          description: '查看当前用户自己的站内通知（最近的，含未读状态）。',
          parameters: {
            type: 'object',
            properties: { limit: { type: 'number', description: '条数，默认 10，最多 20' } }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: '把用户的长期偏好或重要信息存为一条记忆（≤200 字），之后的对话都能看到。保存前先确认没有重复。',
          parameters: {
            type: 'object',
            properties: { content: { type: 'string', description: '一句独立、自包含的记忆' } },
            required: ['content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'forget_memory',
          description: '删除一条关于当前用户的记忆（按系统提示里记忆前的 #id）。',
          parameters: {
            type: 'object',
            properties: { id: { type: 'number', description: '记忆条目的 #id' } },
            required: ['id']
          }
        }
      }
    );
    if (wantWeb) {
      cfg.toolDefs.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: '联网搜索公开信息（站点数据请用 query_database）。',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query']
          }
        }
      });
    }
  }

  // 先落用户消息（失败不阻断对话）
  try {
    await env.DB.prepare('INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)').bind(user.userId, 'user', message).run();
  } catch {}

  /* ── SSE 响应 ── */
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  // 客户端断开后 writer.write 会 reject —— 吞掉，别让后台流程报 unhandled rejection
  const send = (obj) => {
    writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)).catch(() => {});
  };

  const run = async () => {
    if (request.signal?.aborted) {
      try { await writer.close(); } catch {}
      return;
    }
    // 心跳：工具执行/上游长思考期间若没有事件流出，前端 45s 空闲超时会误杀
    // 这一轮其实还在正常推进的对话。15s 一个 ping，前端把它当流量处理、不展示。
    const heartbeat = setInterval(() => send({ ping: true }), 15000);
    let finalText = '';
    let finalReasoning = '';
    try {
      convo.push({ role: 'user', content: message });

      if (cfg.provider === 'workers-ai') {
        finalText = await callWorkersAI(env, cfg, convo);
        send({ delta: finalText });
      } else {
        // 工具循环：最多 4 轮；每轮流式转发增量，出现工具调用则并行执行后继续
        let toolsUsed = [];
        const seenCalls = new Set(); // 重复调用熔断：同名+同参数在本轮对话里只执行一次
        for (let round = 0; round < 4; round += 1) {
          const isLast = round === 3;
          const { content, reasoning, toolCalls } = await streamUpstream(cfg, convo, cfg.tools && !isLast, send, wantThink, request.signal);

          if (!toolCalls.length) {
            finalText = content;
            finalReasoning = reasoning || '';
            break;
          }

          // 记录本轮 assistant 的 tool_calls 消息（OpenAI 格式要求回传）
          convo.push({
            role: 'assistant',
            content: content || null,
            ...(reasoning ? { reasoning_content: reasoning } : {}), // 思考模式下必须回传（400 陷阱）
            tool_calls: toolCalls
          });

          const execOne = async (tc) => {
            const name = tc.function.name;
            let args = {};
            try {
              args = JSON.parse(tc.function.arguments || '{}');
            } catch (e) {
              return { name, result: `工具参数解析失败：${String(e.message || e).slice(0, 160)}` };
            }
            const callKey = `${name}\n${JSON.stringify(args)}`;
            if (seenCalls.has(callKey)) {
              return { name, result: '重复调用被拦截：相同的工具与参数刚才已经执行过，结果就在上文。请基于已有结果回答，或换一种查询思路。' };
            }
            seenCalls.add(callKey);
            const t0 = Date.now();
            let result;
            try {
              if (name === 'query_database') {
                result = canQueryDatabase
                  ? await toolQueryDatabase(env, args.sql)
                  : '无权使用：数据库查询仅对老师、管理员与站长开放';
              }
              else if (name === 'web_search') result = await toolWebSearch(env, args.query);
              else if (name === 'save_memory') result = await toolSaveMemory(env, user, args.content);
              else if (name === 'forget_memory') result = await toolForgetMemory(env, user, args.id);
              else if (name === 'get_my_notifications') result = await toolGetMyNotifications(env, user, args.limit);
              else result = `未知工具：${name}`;
            } catch (e) {
              result = `工具执行出错：${String(e.message || e).slice(0, 160)}`;
            }
            return { name, result, ms: Date.now() - t0 };
          };

          // 同一轮里相互独立的工具调用并行执行，结果仍按原顺序回传给模型
          const settled = await Promise.all(toolCalls.map(execOne));
          for (let i = 0; i < toolCalls.length; i += 1) {
            send({ tool: { name: settled[i].name, args: toolCalls[i].function.arguments || '{}', ms: settled[i].ms } });
            convo.push({ role: 'tool', tool_call_id: toolCalls[i].id, content: String(settled[i].result) });
            toolsUsed.push(settled[i].name);
          }

          if (isLast) {
            // 轮次用尽仍想调工具 → 最后一轮禁用工具让它收口
            const last = await streamUpstream(cfg, convo, false, send, wantThink, request.signal);
            finalText = last.content;
            finalReasoning = last.reasoning || '';
          }
        }
        if (toolsUsed.length) send({ toolsUsed });
      }

      if (finalText.trim()) {
        // 落库失败不该把已完整送达的回答再报成错误 —— 吞掉并记日志
        try {
          await env.DB.prepare('INSERT INTO ai_messages (user_id, role, content, reasoning) VALUES (?, ?, ?, ?)')
            .bind(user.userId, 'assistant', finalText, finalReasoning || null)
            .run();
        } catch (e) {
          console.error('[ai] 回答落库失败', String(e).slice(0, 200));
        }
      }
      send({ done: true });
    } catch (e) {
      try {
        send({ error: String(e.message || e).slice(0, 300) });
      } catch {}
    } finally {
      clearInterval(heartbeat);
      try {
        await writer.close();
      } catch {}
    }
  };
  // 后台执行：SSE 立刻返回，流内容异步写入
  run();

  return new Response(stream.readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no'
    }
  });
}
