/**
 * WinUI 页面渲染验证脚本
 *
 * 关键设计：拿 dist/<entry>.html 作为底子（真实 HTML、真实遗留脚本），
 * 只把底层的 window.fetch 换成打桩 —— 这样 api.js 自己的代码路径
 * （含它调用 showNavLoading 的那段）会真实执行，才能验出
 * 「nav.js 未加载导致 ReferenceError 打断请求链路」这类问题。
 *
 * 同时挂一个错误收集器，把 window.onerror / unhandledrejection 写进 DOM，
 * 便于用 --dump-dom 断言「零 JS 错误」。
 *
 * 用法：node scripts/verify-page.mjs services|announcements
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const entry = process.argv[2] || 'services'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const srcPath = join(dist, `${entry}.html`)
if (!existsSync(srcPath)) throw new Error(`找不到 ${srcPath}`)
const html = readFileSync(srcPath, 'utf8')

const now = Math.floor(Date.now() / 1000)

const fixtures = {
  services: {
    issues: [
      { id: 1, location: '教学楼3楼301', description: '投影仪无法开机', status: '待处理', submitted_by: '张三', created_at: now, comment_count: 2, notes: '已联系厂商' },
      { id: 2, location: '体育馆器材室', description: '门锁损坏', status: '处理中', submitted_by: '李四', created_at: now, comment_count: 0, updated_by: '王五' },
      { id: 3, location: '图书馆二楼自习区', description: '照明灯闪烁', status: '已完成', submitted_by: '匿名访客', created_at: now, comment_count: 1 }
    ],
    banner: { announcements: [{ id: 9, title: '团委换届通知', content: '请各班团支书于本周五前提交名单', created_at: now, created_by: '团委办公室' }] },
    comments: [{ id: 11, created_by: '王五', content: '已安排人员处理', created_at: now }]
  },
  announcements: {
    list: [
      { id: 21, title: '关于开展秋季志愿服务的通知', content: '定于本月下旬组织志愿服务活动，请有意向的同学于本周内报名。', status: '已通过', created_by: '团委办公室', created_at: now, comment_count: 3, has_image: 1 },
      { id: 22, title: '团委学生干事招新结果公示', content: '经面试与综合评议，现将本届招新结果予以公示。', status: '已通过', created_by: '组织部', created_at: now, comment_count: 0, has_image: 0 },
      { id: 23, title: '关于调整值日安排的通知', content: '因考试周临近，值日安排相应调整，详见附表。', status: '待审核', created_by: '纪检部', created_at: now, comment_count: 1, has_image: 0 }
    ]
  },
  moment: {
    feedPayload: {
      messages: [
        { id: 31, type: 'system', content: '团委办公室 通过了你提交的报修「投影仪无法开机」', created_at: new Date(now * 1000).toISOString(), ref_type: 'issue', ref_id: 1, system_data: JSON.stringify({ status: '已完成' }) },
        { id: 32, type: 'system', content: '发布了一条新公告：关于开展秋季志愿服务的通知', created_at: new Date((now - 7200) * 1000).toISOString(), ref_type: 'announcement', ref_id: 21 },
        { id: 33, type: 'system', content: '发起了新投票：秋季运动会项目征集', created_at: new Date((now - 86400) * 1000).toISOString(), ref_type: 'poll', ref_id: 5 }
      ],
      nextCursor: null,
      hasMore: false
    }
  },
  polls: {
    polls: [
      { id: 5, title: '秋季运动会项目征集', description: '请选择你希望增设的比赛项目', status: 'open', min_role: '', created_by: '团委办公室', total_votes: 42, require_name: 0 },
      { id: 6, title: '团委学生干事招新面试时间', description: '请选择方便的时间段', status: 'closed', min_role: 'member', created_by: '组织部', total_votes: 18, require_name: 1 }
    ]
  },
  messages: {
    msgPayload: {
      messages: [
      { id: 1, type: 'system', title: '欢迎使用通办平台', body: '你的账号已通过审核，现在可以访问全部功能。', is_read: false, created_at: new Date(now * 1000).toISOString() },
      { id: 2, type: 'announcement', title: '新公告：团委换届通知', body: '请各班团支书于本周五前提交名单', link: '/announcement.html?id=9', is_read: false, created_at: new Date((now - 3600) * 1000).toISOString() },
      { id: 3, type: 'issue_status', title: '你的报修已处理完成', body: '教学楼3楼301 投影仪无法开机', is_read: true, created_at: new Date((now - 86400) * 1000).toISOString() }
      ],
      total: 3,
      unread: 2
    }
  }
}

const stub = `
(function () {
  window.__errors = [];
  function record(msg) {
    window.__errors.push(String(msg));
    var el = document.getElementById('__errors');
    if (!el) { el = document.createElement('div'); el.id = '__errors'; document.documentElement.appendChild(el); }
    el.textContent = window.__errors.join(' || ');
  }
  window.addEventListener('error', function (e) { record((e.message || '') + ' @' + (e.filename || '')); });
  window.addEventListener('unhandledrejection', function (e) { record('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)); });

  window.getUser = function () { return { name: '测试用户', role: 'admin' }; };
  window.isAdmin = function () { return true; };
  localStorage.setItem('token', 'stub');
  localStorage.setItem('user', JSON.stringify({ name: '测试用户', role: 'admin' }));
  window.confirm = function () { return false; };
  window._fx = ${JSON.stringify(fixtures[entry])};

  function payload(url) {
    var fx = window._fx;
    if (fx.issues && url.indexOf('/api/issues') === 0) return fx.issues;
    if (fx.banner && url.indexOf('/api/banner') === 0) return fx.banner;
    if (fx.comments && url.indexOf('/api/comments/') === 0) return fx.comments;
    if (fx.msgPayload && url.indexOf('/api/messages') === 0) return fx.msgPayload;
    if (fx.polls && url.indexOf('/api/polls') === 0) return fx.polls;
    if (fx.feedPayload && url.indexOf('/api/chat/messages') === 0) return fx.feedPayload;
    if (fx.feedPayload && url.indexOf('/api/feed/') === 0) return [{ id: 41, created_by: '王五', content: '收到', created_at: new Date(now * 1000).toISOString() }];
    if (fx.list && url.indexOf('/api/announcements/images') === 0) return {};
    if (fx.list && url.indexOf('/api/announcements') === 0) return fx.list;
    if (url.indexOf('/api/settings') === 0) return {};
    if (url.indexOf('/api/sync') === 0) return {};
    if (url.indexOf('/api/features/enabled') === 0) return { enabled: [{ key: 'messages' }] };
    if (url.indexOf('/api/features/') === 0) return { enabled: [] };
    if (url.indexOf('/api/captcha') === 0) return { token: 't', svg: '<svg/>' };
    if (url.indexOf('/api/auth/me') === 0) return { name: '测试用户', role: 'admin' };
    if (url.indexOf('/api/messages/unread-count') === 0) return { count: 0 };
    return null;
  }

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = payload(url);
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

// 把桩打进 <head> 最前面，确保先于所有遗留脚本执行
const out = html.replace(/<head([^>]*)>/i, `<head$1>\n<script>${stub}</script>`)
writeFileSync(join(dist, '__verify.html'), out)

console.log(`已生成 dist/__verify.html (entry=${entry})`)
console.log('  真实 HTML + 真实遗留脚本，仅替换 window.fetch')
