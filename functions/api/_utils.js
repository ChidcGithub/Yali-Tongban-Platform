import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const SALT_ROUNDS = 10;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 50;
export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室'];

// 公共安全响应头（json / error / CSV 导出共用，安全策略修改只需改这一处）
export const COMMON_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:;",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-cache',
};

export const ACH_NAMES = {
  read_all_changelog: '真的会有人看这个吗？', color_freak: '五彩斑斓的黑', night_owl: '夜猫子',
  early_bird: '早起的鸟儿', high_five: '击掌！', collector: '收藏家', chatty: '社交恐怖分子',
  commenter: '键盘侠', proposer: '提案王', time_traveler: '时间旅行者', intruder: '入侵者',
  reset_master: '删繁就简', locked_out: '被拒之门外', reader: '阅览室常客',
  power: 'Power...?Point.', extrovert: 'e人', introvert: 'i人', lightning: '闪电侠',
  archaeologist: '考古学家', ocd: '黑白无常', night_owl2: '夜猫子2.0', novice: '初来乍到',
  pigeon: '鸽子', dev: '开发者', easter_egg: '不是彩蛋', screenshot: '截图侠',
  frequent_404: '404常客', attendance: '全勤奖', moonlight: '月光族', anniversary: '周年庆',
  super_graphic: 'Super Graphic', feedback_first: '我有话要说', feedback_tenth: '反馈反馈反馈反馈！',
};

const rateLimitMap = new Map();
const RL_CLEANUP_INTERVAL = 3600000;
let _lastRlCleanup = 0;

export function checkRateLimit(ip, key, maxAttempts = 5, windowMs = 60000) {
  const k = `${ip}:${key}`;
  const now = Date.now();
  const entry = rateLimitMap.get(k);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(k, { windowStart: now, count: 1 });
    if (rateLimitMap.size > 10000 && now - _lastRlCleanup > RL_CLEANUP_INTERVAL) {
      _lastRlCleanup = now;
      for (const [rk, rv] of rateLimitMap) {
        if (now - rv.windowStart > 3600000) rateLimitMap.delete(rk);
      }
    }
    return true;
  }
  entry.count++;
  if (entry.count > maxAttempts) return false;
  return true;
}

// 限流包装器：通过返回 null，被限流返回 error Response（调用方 const rl = rateLimit(...); if (rl) return rl;）
// IP 获取与限流策略集中在此，后续升级分布式限流只改这一处
export function rateLimit(request, key, maxAttempts = 5, windowMs = 60000, msg = '操作过于频繁，请稍后再试') {
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, key, maxAttempts, windowMs)) return error(msg, 429);
  return null;
}

export function safeParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function parseImages(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.startsWith('[')) {
    const arr = safeParse(val, []);
    return Array.isArray(arr) ? JSON.stringify(arr) : val;
  }
  if (Array.isArray(val)) return JSON.stringify(val);
  return JSON.stringify([val]);
}

export function isValidClass(cls) {
  if (!cls || typeof cls !== 'string') return false;
  const n = Number(cls);
  if (isNaN(n) || !Number.isInteger(n) || cls.length !== 4) return false;
  const year = new Date().getFullYear();
  const base = year - 2000;
  return (n >= (base - 1) * 100 + 1 && n <= (base - 1) * 100 + 27)
      || (n >= (base - 2) * 100 + 1 && n <= (base - 2) * 100 + 29)
      || (n >= (base - 3) * 100 + 1 && n <= (base - 3) * 100 + 29)
      || (n >= base * 100 + 1 && n <= base * 100 + 27);
}

let _cleanupCount = 0;
export function setCleanupCount(val) { _cleanupCount = val; }

export function json(data, status = 200, extraHeaders = {}) {
  const body = { success: true, data };
  if (_cleanupCount > 0) {
    body._cleanup = _cleanupCount;
    _cleanupCount = 0;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...COMMON_HEADERS,
      ...extraHeaders,
    },
  });
}

export function error(msg, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...COMMON_HEADERS,
    },
  });
}

export function getSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未设置');
  return new TextEncoder().encode(secret);
}

export async function signToken(payload, env) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setAudience('yali-tongban')
    .setIssuer('yali-tongban')
    .sign(getSecret(env));
}

export async function signTokenForUser(userId, env, extra = {}) {
  const row = await env.DB.prepare('SELECT id, name, role, class_name, department, achievements, token_version FROM users WHERE id = ?').bind(userId).first();
  if (!row) return null;
  return signToken({ userId: row.id, name: row.name, role: row.role, class_name: row.class_name || '', department: row.department || '', achievements: row.achievements || '[]', token_version: row.token_version || 0, ...extra }, env);
}

export function respondWithToken(data, token, status = 200) {
  return json(data, status, { 'Set-Cookie': setTokenCookie(token) });
}

export async function verifyToken(token, env) {
  const { payload } = await jwtVerify(token, getSecret(env), {
    audience: 'yali-tongban',
    issuer: 'yali-tongban',
  });
  return payload;
}

export async function getUserFromRequest(request, env) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const user = await verifyToken(auth.slice(7), env);
      if (user && user.token_version !== undefined) {
        const dbUser = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(user.userId).first();
        if (!dbUser || (dbUser.token_version || 0) > (user.token_version || 0)) return null;
      }
      return user;
    } catch {}
  }
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) {
      try {
        const user = await verifyToken(match[1], env);
        if (user && user.token_version !== undefined) {
          const dbUser = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(user.userId).first();
          if (!dbUser || (dbUser.token_version || 0) > (user.token_version || 0)) return null;
        }
        return user;
      } catch {}
    }
  }
  return null;
}

export async function requireMember(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user || user.role === 'pending') return null;
  return user;
}

export function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'owner' || user.role === 'teacher');
}

export function isOwner(user) {
  return user && user.role === 'owner';
}

export function isHallReviewer(user) {
  return user && (isAdmin(user) || user.department === '社团部');
}

export function setTokenCookie(token) {
  return `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}

export function isValidImageUrl(url) {
  return typeof url === 'string' && /^data:image\/(jpeg|png|gif|webp);base64,/.test(url);
}

export function validatePassword(pwd) {
  if (!pwd || pwd.length < PASSWORD_MIN || pwd.length > PASSWORD_MAX) {
    return `密码长度需在${PASSWORD_MIN}-${PASSWORD_MAX}位之间`;
  }
  if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return '密码需包含至少一个字母和一个数字';
  }
  return null;
}

export async function parseBody(request) {
  try { return await request.json(); } catch { return null; }
}

export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

export async function checkSiteClosed(request, env) {
  const p = new URL(request.url).pathname;
  // 认证与验证码为登录/注册前置依赖，站点关闭期间必须放行，否则管理员无法登录解除关闭（死锁）
  if (p === '/api/auth/login' || p === '/api/auth/signin' || p === '/api/auth/register' || p === '/api/auth/me' || p === '/api/auth/change-department') return null;
  if (p === '/api/captcha/generate') return null;
  if (p === '/api/sync' || p === '/api/settings' || p.startsWith('/api/chat') || p.startsWith('/api/feed') || p.startsWith('/api/admin')) return null;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='site_closed'").first();
    if (row && row.value === 'true') return '网站已关闭，请联系管理员';
  } catch {}
  return null;
}

export async function initDB(env) {
  // P0 优化：短路检查提前到最开头。已初始化（_db_init_done 存在）则跳过下方全部迁移语句，
  // 每次请求只做 1 条探活，省约 39 次 D1 往返（冷启动 + 边缘延迟的主要来源）。
  // 首次部署时 settings 表不存在，该 SELECT 抛错被捕获，继续走下方全量迁移。
  try {
    const done = await env.DB.prepare("SELECT value FROM settings WHERE key='_db_init_done'").first();
    if (done) return;
  } catch {
    // settings 表不存在（首次部署），继续执行迁移
  }
  try {
    await env.DB.prepare("SELECT 1 FROM settings LIMIT 1").first();
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT DEFAULT '', time TEXT NOT NULL, departments TEXT DEFAULT '', need_volunteers INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS activity_volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, member_name TEXT NOT NULL, department TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_activity_volunteers_aid ON activity_volunteers(activity_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS feed_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id INTEGER NOT NULL, user_name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_feed_comments_fid ON feed_comments(feed_id)").run(); } catch {}
    try { await env.DB.prepare("UPDATE chat_messages SET type = 'notification' WHERE type = 'system' AND (system_data LIKE '%\"action\":\"新成员注册\"%' OR system_data LIKE '%\"action\":\"通过注册\"%')").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, contact TEXT DEFAULT '', page TEXT DEFAULT '', turnstile_bypass INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE feedback ADD COLUMN section TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE feedback ADD COLUMN version TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS hall_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, purpose TEXT NOT NULL, applicant TEXT NOT NULL, user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE hall_bookings ADD COLUMN reviewed_at TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE issues ADD COLUMN notes TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE finance ADD COLUMN department TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE finance ADD COLUMN fund_type TEXT DEFAULT '基金账单'").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE finance ADD COLUMN internal_activity INTEGER DEFAULT 0").run(); } catch {}
    try { await env.DB.prepare("DELETE FROM hall_bookings WHERE date < date('now', '-14 days')").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS duty_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, department TEXT NOT NULL, class TEXT NOT NULL, name TEXT NOT NULL, password TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS duty_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, staff_a_id INTEGER NOT NULL, staff_b_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS duty_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, period TEXT NOT NULL, sign_in_time TEXT, sign_out_time TEXT, duration_sec INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', score_absent REAL DEFAULT 0, score_duration REAL DEFAULT 0, is_manual INTEGER DEFAULT 0, modified_by TEXT DEFAULT '', modified_reason TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS duty_score_record (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, date TEXT NOT NULL, period TEXT NOT NULL, score REAL NOT NULL, reason TEXT DEFAULT '', recorder TEXT DEFAULT 'system', is_cancelled INTEGER DEFAULT 0, cancel_reason TEXT DEFAULT '', cancel_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS duty_period_config (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL UNIQUE, slot_type TEXT NOT NULL, sort_order INTEGER NOT NULL, start_time TEXT DEFAULT '08:00', auto_absent_min INTEGER DEFAULT 10)").run(); } catch {}
    try { await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_schedule_date ON duty_schedule(date)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_duty_attendance_schedule ON duty_attendance(schedule_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_attendance_unique ON duty_attendance(schedule_id, staff_id, period)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_duty_score_record_staff ON duty_score_record(staff_id)").run(); } catch {}
    try { await env.DB.prepare("INSERT OR IGNORE INTO duty_period_config (label, slot_type, sort_order, start_time, auto_absent_min) VALUES ('第一节课后', 'small_break', 1, '09:00', 9), ('上午大课间', 'big_break', 2, '09:50', 34), ('第三节课后', 'small_break', 3, '11:05', 39), ('第五节课后', 'small_break', 4, '14:50', 214), ('下午大课间', 'no_duty', 5, '15:00', 74), ('第七节课后', 'small_break', 6, '16:55', 74)").run(); } catch {}
    // ── Migration: update already-deployed period config ──
    try { await env.DB.prepare("UPDATE duty_period_config SET auto_absent_min=9 WHERE label='第一节课后'").run(); } catch {}
    try { await env.DB.prepare("UPDATE duty_period_config SET auto_absent_min=34 WHERE label='上午大课间'").run(); } catch {}
    try { await env.DB.prepare("UPDATE duty_period_config SET start_time='11:05', auto_absent_min=39 WHERE label='第三节课后'").run(); } catch {}
    try { await env.DB.prepare("UPDATE duty_period_config SET start_time='14:50', auto_absent_min=214 WHERE label='第五节课后'").run(); } catch {}
    try { await env.DB.prepare("UPDATE duty_period_config SET auto_absent_min=74 WHERE label='下午大课间'").run(); } catch {}
    try { await env.DB.prepare("UPDATE duty_period_config SET slot_type='small_break', start_time='16:55', auto_absent_min=74 WHERE label='第七节课后'").run(); } catch {}
    // Features & notifications（新表，每次都确保存在，必须在 _db_init_done 检查之前）
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS features (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT 'bell', globally_enabled INTEGER DEFAULT 0, invite_mode TEXT DEFAULT 'manual', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_feature_responses (user_id INTEGER NOT NULL, feature_key TEXT NOT NULL, status TEXT DEFAULT 'pending', invited_at TEXT, responded_at TEXT, PRIMARY KEY(user_id, feature_key))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '', link TEXT DEFAULT '', icon TEXT DEFAULT '', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_features_key ON features(key)").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE announcements ADD COLUMN image_url TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE announcements ADD COLUMN status TEXT DEFAULT '已通过'").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE announcements ADD COLUMN reviewed_by TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE announcements ADD COLUMN reviewed_at TEXT").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE announcements ADD COLUMN reject_reason TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE issues ADD COLUMN image_url TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE finance ADD COLUMN type TEXT NOT NULL DEFAULT '支出'").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE finance ADD COLUMN amount REAL NOT NULL DEFAULT 0").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE poll_questions ADD COLUMN max_length INTEGER DEFAULT 1000").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE poll_responses ADD COLUMN ip TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN class_name TEXT NOT NULL DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE polls ADD COLUMN allowed_classes TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN password_reset INTEGER DEFAULT 0").run(); } catch {}
    try { await env.DB.prepare("UPDATE finance SET department = '办公室' WHERE department IS NULL OR department = ''").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN achievements TEXT NOT NULL DEFAULT '[]'").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'open', require_name INTEGER NOT NULL DEFAULT 0, min_role TEXT, created_by TEXT NOT NULL, total_votes INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS poll_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, options TEXT DEFAULT '[]', image_url TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS poll_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, user_id INTEGER, voter_name TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS poll_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, question_id INTEGER NOT NULL, answer TEXT NOT NULL)").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', system_data TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS announcement_images (id INTEGER PRIMARY KEY AUTOINCREMENT, announcement_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_announce_images_aid ON announcement_images(announcement_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_questions_pid ON poll_questions(poll_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_responses_pid ON poll_responses(poll_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_answers_rid ON poll_answers(response_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_type_created ON chat_messages(type, created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_finance_created ON finance(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_finance_department ON finance(department)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_polls_created ON polls(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_hall_bookings_date ON hall_bookings(date)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_hall_bookings_status ON hall_bookings(status)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_answers_qid ON poll_answers(question_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_user ON poll_responses(poll_id, user_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_ip ON poll_responses(poll_id, ip)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_created_by ON comments(created_by)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_hall_bookings_user_id ON hall_bookings(user_id)").run(); } catch {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_activity_volunteers_activity_member ON activity_volunteers(activity_id, member_name)").run(); } catch {}
    try { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('_db_init_done', '1')").run(); } catch {}
  } catch {
    const sql = [
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, location TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT '待处理', submitted_by TEXT NOT NULL, updated_by TEXT, contact TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)",
      "CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, image_url TEXT DEFAULT '', status TEXT DEFAULT '已通过', reviewed_by TEXT DEFAULT '', reviewed_at TEXT, reject_reason TEXT DEFAULT '', created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS finance (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT NOT NULL, tags TEXT DEFAULT '[]', notes TEXT DEFAULT '', type TEXT NOT NULL DEFAULT '支出', amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT '待完成', created_by TEXT NOT NULL, completed_by TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT, department TEXT DEFAULT '', fund_type TEXT DEFAULT '基金账单', internal_activity INTEGER DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT '待审核', reject_reason TEXT, created_by TEXT NOT NULL, reviewed_by TEXT, created_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT)",
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      "INSERT OR IGNORE INTO settings VALUES ('site_closed', 'false')",
      "INSERT OR IGNORE INTO settings VALUES ('site_closed_message', '')",
      "INSERT OR IGNORE INTO settings VALUES ('site_closed_by', '')",
      "CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "INSERT OR IGNORE INTO settings VALUES ('last_cleanup', '')",
      "CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'open', require_name INTEGER NOT NULL DEFAULT 0, min_role TEXT, created_by TEXT NOT NULL, total_votes INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS poll_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, options TEXT DEFAULT '[]', image_url TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, max_length INTEGER NOT NULL DEFAULT 1000)",
      "CREATE TABLE IF NOT EXISTS poll_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, user_id INTEGER, voter_name TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS poll_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, question_id INTEGER NOT NULL, answer TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS announcement_images (id INTEGER PRIMARY KEY AUTOINCREMENT, announcement_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', system_data TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT DEFAULT '', time TEXT NOT NULL, departments TEXT DEFAULT '', need_volunteers INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS activity_volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, member_name TEXT NOT NULL, department TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS feed_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id INTEGER NOT NULL, user_name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, contact TEXT DEFAULT '', page TEXT DEFAULT '', section TEXT DEFAULT '', version TEXT DEFAULT '', turnstile_bypass INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS duty_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, department TEXT NOT NULL, class TEXT NOT NULL, name TEXT NOT NULL, password TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS duty_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, staff_a_id INTEGER NOT NULL, staff_b_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS duty_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, period TEXT NOT NULL, sign_in_time TEXT, sign_out_time TEXT, duration_sec INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', score_absent REAL DEFAULT 0, score_duration REAL DEFAULT 0, is_manual INTEGER DEFAULT 0, modified_by TEXT DEFAULT '', modified_reason TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS duty_score_record (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, date TEXT NOT NULL, period TEXT NOT NULL, score REAL NOT NULL, reason TEXT DEFAULT '', recorder TEXT DEFAULT 'system', is_cancelled INTEGER DEFAULT 0, cancel_reason TEXT DEFAULT '', cancel_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS duty_period_config (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL UNIQUE, slot_type TEXT NOT NULL, sort_order INTEGER NOT NULL, start_time TEXT DEFAULT '08:00', auto_absent_min INTEGER DEFAULT 10)",
      "INSERT OR IGNORE INTO duty_period_config (label, slot_type, sort_order, start_time, auto_absent_min) VALUES ('第一节课后', 'small_break', 1, '09:00', 9), ('上午大课间', 'big_break', 2, '09:50', 34), ('第三节课后', 'small_break', 3, '11:05', 39), ('第五节课后', 'small_break', 4, '14:50', 214), ('下午大课间', 'no_duty', 5, '15:00', 74), ('第七节课后', 'small_break', 6, '16:55', 74)",
      // Features & notifications
      "CREATE TABLE IF NOT EXISTS features (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT 'bell', globally_enabled INTEGER DEFAULT 0, invite_mode TEXT DEFAULT 'manual', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS user_feature_responses (user_id INTEGER NOT NULL, feature_key TEXT NOT NULL, status TEXT DEFAULT 'pending', invited_at TEXT, responded_at TEXT, PRIMARY KEY(user_id, feature_key))",
      "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '', link TEXT DEFAULT '', icon TEXT DEFAULT '', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_features_key ON features(key)",
    ];
    for (const stmt of sql) {
      await env.DB.prepare(stmt).run();
    }
  }
  try { await env.DB.prepare("DROP TABLE IF EXISTS tasks").run(); } catch {}
  try { await env.DB.prepare("DROP TABLE IF EXISTS cultural_items").run(); } catch {}
}

export async function verifyTurnstile(token, env) {
  // 开发环境通过环境变量 TURNSTILE_BYPASS=true 跳过验证，客户端参数不可信
  if (env.TURNSTILE_BYPASS === 'true' || env.TURNSTILE_BYPASS === true) return true;
  if (!token) return false;
  if (!env.TURNSTILE_SECRET) return false;
  const secret = env.TURNSTILE_SECRET;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: `secret=${secret}&response=${token}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json();
    return data.success === true;
  } catch { return false; }
}

/* ═══════════════════════════════════════════════════════
   自研图形验证码（HMAC 签名 token，无状态）
   - generateCaptcha(env) → { token, svg }
   - verifyCaptcha(token, code, env) → boolean
   ═══════════════════════════════════════════════════════ */
const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'; // 排除易混淆 0/O/1/I/l/o
const CAPTCHA_TTL = 5 * 60 * 1000; // 5 分钟有效期

function getCaptchaSecret(env) {
  return env.CAPTCHA_SECRET || env.TURNSTILE_SECRET || 'captcha-default-fallback-secret';
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateCaptchaSVG(code) {
  const W = 200, H = 70;
  const palette = ['#1a1a1a', '#2d5b3e', '#7a3d3d', '#3d4d7a', '#6b3d7a'];
  let chars = '';
  for (let i = 0; i < code.length; i++) {
    const x = 28 + i * 42;
    const y = 48 + (Math.random() * 10 - 5);
    const rotate = Math.random() * 30 - 15;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const size = 36 + Math.random() * 6;
    chars += `<text x="${x}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${size.toFixed(1)}" font-weight="bold" fill="${color}" transform="rotate(${rotate.toFixed(1)} ${x} ${y})">${code[i]}</text>`;
  }
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * W, y1 = Math.random() * H;
    const x2 = Math.random() * W, y2 = Math.random() * H;
    const color = palette[Math.floor(Math.random() * palette.length)];
    lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="1" opacity="0.4"/>`;
  }
  let dots = '';
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const color = palette[Math.floor(Math.random() * palette.length)];
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1" fill="${color}" opacity="0.5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f4f4f4"/>${dots}${lines}${chars}</svg>`;
}

export async function generateCaptcha(env) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  const expire = Date.now() + CAPTCHA_TTL;
  const nonce = Math.random().toString(36).slice(2, 10);
  const payload = `${code}:${expire}:${nonce}`;
  const signature = await hmacHex(payload, getCaptchaSecret(env));
  return { token: btoa(payload + ':' + signature), svg: generateCaptchaSVG(code) };
}

export async function verifyCaptcha(token, code, env) {
  if (env.CAPTCHA_BYPASS === 'true' || env.CAPTCHA_BYPASS === true) return true;
  if (!token || !code) return false;
  try {
    const decoded = atob(token);
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const expectedSig = await hmacHex(payload, getCaptchaSecret(env));
    if (signature !== expectedSig) return false;
    const parts = payload.split(':');
    if (parts.length < 3) return false;
    const storedCode = parts[0];
    const expire = Number(parts[1]);
    if (!storedCode || !expire) return false;
    if (Date.now() > expire) return false;
    if (storedCode.toLowerCase() !== String(code).toLowerCase()) return false;
    return true;
  } catch { return false; }
}

export async function computeHash(obj) {
  const str = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function attachAnnounceImages(env, rows) {
  if (!rows || rows.length === 0) return;
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  try {
    const imgRows = await env.DB.prepare(`SELECT announcement_id, image_url FROM announcement_images WHERE announcement_id IN (${placeholders}) ORDER BY sort_order ASC`).bind(...ids).all();
    const map = {};
    for (const ir of imgRows.results) {
      if (!map[ir.announcement_id]) map[ir.announcement_id] = [];
      map[ir.announcement_id].push(ir.image_url);
    }
    for (const row of rows) {
      const legacy = safeParse(row.image_url, row.image_url ? [row.image_url] : []);
      const child = map[row.id] || [];
      row.image_url = [...(Array.isArray(legacy) ? legacy : []), ...child];
    }
  } catch {
    for (const row of rows) {
      row.image_url = safeParse(row.image_url, row.image_url ? [row.image_url] : []);
    }
  }
}

export async function replaceAnnounceImages(env, announcementId, imageUrls) {
  await env.DB.prepare('DELETE FROM announcement_images WHERE announcement_id = ?').bind(announcementId).run();
  for (let i = 0; i < imageUrls.length; i++) {
    await env.DB.prepare('INSERT INTO announcement_images (announcement_id, image_url, sort_order) VALUES (?, ?, ?)').bind(announcementId, imageUrls[i], i).run();
  }
}

export async function autoCleanup(env) {
  let total = 0;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='last_cleanup'").first();
    const last = row?.value || '';
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (last && last.startsWith(now.slice(0, 10))) return 0;
    const r1 = await env.DB.prepare("DELETE FROM issues WHERE status = '已完成' AND updated_at < datetime('now', '-90 days')").run();
    total += r1.meta.changes;
    const r3 = await env.DB.prepare("DELETE FROM hall_bookings WHERE date < date('now', '-14 days')").run();
    total += r3.meta.changes;
    const r4 = await env.DB.prepare("DELETE FROM comments WHERE target_type='issue' AND target_id NOT IN (SELECT id FROM issues)").run();
    total += r4.meta.changes;
    const r5 = await env.DB.prepare("DELETE FROM comments WHERE target_type='announcement' AND target_id NOT IN (SELECT id FROM announcements)").run();
    total += r5.meta.changes;
    const r6 = await env.DB.prepare("DELETE FROM poll_responses WHERE poll_id NOT IN (SELECT id FROM polls)").run();
    total += r6.meta.changes;
    const r7 = await env.DB.prepare("DELETE FROM poll_answers WHERE response_id NOT IN (SELECT id FROM poll_responses)").run();
    total += r7.meta.changes;
    const r8 = await env.DB.prepare("DELETE FROM poll_questions WHERE poll_id NOT IN (SELECT id FROM polls)").run();
    total += r8.meta.changes;
    const r9 = await env.DB.prepare("DELETE FROM announcement_images WHERE announcement_id NOT IN (SELECT id FROM announcements)").run();
    total += r9.meta.changes;
    const r10 = await env.DB.prepare("DELETE FROM feed_comments WHERE feed_id NOT IN (SELECT id FROM chat_messages)").run();
    total += r10.meta.changes;
    const r11 = await env.DB.prepare("DELETE FROM activity_volunteers WHERE activity_id NOT IN (SELECT id FROM activities)").run();
    total += r11.meta.changes;
    const r12 = await env.DB.prepare("DELETE FROM chat_messages WHERE created_at < datetime('now', '-90 days')").run();
    total += r12.meta.changes;
    const r13 = await env.DB.prepare("DELETE FROM users WHERE role='pending' AND created_at < datetime('now', '-30 days')").run();
    total += r13.meta.changes;
    const r14 = await env.DB.prepare("DELETE FROM duty_score_record WHERE created_at < datetime('now', '-14 days')").run();
    total += r14.meta.changes;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_cleanup', ?)").bind(now).run();
  } catch {}
  return total;
}

export async function getStorageStats(env) {
  const D1_LIMIT = 5 * 1024 * 1024 * 1024;
  const [financeBytes, issuesBytes, announcementsBytes, reviewsBytes, announceImagesBytes, financeCount, userCount, issueCount, announceCount, reviewCount, chatCount, hallCount, pollCount, commentCount, volunteerCount, feedCommentCount, chatText, commentText, announceText, issueText, financeText, hallText, pollText, feedText] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(image_url)), 0) AS total FROM finance").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(image_url)), 0) AS total FROM issues").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(image_url)), 0) AS total FROM announcements").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(image_url)), 0) AS total FROM reviews").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(image_url)), 0) AS total FROM announcement_images").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM finance").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM issues").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM announcements").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM reviews").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM chat_messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM hall_bookings").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM polls").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM comments").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM activity_volunteers").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM feed_comments").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(content) + LENGTH(system_data)), 0) AS total FROM chat_messages").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(content)), 0) AS total FROM comments").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(title) + LENGTH(content) + LENGTH(reject_reason)), 0) AS total FROM announcements").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(location) + LENGTH(description) + LENGTH(contact) + LENGTH(notes)), 0) AS total FROM issues").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(notes) + LENGTH(tags)), 0) AS total FROM finance").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(purpose) + LENGTH(applicant) + LENGTH(reviewed_by)), 0) AS total FROM hall_bookings").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(title) + LENGTH(description)), 0) AS total FROM polls").first(),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(content) + LENGTH(user_name)), 0) AS total FROM feed_comments").first(),
  ]);
  const rawImageBytes = Number(financeBytes?.total || 0) + Number(issuesBytes?.total || 0) + Number(announcementsBytes?.total || 0) + Number(reviewsBytes?.total || 0) + Number(announceImagesBytes?.total || 0);
  const imageBytes = Math.round(rawImageBytes * 0.75);
  const textBytes = Number(chatText?.total || 0) + Number(commentText?.total || 0) + Number(announceText?.total || 0) + Number(issueText?.total || 0) + Number(financeText?.total || 0) + Number(hallText?.total || 0) + Number(pollText?.total || 0) + Number(feedText?.total || 0);
  const totalBytes = imageBytes + textBytes;
  const imgPct = Math.min(100, +(imageBytes / D1_LIMIT * 100).toFixed(1));
  const totalPct = Math.min(100, +(totalBytes / D1_LIMIT * 100).toFixed(1));
  return {
    imageBytes, textBytes, totalBytes, limitBytes: D1_LIMIT,
    percent: imgPct, totalPercent: totalPct,
    financeCount: Number(financeCount?.c || 0), userCount: Number(userCount?.c || 0),
    issueCount: Number(issueCount?.c || 0), announceCount: Number(announceCount?.c || 0),
    reviewCount: Number(reviewCount?.c || 0), chatCount: Number(chatCount?.c || 0),
    hallCount: Number(hallCount?.c || 0), pollCount: Number(pollCount?.c || 0),
    commentCount: Number(commentCount?.c || 0), volunteerCount: Number(volunteerCount?.c || 0),
    feedCommentCount: Number(feedCommentCount?.c || 0),
  };
}

export async function insertChatSystemMessage(env, data) {
  const { action, from_dept, to_dept, title, status, ref_type, ref_id } = data;
  const parts = [];
  if (from_dept) parts.push(from_dept);
  if (to_dept) parts.push('向' + to_dept);
  parts.push(action);
  let content = parts.join('');
  if (title) content += '：' + title;
  const system_data = JSON.stringify({ action, from_dept, to_dept, title, status, ref_type, ref_id });
  await env.DB.prepare(
    "INSERT INTO chat_messages (content, type, system_data, user_name) VALUES (?, 'system', ?, '')"
  ).bind(content, system_data).run();
}

export async function insertNotification(env, content) {
  await env.DB.prepare(
    "INSERT INTO chat_messages (content, type, user_name) VALUES (?, 'notification', '')"
  ).bind(content).run();
}

export async function updateChatSystemStatus(env, ref_type, ref_id, newStatus) {
  const esc = s => String(s).replace(/[%_\\]/g, '\\$&');
  const rows = await env.DB.prepare(
    "SELECT id, system_data FROM chat_messages WHERE type='system' AND system_data LIKE ? ESCAPE '\\'"
  ).bind(`%"ref_type":"${esc(ref_type)}","ref_id":${esc(ref_id)}%`).all();
  for (const row of rows.results) {
    try {
      const data = safeParse(row.system_data, {});
      const statusMap = { '待完成': '待处理', '已完成': '已完成', '已报销': '已完成' };
      data.status = statusMap[newStatus] || newStatus;
      const parts2 = [];
      if (data.from_dept) parts2.push(data.from_dept);
      if (data.to_dept) parts2.push('向' + data.to_dept);
      parts2.push(data.action);
      let updatedContent = parts2.join('');
      if (data.title) updatedContent += '：' + data.title;
      await env.DB.prepare("UPDATE chat_messages SET content = ?, system_data = ? WHERE id = ?")
        .bind(updatedContent, JSON.stringify(data), row.id).run();
    } catch {}
  }
}

export async function addAchievementBatchEntry(env, userName, achId) {
  try {
    const achName = ACH_NAMES[achId] || achId;
    const batchKey = 'achievement_batch';
    const batchRow = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(batchKey).first();
    const today = new Date().toISOString().slice(0, 10);
    let batch = batchRow ? safeParse(batchRow.value, { date: today, entries: [] }) : { date: today, entries: [] };
    if (batch.date !== today && batch.entries && batch.entries.length > 0) {
      const grouped = {};
      batch.entries.forEach(e => { (grouped[e.user] ||= []).push(e.title); });
      const entryTexts = Object.entries(grouped).map(([user, titles]) => `${user} 解锁了 ${titles.join('、')}`);
      await insertChatSystemMessage(env, { action: '昨日成就解锁', from_dept: '', to_dept: '', title: entryTexts.join('；'), status: '已完成', ref_type: 'achievement' });
      batch = { date: today, entries: [] };
    }
    if (batch.date !== today) batch = { date: today, entries: [] };
    batch.entries.push({ user: userName, title: achName });
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(batchKey, JSON.stringify(batch)).run();
  } catch {}
}

export async function getBannerData(env) {
  const annRows = await env.DB.prepare(
    "SELECT id, title, content, image_url, created_by, created_at FROM announcements WHERE status IS NULL OR status = '已通过' ORDER BY created_at DESC LIMIT 3"
  ).all();
  const annIds = annRows.results.map(r => r.id);
  const imgMap = {};
  if (annIds.length > 0) {
    const placeholders = annIds.map(() => '?').join(',');
    const imgs = await env.DB.prepare(
      `SELECT announcement_id, image_url FROM announcement_images WHERE announcement_id IN (${placeholders}) ORDER BY sort_order ASC`
    ).bind(...annIds).all();
    for (const ir of imgs.results) {
      if (!imgMap[ir.announcement_id]) imgMap[ir.announcement_id] = ir.image_url;
    }
  }
  const announcements = [];
  for (const row of annRows.results) {
    let imgUrl = imgMap[row.id] || '';
    if (!imgUrl && row.image_url) {
      const parsed = safeParse(row.image_url); if (Array.isArray(parsed) && parsed.length > 0) imgUrl = parsed[0];
    }
    announcements.push({ id: row.id, title: row.title, content: row.content, created_by: row.created_by, created_at: row.created_at, image_url: imgUrl, _images: imgUrl ? [imgUrl] : [] });
  }
  const hallRows = await env.DB.prepare(
    "SELECT date, start_time, end_time, purpose, applicant FROM hall_bookings WHERE status = 'approved' AND date >= date('now') ORDER BY date ASC, start_time ASC LIMIT 3"
  ).all();
  const hallBookings = hallRows.results.map(r => ({
    date: r.date, start_time: r.start_time, end_time: r.end_time,
    purpose: r.purpose, applicant: r.applicant
  }));
  return { announcements, hallBookings };
}

// ─── Feature notifications ───
// 向指定用户创建消息通知（仅当该用户已启用 messages 功能时）
export async function createNotification(env, userId, type, title, body = '', link = '', icon = '', featureKey = 'messages') {
  if (!userId || !title) return;
  try {
    // 检查用户是否已启用指定功能（同时校验功能已全局启用）
    const resp = await env.DB.prepare(
      "SELECT ufr.status FROM user_feature_responses ufr " +
      "JOIN features f ON f.key = ufr.feature_key " +
      "WHERE ufr.user_id = ? AND ufr.feature_key = ? AND f.globally_enabled = 1"
    ).bind(userId, featureKey).first();
    if (!resp || resp.status !== 'accepted') return;
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, body, link, icon) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, type, title, body, link, icon).run();
  } catch {}
}

// 向多个用户批量创建通知（仅向已启用指定功能的用户）
export async function createNotificationBatch(env, userIds, type, title, body = '', link = '', icon = '', featureKey = 'messages') {
  if (!userIds || !userIds.length || !title) return;
  try {
    // 只保留已启用指定功能且功能已全局启用的用户
    const placeholders = userIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT ufr.user_id FROM user_feature_responses ufr ` +
      `JOIN features f ON f.key = ufr.feature_key ` +
      `WHERE ufr.feature_key = ? AND ufr.status = 'accepted' AND f.globally_enabled = 1 AND ufr.user_id IN (${placeholders})`
    ).bind(featureKey, ...userIds).all();
    const accepted = rows.results.map(r => r.user_id);
    if (!accepted.length) return;
    const valPh = accepted.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const binds = [];
    for (const uid of accepted) {
      binds.push(uid, type, title, body, link, icon);
    }
    await env.DB.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link, icon) VALUES ${valPh}`
    ).bind(...binds).run();
  } catch {}
}

// 检查用户是否启用了某功能（同时校验功能已全局启用）
export async function isFeatureEnabled(env, userId, featureKey) {
  if (!userId) return false;
  try {
    const resp = await env.DB.prepare(
      "SELECT ufr.status FROM user_feature_responses ufr " +
      "JOIN features f ON f.key = ufr.feature_key " +
      "WHERE ufr.user_id = ? AND ufr.feature_key = ? AND f.globally_enabled = 1"
    ).bind(userId, featureKey).first();
    return resp && resp.status === 'accepted';
  } catch { return false; }
}

// 按用户名查找 user_id（取第一个匹配）
export async function getUserIdByName(env, name) {
  if (!name) return null;
  try {
    const row = await env.DB.prepare("SELECT id FROM users WHERE name = ? AND role IN ('member','admin','owner','teacher') LIMIT 1").bind(name).first();
    return row?.id || null;
  } catch { return null; }
}
