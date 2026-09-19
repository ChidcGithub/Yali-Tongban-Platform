/**
 * AI 助手后端（仅登录用户可用）
 * ═════════════════════════════════════════════════════════
 * 能力：流式对话（SSE）+ 工具调用 ——
 *   ① query_database：只读查询站点数据库（SELECT 白名单，自动加 LIMIT）
 *   ② web_search：联网搜索（可选，需 TAVILY_API_KEY）
 *   ③ save_memory：记住用户的长期偏好（存 ai_memories，注入后续对话）
 * 记忆：每次对话自动把该用户最近的记忆注入 system prompt。
 *
 * 供应商配置（Cloudflare 环境变量，二选一）：
 *   AI_API_KEY (+ AI_BASE_URL / AI_MODEL)  → OpenAI 兼容接口
 *     （智谱 / DeepSeek / Moonshot 等，默认指向智谱 open.bigmodel.cn，
 *      默认模型 glm-4-flash——免费档，支持工具调用）
 *   或在 Pages 项目设置里绑定 Workers AI（env.AI），零密钥但无工具调用。
 *
 * 安全边界：
 *   - 数据库工具只允许 SELECT、白名单表、禁 password 字样、自动加 LIMIT ≤ 20
 *   - users 表整体不可查（含密码哈希）；当前用户信息走 system prompt 注入
 *   - 对话与记忆都按 user_id 隔离，只能读写自己的
 *   - 每用户每小时 40 条消息
 */
import { json, error, parseBody, checkRateLimit } from './_utils.js';

/* ── 表（沿用站点「运行时建表」的惯例，零迁移） ── */
async function ensureTables(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_messages(user_id, id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_memories_user ON ai_memories(user_id, id)').run();
}

/* ── 供应商配置 ── */
export function getAIConfig(env) {
  if (env.AI_API_KEY) {
    return {
      provider: 'openai',
      key: env.AI_API_KEY,
      baseUrl: String(env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, ''),
      model: env.AI_MODEL || 'glm-4-flash',
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
    .bind(user.id)
    .all();
  return json({ messages: (r.results || []).reverse() });
}

export async function handleAIMessagesClear(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  await env.DB.prepare('DELETE FROM ai_messages WHERE user_id = ?').bind(user.id).run();
  return json({ message: '对话已清空' });
}

/* ── 记忆 ── */
export async function handleAIMemoriesGet(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  const r = await env.DB.prepare(
    'SELECT id, content, created_at FROM ai_memories WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  )
    .bind(user.id)
    .all();
  return json({ memories: r.results || [] });
}

export async function handleAIMemoriesClear(env, user) {
  if (!user) return error('需要登录', 401);
  await ensureTables(env);
  await env.DB.prepare('DELETE FROM ai_memories WHERE user_id = ?').bind(user.id).run();
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

/** 给模型看的表结构摘要（刻意不含 users / 密码列 / 其它用户的私信） */
const SCHEMA_HINT = [
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

async function toolQueryDatabase(env, sql) {
  const q = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!/^select\b/i.test(q)) return '拒绝执行：只允许 SELECT 查询';
  if (/;/.test(q)) return '拒绝执行：只允许单条语句';
  if (/\b(insert|update|delete|drop|alter|create|attach|pragma|vacuum|replace)\b/i.test(q)) {
    return '拒绝执行：包含写操作关键字';
  }
  if (/password/i.test(q)) return '拒绝执行：不允许查询凭据字段';
  const tables = [...q.matchAll(/(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  if (!tables.length) return '拒绝执行：没有可识别的目标表';
  for (const t of tables) {
    if (!AI_TABLES.has(t)) return `拒绝执行：表 ${t} 不在允许范围内`;
  }
  const finalSql = /\blimit\b/i.test(q) ? q : `${q} LIMIT 20`;
  try {
    const r = await env.DB.prepare(finalSql).all();
    const rows = r.results || [];
    const out = JSON.stringify({ rows, rowCount: rows.length });
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
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: q, max_results: 5, search_depth: 'basic' })
    });
    if (!res.ok) return `搜索失败（HTTP ${res.status}）`;
    const data = await res.json();
    const items = (data.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.content }));
    const out = JSON.stringify(items);
    return out.length > 3000 ? out.slice(0, 3000) + '…(已截断)' : out;
  } catch (e) {
    return `搜索出错：${String(e.message || e).slice(0, 160)}`;
  }
}

async function toolSaveMemory(env, user, content) {
  const text = String(content || '').trim();
  if (!text) return '记忆内容为空';
  if (text.length > 200) return '记忆内容过长（≤200 字）';
  await ensureTables(env);
  await env.DB.prepare('INSERT INTO ai_memories (user_id, content) VALUES (?, ?)').bind(user.id, text).run();
  return '已记住';
}

/* ═════════════════════════════════════════════════════════
   对话（SSE 流式 + 工具循环）
   ═════════════════════════════════════════════════════════ */
function buildSystemPrompt(user, memories, cfg) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}（星期${'日一二三四五六'[now.getDay()]}）`;
  const lines = [
    '你是「雅礼团委 · 通办」站点的 AI 助手——一个中学团委线上办事平台。用简体中文回答：简洁、准确、友好。',
    `今天是 ${dateStr}。`,
    `当前用户：${user.name}（角色 ${user.role}${user.class_name ? '，班级 ' + user.class_name : ''}${user.department ? '，部门 ' + user.department : ''}）。与其个人相关的问题以此为准。`,
    '站点功能：服务（报修与意见反馈）、公告、投票、活动（含志愿者报名）、值日（排班/签到/评分）、财务、动态、消息、个性化设置、管理面板（仅管理员）。',
    '',
    '你可以调用工具：',
    '- query_database：只读查询站点数据库。数据库表结构（SQLite）：',
    SCHEMA_HINT,
    '- save_memory：当用户表达长期偏好、或让你「记住」什么时，把要点存成一句独立、自包含的话（≤200 字）。',
    cfg.webSearch ? '- web_search：联网搜索公开信息。' : '- web_search 当前未配置，不要调用。',
    '',
    '回答规则：',
    '1. 涉及站点数据（活动/公告/值日/财务/报修等）时先用 query_database 查询，再口头总结；不要把大段 JSON 原样贴给用户。',
    '2. 值日排班表里只存 staff_id，姓名要 join duty_staff 才能拿到。',
    '3. 财务金额汇总时注明是否只统计了部分记录（查询有 LIMIT）。',
    '4. 不确定的信息就说不确定；不编造数据。',
    '5. 回复保持简短，用短段落或列表，不要长篇大论。'
  ];
  if (memories.length) {
    lines.push('', '你记住的关于该用户的信息（按时间新→旧）：');
    for (const m of memories) lines.push(`- ${m.content}`);
  }
  return lines.join('\n');
}

/** 上游（OpenAI 兼容）一次流式调用。返回 { content, toolCalls }；增量已转发给客户端 */
async function streamUpstream(cfg, messages, useTools, send) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      max_tokens: 1500,
      temperature: 0.6,
      ...(useTools ? { tools: cfg.toolDefs } : {})
    })
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`上游服务错误（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
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
  return { content, toolCalls: sawToolCall ? toolCalls.filter(Boolean) : [] };
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
  const message = String(body?.message || '').trim();
  if (!message) return error('消息不能为空', 400);
  if (message.length > 2000) return error('消息过长（最多 2000 字）', 400);

  await ensureTables(env);

  const hist = await env.DB.prepare(
    'SELECT role, content FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT 16'
  )
    .bind(user.id)
    .all();
  const memories = await env.DB.prepare(
    'SELECT content FROM ai_memories WHERE user_id = ? ORDER BY id DESC LIMIT 10'
  )
    .bind(user.id)
    .all();

  const system = buildSystemPrompt(user, memories.results || [], cfg);
  // 传给模型的消息（本轮用户消息稍后追加）
  const convo = [
    { role: 'system', content: system },
    ...hist.results.reverse().slice(-16).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }))
  ];

  // 工具清单按配置动态生成
  if (cfg.provider === 'openai') {
    cfg.toolDefs = [
      {
        type: 'function',
        function: {
          name: 'query_database',
          description: '只读查询站点数据库（SQLite）。用于回答活动/公告/值日/财务/报修等站点数据问题。',
          parameters: {
            type: 'object',
            properties: { sql: { type: 'string', description: '单条 SELECT 语句，自动追加 LIMIT 20' } },
            required: ['sql']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: '把用户的长期偏好或重要信息存为一条记忆（≤200 字），之后的对话都能看到。',
          parameters: {
            type: 'object',
            properties: { content: { type: 'string', description: '一句独立、自包含的记忆' } },
            required: ['content']
          }
        }
      }
    ];
    if (cfg.webSearch) {
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
    await env.DB.prepare('INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)').bind(user.id, 'user', message).run();
  } catch {}

  /* ── SSE 响应 ── */
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  const send = (obj) => writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const run = async () => {
    let finalText = '';
    try {
      convo.push({ role: 'user', content: message });

      if (cfg.provider === 'workers-ai') {
        finalText = await callWorkersAI(env, cfg, convo);
        send({ delta: finalText });
      } else {
        // 工具循环：最多 4 轮；每轮流式转发增量，出现工具调用则执行后继续
        let toolsUsed = [];
        for (let round = 0; round < 4; round += 1) {
          const isLast = round === 3;
          const { content, toolCalls } = await streamUpstream(cfg, convo, cfg.tools && !isLast, send);

          if (!toolCalls.length) {
            finalText = content;
            break;
          }

          // 记录本轮 assistant 的 tool_calls 消息（OpenAI 格式要求回传）
          convo.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
          for (const tc of toolCalls) {
            let result;
            const name = tc.function.name;
            try {
              const args = JSON.parse(tc.function.arguments || '{}');
              if (name === 'query_database') result = await toolQueryDatabase(env, args.sql);
              else if (name === 'web_search') result = await toolWebSearch(env, args.query);
              else if (name === 'save_memory') result = await toolSaveMemory(env, user, args.content);
              else result = `未知工具：${name}`;
              toolsUsed.push(name);
            } catch (e) {
              result = `工具参数解析失败：${String(e.message || e).slice(0, 160)}`;
            }
            send({ tool: { name, args: tc.function.arguments || '{}' } });
            convo.push({ role: 'tool', tool_call_id: tc.id, content: String(result) });
          }

          if (isLast) {
            // 轮次用尽仍想调工具 → 最后一轮禁用工具让它收口
            const last = await streamUpstream(cfg, convo, false, send);
            finalText = last.content;
          }
        }
        if (toolsUsed.length) send({ toolsUsed });
      }

      if (finalText.trim()) {
        await env.DB.prepare('INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)')
          .bind(user.id, 'assistant', finalText)
          .run();
      }
      send({ done: true });
    } catch (e) {
      try {
        send({ error: String(e.message || e).slice(0, 300) });
      } catch {}
    } finally {
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
