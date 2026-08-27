# 06 · 前端共享基础设施规格（`public/js/` + `public/version.js`）

> 项目：yali-tongban（Cloudflare Pages 静态前端，非模块化多页应用）
> 本文覆盖：`api.js`(956 行全文)、`utils.js`、`nav.js`、`auth.js`、`captcha.js`、`lightbox.js`、`modal.js`、`graphic.js`、`features.js`、`changelog-data.js`、`version.js`。
> 所有标识符、魔法数字、文案均**照抄源码**；行号以当前工作区文件为准。

---

## 0. 总览与加载模型

- 全部为经典 `<script src>`（非 module），共享 `window` 作用域，函数直接以全局声明暴露（隐式 global）。
- 各页面统一加载顺序（抽查 `services.html` / `moment.html` / `index.html` / `login.html` 等）：**`captcha.js`（按需）→ `modal.js` → `api.js` → `utils.js` → `auth.js`（按需）→ `nav.js` → 页面业务 JS**。
- `version.js` 位于 `/version.js`（public 根），内容仅两行：

```js
var APP_VERSION = '2.7.1.0';
var APP_DEPLOYED = '2026-08-26 17:00';
```

- 跨文件隐式依赖（无任何显式 import）：`api.js` 调用 `nav.js` 的 `showNavLoading/hideNavLoading`、`utils.js` 的 `escapeHtml`、`modal.js` 的 `openModal`；`utils.js` 的 `progressiveRender/createImageGallery` 调用 `api.js` 的 `showNavLoadingProgress/toast/icon`。任一缺失即在运行时 ReferenceError。

---

## 1. api.js 全量 API 面

常量：`const API_BASE = '';`（同源相对路径）。

### 1.1 HTTP 客户端

核心函数 `async function api(path, options = {}, retries = 1)`（api.js:166）：

| 步骤 | 行为（原文照抄关键值） |
|---|---|
| Content-Type | `body instanceof FormData` 时不设；否则 `options.body !== undefined` 时设 `'application/json'` |
| 超时 | `AbortController` + `setTimeout(() => controller.abort(), 30000)`；可被 `options.signal` 覆盖 |
| AbortError | 抛 `'请求超时，请检查网络后重试'` |
| 网络错误 | `retries > 0` 时等 `2000ms` 重试；否则抛 `'网络连接失败，请检查网络后重试'` |
| 响应为 `text/html` | 视为安全验证/挑战页：`retries > 0 && res.status !== 403 && res.status !== 401` 时等 `1500ms` 重试；否则抛 `'安全验证失败，请刷新页面后重试'` |
| JSON 解析失败 | `retries > 0 && res.status !== 502 && res.status !== 503 && res.status !== 504` 时等 `1500ms` 重试；否则抛 `'服务器返回格式错误，请刷新页面后重试'`（注意：502/503/504 **不**进入此重试分支，见 §9 疑点） |
| 业务解包 | `if (!data.success) throw new Error(data.error \|\| '请求失败');` 成功返回 `data.data` |
| 附带副作用 | `data._cleanup > 0` 时 `toast(\`已自动清理 ${data._cleanup} 条冗余数据\`, 'info')` |

- **credentials**：未显式设置（依赖同源 fetch 默认携带 Cookie）。
- **401 跳转**：HTTP 客户端层**不做** 401 跳转；鉴权失败由 `auth.js` 的 `checkAuth` 捕获后清 `user` 并 `_go404()`（§4）。唯一例外：维护遮罩内管理员登录失败提示（§1.6）。
- **apiUpload 不存在**（全项目 grep 确认）；上传一律 `apiPost(path, formData)`。

快捷包装（api.js:226-244）：

```js
function apiGet(path) { return api(path); }
function apiPost(path, body) { return api(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }); }
function apiPut(path, body)  { return api(path, { method: 'PUT',  body: JSON.stringify(body) }); }
function apiDel(path)        { return api(path, { method: 'DELETE' }); }
```

### 1.2 缓存层（localStorage）

| 函数 | 签名 | 行为 |
|---|---|---|
| `cacheSet` | `(key, data, hash)` | 写入 `localStorage['yc_' + key]`，值为 `{ data, hash: hash \|\| '', ts: Date.now() }` 序列化；序列化结果 `> 4 * 1024 * 1024` 直接放弃；QuotaExceeded 时**收集全部 `yc_` 前缀键按 ts 升序，保留最新 5 条（`while (keys.length > 5)` 删最旧）**后重试一次 |
| `cacheGet` | `(key)` | 读 `yc_<key>`，过期条件 `Date.now() - entry.ts > CACHE_TTL` 即删除并返回 `null`；返回完整 entry（含 `.data/.hash/.ts`） |
| `cacheDel` | `(key)` | `localStorage.removeItem(CACHE_PREFIX + key)` |

- `CACHE_PREFIX = 'yc_'`；`CACHE_TTL = 3 * 24 * 60 * 60 * 1000`（3 天）。
- 上层封装 `fetchWithCache(key, fetchFn, renderFn)`（api.js:57）：stale-while-revalidate——先渲染缓存；`POST /api/sync { pages: { [key]: hash } }` 问哈希，`pr.changed` 才真正 `fetchFn()` 并以新 hash 回填；无缓存/同步异常时兜底直拉。并发计数 `_fetchCount` 控制 `showNavLoading('加载中...')` / `hideNavLoading()`（定义在 nav.js）。

### 1.3 Toast

`toast(msg, type = 'info')`（api.js:247）：

- 容器：懒创建 `<div id="toastContainer" class="toast-container" aria-live="polite">` 挂 `document.body`。
- 单条：`<div class="toast toast-{type}">`，`textContent` 赋值（天然防注入）。
- 类型集（type 为自由字符串，全站实际使用）：`info` / `success` / `error`（样式类 `toast-info/toast-success/toast-error`）。
- 生命周期：`3000ms` 后加 `.exit` 类，再 `250ms` 后 `el.remove()`。

### 1.4 模态框（api.js 内的部分）

api.js 拥有模态系统的**下半场**，`openModal` 本体在 `modal.js`（见 §7）：

- `closeModal(overlay)`（api.js:561）：幂等（`display==='none'` 直接 return）；先执行一次性 `overlay._onClose`（执行前置空，异常吞掉）；移除 `overlay._trapHandler`；清 `overlay._countdownTimer`；给 overlay 与内部 `.modal` 加 `.closing` 类；**`overlay._closeTimer = setTimeout(..., 280)`** 后 `display='none'`、移除 closing 类、恢复 `document.body.style.overflow = ''`。
- `trapFocus(container)`（api.js:581）：收集 `button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])`，Tab 循环焦点，挂到 `container._trapHandler`，并 `first.focus()`。
- `confirmAction(msg, cb, allowHtml = false)`（api.js:600）：`openModal({ title:'', body: '<p style="margin-bottom:20px;font-size:1rem;color:var(--md-on-surface);text-align:center">' + (allowHtml ? msg : escapeHtml(msg)) + '</p>', maxWidth: '380px', footer:[确定 primary→cb(true)、取消 outline], onClose: () => cb(false) })`。**无倒计时**；倒计时能力在 `modal.js` 的 `config.countdown`（§7）。确定按钮回调里 `c._onClose = null` 后再关，避免重复触发 `cb(false)`。

### 1.5 图标库

- 包装器：`const S = (d) => \`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>\``——**Lucide/Feather 风格线性图标**，path 数据内联硬编码于源码（api.js:89-161），无外部请求。
- `icon(name)` 返回 `ICONS[name] || ''`（未知名静默空串）。
- 支持名称全集（69 个唯一 key；其中 `clock` 在 api.js:101 与 :159 **定义了两次**，值相同）：

```
alert, alert-circle, alert-triangle, award, barrier, bell, book-check, book-open,
calendar, camera, check, check-circle, chevron-down, chevron-left, chevron-right,
clipboard, clock, clock-rewind, cloud, cookie, cube, database, download, eye-off,
file-text, gift, hard-drive, heart, hourglass, image, inbox, keyboard, lightbulb,
lock, lock-x, map-pin, megaphone, menu, message-circle, message-square,
messages-square, moon, package, palette, paperclip, party-popper, person, refresh,
search, settings, shield, smile, star, sunrise, terminal, thumbs-up, trash-2,
trending-down, trending-up, trophy, upload, user-check, user-plus, users, wallet,
wand-2, wrench, x, x-circle, zap
```

### 1.6 站点关闭检查（启动引导）

相关常量/状态：`STATUS_CACHE_KEY = 'site_status'`（sessionStorage）、`STATUS_CACHE_TTL = 30000`（30s）、遮罩宿主元素 `#sco`。

流程 `async checkSiteClosed()`（api.js:301）：

1. 读 session 缓存 `{closed, message}`（30s 内有效）；若 `closed && !isPrivilegedRole(getUser())` 立即铺遮罩。
2. `refreshSiteStatus()` → `apiGet('/api/settings')` 取 `site_closed` / `site_closed_message` 回写缓存；仍关闭则补遮罩，否则 `applyOverlay(false)`（移除 `#sco`）并返回 false。
3. `isPrivilegedRole = isAdmin`（role ∈ `admin/owner/teacher`）。

遮罩实现（api.js:288-359）：`position:fixed;inset:0;z-index:99999;background:var(--md-primary)`，内容 `icon('wrench') 网站维护中` + 消息（缺省 `'雅礼团委-通办暂时关闭，请稍后再访问'`）+ **管理员降级登录表单**（姓名/密码/验证码）。验证码组件按需注入：页面无 `CaptchaWidget` 时动态插 `<script src="/js/captcha.js">` 再实例化。

`handleAdminLogin`（api.js:372）：`POST /api/auth/login`；成功后若 `data.password_reset` 弹 `alert('你的账号密码已重置，初始密码为 Yali@1234，请及时修改密码')`；把本地遗留成就合并上传后清 `achievements`；**role 非 admin/owner/teacher 一律拒绝**（`'仅管理员可在维护期间登录'`，并清除 token/user）；通过则移除遮罩 `location.reload()`。每次失败刷新验证码。

各页脚以 `<script>renderNav('<page>');checkSiteClosed();</script>` 引导（全站 18 处 `checkSiteClosed()` 调用）。

### 1.7 页面脏状态与全局事件委托

- `let _pageDirty = false; setPageDirty(dirty)`；`beforeunload` 拦截未保存离开。
- 文档级 click 捕获站内 `<a href>`（排除 http/#/javascript:/download/_blank），dirty 时 `confirmAction('有未保存的更改，确定离开吗？', ok => ...)`。
- **全局 `data-action` 委托**（api.js:439-455）：click 与 submit 双监听，`e.target.closest('[data-action]')` → `window[target.dataset.action](target.dataset, target)`；FORM 元素在 click 分支被跳过（避免输入框误触、不妨碍 radio/checkbox）。

### 1.8 图片管线

- 压缩 `compressImage(dataUrl)`：`IMG_MAX_SIZE = 900 * 1024`、`IMG_MAX_DIM = 1920`；canvas 重绘，JPEG quality 从 `0.85` 起，`quality -= 0.1` 循环直到 `result.length <= IMG_MAX_SIZE` 或 quality `<= 0.1`。
- Blob URL 缓存 `dataUrlToBlobUrl(dataUrl)`：`_blobCache = new Map()`，上限 `_blobCacheMax = 100`（FIFO 逐出并 `URL.revokeObjectURL`）；base64 → Blob → objectURL，失败原样返回。
- 懒加载 `lazyLoadImages(root)`：扫描 `img[data-src]:not([data-loaded])`，`IntersectionObserver({ rootMargin: '100px' })` 入队 `_imgQueue`，串行处理（`_imgQueueBusy`），已脱离 DOM 的节点跳过；完成后删 `data-src`、标 `data-loaded="1"`。占位图 `IMG_PLACEHOLDER` 为 400×300 灰色 SVG data URI。

### 1.9 CSP 上报监听

```js
document.addEventListener('securitypolicyviolation', e => {
  if (e.blockedURI.includes('kaspersky-labs.com')) return;
  console.warn(`[CSP] 被阻止: ${e.blockedURI}（${e.effectiveDirective}）`);
});
```
仅 console.warn，不上报服务器；白名单屏蔽 Kaspersky 扩展误报。

### 1.10 个性化 applyPersonalize（IIFE，每个页面自动执行）

数据来源**双源**：`localStorage.getItem('personalize')`，为空则回落 cookie 正则 `/(?:^|;\s*)personalize=([^;]*)/` + `decodeURIComponent`；JSON 解析失败整体 try 吞掉。

| prefs 字段 | 行为 |
|---|---|
| `theme === 'dark'` | `document.documentElement.classList.add('dark')` |
| `theme === 'auto'` | 按 `matchMedia('(prefers-color-scheme: dark)')` toggle `dark`，并监听 change（回调内再次确认存储中仍是 auto） |
| `color` | `setProperty('--md-primary', prefs.color)`；hex 解析 slice(1,3)/(3,5)/(5,7) → 注入 `--md-primary-dim = rgba(r,g,b,.8)` |
| `fontSize` | `document.documentElement.style.fontSize = prefs.fontSize + 'px'` |
| `animation === false` | 加类 `reduce-animation` |
| `noAnimation === true` | 加类 `no-animation` |
| `superGraphic === true` | 加类 `super-graphic`；动态注入 `<link id="sgCss" href="/css/graphic.css">` 与 `<script id="sgJs" src="/js/graphic.js">`（均有 id 幂等守卫） |

配套机制：
- storage 事件跨标签页同步：他页改动 → `document.cookie = 'personalize=' + encodeURIComponent(e.newValue) + ';path=/;max-age=31536000'`（cookie 供 SSR/首屏前使用）。
- Cookie 告知条 `initCookieConsent()`（localStorage `cookieConsent` 已同意则跳过）；`window.acceptCookieConsent` 记录并解锁成就 `cookie_monster`。
- `.img-row` 滚轮横滚：wheel → `row.scrollLeft += d * (Math.abs(d) < 1 ? 30 : 1)`，MutationObserver 补挂新节点（观察器挂在 `window._imgRowObserver`）。
- **空闲登出**：`TIMEOUT = 20 * 60 * 1000`、`WARN_AT = 18 * 60 * 1000`；监听 `mousemove/keydown/click/scroll/touchstart`（passive）；18 分钟时 toast `'你已闲置 18 分钟，2 分钟后将自动退出登录'`；到点 `doLogout` 清 token/user、fire-and-forget `apiPost('/api/auth/logout')`、跳 `login.html`。仅 `user.role !== 'public'` 生效。
- **View Transitions**：全项目 grep 无 `document.startViewTransition` / `view-transition` —— **无使用点**；页面间过渡由 nav.js 的手写 FLIP 动画承担（§3.4）。

### 1.11 成就引擎

**契约**：
- 定义表 `ACHIEVEMENT_DEFS`（api.js:752-787），共 **34 条** `{ id, title, desc, icon }`。
- `getAchievements()`：`getUser().achievements` ∪ `localStorage['achievements']`（去重 Set）。
- `unlockAchievement(id)`：已含则 `return false`；`POST /api/achievements/unlock { id }` 成功 → 用响应 `data.achievements` 刷新本地 user 缓存 + `checkCollector()` + `return true`；**请求失败则写入本地 `achievements` 数组兜底 + `return true`**（下次登录时在维护登录/正常流程中合并上传，见 §1.6）。
- 服务端约束（functions/api/achievements.js）：`COUNT_BASED = ['chatty', 'commenter', 'proposer', 'extrovert']` 只能经 `handleCheckCounts` 解锁，其余 id 允许客户端手动 unlock。
- `checkCountAchievements()`：`POST /api/achievements/check-counts {}` → 响应 `{ achievements, unlocked[] }`，刷新缓存并对每个新 id 弹 toast。前端调用点：`login.html:204`、`announcement.js:193`、`services.js:402,505`。
- `showAchievementToast(id)`：`<div class="ach-toast">` = `.ach-toast-icon`(icon(def.icon)) + `.ach-toast-title`("成就已解锁！") + `.ach-toast-name`(title) + `.ach-toast-desc`(desc)；rAF 加 `.show`，`5000ms` 后退场再 `400ms` 移除。
- 辅助：`hasAchievement(id)`；`checkCollector()`（解锁数 `>= Math.ceil(total / 2)` 即 17/34 时解 collector）；`checkTimeTraveler(createdAt)`（正则取 `YYYY-MM-DD` 按 UTC 算天数，`days > 90` → time_traveler，`days > 180` → archaeologist）；`checkNovice()`（localStorage `_noviceDone` 一次性闸门）；控制台彩蛋 `window.__yali` → dev。
- 启动自举（DOMContentLoaded 及已加载两种分支重复实现）：`button:not([type])` 强制 `type='button'`；`lazyLoadImages()`；`checkTimeAchievements()`；admin/owner 自动解 `power`；注册全局 `copy` 监听——选区祖先含 `<IMG>` 时解 `screenshot`。
- 文件末尾 IIFE 动态加载 `features.js`（`src="/js/features.js?v=" + (window.APP_VERSION || Date.now())`，守卫 `script[src*="features.js"]`）。

**34 个成就前端触发点分布表**（id → 触发条件 → 所在文件:行）：

| id | 触发条件 | 所在文件 |
|---|---|---|
| read_all_changelog | 展开全部更新日志卡片后停留 30s（`setTimeout ..., 30000`） | public/changelog.html:83-90 |
| color_freak | 10 秒内切 6 次以上主题色（页面内计时逻辑） | public/personalize.html:193 |
| night_owl | 00:00–05:59 登录（`getHours() < 6`） | public/js/api.js:839 |
| night_owl2 | 连续 3 天凌晨登录（`_nightOwlDates` 存最近 3 天，相邻差恰 1 天） | public/js/api.js:853 |
| early_bird | 06:00–08:59 登录（`h >= 6 && h < 9`；desc 写 06:00–08:00） | public/js/api.js:858 |
| high_five | 连续点击顶部 logo 10 次（`localStorage '_hf'` 计数，达 10 次阻断跳转） | public/js/nav.js:49-59 |
| collector | 解锁数 ≥ ⌈34/2⌉ = 17（每次 unlock 后自检） | public/js/api.js:860-866 |
| chatty ⚙ | 动态消息 ≥ 50 条（服务端 COUNT） | functions/api/achievements.js:31 |
| commenter ⚙ | 评论 + 议题累计 ≥ 10（服务端 COUNT） | functions/api/achievements.js:36 |
| proposer ⚙ | 创建议题 ≥ 5（服务端 COUNT） | functions/api/achievements.js:37 |
| time_traveler | 查看创建于 > 90 天前的公告 | public/js/api.js:878-887 ← announcement.js:26,34 |
| intruder | 触发越权/404 警告页 | public/404.html:373 |
| reset_master | 个性化页重置所有设置 | public/personalize.html:370 |
| locked_out | 连续 3 次输错密码 | public/login.html:216 |
| reader | 累计查看 50 条公告（`'_rd'` 计数） | public/js/announcement.js:43 |
| power | 成为管理员或站长（登录后角色判定） | public/js/api.js:908,927 |
| extrovert ⚙ | 动态消息 ≥ 100 条（服务端 COUNT） | functions/api/achievements.js:32 |
| lightning | （无前端/服务端触发点，⚠️待确认） | — |
| archaeologist | 查看创建于 > 180 天前的公告 | public/js/api.js:888-891 |
| ocd | 深/浅色切换 ≥ 20 次 | public/personalize.html:207 |
| novice | 首次提交议题/评论/投票（`checkNovice`，调用点 poll.js:169、services.js:403,506） | public/js/api.js:893-897 |
| pigeon | 注册后超 31 天未登录 | public/login.html:161 |
| dev | 控制台输入 `__yali()` | public/js/api.js:900 |
| easter_egg | 关于页点击校徽 5 次 | public/about.html:129 |
| screenshot | 复制操作选区包含图片 | public/js/api.js:910-921,928-939 |
| frequent_404 | 累计访问 404 超 3 次 | public/404.html:377 |
| super_graphic | 开启华丽动画效果 | public/personalize.html:323 |
| attendance | 连续 7 天登录 | public/login.html:172 |
| moonlight | 月底最后一天登录 | public/login.html:182 |
| anniversary | 注册满一整年那天登录 | public/login.html:187 |
| cookie_monster | 接受 Cookie 告知 | public/js/api.js:676-681 |
| feedback_first | 首次提交反馈 | public/feedback.html:51 |
| feedback_tenth | 累计 10 次反馈 | public/feedback.html:53 |
| introvert ⚠️ | 「浏览动态超过 5 次而不发一言」——前后端均未找到解锁调用（仅定义） | ⚠️待确认 |

⚙ = 由 `checkCountAchievements()` 轮询式触发（服务端真实计数，客户端禁止手动解锁）。

---

## 2. utils.js（220 行）

### 2.1 存储/转义基础

- `safeGetItem(key)` / `safeSetItem(key, val)` / `safeRemoveItem(key)`：try 包裹的 localStorage 读写删。
- `escapeHtml(s)`（utils.js:22）：`div.appendChild(document.createTextNode(s || ''))` 后取 `innerHTML` —— **只转义 `& < >`，不转义引号**，属性位必须改用 attrEscape。
- `attrEscape(s)`（utils.js:28）：null → `''`；替换集 `/[&"'\n\r<>]/g` → `{&: &amp;, ": &quot;, ': &#39;, \n: &#10;, \r: &#13;, <: &lt;, >: &gt;}`。
- `formatTime(t)`（utils.js:11）：匹配 `/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/`，把该串视为 **UTC** 加 `8 * 3600000` 得北京时间，输出 `YYYY-MM-DD HH:mm`；不匹配则 `new Date(t).toLocaleString('zh-CN', { hour12: false })`；仍无效原样返回。
- `isValidClass(cls)`：Number 化为整数且 `String(cls).length === 4`，范围 `(2501–2527) || (2401–2429) || (2301–2329)`。
- `parseImages(val)`：字符串以 `[` 开头尝试 JSON.parse（失败/非数组回落 `[val]`）；数组透传；其他包成 `[val]`。
- `DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']`。

### 2.2 图片工具

- `fileToDataUrl(file)` → `Promise<string>`：FileReader.readAsDataURL。
- `previewImageFile(inputEl, previewEl, labelEl, maxSize)`：单图；`file.size > maxSize` → `toast(\`文件过大，最大 ${Math.round(maxSize/1024)}KB\`, 'error')` 并清空 input；labelEl 显示文件名；reader 结果赋 `previewEl.src`。
- `createImageGallery(opts)` → 多图画廊控制器。opts：`{ container: Element|Function, hintEl?: Element|Function, maxMB? = 25, onChange? }`（container/hintEl 支持函数惰性解析，兼容弹窗动态 DOM）。返回对象：
  - `items`：`[{ file, dataUrl }]` 原数组引用；
  - `clear()`；`count()`；
  - `addFiles(fileList)`：逐个校验 `file.size > maxMB * 1024 * 1024` → `toast('图片 ' + file.name + ' 超过 ' + maxMB + 'MB，已跳过', 'error')` 跳过；读入后重渲染缩略图（80px 高圆角预览 + 右上 20px 圆形删除钮 `background:var(--accent)`）并更新提示 `'已选 N 张图片'` / `'点击选择图片（可多选）'`。
- `progressiveRender(container, items, renderItem, chunkSize = 8)`：每 chunk 一个 `requestAnimationFrame` 分帧插入 `insertAdjacentHTML('beforeend')`，配合 `showNavLoadingProgress(done, total)` 进度。

### 2.3 渲染组件（输出 HTML 结构）

| 组件 | 签名 | 输出结构 |
|---|---|---|
| `Card` | `(header, body, footer, className)` | `<div class="card[ className]">[<div class="card-header">header</div>]<div class="card-body">body</div>[<div class="card-footer">footer</div>]</div>`（header/body/footer 原样拼接，**不转义**） |
| `Badge` | `(text, type)` | `<span class="badge badge-{type \|\| 'pending'}">{escapeHtml(text)}</span>` |
| `Button` | `(config)` | `<button class="btn btn-{variant \|\| 'outline'}[ btn-{size}]"{data-*}{disabled}{id} type="{type \|\| 'button'}">[{icon span}] {escapeHtml(text)}</button>`；`config.data` 每个 k → `data-k="attrEscape(v)"`；`config.action` → `data-action`；`config.icon` 包 `<span style="display:inline-flex;vertical-align:middle">` |
| `EmptyState` | `(icon, text, subtext)` | `<div class="empty-state">[<div class="empty-state-icon">icon</div>]<p>{escapeHtml(text)}</p>[<p class="empty-state-subtext">{escapeHtml(subtext)}</p>]</div>` |
| `MetaRow` | `(items: [{label, value}])` | 每项 `<div class="meta-row"><span class="meta-label">{label}</span><span class="meta-value">{value \|\| '—'}</span></div>` |
| `CommentItem` | `(c)` | `<div class="comment-item" data-comment-id="{c.id}"><div class="comment-body"><div class="comment-author">{c.author}</div><div class="comment-text">{c.html \|\| escapeHtml(c.text)}</div><div class="comment-time">{c.time}</div>[actions]</div></div>`；actions 每项 `<button class="btn btn-sm btn-text" data-action="{a.action}" data-comment-id="{c.id}" {data-*}>{a.text}</button>`，data 键 camelCase → kebab-case |
| `ImageThumb` | `(url, alt)` | `<img class="img-thumb" src="{attrEscape(url)}" alt="…" loading="lazy" style="max-width:120px;max-height:90px;border-radius:var(--md-shape-sm);object-fit:cover;cursor:pointer" data-action="openLightbox" data-src="{attrEscape(url)}">`；url 空返回 `''` |

杂项：`clickFileInput(dataset, target)` 点击代理触发 `dataset.target || 'fileInput'` 的 file input；`closeActiveModal()` 关 `#modalContainer`。
badgeClass 映射约定：`Badge(text, type)` 直接拼 `badge-<type>`，全站使用的 type 词表由各业务页自定（pending/done/reject/processing 等，见 changelog.html §9 的映射示例）。

---

## 3. nav.js（451 行）

### 3.1 renderNav(currentPage)

- 数据源：`getUser()`（api.js，localStorage `user`）。
- 生成的 nav DOM 结构（模板原文，插入 `document.body` 最前）：

```html
<nav class="nav">
  <div class="nav-inner">
    <a href="about.html" class="nav-brand"><img src="/images/emblem.png" alt="" class="nav-emblem">雅礼团委 <small>· 通办</small></a>
    <div class="nav-links" id="navLinks">${rightHtml}</div>
  </div>
</nav>
```

- `rightHtml`：已登录 → personalize 图标链接(settings icon) + `<a href="settings.html" class="nav-user">{user.name}</a>` + `<button class="nav-link nav-logout" data-action="logout">登出</button>`；未登录 → personalize + `<a href="login.html">登录</a>`。当前页加 ` active` 类。
- nav 内 click 委托只处理 `data-action="logout"` → `logout()`（清 token/user、`apiPost('/api/auth/logout').catch(()=>{})`、跳 `services.html`）。
- `user` 存在时调 `initMessagesIcon()`（§3.5）。
- 彩蛋：`.nav-brand` 点击计数（`localStorage '_hf'`），≥10 次解 `high_five` 并 `stopImmediatePropagation()+preventDefault()`（阻止跳 about.html）。
- 文件头部 IIFE 注入 `features.js`（此处不带 `?v=` 参数，与 api.js 尾部的加载器并存，守卫选择器分别为 `script[src*="/js/features.js"]` 与 `script[src*="features.js"]`，⚠️见 §9 疑点 6）。

### 3.2 renderCapsuleBar —— tabPages 配置原值

```js
const tabPages = [
  { id: 'services',      label: '服务', icon: 'clipboard',     href: 'services.html' },
  { id: 'moment',        label: '动态', icon: 'zap',           href: 'moment.html' },
  { id: 'announcements', label: '公告', icon: 'megaphone',     href: 'announcements.html' },
  { id: 'polls',         label: '投票', icon: 'check-circle',  href: 'polls.html' },
  { id: 'finance',       label: '财务', icon: 'wallet',        href: 'finance.html', roleMin: 'member' },
  { id: 'activities',    label: '活动', icon: 'calendar',      href: 'activities.html' },
  { id: 'duty',          label: '值日', icon: 'clock',         href: 'duty.html', roleMin: 'public' },
  { id: 'admin',         label: '管理', icon: 'shield',        href: 'admin.html', adminOnly: true },
  { id: 'feedback',      label: '反馈', icon: 'message-square',href: 'feedback.html' },
];
const roleWeight = { member: 2, admin: 3, owner: 4, teacher: 3, public: 1 };
```

### 3.3 过滤 / 排序 / swap 规则

- 过滤：`adminOnly` 需 `window.isAdmin(user)`；`roleMin === 'public'` 需已登录（`!role` 剔除）；其余 `roleMin` 需 member 及以上（`isMember = role==='member'||role==='public'||isAdmin`）且 `roleWeight[role] >= roleWeight[roleMin]`（权重不足按 `99` 剔除）；`memberOnly` 需登录（配置表中暂无人使用）。
- 排序：`services` 恒排第一；其余按 `localStorage['tabCapsuleUsage']`（`recordTabUsage` 每次进页/点击 +1）降序；`feedback` 强制挪到最后。
- 容量：桌面 `window.innerWidth > 768` → `limit = 6`，移动端 `limit = 4`。
- **swap 逻辑**：当前页不在前 limit 时与第 `limit - 1` 位交换，保证当前页永远可见：`visible[limit-1] = visible[curIdx]; visible[curIdx] = swap`。
- 超出部分进 `extra` 区，出现展开按钮 `#tabExpandBtn`（chevron-down 图标）。

### 3.4 展开/收起动画与 FLIP

- `expandCapsule`：显示 extra，测 `scrollHeight + 8` 后把 `maxHeight` 从 `none` 过渡到目标 px；按钮加 `.expanded`。
- `collapseCapsule`：还原 maxHeight，`350ms` 后移除 `.expanded` 并隐藏 extra（可选回调，导航前先收起）。
- 导航 `navigateTo(href, id)`：记 usage → `captureCapsuleFlip()` 把所有 `.tab-cap-item` 的 `{id,left,top}` 存 `sessionStorage['capsuleFlip']` → 跳转。
- `runCapsuleFlip`：下一页读取快照，按 id 匹配计算 dx/dy，先 `transform+opacity:0` 复位旧位置，rAF 两跳后过渡 `transform .5s cubic-bezier(.2,0,0,1), opacity .5s cubic-bezier(.2,0,0,1)` 归零——手写共享元素 FLIP（替代 View Transitions）。
- 展开态点击胶囊外部（`setTimeout 100` 后挂文档监听）自动收起。
- `/moment` 路径下胶囊初始 `capsule-hidden` 且 `bottom:-100px`。

### 3.5 滚动隐藏 / 鼠标呼出 / 触摸

- 滚动（`_capsuleOnScroll`，节流 `40ms`）：下滑且 `sy > 80` 加 `capsule-hidden`；上滑移除；expanded 态与聊天页（`location.pathname.startsWith('/moment')`）豁免滚动逻辑。
- mousemove（rAF 节流）：聊天页按上下各 1/4 视口分区呼出/隐藏（呼出时 `bottom = calc(20px + env(safe-area-inset-bottom, 0px))`）；普通页光标距底部 `> window.innerHeight - 80` 时唤回隐藏胶囊。
- 触摸：`touchmove`（聊天页）`dy < -20` 且不近底部 → 隐藏；`dy > 20` 或近底部（`window.innerHeight - clientY < window.innerHeight / 4`）→ 显示（bottom `calc(70px + env(safe-area-inset-bottom, 0px))`）。

### 3.6 导航栏加载指示

- `showNavLoading(text)`：`#navLoading`（spinner + 文本）插入 `.nav-brand` 之后；`showNavLoadingProgress(done,total)` 文本 `` `加载中 ${done}/${total} 项 (${pct}%)` ``；`hideNavLoading()` 移除。

### 3.7 消息铃铛注入条件

`initMessagesIcon()`（nav.js:405）：仅 `renderNav` 且有用户时调用；等待 `typeof isFeatureEnabled === 'function'`（未就绪 `setTimeout(initMessagesIcon, 500)` 重试）；`isFeatureEnabled('messages')` 为真才注入——在 `personalize.html` 链接前插入 `<a href="messages.html" id="navMessagesBtn" class="nav-link nav-msg-bell">bell 图标 + <span class="msg-badge" id="msgBadge">`。徽标刷新：`GET /api/messages/unread-count`，`count > 99 → '99+'`；周期 `setInterval(updateMsgBadge, 60000)` + `visibilitychange` 回前台刷新。

---

## 4. auth.js（111 行）

| 函数 | 返回 | 失败行为 |
|---|---|---|
| `checkAuth()` | `GET /api/auth/me` 的 user（顺带回写 localStorage `user`；`!user.class_name` 时弹班级补填） | 异常 → 清 `user`，返回 `null` |
| `requireAuth()` | user 或 `null` | `null` → `_go404()`（**跳 404 而非 login**） |
| `requireMember()` | user 或 `null` | role ∉ `member/admin/owner/teacher` → `_go404()` |
| `requireAdmin()` | user 或 `null` | role ∉ `admin/owner/teacher` → `_go404()` |

- `_go404()`：`location.href = '/404.html' + (n ? '?from=' + encodeURIComponent(n) : '')`；`_pageName()` 映射：`/admin→管理面板、/settings→个人设置、/finance→财务管理、/announcements→公告管理、/announcement→公告详情`。
- `requireClass(user)`：全屏 `#classPromptOverlay`（z-index 100000）要求填 4 位班级 + 密码，`isValidClass` 校验，`POST /api/auth/change-class { class_name, password }` 成功回写 user 缓存。
- `getUser` 来源：直接复用 api.js 的同名函数（localStorage `'user'`），auth.js 不另行定义。

---

## 5. captcha.js（67 行）

自研图形验证码组件（替代 Cloudflare Turnstile），`window.CaptchaWidget = CaptchaWidget`。

- `new CaptchaWidget(containerId)`：接受 id 字符串或 Element；构造即 `render()` + `load()`。
- `render()`：`.captcha-wrap` = `<img class="captcha-img" title="点击刷新验证码">`（初始占位为灰底 "Loading..." 的 base64 SVG，避免裂图）+ `<input class="captcha-input" maxlength="4" autocomplete="off" autocorrect="off" spellcheck="false">`。
- **刷新/装载流程 `load()`**：`fetch('/api/captcha/generate', { cache: 'no-store' })` → `resp.data || resp`（兼容 `{success,data}` 包装）→ `this.token = data.token`；SVG 经 `'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))` 展示；清空输入框。失败时展示红字 "加载失败 点击重试" 占位 SVG 且 `token = ''`。点击图片 = `refresh()` = 重新 `load()`。
- `getData()` → `{ captcha_token: this.token || '', captcha_code: input.value.trim() }`（随登录等表单一并 POST）。
- `isValid()` → `!!token && 输入长度 === 4`。

---

## 6. lightbox.js（243 行）

### 打开契约（经全局 data-action 委托传入 dataset 对象）

`openLightbox(src, items)` 兼容两种属性模式（lightbox.js:15-25）：

| 模式 | 属性 | 说明 |
|---|---|---|
| A | `data-url` + `data-images` | `data-images` 为 JSON 数组字符串（`[{src: url}, ...]` 结构，消费端取 `i.src`）；公告详情用法：单引号属性包裹、内部 `'` 预替换为 `&#39;`（announcement.js:65） |
| B | `data-src` [+ `data-items`] | `ImageThumb` 生成的缩略图即此模式（仅 data-src，单图） |

- 所有 src 经 `dataUrlToBlobUrl()` 转 blob URL（base64 图省内存）；当前索引用**原始 src** 在原 items 中查找（blob 转换不稳定导致不能事后匹配）。
- 单图隐藏左右导航与计数器；计数器 `${lbCurrentIndex + 1} / ${lbCurrentItems.length}`。

### 交互

- 缩放 `zoomLightbox(dir, cx, cy)`：步长 `dir * 0.25`，钳制 `Math.max(0.5, Math.min(10, ...))`；传锚点时围绕指针缩放。滚轮 ±1、双指捏合 `zoomLightbox(dir * 0.5, cx, cy)`（等效 ±0.125）、按钮 ±、键盘 `+/=/-`。
- 平移：鼠标拖拽仅 `lbScale > 1` 允许；单指触摸平移同样要求放大态；双指捏合以两指中点为锚。
- 键盘 `lbKeyHandler`：`Escape` 关、`ArrowLeft/ArrowRight` 翻页、`+`/`=`/`-` 缩放、`0` 重置。
- 多图导航 `navLightbox(dir)`：`_navLock` 防连点；旧图加 `lightbox-img-exit-left/right`，`230ms` 后环形换索引（`% length`）重渲；入场类 `img-enter-right/left`。
- 关闭 `closeLightbox()`：加 `.lightbox-closing`，`260ms` 后 remove 并解绑 keydown/mousemove/mouseup；移动端（`innerWidth <= 768`）点背景关闭；打开后首元素延迟 `50ms` 聚焦 + Tab 圈焦。

---

## 7. modal.js 与 api.js 内置 modal 的关系

**分工（无覆盖、互补）**：

| 文件 | 提供 | 职责 |
|---|---|---|
| modal.js（IIFE，79 行） | `window.openModal(config)`、`window.destroyModal()`；解析时即创建 `#modalContainer.modal-overlay > .modal > #modalTitle / #modalBody / #modalActions` | 模态**开**与内容装配 |
| api.js | `closeModal(overlay)`、`trapFocus(container)`、`confirmAction(msg, cb, allowHtml)` | 模态**关**、焦点圈、通用确认（复用同一容器 `#modalContainer`） |

- 二者通过共享容器与容器挂载的约定字段协作：`c._dirtyCheck`、`c._onClose`、`c._countdownTimer`、`c._closeTimer`、`c._trapHandler`。谁都不覆盖谁的符号——同名函数不存在两份定义。
- **加载顺序影响**：所有受检页面均为 **modal.js 先于 api.js**（如 services.html：captcha → modal → api → …；index/login 亦然），因此 `api.js` 中 `confirmAction` 引用的 `openModal` 在其解析时就已存在。但由于 `openModal` 只在运行时（用户交互/异步回调）才被调用，只要两者都在交互前加载完成，顺序并不致命；真正的硬依赖是**成对出现**——只引 api.js 不引 modal.js 的页面一旦触发 `confirmAction/features 邀请弹窗` 将 ReferenceError（现有页面均成对引入）。
- modal.js 自身的关闭入口：容器 click（**仅 `window.innerWidth <= 768` 且点到背景**）→ `_dirtyCheck()` 返回真则阻止关闭，否则 `closeModal(c)`。

**openModal(config) 完整配置项**（modal.js:15-70）：

| 配置 | 行为 |
|---|---|
| `title` | `textContent` 赋给 `#modalTitle`（纯文本，防注入） |
| `body` | 字符串 → `innerHTML`；函数 → `bodyEl.innerHTML=''` 后 `config.body(bodyEl)` 自行填充 |
| `footer` | `[{ text, variant = 'outline', size, disabled, onClick, countdownBtn }]` → 依次生成 `.btn.btn-{variant}[ btn-{size}]` |
| `maxWidth` | 设 `.modal` 的 `style.maxWidth`（否则复位空串） |
| `dirtyCheck` | fn，挂 `c._dirtyCheck`，移动端点背景关闭前询问 |
| `onClose` | fn，挂 `c._onClose`，由 api.js `closeModal` 恰好执行一次 |
| `countdown` | `{ seconds, hint }`：footer 中标记 `countdownBtn: true` 的按钮禁用倒计时；hint 默认 `'请等待 {n} 秒'`，`{n}` 实时替换剩余秒数；归零隐藏提示并解禁按钮；计时器句柄挂 `c._countdownTimer`，重开时先清理 |
| `trapFocus` | 默认开启（`config.trapFocus !== false` 时 `trapFocus(c)`） |
| `onOpen` | fn，最后以 `config.onOpen(c)` 回调 |

附加行为：链式连续打开时 `clearTimeout(c._closeTimer)` 取消上一次挂起的关闭动画并移除 `.closing`；打开期间 `document.body.style.overflow = 'hidden'`。`destroyModal()` = 关闭 + 清空 body/actions + 清 dirty/onClose 状态。

---

## 8. graphic.js（501 行）—— super-graphic 华丽动效

入口守卫：`if (!document.documentElement.classList.contains('super-graphic')) return;`（类名与脚本均由 api.js `applyPersonalize` 的 `superGraphic === true` 分支注入）。配色统一从 `--md-primary` 谐化：`getHarmonizedColors(count = 6)` 做 RGB→HSL，饱和度减半（`s = s * 0.5`），色相 ±25° 展开取 count 个；无法解析时回落固定 6 色 `['hsl(212,31%,30%)', 'hsl(227,31%,35%)', 'hsl(197,31%,28%)', 'hsl(242,31%,33%)', 'hsl(182,31%,25%)', 'hsl(212,31%,40%)']`。

任务所述「四种效果」在代码中的对应关系（粒子与按钮破碎实为同一引擎的两个表现）：

| 效果 | 实现 | 要点（魔法数字照抄） |
|---|---|---|
| 按钮破碎（含碎片粒子）`spawnParticles(btn)` + `initParticleBurst()` | 文档级 click 委托 `.btn`（disabled 跳过）：克隆按钮为 **4 片 clip-path 四象限碎片** `inset(...)`；父级卡片（`.card, .img-card, .announce-card, .summary-card, .activity-card, .admin-card`）播放 `sgCardShake .5s ease-out` 抖动；碎片 2D 物理：`G = H * 1.0`、`FLOOR = H - 60`、`DRAG = 0.97`、初速 `vx = cos(a)*(80+rand*100)`、`vy = -(220+rand*140)`、落地反弹 `vy *= -0.5, vx *= 0.85`，静止阈值 `|vy| < 8`，落地 `fadeAge > 0.5` 后移除（淡出起点 0.1） |
| 卡片倾斜 `initCardTilt()` | pointerover/move/out（capture）跟踪活动卡片，指针相对坐标钳制 `±0.9`，写入 CSS 变量 `--rx = cx*20deg`、`--ry = cy*-20deg`；rAF 合帧刷新；willChange 按需启停；`initCardTilt._done` 幂等 |
| 彩纸烟花 `triggerFirework()` | 全屏 `canvas.sg-firework-canvas`；`generateConfettiPalette() = getHarmonizedColors(8)`；两侧各 `240 + rand*20` 枚，物理常量 `GRAVITY = H*0.18`、`BASE_SPEED = H*0.30`、`SPEED_VAR = H*0.80`、`LIFETIME = 7.0`、`FADE_START = 5.5`、`ANGLE_SPREAD = 1.2`、`delay <= 3.0s`；形状 square(40%)/dot，dot 有 1% 概率贴校徽图（预加载 `/images/emblem.png`）；3D 透视投影 + 法线亮度着色渲染 |
| 烟花触发开关 `initFireworkOnToast()` | MutationObserver 监听 body 新增节点，命中 `.toast-success` 即放一发烟花（成功 toast 驱动） |

对外钩子：`window._sgFirework = triggerFirework`；`window._sgPendingFirework` 存在则立即补放；`window._sgDestroy()` 断开 observer、移除全部监听/rAF、清场 `.sg-particle, .sg-firework-canvas, .sg-btn-shard`。样式来自 `/css/graphic.css`。

---

## 9. changelog-data.js 与 features.js 补充

### changelog-data.js（695 行）

- 全局变量 `var CHANGELOG_ENTRIES = [...]`。
- 条目 schema：`{ date: 'YYYY-MM-DD', version: 'vX.Y.Z[.W][-beta]', items: [{ type: string, text: string }] }`。
- 规模：**51 个版本条目、387 条 item**。
- **type 枚举全集（从数据归纳）**：`fix`(116) / `add`(97) / `change`(91) / `ui`(39) / `feature`(17) / `security`(15) / `new`(11) / `remove`(1)。注意三组近义并存：`add`/`new`/`feature`。
- 渲染方 `public/changelog.html` 的 `typeLabels` 只映射 `add→新增(badge-pending)、change→改进(badge-processing)、fix→修复(badge-done)、ui→UI(badge-pending)、security→安全(badge-reject)、refactor→重构(badge-processing)`；`refactor` 在数据中 **0 条**，而 `feature/new/remove` 无映射 → 徽章回退显示英文原词 + `badge-pending`。前 3 条之外默认折叠，全部展开并停留 30s 触发 `read_all_changelog`。

### features.js（105 行，功能开关邀请系统）

- 由 nav.js 头部与 api.js 尾部双路动态注入（所有载入 nav/api 的页面自动获得）。
- `window.getEnabledFeatures()`：`GET /api/features/enabled`，模块级缓存 `_enabledCache/_enabledPromise`（失败回落 `[]`）；`window.isFeatureEnabled(key)`；`window.refreshEnabledFeatures()` 清缓存重拉。
- 待邀请检查：`GET /api/features/pending`，过滤掉本会话点过"稍后"的（`sessionStorage['_feat_later']`），**只弹第一个**且延迟 `1500ms`（页面就绪后再 `800ms`）。
- 邀请弹窗 footer 三选：永不提醒（`POST /api/features/{key}/respond {status:'never'}`）/ 稍后（sessionStorage 记录）/ 接受（accepted → 刷新缓存 → toast `'已启用「key」功能'`；`key === 'messages'` 时 `800ms` 后 reload 使铃铛生效）。

---

## 10. 疑点汇总（⚠️待确认）

1. **introvert / lightning 两成就无任何触发点**：前后端全量 grep 仅存在于定义表（ACHIEVEMENT_DEFS、后端 ACH_DEFS、_worker.bundle 快照），疑似随动态页改版丢失或已废弃。
2. `early_bird` 文案「06:00–08:00」但代码判定 `h >= 6 && h < 9`（至 08:59），口径不一致。
3. `api()` JSON 解析失败分支的重试条件为 `res.status !== 502 && 503 && 504` —— 即网关错误**反而不重试**（立即抛错），与网络错误无条件重试的行为不对称，疑似笔误。
4. `ICONS.clock` 键重复定义（api.js:101 与 :159），值完全相同，无功能影响但属冗余。
5. `escapeHtml` 不转义引号，凡输出进属性的位置必须 `attrEscape`——审计时需人工核对每个插值位（现有代码基本遵守）。
6. features.js 被 nav.js 与 api.js **各自注入一次**：两处守卫选择器不同（`"/js/features.js"` vs `"features.js"`）且几乎同时执行，极端时序下可能双加载（IIFE 幂等所以仅浪费请求，⚠️待确认是否发生过）。
7. 任务预设的「View Transitions 使用点」不存在：全站无 `document.startViewTransition`；页面过渡由 nav.js 手写 FLIP（capsuleFlip）承担。
8. `formatTime` 将无时区时间串一律按 UTC +8h 处理——隐含"后端恒存 UTC"的约定，若有接口直接存北京时间将产生双重偏移。
9. 维护遮罩内 `handleAdminLogin` 会把本地成就合并上传，但普通登录流程（login.html）是否也做同等合并未在本文档范围内逐行核验（login.html:204 附近有 `checkCountAchievements`，合并逻辑 ⚠️待确认）。

---

## 提取来源

- `public/js/api.js`（956 行全文）、`public/js/utils.js`（220 行）、`public/js/nav.js`（451 行）、`public/js/auth.js`（111 行）、`public/js/captcha.js`（67 行）、`public/js/lightbox.js`（243 行）、`public/js/modal.js`（79 行）、`public/js/graphic.js`（501 行）、`public/js/features.js`（105 行）、`public/js/changelog-data.js`（schema + type 统计）、`public/version.js`
- 交叉引用：`functions/api/achievements.js`（46 行全文，COUNT_BASED 白名单）、`public/changelog.html`（typeLabels + read_all_changelog）、`public/login.html` / `public/personalize.html` / `public/about.html` / `public/404.html` / `public/feedback.html`（成就触发点行号）、`public/js/announcement.js`（reader / checkTimeTraveler / data-images 用法）、`public/services.html` 等页面 script 加载顺序
- 检索手段：全项目 Select-String（`unlockAchievement|checkCountAchievements|startViewTransition|apiUpload|data-images|introvert|lightning` 等），ICON key 与 changelog type 均以正则程序化枚举统计
