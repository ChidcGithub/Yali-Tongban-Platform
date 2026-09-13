/**
 * WinUI 页面渲染验证脚本
 *
 * 关键设计：拿 dist/<entry>.html 作为底子（真实 HTML、真实遗留脚本），
 * 只把底层的 window.fetch 换成打桩 —— 这样 api.js 自己的代码路径
 * （含它调用 showNavLoading 的那段）会真实执行，才能验出
 * 「nav.js 未加载导致 ReferenceError 打断请求链路」这类问题。
 *
 * 注意：不要改成打桩 apiGet/apiPost —— 那会绕开 api.js 自身的代码路径，
 * 曾经因此漏掉一个真实 bug。
 *
 * 同时挂错误收集器，把 window.onerror / unhandledrejection 写进 DOM，
 * 便于用 --dump-dom 断言「零 JS 错误」。
 *
 * 用法：
 *   node scripts/verify-page.mjs <entry>      生成 dist/__verify.html
 *   需要 query 的页面（如公告详情）在 URL 上自行带，例如
 *   chrome --dump-dom "http://127.0.0.1:4173/__verify.html?id=21"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const entry = process.argv[2] || 'services'
/** 可选：第 3 个参数是查询串（如 "?id=21"），注入给依赖 location.search 的页面 */
const query = process.argv[3] || ''
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const srcPath = join(dist, `${entry}.html`)
if (!existsSync(srcPath)) throw new Error(`找不到 ${srcPath}（先跑 npm run build）`)
const html = readFileSync(srcPath, 'utf8')

const now = Math.floor(Date.now() / 1000)

/**
 * 时间戳格式必须与后端一致：D1 里 created_at 是 TEXT，
 * 由 SQLite 的 datetime('now') 生成，形如 '2026-06-04 14:59:00'。
 * 用 ISO 串或数字会与真实数据的解析路径不一致，验不出真问题。
 */
const ts = (offsetSec = 0) => {
  const d = new Date(Date.now() - offsetSec * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const FIXTURES = {
  services: {
    issues: [
      { id: 1, location: '教学楼3楼301', description: '投影仪无法开机', status: '待处理', submitted_by: '张三', created_at: ts(), comment_count: 2, notes: '已联系厂商' },
      { id: 2, location: '体育馆器材室', description: '门锁损坏', status: '处理中', submitted_by: '李四', created_at: ts(), comment_count: 0, updated_by: '王五' },
      { id: 3, location: '图书馆二楼自习区', description: '照明灯闪烁', status: '已完成', submitted_by: '匿名访客', created_at: ts(), comment_count: 1 }
    ],
    banner: {
      announcements: [{ id: 9, title: '团委换届通知', content: '请各班团支书于本周五前提交名单', created_at: ts(), created_by: '团委办公室' }]
    },
    comments: [{ id: 11, created_by: '王五', content: '已安排人员处理', created_at: ts() }]
  },

  announcements: {
    list: [
      { id: 21, title: '关于开展秋季志愿服务的通知', content: '定于本月下旬组织志愿服务活动，请有意向的同学于本周内报名。', status: '已通过', created_by: '团委办公室', created_at: ts(), comment_count: 3, has_image: 1 },
      { id: 22, title: '团委学生干事招新结果公示', content: '经面试与综合评议，现将本届招新结果予以公示。', status: '已通过', created_by: '组织部', created_at: ts(), comment_count: 0, has_image: 0 },
      { id: 23, title: '关于调整值日安排的通知', content: '因考试周临近，值日安排相应调整，详见附表。', status: '待审核', created_by: '纪检部', created_at: ts(), comment_count: 1, has_image: 0 }
    ]
  },

  announcement: {
    annDetail: {
      id: 21,
      title: '关于开展秋季志愿服务的通知',
      content: '定于本月下旬组织志愿服务活动，请有意向的同学于本周内报名。具体安排将另行通知。',
      status: '已通过',
      created_by: '团委办公室',
      created_at: ts(),
      comment_count: 1,
      has_image: 0
    },
    comments: [{ id: 11, created_by: '王五', content: '已报名，期待参与', created_at: ts() }]
  },

  messages: {
    msgPayload: {
      messages: [
        { id: 1, type: 'system', title: '欢迎使用通办平台', body: '你的账号已通过审核，现在可以访问全部功能。', is_read: false, created_at: ts(0) },
        { id: 2, type: 'announcement', title: '新公告：团委换届通知', body: '请各班团支书于本周五前提交名单', link: '/announcement.html?id=9', is_read: false, created_at: ts(3600) },
        { id: 3, type: 'issue_status', title: '你的报修已处理完成', body: '教学楼3楼301 投影仪无法开机', is_read: true, created_at: ts(86400) }
      ],
      total: 3,
      unread: 2
    }
  },

  moment: {
    feedPayload: {
      messages: [
        { id: 31, type: 'system', content: '团委办公室 通过了你提交的报修「投影仪无法开机」', created_at: ts(0), ref_type: 'issue', ref_id: 1, system_data: JSON.stringify({ status: '已完成' }) },
        { id: 32, type: 'system', content: '发布了一条新公告：关于开展秋季志愿服务的通知', created_at: ts(7200), ref_type: 'announcement', ref_id: 21 },
        { id: 33, type: 'system', content: '发起了新投票：秋季运动会项目征集', created_at: ts(86400), ref_type: 'poll', ref_id: 5 }
      ],
      nextCursor: null,
      hasMore: false
    },
    comments: [{ id: 41, created_by: '王五', content: '收到', created_at: ts() }]
  },

  polls: {
    polls: [
      { id: 5, title: '秋季运动会项目征集', description: '请选择你希望增设的比赛项目', status: 'open', min_role: '', created_by: '团委办公室', total_votes: 42, require_name: 0 },
      { id: 6, title: '团委学生干事招新面试时间', description: '请选择方便的时间段', status: 'closed', min_role: 'member', created_by: '组织部', total_votes: 18, require_name: 1 }
    ]
  },

  poll: {
    pollDetail: {
      id: 5, title: '秋季运动会项目征集', description: '请选择你希望增设的比赛项目',
      status: 'open', created_by: '团委办公室', total_votes: 42, require_name: 0,
      questions: [
        { id: 1, type: 'single', title: '你最希望增设哪个项目？', options: ['4x100 米接力', '跳高', '趣味接力'] },
        { id: 2, type: 'multiple', title: '你觉得哪些环节需要改进？（可多选）', options: ['检录流程', '场地布置', '计分公示'] },
        { id: 3, type: 'text', title: '其他建议' }
      ]
    },
    myVote: []
  },
  activities: {
    activities: [
      { id: 51, name: '秋季校园志愿服务', location: '校门口广场', time: '2026-10-01 09:00', departments: '组织部、青志协', need_volunteers: 1, created_by: '团委办公室', volunteer_count: 12 },
      { id: 52, name: '团委换届大会', location: '千人报告厅', time: '2026-10-08 15:30', departments: '全体', need_volunteers: 0, created_by: '书记处', volunteer_count: 0 }
    ]
  }
}

const fx = FIXTURES[entry] ?? {}

const stub = `
(function () {
  /* 依赖 location.search 的页面（如公告详情 ?id=）需要查询串：
     直接在 URL 上带会被 vite preview 的扩展名归一化处理掉，这里注入更稳 */
  try {
    if (${JSON.stringify(query)}) {
      history.replaceState(null, '', location.pathname + ${JSON.stringify(query)});
    }
  } catch (e) {}

  window.__errors = [];
  window.__search = location.search;
  var dbg = document.createElement('div');
  dbg.id = '__search';
  dbg.textContent = 'search=' + location.search + '; pathname=' + location.pathname;
  document.documentElement.appendChild(dbg);
  function record(msg) {
    window.__errors.push(String(msg));
    var el = document.getElementById('__errors');
    if (!el) { el = document.createElement('div'); el.id = '__errors'; document.documentElement.appendChild(el); }
    el.textContent = window.__errors.join(' || ');
  }
  window.addEventListener('error', function (e) { record((e.message || '') + ' @' + (e.filename || '')); });
  window.addEventListener('unhandledrejection', function (e) { record('unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)); });

  window.getUser = function () { return { name: '测试用户', role: 'admin' }; };
  window.isAdmin = function () { return true; };
  localStorage.setItem('token', 'stub');
  localStorage.setItem('user', JSON.stringify({ name: '测试用户', role: 'admin' }));
  window.confirm = function () { return false; };

  window._fx = ${JSON.stringify(fx)};

  function payload(url) {
    var fx = window._fx;
    if (fx.annDetail && /\\/api\\/announcements\\/\\d+/.test(url)) return fx.annDetail;
    if (fx.issues && url.indexOf('/api/issues') === 0) return fx.issues;
    if (fx.banner && url.indexOf('/api/banner') === 0) return fx.banner;
    if (fx.comments && url.indexOf('/api/comments/') === 0) return fx.comments;
    if (fx.msgPayload && url.indexOf('/api/messages') === 0) return fx.msgPayload;
    if (fx.feedPayload && url.indexOf('/api/chat/messages') === 0) return fx.feedPayload;
    if (fx.feedPayload && url.indexOf('/api/feed/') === 0) return fx.comments || [];
    if (fx.pollDetail && url.indexOf('/my-vote') > 0) return fx.myVote;
    if (fx.pollDetail && /\\/api\\/polls\\/\\d+/.test(url)) return fx.pollDetail;
    if (fx.polls && url.indexOf('/api/polls') === 0) return fx.polls;
    if (fx.activities && url.indexOf('/api/activities') === 0) return fx.activities;
    if (fx.list && url.indexOf('/api/announcements/images') === 0) return {};
    if (fx.list && url.indexOf('/api/announcements') === 0) return fx.list;
    if (url.indexOf('/api/features/enabled') === 0) return { enabled: [{ key: 'messages' }] };
    if (url.indexOf('/api/features/') === 0) return { enabled: [] };
    if (url.indexOf('/api/settings') === 0) return {};
    if (url.indexOf('/api/sync') === 0) return {};
    if (url.indexOf('/api/auth/me') === 0) return { name: '测试用户', role: 'admin' };
    if (url.indexOf('/api/messages/unread-count') === 0) return { count: 0 };
    if (url.indexOf('/api/captcha') === 0) return { token: 't', svg: '<svg/>' };
    return null;
  }

  var realFetch = window.fetch;
  window.__calls = [];
  function noteCall(url, stubbed) {
    window.__calls.push((stubbed ? '[桩] ' : '[真] ') + url);
    var el = document.getElementById('__calls');
    if (!el) { el = document.createElement('div'); el.id = '__calls'; document.documentElement.appendChild(el); }
    el.textContent = window.__calls.join(' || ');
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = payload(url);
    noteCall(url, p !== null);
    if (p === null) return realFetch.call(window, input, init);
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: function (k) { return k.toLowerCase() === 'content-type' ? 'application/json' : ''; } },
      json: function () { return Promise.resolve({ success: true, data: p }); },
      text: function () { return Promise.resolve(JSON.stringify({ success: true, data: p })); }
    });
  };
})();
`

const out = html.replace(/<head([^>]*)>/i, `<head$1>\n<script>${stub}</script>`)

/* 自检：注入的脚本一旦有语法错误，会**整体不执行** ——
   而错误监听器就在这个脚本里，于是表现为「零错误但页面没数据」的静默假绿。
   这里先生成一次校验语法，有问题立刻报错。（曾因正则转义丢失踩过一次） */
try {
  // eslint-disable-next-line no-new-func
  new Function(stub)
} catch (err) {
  console.error('❌ 注入的验证脚本存在语法错误，会导致静默失效：')
  console.error('   ' + err.message)
  const bad = stub.split('\n').filter((l) => /^\s*if \(.*&&\s*\/\//.test(l))
  if (bad.length) {
    console.error('   可疑行（正则转义丢失，// 被当成注释）：')
    for (const l of bad) console.error('     ' + l.trim())
  }
  process.exit(1)
}

writeFileSync(join(dist, '__verify.html'), out)

console.log(`已生成 dist/__verify.html (entry=${entry}${query ? `, query=${query}` : ''})`)
console.log(`  真实 HTML + 真实遗留脚本，仅替换 window.fetch；桩数据键：${Object.keys(fx).join(', ') || '（无）'}`)
