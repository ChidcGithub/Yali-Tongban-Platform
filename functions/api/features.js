import { json, error, parseBody } from './_utils.js';

// ─── 预定义功能列表（代码内置）───
// 站长无需创建功能，只能选择启用/邀请
export const BUILTIN_FEATURES = [
  {
    key: 'messages',
    name: '消息提醒',
    description: '在导航栏显示消息铃铛，接收公告、审核结果、报修状态、财务变动、评论回复、活动邀请、值日分数等 8 类消息通知。',
    icon: 'bell',
  },
  // 未来新增的测试性功能在这里添加
];

// 获取预定义功能（合并数据库启用状态）
async function getFeatureWithState(env, key) {
  const builtin = BUILTIN_FEATURES.find(f => f.key === key);
  if (!builtin) return null;
  const row = await env.DB.prepare("SELECT globally_enabled FROM features WHERE key = ?").bind(key).first();
  return { ...builtin, globally_enabled: row ? !!row.globally_enabled : false };
}

// ─── 管理员端点 ───

// GET /api/admin/features — 列出所有预定义功能及其启用状态和统计
export async function handleAdminGetFeatures(env) {
  const result = [];
  for (const builtin of BUILTIN_FEATURES) {
    const row = await env.DB.prepare("SELECT globally_enabled FROM features WHERE key = ?").bind(builtin.key).first();
    const stats = await env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM user_feature_responses WHERE feature_key = ? GROUP BY status"
    ).bind(builtin.key).all();
    const statMap = {};
    for (const s of stats.results) statMap[s.status] = s.cnt;
    result.push({
      ...builtin,
      globally_enabled: row ? !!row.globally_enabled : false,
      stats: statMap,
    });
  }
  return json({ features: result });
}

// POST /api/admin/features — 启用/禁用功能（仅预定义功能）
export async function handleAdminToggleFeature(request, env) {
  const body = await parseBody(request);
  if (!body.key) return error('key 必填', 400);
  const builtin = BUILTIN_FEATURES.find(f => f.key === body.key);
  if (!builtin) return error('该功能不存在于预定义列表中', 400);

  const enabled = body.globally_enabled ? 1 : 0;
  await env.DB.prepare(
    "INSERT INTO features (key, name, description, icon, globally_enabled, invite_mode) VALUES (?, ?, ?, ?, ?, 'manual') " +
    "ON CONFLICT(key) DO UPDATE SET globally_enabled=excluded.globally_enabled"
  ).bind(builtin.key, builtin.name, builtin.description, builtin.icon, enabled).run();
  return json({ message: enabled ? '已启用' : '已禁用' });
}

// POST /api/admin/features/:key/invite — 邀请用户
export async function handleAdminInvite(request, env, featureKey) {
  const builtin = BUILTIN_FEATURES.find(f => f.key === featureKey);
  if (!builtin) return error('功能不存在', 404);

  // 校验功能是否已全局启用（防止邀请死数据）
  const featRow = await env.DB.prepare("SELECT globally_enabled FROM features WHERE key = ?").bind(featureKey).first();
  if (!featRow || !featRow.globally_enabled) {
    return error('请先启用功能再邀请用户', 400);
  }

  const body = await parseBody(request);
  let userIds = [];
  if (body.all) {
    // 全员邀请（所有已通过的用户，含 officer）
    const users = await env.DB.prepare("SELECT id FROM users WHERE role IN ('member','officer','admin','owner','teacher')").all();
    userIds = users.results.map(u => u.id);
  } else if (Array.isArray(body.user_ids)) {
    // 单人/多人邀请：过滤无效 ID
    userIds = body.user_ids.filter(id => Number.isInteger(id) || /^\d+$/.test(id)).map(id => Number(id));
  } else {
    return error('需要 user_ids 数组或 all=true', 400);
  }

  if (!userIds.length) return json({ message: '没有可邀请的用户', invited: 0, skipped: 0 });

  // 先查询哪些用户已被邀请（含已响应的），跳过这些用户
  const placeholders = userIds.map(() => '?').join(',');
  const existingRows = await env.DB.prepare(
    `SELECT user_id FROM user_feature_responses WHERE feature_key = ? AND user_id IN (${placeholders})`
  ).bind(featureKey, ...userIds).all();
  const existingSet = new Set(existingRows.results.map(r => r.user_id));
  const newUserIds = userIds.filter(id => !existingSet.has(id));

  if (!newUserIds.length) {
    return json({ message: '所有用户已被邀请', invited: 0, skipped: userIds.length });
  }

  // 批量插入邀请记录（使用 batch 提升性能）
  const now = new Date().toISOString();
  const stmts = newUserIds.map(uid => env.DB.prepare(
    "INSERT INTO user_feature_responses (user_id, feature_key, status, invited_at) VALUES (?, ?, 'pending', ?) " +
    "ON CONFLICT(user_id, feature_key) DO NOTHING"
  ).bind(uid, featureKey, now));
  await env.DB.batch(stmts);

  return json({
    message: '邀请已发送',
    invited: newUserIds.length,           // 实际新增邀请数
    skipped: userIds.length - newUserIds.length, // 已存在被跳过的数
  });
}

// POST /api/admin/features/:key/reset — 重置某用户的响应（重新邀请已选"永不"的用户）
export async function handleAdminResetUser(request, env, featureKey) {
  const builtin = BUILTIN_FEATURES.find(f => f.key === featureKey);
  if (!builtin) return error('功能不存在', 404);
  const body = await parseBody(request);
  if (!body.user_id) return error('user_id 必填', 400);
  await env.DB.prepare(
    "DELETE FROM user_feature_responses WHERE user_id = ? AND feature_key = ?"
  ).bind(body.user_id, featureKey).run();
  return json({ message: '已重置，可重新邀请' });
}

// GET /api/admin/features/:key/invitations — 查看邀请详情
export async function handleAdminGetInvitations(env, url, featureKey) {
  const builtin = BUILTIN_FEATURES.find(f => f.key === featureKey);
  if (!builtin) return error('功能不存在', 404);
  const invitations = await env.DB.prepare(
    "SELECT ufr.user_id, ufr.status, ufr.invited_at, ufr.responded_at, u.name FROM user_feature_responses ufr " +
    "JOIN users u ON u.id = ufr.user_id WHERE ufr.feature_key = ? ORDER BY ufr.invited_at DESC"
  ).bind(featureKey).all();
  return json({ invitations: invitations.results });
}

// ─── 用户端点 ───

// GET /api/features/pending — 获取待响应的邀请
export async function handleGetPendingFeatures(env, user) {
  if (!user || !user.userId) return json({ pending: [] });
  const rows = await env.DB.prepare(
    "SELECT f.key, f.name, f.description, f.icon, ufr.invited_at " +
    "FROM user_feature_responses ufr JOIN features f ON f.key = ufr.feature_key " +
    "WHERE ufr.user_id = ? AND ufr.status = 'pending' AND f.globally_enabled = 1 " +
    "ORDER BY ufr.invited_at DESC"
  ).bind(user.userId).all();
  return json({ pending: rows.results });
}

// POST /api/features/:key/respond — 响应邀请
export async function handleRespondFeature(request, env, featureKey, user) {
  if (!user || !user.userId) return error('需要登录', 401);
  const builtin = BUILTIN_FEATURES.find(f => f.key === featureKey);
  if (!builtin) return error('功能不存在', 404);
  const body = await parseBody(request);
  const status = body.status;
  if (!['accepted', 'later', 'never'].includes(status)) return error('无效的状态', 400);

  const now = new Date().toISOString();
  // 使用 UPSERT：即使未被正式邀请也能响应（防御性）
  await env.DB.prepare(
    "INSERT INTO user_feature_responses (user_id, feature_key, status, responded_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(user_id, feature_key) DO UPDATE SET status = excluded.status, responded_at = excluded.responded_at"
  ).bind(user.userId, featureKey, status, now).run();
  return json({ message: '已记录', status });
}

// GET /api/features/enabled — 获取已启用的功能列表
export async function handleGetEnabledFeatures(env, user) {
  if (!user || !user.userId) return json({ enabled: [] });
  const rows = await env.DB.prepare(
    "SELECT f.key, f.name, f.icon FROM user_feature_responses ufr " +
    "JOIN features f ON f.key = ufr.feature_key " +
    "WHERE ufr.user_id = ? AND ufr.status = 'accepted' AND f.globally_enabled = 1"
  ).bind(user.userId).all();
  return json({ enabled: rows.results });
}
