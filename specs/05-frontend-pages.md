# 05 · 前端页面规格（`public/` 26 个 HTML × 页面级 JS）

> 项目：yali-tongban（原生 JS MPA，无框架、无构建期模块化，页面级脚本直接挂 `window`）
> 本文只描述前端行为；API 契约见 `02/03/04` 号文档。
> 标识符保留英文原文；不确定处标 **⚠️待确认**。

---

## 0. 全站架构约定（读每页前先看这节）

### 0.1 脚本加载顺序（几乎所有页面一致）

```html
<div id="sco"></div>                     <!-- 站点关闭遮罩容器 -->
<script src="/js/modal.js"></script>     <!-- openModal/closeModal/confirmAction 基座 -->
<script src="/js/api.js"></script>       <!-- apiGet/apiPost/apiPut/apiDel、cache*、data-action 全局委托、成就系统 -->
<script src="/js/utils.js"></script>     <!-- escapeHtml/formatTime/Card/Badge/EmptyState/createImageGallery 等 -->
<script src="/js/auth.js"></script>      <!-- checkAuth/requireAuth/requireMember/requireAdmin -->
<script src="/js/nav.js"></script>
<script>
  renderNav('<currentPage>');
  checkSiteClosed();
</script>
<!-- 页面主体 -->
<script src="/js/lightbox.js"></script>  <!-- 按需 -->
<script src="/js/captcha.js"></script>   <!-- 按需（含表单的页面在 head 后最先加载） -->
<script src="/js/<page>.js"></script>    <!-- 页面逻辑，末尾自动 init() -->
```

- `nav.js` 被加载时会自动动态注入 `/js/features.js`（功能开关邀请弹窗），`api.js` 尾部也会兜底注入一次（`api.js:942-956`）。
- `version.js` 只在需要显示版本号的页面单独引入（index/duty/duty-admin/messages/feedback/about/thanks/debug），定义全局 `APP_VERSION` / `APP_DEPLOYED`。

### 0.2 `data-action` 全局事件委托（api.js:439-455）

- **click**：`e.target.closest('[data-action]')` → 若是 `<form>` 则跳过（由 submit 处理）→ 调用 `window[action](dataset, target)`。
- **submit**：`<form data-action="fn">` → `preventDefault()` → `window[fn](dataset, target)`。
- 即：所有页面级 JS 的交互函数都是**全局函数**，通过 HTML 字符串里的 `data-action` 触发；lightbox.js 内部另有一套 switch-case 分发（`lightbox.js:192-195`）。

### 0.3 缓存体系（api.js:3-85）

| 函数 | 说明 |
|---|---|
| `CACHE_PREFIX = 'yc_'`、`CACHE_TTL = 3天` | localStorage 键 `yc_<api路径>`，值 `{data, hash, ts}` |
| `cacheSet(key,data,hash)` | 序列化后 >4MB 直接放弃；写满时按 `ts` 淘汰最旧缓存只留 5 条再重试 |
| `cacheGet(key)` | 过期即删除返回 null |
| `cacheDel(key)` | 写操作后手动失效 |
| `fetchWithCache(key, fetchFn, renderFn)` | 先渲染缓存 → POST `/api/sync {pages:{[key]:hash}}` 比对 hash，`changed` 才真正拉取并重渲染；网络失败且有缓存则静默用缓存 |

### 0.4 鉴权函数（auth.js）

| 函数 | 行为 |
|---|---|
| `checkAuth()` | GET `/api/auth/me` 成功→刷新 `localStorage.user` 并返回 user；失败→删 user 返回 null。若 user 无 `class_name` 弹 `requireClass` 强制补班级浮层（全屏 overlay，POST change-class） |
| `requireAuth()` | checkAuth 失败 → `_go404()` 跳 `/404.html?from=<页名>` |
| `requireMember()` | requireAuth + role ∈ {member,admin,owner,teacher}，否则 `_go404()` |
| `requireAdmin()` | role ∈ {admin,owner,teacher}，否则 `_go404()` |
| `isAdmin(user)` | admin/owner/teacher 三角色都算"管理侧" |

`_pageName()` 映射：/admin→管理面板、/settings→个人设置、/finance→财务管理、/announcements→公告管理、/announcement→公告详情（auth.js:13-23）。

### 0.5 成就系统基建（api.js:752-900）

- `ACHIEVEMENT_DEFS` 共 **34** 条定义（id/title/desc/icon）；`unlockAchievement(id)` 先查重 → POST `/api/achievements/unlock`，失败则写入本地 `localStorage.achievements` 兜底（登录时合并上传后清除）。
- 每次解锁成功调用 `checkCollector()`：已解锁 ≥ ⌈34/2⌉=17 → 连锁解锁 `collector`。
- `showAchievementToast(id)` 渲染 `.ach-toast`（5 秒消失）。
- 全局自动触发点（api.js:902-940）：DOM ready 时 `checkTimeAchievements()`（night_owl 00–06 点、early_bird 06–09 点、night_owl2 连续3天凌晨登录，键 `_nightOwlDates`）；admin/owner 自动解锁 `power`；`copy` 事件且选区在 `<img>` 上 → `screenshot`。控制台执行 `__yali()` → `dev`。Cookie 横幅"知道了"按钮 `data-action="acceptCookieConsent"` → `cookie_monster`。

---

## 1. 页面清单总表

鉴权列为**客户端实际调用的门槛**（服务端另有校验）。"公开"= 不调用任何 require*。

| # | 文件名 | 页面用途 | 主要脚本依赖 | 鉴权要求 | 关键 DOM 容器 id |
|---|---|---|---|---|---|
| 1 | index.html | 启动闪屏，1.8s 或点击后跳 services | modal/api/utils/nav/version(内联样式) | 公开 | `sco`（splash 区块为 class `.splash-wrap`） |
| 2 | services.html | 报修问题反馈大厅 + 公告横幅轮播 | captcha/modal/api/utils/nav/auth/lightbox/services.js | 公开浏览；状态操作需登录(role≠pending)；评论需登录 | `announceBanner` `filterTabs` `issueList` `fabBtn` |
| 3 | announcements.html | 公告列表（+发布/编辑弹窗） | modal/api/utils/auth/nav/lightbox/announcements.js | 公开看已通过；FAB 需登录(role≠pending) | `announceList` `fabBtn` |
| 4 | announcement.html | 公告详情 + 评论 | modal/api/utils/auth/nav/lightbox/announcement.js | 公开（编辑按钮按身份显隐） | `announceDetail`（内含动态 `commentSection`） |
| 5 | moment.html | 团委动态 feed（轮播消息流+评论） | modal/api/utils/auth/nav/moment.js | 公开渲染 ⚠️数据接口需登录 | `feedList`（动态插入 `feedSentinel`） |
| 6 | polls.html | 投票列表 + 发起投票弹窗 | modal/api/utils/auth/nav/polls.js | 公开列表（按 min_role/allowed_classes 过滤）；FAB 仅 admin/owner | `pollList` `fabBtn` |
| 7 | poll.html | 投票详情/填写/结果 | captcha/modal/api/utils/auth/nav/lightbox/poll.js | 公开可看；投票按 min_role/class；结果仅创建者与管理侧 | `pollDetail`（动态 `pollVoteForm` `myVoteResult` `pollResults`） |
| 8 | finance.html | 财务收支公示 + 上传 | captcha/modal/api/utils/auth/nav/lightbox/finance.js | `requireMember()`；上传 FAB 仅 isAdmin | `financeSummary` `summaryIncome` `summaryExpense` `reimburseRatioCard/Text/Bar` `deptTabs` `financeSectionTitle` `financeCount` `financeGrid` `fabBtn` |
| 9 | activities.html | 活动列表 + 千人报告厅预约（时间线） | captcha/modal/api/utils/auth/nav/activities.js | 公开看活动；报名登录直约/游客弹窗；预约需登录；审核面板 isHallReviewer(admin 或 社团部) | `hallSectionTabs` `activitySection` `activityList` `activityCount` `hallSection` `hallReviewPanel` `hallReviewBadge` `hallReviewBody` `hallCal` `hallDateTitle` `hallSlots` `hallCustomRow` `fabBtn` |
| 10 | duty.html | 今日值日签到看板 + 公开部门扣分统计 | modal/api/version/utils/auth/nav/duty.js | 公开看板；签到接口服务端校验；管理入口仅 admin/owner/teacher 显示 | `dutyDashboard` `publicDeptStatsSection` `publicDeptStats` |
| 11 | duty-admin.html | 排班生成/干事名单/扣分管理（8 个静态模态框） | modal/api/version/utils/auth/nav/duty-admin.js | `requireAdmin()`（DOMContentLoaded 中） | `calTitle` `adminScheduleList` `staffCount` `scoreCount` `deptStatsContainer`；静态模态：`uploadModal` `staffModal`(>`staffModalBody`) `addStaffModal` `scheduleModal` `scoresModal`(>`scoreFilterDept/Cancelled/Name`,`scoreBatchBar`,`scoresModalBody`) `addScoreModal` `batchCancelModal` `cancelModal` |
| 12 | admin.html | 管理面板手风琴（注册审批/成员/问题/公告审核/财务/审核记录/反馈/功能开关/危险操作） | modal/api/utils/auth/nav/lightbox/admin.js | `requireAdmin()` | `adminAccordion` `ownerSection` `storageSection`(>`storageInfo`) `registrationList` `regCount` `memberSummary` `memberCount` `batchImportBtn` `issueSummary/Count` `announceSummary/Count` `financeSummary/Count` `reviewSummary/Count` `feedbackSummary/Count` `featuresSection`(>`featuresList`,`featuresCount`) `dangerSection` `syncBtn/syncIcon/syncLabel` |
| 13 | messages.html | 站内消息中心（8 类筛选/已读/删除） | modal/api/version/utils/nav/messages.js | 无客户端门槛 ⚠️接口需登录 | `msgUnreadHint` `msgTabs` `msgToolbar` `msgList` `msgLoadMore` |
| 14 | feedback.html | 匿名反馈提交表单 | captcha/modal/api/version/utils/nav(内联 submitFeedback) | 公开 + 验证码 | `captchaBox` `feedbackForm` `feedbackVersion` `feedbackBtn` |
| 15 | settings.html | 个人中心（资料卡/成就墙/改名改班改部改密）；`?userId=` 管理员查看他人 | modal/api/utils/auth/nav/settings.js(页面内联大段) | `requireAuth()`（settings.js）；`?userId=` 数据走 admin 接口 | `pcHeader` `pcName` `pcMeta` `pcTrophy` `achCard` `achGrid` `accountSettingsSection` `currentClass` `currentDepartment` `deptGroup` 表单：`nameForm` `classForm` `deptForm` `passwordForm` `pageSubtitle` |
| 16 | login.html | 登录/注册双 Tab | captcha/modal/api/utils/nav(内联 handleLogin/handleRegister) | 公开 | `.login-page/.login-card` `tabLogin/tabRegister` `loginFormWrap/registerFormWrap` `loginForm` `registerForm` `loginCaptchaBox` `registerCaptchaBox` `nameCheckMsg` `classCheckMsg` `loginError` `registerMsg` |
| 17 | personalize.html | 个性化设置（主题/风格/强调色/字号/动画开关组） | modal/api/utils/auth/nav(全部内联) | 公开 | `themeOptions` `styleOptions` `colorOptions` `fontSlider` `animationToggle` `stackRow/stackToggle` `noAnimationRow/noAnimationToggle` `superGraphicRow/superGraphicToggle` `resetBtn` |
| 18 | about.html | 关于页（最近更新卡/功能介绍/徽标彩蛋/作者/调试入口） | modal/api/utils/auth/changelog-data/nav/version | 公开 | `featureList` `aboutUpdateIcon/Version/Date/Summary` `authorName` `debugEntry` `aboutVersion` |
| 19 | changelog.html | 更新日志（折叠卡片） | modal/api/utils/auth/nav/changelog-data | 公开 | `changelogList` |
| 20 | thanks.html | 鸣谢（开源库/云服务静态页） | modal/api/utils/auth/nav/version | 公开 | `thanksVersion` |
| 21 | cultural.html | 已删除页跳板 | （meta refresh 0 → `/410.html?from=cultural`） | 公开 | — |
| 22 | tasks.html | 已删除页跳板 | meta refresh → `/410.html?from=tasks` | 公开 | — |
| 23 | review.html | 已删除页跳板 | meta refresh → `/410.html?from=review` | 公开 | — |
| 24 | debug.html | 调试信息面板（Cookie/Navigator/Screen/Storage…） | modal/api/utils/auth/nav/version(内联采集) | `requireAuth()`（任意登录用户）；入口隐藏于 about 页脚三连击 | `dbgContent` |
| 25 | 404.html | 404 页 + "越权审计"演出 + 维护期管理员登录遮罩 | modal/api(内联) | 公开 | `sco` `intrSeq/intrTerm/intrSeqContent/intrSeqIcon/intrSeqLine1/intrSeqLine2` `.card-404` |
| 26 | 410.html | 410 页 + 维护期管理员登录遮罩 | modal/api(内联) | 公开 | `sco` `q410` `h410` `.card-410` |

---

## 2. 逐页详述

### 2.1 index.html — 启动闪屏

- **用户流程**：进入 → 居中 emblem + "雅礼团委 · 通办" + 不定长进度条动画（`splashIndeterminate` 1.4s 循环）+ `v{APP_VERSION}`（`document.write`）→ 1800ms 定时跳 `services.html`；任意 click 清除定时立即跳转（index.html:67-70）。
- **状态管理**：无。仅 `renderNav('index')` + `checkSiteClosed()`。
- **区块结构**：`.container > .splash-wrap`（flex 居中），无 page-header/card。

### 2.2 services.html + services.js — 服务（报修）★重点见 §3.1

- **用户流程**：公开进入 → 顶部公告横幅自动轮播 → 浏览问题反馈卡片（Tab 过滤状态）→ 点 FAB 打开"提交问题"模态（免登录，带验证码）→ 提交后 unshift 进列表；登录用户可在卡片上切换状态/评论。
- **区块**：`.page-header` → `#announceBanner`（横幅）→ `.section > .section-title(#filterTabs) + #issueList.card` → 底部 `.fab`。
- **核心 data-action**：`updateStatus` `deleteIssue` `toggleIssueComments` `postIssueComment` `editIssueComment/saveEditIssueComment/cancelEditIssueComment` `deleteIssueComment/cancelDeleteIssueComment` `submitIssue`(form) `closeActiveModal` `clickFileInput`；onclick：`openIssueModal()` `setFilter(x)`；lightbox：`openLightbox`。
- **状态**：模块级 `currentFilter/issues/bannerTimer/bannerItems/_bannerData/_issueCaptcha/issueCommentsCache{}`；缓存键 `/api/issues`、`/api/banner`、`/api/comments/issue/<id>`。
- **成就**：提交报修与发表评论后 `checkCountAchievements()` + `checkNovice()`（novice 仅首次，键 `_noviceDone`）。

### 2.3 announcements.html + announcements.js — 公告列表 ★重点见 §3.2

- **用户流程**：进入 → 已通过公告 progressiveRender 卡片流 → 点击卡片进详情 / 点多图区打开 3D 图片选择器 → 登录者经 FAB 发布或卡片上"编辑"（支持 `?edit=<id>` 直达编辑弹窗）/删除 → 评论展开互动。
- **区块**：`.page-header` → `.section > #announceList` → `.fab`（默认 display:none，role!=='pending' 时显示）。
- **核心 data-action**：`openEditModal` `deleteAnnouncement` `toggleAnnounceComments` `postAnnounceComment` `editAnnounceComment/saveEditAnnounceComment/cancelEditAnnounceComment` `deleteAnnounceComment/cancelDeleteAnnounceComment` `postAnnouncement`(form) `clickFileInput`；onclick：`openAnnounceModal()`。
- **状态**：`user/allAnnouncements/editingId/announceCommentsCache/_formDirty/_announceGallery`；缓存 `/api/announcements`、`/api/comments/announcement/<id>`；写操作后统一 `cacheDel('/api/announcements')`。
- **成就**：无本页专属（评论不触发 novice ⚠️与 services 不一致）。

### 2.4 announcement.html + announcement.js — 公告详情

- **用户流程**：`?id=` → fetchWithCache 整表 find（失败 fallback GET 单条）→ 渲染文章卡（标题/BY 行/正文 pre-wrap/图片组）→ 阅读计数 → 评论。
- **区块**：顶部"← 返回公告列表"链接 → `#announceDetail`（Card 包裹，尾部追加 `#commentSection`）。
- **核心 data-action**：`editAnnouncement`（→ `/announcements.html?edit=id`）、`deleteAnnouncement`（confirm→DELETE→跳列表）、`openLightbox`（data-url + data-images）、评论五件套 `postComment`(form)/`editComment/saveEditComment/cancelEditComment/deleteComment/cancelDeleteComment`。
- **状态**：`user/currentId/comments`；缓存同列表。
- **成就触发点**：
  - `reader`：每次加载详情 `_rd+1`，≥50 清零并解锁（announcement.js:41-43）。
  - `time_traveler` / `archaeologist`：`checkTimeTraveler(created_at)` 内容距今 >90 天 / >180 天（api.js:878-891，渲染后 200ms 调用）。
  - 评论后 `checkCountAchievements`。

### 2.5 moment.html + moment.js — 动态 Feed

- **用户流程**：进入 → 先渲染 `yc_/api/chat/messages` 缓存 → 拉最新 20 条 → 向下滚动 IntersectionObserver 触发游标加载 → 每 30s 轮询增量（页面隐藏暂停）→ 条目点击按 ref_type 跳转对应页面 → 展开/收起行内评论。
- **区块**：`.page-header` → `.feed-list#feedList`（feed-item 列表 + 尾部 `#feedSentinel`）。
- **核心交互**：
  - 图标映射 `FEED_ICONS`：finance→wallet、activity→calendar、issue→clipboard、announcement→megaphone、poll→check-circle、achievement→award、user→person，缺省 zap。
  - 链接映射 `FEED_LINKS`：finance→finance.html、activity→activities.html、issue→services.html、announcement→`announcement.html?id=`、poll→`poll.html?id=`、user→admin.html。
  - `type==='notification'` 与 system_data.action==='任命' 的条目渲染为纯文本通知卡（无操作按钮）。
- **核心 data-action**：`toggleComments` `submitComment` `deleteFeedItem`(isAdmin)；输入 `#feedCommentInput_<id>` maxlength 200。
- **状态管理**：
  - 游标分页：首屏 `GET /api/chat/messages?limit=20` → `_nextCursor=data.nextCursor`；加载更多 `?before=<nextCursor>&limit=20`；轮询增量 `?after=<_newestId>&limit=20` 并 insertAdjacentHTML 倒序插到最前。
  - `sessionStorage.feed_openComments`：记录展开过评论的消息 id，重渲染后恢复并重新拉取。
  - 缓存键 `/api/chat/messages`（cacheSet/cacheGet 手动，不走 fetchWithCache）。
- **成就**：无直接触发（chatty/extrovert/introvert 由服务端计数，check-counts 在别处拉动）⚠️本页未调用 checkCountAchievements。

### 2.6 polls.html + polls.js — 投票列表

- **用户流程**：进入 → 可见投票过滤（min_role 权重 member=2/admin=3/owner=4；allowed_classes 含 class_name 才可见）→ 卡片点击整卡 `gotoPoll` → 管理者在卡片上看"查看结果/导出CSV/删除" → owner/admin 经 FAB 发起多题投票。
- **区块**：`.page-header` → `.section > #pollList` → `.fab`。空态为自绘斜线剪贴板图标。
- **核心 data-action**：`gotoPoll` `exportPoll`（fetch blob → `投票_<id>.csv` 下载）`deletePoll` `createPoll`(form) `addPollQuestion` `removePollQuestion` `addPollOption` `removeOption` `triggerFileInput`。
- **创建弹窗字段**：`pollTitle`*(200)、`pollDesc`(1000)、`pollMinRole`(所有人/member/admin)、`pollRequireName`(匿名/留名)、`pollAllowedClasses`（逗号分隔，正则 `/^\d{4}$/` 过滤）、题目卡 `pq-<idx>`：题干*(必填)、类型 single/multiple/text、配图（≤25MB compressImage）、选项 A..Z（最多 26 个）、主观题字数限制 `pq-maxlen-<idx>`(1..10000 默认 1000)。
- **校验**：所有题干非空；选择题 ≥2 选项；≥1 题。POST `/api/polls {title,description,require_name,min_role,allowed_classes,questions}`。
- **状态**：`polls[]`、`_pollQIdx`、`_pollDirty`（dirtyCheck 关闭确认）；缓存 `/api/polls`。

### 2.7 poll.html + poll.js — 投票详情

- **用户流程**：`?id=` → 详情 + my-vote → 四分支渲染：已投（我的答案卡 [+ 结果区 if canViewResults]）／已结束／无权限（EmptyState 说明原因：班级不符/权限不足/请登录）／可投票表单 → 提交 → 全屏成功遮罩（查看投票列表 / 留在本页）。
- **权限**：`canViewResults = 创建者 || admin || owner`；min_role/class 校验同列表页。
- **表单**：`require_name && !u` 时显示姓名输入 `pollVoterName`(20)；题目按 type 渲染 radio(name=`pq-<qid>` required)/checkbox/textarea(maxlength q.max_length||1000)；配图点击 `openImageLightbox`；`CaptchaWidget('pollCaptchaBox')`。
- **提交**：answers=[{question_id, answer:number|array|string}] + voter_name + captcha → POST `/api/polls/:id/vote`；错误时 captcha.refresh()；成功后 `checkNovice()`、`total_votes++`。
- **结果渲染**（renderResults）：单/多选条形图——`barWidth = count/maxCount*100%`（相对最大值），`pct = count/total`（相对总数）；主观题平铺回答；参与名单 responses（voter_name||匿名 + 时间）。
- **状态**：`poll/myVote/pollCaptcha`；缓存 `/api/polls/<id>`、`/api/polls/<id>/results`。

### 2.8 finance.html + finance.js — 财务 ★重点见 §3.3

### 2.9 activities.html + activities.js — 活动 + 千报预约 ★重点见 §3.4

### 2.10 duty.html + duty.js — 值日看板

- **用户流程**：进入 → `GET /api/duty/attendance/today` → 无排班/异常 → EmptyState + （admin/owner/teacher）"排班管理"链接按钮 → 有排班：渲染当日两位值日干事的时段表（label | 干事A 按钮 | 干事B 按钮 | 计分）→ 各时段签到/签退。
- **按钮四态**（renderDutyButton）：
  - pending → `duty-btn-pending`，`data-action="signin" data-sid=<scheduleId> data-staff=<staffId> data-period=<label>`；
  - signed_in → `duty-btn-active`，`data-action="signout" data-aid=<attendance_id>`，内部 `.duty-timer` 每秒刷 `m:ss`；
  - completed → total<0 用 warn 色 + 显示分数，否则 done 色 ✓；
  - absent → `✕ 缺岗` 灰态。
- **签退结果**：res.color==='pink' → warn 类（在岗不足），否则 done；`spawnParticles(btn)` 粒子（graphic.js 开启时）。
- **计时器**：`startDutyTimer(attId, signInTime)` —— 兼容 `'T'` 分隔与 UTC 补 'Z'（注释明确后端 datetime('now') 为 UTC）；interval 1000ms 按 `[data-att-id]` 全局更新文本。
- **公开部门统计**：`GET /api/duty/department-stats?weeks=2` → dept-stat-row（部门/动画进度条/total_score/N次），条形 delay i*0.08s。
- **⚠️待确认**：duty.js:73-75 计算了 `deadline = start_time + auto_absent_min` 与 `past`，但模板未使用（疑似遗留/应由服务端标记缺岗）。
- **成就**：无。

### 2.11 duty-admin.html + duty-admin.js — 值日管理 ★重点见 §3.6

### 2.12 admin.html + admin.js — 管理面板 ★重点见 §3.5

### 2.13 messages.html + messages.js — 消息中心

- **用户流程**：进入 → `loadMessages(false)`（limit 20 offset 0，type=all）→ Tab 切换重置 offset 重载 → 点击未读项标记已读（POST read）→ 有 link 则 200ms 后跳转 → 底部"加载更多"翻页 → 长按（触屏 600ms）/右键（桌面 contextmenu 未绑定 ⚠️代码只有 touch 长按）删除。
- **类型元数据 TYPE_META**（messages.js:3-12）：system/公告/审核 review_result/报修 issue_status/财务 finance_update/评论 comment_reply/活动 activity_invite/值日 duty，各带 color + defaultIcon。
- **工具栏**（有消息才显示）：`markAllRead()` POST `/api/messages/read-all`（当前 type 非 all 时带 `{type}`）→ 刷新并 `updateMsgBadge()`；`clearRead()` 原生 confirm → DELETE `/api/messages`。
- **未读提示** `#msgUnreadHint`：N 条未读 / 全部消息已读 / 还没有消息。
- **时间显示** `relativeTime`：解析时强制按 `+08:00`（无 Z 后缀时）。
- **状态**：`_currentType/_offset/_limit=20/_total/_unread/_loading`；offset 分页（非游标）。
- **成就**：无。

### 2.14 feedback.html — 反馈

- **用户流程**：填内容*（≤2000）+ 联系方式（≤100）+ 版块下拉（未指定/动态/公告/投票/财务/活动/其它）+ CaptchaWidget(`captchaBox`) → 提交 POST `/api/feedback {content, contact, page:location.pathname, section, version:APP_VERSION, ...captcha}` → toast + reset + captcha.refresh()。
- **成就触发点**：`_fc` 计数 ===1 → `feedback_first`；===10 → `feedback_tenth`（feedback.html:48-54）。
- **布局**：page-header → section > card > form（含版本号展示 `#feedbackVersion`）。

### 2.15 settings.html (+settings.js + 页面内联脚本) — 个人中心

- **两种模式**：
  1. **本人模式**：`settings.js init()` → `requireAuth()`；渲染 `userInfo`（⚠️该 id 页面 HTML 中不存在，赋值静默无效——疑似遗留）；填充 currentClass/currentDepartment/deptSelect 回显；owner 隐藏自己的改名组。
  2. **查看他人模式**：URL 带 `?userId=` → 内联脚本隐藏 `accountSettingsSection`，副标题改为"查看该用户的账户与偏好"，GET `/api/admin/users/<userId>` 渲染对方资料卡 + 对方成就（404 则 1.5s 后回 settings.html）。
- **资料卡 `pcHeader`**：姓名水印背景（140×80 SVG pattern，姓名 rotate(-18deg) rgba(255,255,255,.04) 平铺）+ 渐变底；奖杯 SVG 按 unlocked/total 比例 clipPath 金色渐变填充；meta = 班级/部门/角色中文标签。
- **成就墙 `achGrid`**：本人已解锁项点击回放 toast；未解锁占位 lock 图标；他人未解锁显示乱码 `_g(22)` 随机字符且开启动画时每 10ms 滚动刷新（防窥）；>3 项时随机抽 3 个 + "展开全部/收起" toggle（再次收起会重新洗牌）。
- **后台同步**：静默 GET `/api/auth/me`，成就集合变化则更新 localStorage.user 并重渲成就墙与奖杯比例。
- **账户设置表单**（均要求当前密码）：
  - `changeName` POST `/api/auth/change-name {new_name,password}`；
  - `changeClass` POST `/api/auth/change-class`（isValidClass：2501–2527 / 2401–2429 / 2301–2329）；
  - `changeDepartment` POST `/api/auth/change-department`（8 部门下拉；**非 admin/owner/teacher 隐藏整个 `#deptGroup`**，settings.html:441-444）；
  - `changePassword` POST `/api/auth/change-password {old_password,new_password}`（新密码 ≥6，两次一致性前端校验）。
  - 成功后统一 `localStorage.user` 覆盖为新 user 对象。
- **底部**："→ 反馈意见"链接 feedback.html。
- **成就**：无新增触发（展示型页面）。

### 2.16 login.html — 登录/注册

- **用户流程**：双 Tab 切换（250ms form-exit + 300ms form-enter 动画）；登录 name/password + `CaptchaWidget('loginCaptchaBox')` → 成功：清 `_loginFail` → 存 user → 一连串登录成就判定 → password_reset 弹 alert("初始密码为 Yali@1234") → 本地成就合并上传（遍历差集 POST unlock，然后清 `achievements` 键并重取 /me）→ `checkCountAchievements()` → 跳 services.html；失败：显示 err + captcha.refresh + `_loginFail+1`。
- **登录成就触发点**（login.html:155-217）：
  - `locked_out`：连续失败 ≥3（`_loginFail`，达标即清零）；
  - `pigeon`：距上次登录 >31 天（`_lastLogin`）；
  - `attendance`：连续 7 天登录（`_loginDates` 数组，间隔 ≤1.5 天视为连续，超 7 截断 shift）；
  - `moonlight`：当天为当月最后一天；
  - `anniversary`：今天 == 注册月-日（`_regDate`，优先 server created_at）。
- **注册表单**：姓名（oninput `checkName` → GET `/api/auth/check-name?name=` 实时可用性提示）、班级（pattern `[0-9]{4}` + isValidClass 实时提示）、部门下拉（8 部门）、密码 ≥6、确认、`registerCaptchaBox`；成功提示"...请等待管理员审核"，2s 后自动切回登录 Tab。
- **布局**：`.login-page > .login-card`（居中卡片，独立 login.css），tabs + 两个 form-wrap。

### 2.17 personalize.html — 个性化 ★重点见 §3.7

### 2.18 about.html — 关于

- **用户流程**：最近更新卡（CHANGELOG_ENTRIES[0] 渲染 version/date/items[0].text+"等 N 项"，点击进 changelog）→ 功能介绍列表（8 项，按角色过滤：财务管理 minRole member、审核系统 minRole admin）→ hover 功能标题会让底部胶囊导航同名 tab 弹跳（`.tab-bounce`）→ 个性化入口卡 → 作者卡（Chidc 点击 shake）→ 鸣谢入口卡 → 页脚版权。
- **彩蛋**：
  - 标题右侧徽标组（团徽 gqt.org.cn / 校徽 yali.csedu.gov.cn / 通办 the-office.png，均外链）连点 5 次 → `easter_egg`（`_emblemClicks`，about.html:126-130）。
  - 页脚版权文字 1 秒内连点 3 次 → `debug.html`（about.html:190-196）。
- **状态**：仅 `_emblemClicks` 计数。

### 2.19 changelog.html — 更新日志

- **用户流程**：CHANGELOG_ENTRIES 渲染卡片流；第 4 条起（i>=3）默认折叠；点 header 展开/收起（max-height 动画 + chevron rotate 90°，展开后 400ms 放宽到 2000px）。
- **类型徽章**：add 新增(pending)/change 改进(processing)/fix 修复(done)/ui UI(pending)/security 安全(reject)/refactor 重构(processing)。
- **成就触发点**：`read_all_changelog` —— 展开数 ≥ 折叠总数后启动 30s 定时器，到期仍全展开才解锁（changelog.html:79-90）。
- `renderNav('about')`（复用 about 高亮）。

### 2.20 thanks.html — 鸣谢

纯静态：特别鸣谢李昂（构想）；运行时库 bcryptjs/jose(MIT)；外部资源 Noto Sans SC / Noto Serif SC / Three.js(r128，3D 图片选择器) / Google Sans Flex(GSF.ttf)；闭源服务 Cloudflare Pages/Workers/D1/R2；开发工具 wrangler/esbuild。`renderNav('about')`。

### 2.21 cultural.html / tasks.html / review.html — 已删除跳板

```html
<meta http-equiv="refresh" content="0;url=/410.html?from=<name>">
<script>location.href='/410.html?from=<name>'</script>
```

双保险跳转，无其他逻辑。

### 2.22 debug.html — 调试面板

- **入口**：about 页脚三连击（隐藏入口）。
- **鉴权**：内联 `requireAuth()`，未登录直接被踢 404。
- **内容**：10 个折叠 section（复用 set-group 手风琴样式）：Cookie（键值打码 mask()+Raw 原文）/ Navigator / Screen / Location / localStorage / sessionStorage / Performance(memory+timing) / Window / Time(ISO+时区) / Battery(navigator.getBattery) / App(APP_VERSION+APP_DEPLOYED)。
- **脱敏规则** `mask(val)`：长度 ≤6 → `"***"`；否则 `前3****后3`（debug.html:55-59）。

### 2.23 404.html — 404 + 越权演出

- **维护遮罩**（与 410 相同逻辑，404.html:84-109）：fetch `/api/settings` → `site_closed && 当前 localStorage.user 非 admin/owner` → 全屏 `#sco` 变成"网站维护中"卡 + 管理员登录表单（POST `/api/auth/login`，非 admin/owner 拒绝）→ 成功写 user 后 reload。
- **越权审计序列**（`?from=<页名>` 时触发，404.html:140-384）：
  1. 500ms 后升起暗红全屏 `#intrSeq`（背后终端滚动打印伪审计日志）；
  2. Phase1 大字"你要越权访问<页名>？"（500ms 入场，停 2s，350ms 出场）；
  3. Phase2"正在收集数据并上传/请稍候"+ `generateDeviceLines()` 逐行打印 ~90 行真实环境信息（OS/浏览器引擎/CPU 核数/内存/插件列表/屏幕/时区/localstorage 前 10 条/Canvas 指纹/WebGL renderer & vendor/媒体查询偏好/伪 SHA-256 校验/伪归档路径），每行间隔 200–500ms；
  4. Phase3"已完成" + 图标脉冲 → 解锁成就 → 淡出。
- **成就触发点**：`intruder`（触发 from 序列即解锁）；`frequent_404`：`_404count >= 3`。
- 正常卡片：ERROR 404 大字 + 返回首页(/services.html) + 上一页(history.back())。

### 2.24 410.html — 410 Gone

- 同款维护遮罩（410.html:78-103）。
- `?from=x` → 问题文案变"你访问的 x 页面已被永久删除"；底部反馈链接指向 `/feedback`。
- **成就触发点**：`frequent_410`：`_410count >= 3`（410.html:132-134）。

---

## 3. 重点页面加细

### 3.1 services.html + services.js

#### 3.1.1 公告横幅轮播（services.js:21-187）

- **数据源两级**：`fetchWithCache('/api/banner', ...)` 主源；无网/无缓存时 fallback `renderBannerFromFallback()` —— 取 `yc_/api/announcements` 缓存中 status 通过的前 3 条拼成 `{announcements}`。
- **条目合成**：`bannerItems = announcements(→type:'announcement') + hallBookings(→type:'hall'，千报预约占用通告卡)`。
- **图片预处理**：`image_url` 归一为数组存 `d._images`；首张若为 data: 则预转 blob URL 存 `d._cacheUrl`；**slide 展示图随机取一张**（`Math.random()*length`），但点击放大传的是第一张 `d._images[0]`（services.js:87）。
- **滚动机制**：横向 scroll 容器 `.announce-banner-track`，`goTo(i)=track.scrollTo({left: slides[i].offsetLeft, behavior:'smooth'})`。
- **鼠标拖拽**：mousedown(左键) 记录 startX/startScroll → document mousemove 直接改 `track.scrollLeft`，位移 >5px 标记 `drag.moved` → mouseup：若 moved，给所有 slide inner 打 `dataset._dragged='1'`（吞掉本次 click 跳转），并用 `updateActive()` 最近中心算法吸附 `goTo(idx)`。
- **触摸**：交给原生惯性滚动（touchstart 仅置 `_userDragging=true`），touchend 后 100ms 再 updateActive 等 snap 稳定。
- **圆点**：`updateActive()` 取"slide 中心距 track 视口中心最近"者为 active。
- **自动播放**：`setInterval 5000ms`；守卫 `_userDragging`；计算 `cur=Math.round(scrollLeft/第一张宽度)`，`next=(cur+1)%len`。多条目才渲染 dots。
- **点击跳转**：未被拖拽时 → `/announcement.html?id=<公告id>`；hall 类型卡 cursor:default 不可点。

#### 3.1.2 报修提交含图片流程

```
FAB onclick=openIssueModal()
 └ openModal(title:'提交问题', maxWidth:600px)
    body = <form id="issueForm" data-action="submitIssue">
      location*        input maxlength 200
      contact          input maxlength 100
      description*     textarea maxlength 2000
      notes            textarea maxlength 50（红色警示框）
      submitted_by     input maxlength 50（已登录自动预填 user.name）
      issueUploadZone  upload-zone(data-action=clickFileInput target=issueFileInput) + 隐藏 file input accept=image/*
                       onchange=previewIssueFile → previewImageFile(input, preview, label, 25MB)
      issueCaptchaBox  new CaptchaWidget(...)
      [取消 closeActiveModal] [提交 submit]
 └ submitIssue(dataset, form):
    fileToDataUrl(file) → compressImage(dataUrl)        // api.js:461-488，最长边 1920、JPEG 质量 0.85 起步降到 ≤900KB
    apiPost('/api/issues',{location,description,contact,notes,
       submitted_by: 登录?user.name:(表单值||'匿名访客'), ...captcha.getData(), image_url})
    成功: issues.unshift → renderIssues → reset → closeModal → toast
         → setTimeout(checkCountAchievements,100) + checkNovice()
    失败: toast(err) + _issueCaptcha.refresh()
```

- 列表渲染 `progressiveRender(el, filtered, renderItem)`（utils.js:57-69）：每帧 8 条 chunk，导航栏显示进度百分比；图片走 `img-lazy + IMG_PLACEHOLDER + lazyLoadImages`。
- 状态流转按钮：三个常驻按钮（待处理 warning / 处理中 primary / 已完成 success，当前态高亮实心）；**当前状态 ≠ 待处理 时二次 confirmAction**（services.js:409-429）；PUT `/api/issues/<id>/status` 后本地改 `issue.status/updated_by` 并局部重渲。
- 删除仅 admin/owner（DELETE `/api/issues/<id>`）。
- 评论懒加载：首次展开 `fetchWithCache('/api/comments/issue/<id>')`，之后读写全走内存 `issueCommentsCache`；删除评论两段式确认（按钮原位替换成 确认/取消）。

### 3.2 announcements.html + announcements.js

#### 3.2.1 列表渲染

- `visible = allAnnouncements.filter(a => !a.status || a.status==='已通过')` —— 待审核/已拒绝不出现在列表。
- 卡片结构 `.card.announce-card[data-id]`：header（标题 + NEW badge（<24h，`processing` 型）+ 编辑/删除按钮）→ body（pre-wrap 正文）→ 图片区 → footer（created_by + formatTime）→ 评论 toggle + 折叠评论区。
- 整卡 click 委托（announcements.js:101-117）：命中 `[data-action]` 忽略；命中 `.announce-img` 且多图 → `showImagePicker(imgs)`；否则跳 `/announcement.html?id=`。
- 图片两种形态（renderAnnounceImages）：
  - **堆叠卡**：`personalize.stack===true && animation!==false && width>=768 && imgs.length>2` → `.img-stack-card` 前 4 张层叠 + 右下角数量 badge；
  - **普通行**：`.img-row` 每张 `data-action=openLightbox data-src=blobURL data-items=JSON([{src}])`。

#### 3.2.2 多图画廊接入（创建/编辑共用）

- 共享组件 `createImageGallery`（utils.js:84-146）：`getAnnounceGallery()` 单例，参数 `{container/hintEl 为惰性函数（弹窗 DOM 每次重建）、maxMB:25、onChange:置脏}`；提供 clear/count/addFiles(items push {file,dataUrl})，缩略图右上角红色 ✕ 删除并重排。
- 选择文件 `previewAnnounceFiles(e)`：先 gallery.clear() 再 addFiles（替换语义，不是追加）。
- **创建流 postAnnouncement**（editingId=null）：① POST `/api/announcements {title,content,image_urls:[]}` 占位 → ② 逐张 compressImage 后 POST `/api/announcements/<id>/images {image_url}` → ③ GET 单条回填 allAnnouncements[0]。toast「公告已发布」。
- **编辑流**（editingId 设置）：gallery 有图 → 全部重压缩替换；gallery 空 → 沿用原图（`a.image_url` 数组或单值兼容）；PUT `/api/announcements/<id>`。toast「公告已更新，**等待审核**」（改后重回审核流）。
- 编辑弹窗回填：现有图片以只读缩略图列出（无删除钮），提示文案「现有 N 张图片（重新选择将替换）」，提交按钮文字改「保存修改」。
- 脏检查：title/content input 一次性监听 `markDirty` → `setPageDirty(true)`；modal dirtyCheck 与取消按钮都会 confirm「有未保存的更改，确定关闭吗？」。

#### 3.2.3 3D 多图画廊 showImagePicker（Three.js r128，CDN 按需注入）

- 全屏 overlay（黑 70%）+ 关闭按钮；`typeof THREE==='undefined'` 时动态加载 cdnjs three.min.js，失败 toast「3D预览加载失败」并移除 overlay。
- 场景参数：PerspectiveCamera fov 40 / z=450；ACESFilmic tone mapping exposure .8；环境光 .35 + 双平行光。
- 卡片布局：`cardW = clamp(110, 320/n^0.35, 200)`，`spacing = max(120, cardW*1.1)`；初始位置 x=idx*spacing、y=-|idx|*6、z=|idx|*20、rotation.y=idx*0.15；入场 scale 0.01→1 ease-out-cubic，delay=i*50ms。
- 交互：拖拽累积 velocity（dx*0.6），松手后 velocity*=0.92 衰减，scrollOffset 夹在 ±((n-1)/2*spacing+50)；卡片位置向目标 lerp 0.1；中心最大 distScale=max(.6, 1-|off|*0.002)。
- 点击（拖距 ≤5px）：Raycaster 命中 → transitioning：700ms 内 mesh 以加速 speed(0.035*(1+ease*6)) 移到相机中心并放大到铺满视口（按 fov 反解 targetScale），其余卡透明度衰减，完成后 `openLightbox(url, imgs)` 并销毁场景（dispose geometry/material/texture/renderer）。

#### 3.2.4 审核状态展示

- 列表层：非"已通过"直接不可见；NEW(<24h) 用 Badge('NEW','processing')。
- 详情层（announcement.js:52）：`statusBadge = a.status!=='已通过' 时 Badge(status+(reject_reason?'：'+reason:''), 待审核→pending / 其他→reject)`，挂在 BY 行。
- 管理端审核 UI 见 §3.5 公告审核分区。

### 3.3 finance.html + finance.js

#### 3.3.1 月度汇总计算方式

- `filterByMonth(list,y,m)`：按 `created_at` 的本地年月切片（getMonthFromDate）。
- `computeSummary(list)`：遍历累加——`type==='收入' → income += Number(amount||0)`，其余一律计入 expense；`toFixed(2)` 展示。
- **汇总口径**：`renderFinance` 中 summary 用的是**月份过滤后、未经收入/支出类型过滤**的数据（注释：Update 2 summary cards from full month data, not type-filtered，finance.js:220-221）；即点击"总收入"卡过滤列表，但两张汇总卡的数字保持整月口径。
- 近30天报销率（仅 admin 可见 `#reimburseRatioCard`）：`recent = created_at ≥ now-30d`；`eligible = recent∩支出`；`done = eligible∩status==='已报销'`；`pct = done/total*100`，文本 `${done} / ${total} (${pct.toFixed(0)}%)`，进度条宽度 pct%。逻辑在 renderFinance 与独立的 updateRatioCard 各实现一遍。

#### 3.3.2 筛选器

| 筛选 | 触发 | 状态变量 | 互斥关系 |
|---|---|---|---|
| 收入/支出卡 | summary-card onclick `toggleTypeFilter('收入'|'支出')` | `_typeFilter`（再点取消） | 置空 `_pendingFilter` |
| 未报销 | ratio card onclick `togglePendingFilter` | `_pendingFilter`（支出且 status!=='已报销'） | 置空 `_typeFilter` |
| 月份 | "历史"按钮 → `openMonthPicker()` 模态 | `_filterYear/_filterMonth` | 年下拉：当年~当年-3；快选 `#quickMonths` = 数据中最近 6 个不同年月（降序）；footer「全部记录」清空全部筛选，「查看」应用 |
| 部门 | `#deptTabs`（仅 admin 渲染：'' + DEPARTMENTS 8 项） | `_filterDept` | 触发 `loadFinance()` 按缓存键 `'/api/finance'+('?department='+x)` 重新拉取 |

- `applyCurrentFilter()` 串联：month → typeFilter → pendingFilter → renderFinance(filtered)；section 标题随筛选切换（收入记录/支出记录/未报销支出/`YYYY年MM月`/全部记录）；active 卡片高亮同步。

#### 3.3.3 报销流转按钮（卡片内，仅 isAdmin）

| 按钮 | data-action | API | 本地效果 |
|---|---|---|---|
| 标记已报销（非已报销时） | `reimburseFinance` | PUT `/api/finance/<id>/reimburse` | status→'已报销' |
| 取消报销（已报销时） | `unreimburseFinance` | PUT `/api/finance/<id>/unreimburse` | status→'待完成' |
| 删除 | `deleteFinanceItem` | confirm → DELETE `/api/finance/<id>` | 数组剔除 |

状态徽章映射：已报销→pass、已完成→done、其余→pending。

#### 3.3.4 上传弹窗字段（openFinanceModal）

`type`(支出/收入)*、`amount`(number step .01 min 0)*、`internalActivityGroup`（checkbox「团委内活动（计入流动资金库）」，仅 admin 且 type=支出 时可见，切类型联动复位）、`fileInput` 图片*（upload-zone，≤25MB，compressImage）、`tags`（逗号分隔 → 数组）、`notes`(≤500)、`uploadDeptGroup`（admin 可见：目标部门 select，''=本部门 + 8 部门）、`financeCaptchaBox`。提交 `uploadFinance`：成功后**不关弹窗**（「上传成功，可继续上传」），unshift + applyCurrentFilter + captcha.refresh()。

### 3.4 activities.html + activities.js

#### 3.4.1 报厅时间线拖选算法要点

常量原值（activities.js:264-266,341）：

```js
const HALL_START = 6, HALL_END = 24;        // 时间轴 06:00–24:00
const HALL_PX_PER_HOUR = 48;
const HALL_PAD_TOP = 14, HALL_PAD_BOTTOM = 14;
const HALL_SNAP = 10;                        // 分钟吸附粒度
```

- **Y↔时间换算** `timeFromY(y, isEnd)`：`totalMin=(y-PAD_TOP)/PX_PER_HOUR*60` → snap 到 10min → `h=HALL_START+floor(snap/60), m=snap%60`；终点越界钳到 `'24:00'`，起点钳到 06:00。
- **反向** `addHoursToTime(t, addH)`：分钟制加法后再 snap 10min，≥24:00 归一。
- **取点** `getHallGridY(e)`：grid rect.top 起、钳到 `[0, (HALL_END-HALL_START)*PX+PAD_TOP+PAD_BOTTOM]`；touch 取 touches[0].clientY。
- **拖选状态机**：mousedown/touchstart（目标是 `.hall-timeline-card` 则忽略）记 startY → move 累积 lastY，位移 >5px 进入 dragging 并实时绘制 `.hall-timeline-selection`（top=min, height=max(|dy|,8)，label 显示 `t1 – t2` 或 `t (1h)`）→ up：拖距 <6px 视为**单击=默认 1 小时**（start=t, end=addHoursToTime(t,1)），否则 start=timeFromY(min(y1,y2)) end=timeFromY(max,…,isEnd=true)；start==end（吸附塌缩）也退化为 1 小时 → 打开预约弹窗。touchmove 期间 preventDefault 阻止页面滚动。
- **甘特冲突视图（重叠分列）** `assignOverlapColumns(bookings)`（activities.js:508-553）：
  1. 按 `start_time` 升序、`end_time` 降序排序；
  2. 顺序聚类：`b.start_time < curEnd` 归入当前簇并扩张 curEnd，否则开新簇；
  3. 簇内 first-fit 列分配：已有列 `cols[i].end <= b.start_time` 则复用（更新列尾），否则新开列；
  4. 每个 booking 得 `_col/_numCols`。
- **卡片定位**：`top=(sh-HALL_START+sm/60)*PX+PAD_TOP`；`height=max(durH*PX, 24px)`；多列时 `left=calc(8px+(100%-16px)*col/nc)`、`width=calc((100%-16px)/nc)`、`z-index=2+col`；相邻边加 touch-left/right 圆角类。状态类：self/others(approved)、pending、cancelled；rejected 直接不渲染（renderHallSlots filter）。
- **重渲染保滚动**：重建 innerHTML 前记录旧 timeline 的 scrollTop 与 scrollTop/scrollHeight 比例，渲染后按比例恢复（activities.js:639-670）。
- **日历条**：范围 = 昨天～今天+13（共 15 格），默认选中"今天"（days[1]）；`data-action=selectHallDate data-hdate=YYYY-MM-DD`。
- **自定义时间行**：07–21 时下拉 + 00/30 分下拉 ×起止 + 「预约」按钮（组装后同样走 openHallBookingModal）。

#### 3.4.2 预约弹窗与冲突确认

- `openHallBookingModal(date,start,end)`：日期只读展示、`hallBookingStart/End` time 输入（step=600s）、用途*（maxlength 200）；footer 取消/提交预约。
- `confirmHallBooking()`：start<end 校验 → 遍历同日他人（排除自己、cancelled/rejected）预约算重叠分钟 `overlap=min(eEnd,bEnd)-max(eStart,bStart)`；**累计 overlap>10 分钟** → confirmAction 列出每条冲突（申请人/区间/重叠分钟）建议重选，确认才继续；POST `/api/hall/bookings {date,start_time,end_time,purpose}` → refreshHall()。
- 我的 pending 卡片有「撤回」按钮（`withdrawHallBooking` POST .../withdraw）；非 cancelled 且（mine || isAdmin || teacher）显示 ✕ 删除（DELETE）。
- 点击已有卡片 → `showHallBookingDetail(b)`：MetaRow（提交人/状态中文映射 approved已通过 pending待审核 cancelled已作废 rejected已拒绝/时间/用途/提交时间/审核者/审核时间）。

#### 3.4.3 审核面板（isHallReviewer = isAdmin || department==='社团部'）

- `#hallReviewPanel` 有待审才显示；header 显示计数 `#hallReviewBadge`，点击展开 `#hallReviewBody`。
- 每条待审项内嵌**迷你甘特**：固定 07–22 点、`pxPerHour=40`，`toPx=(h-7+m/60)*40`；把本申请+全部冲突 bar 归一化到 [min,max] 区间按 % 定位；配色 self/approved/pending；下方「批准/拒绝」`data-action=reviewHallBooking data-param=approve|reject` → POST `/api/hall/bookings/<id>/review {action}`。

#### 3.4.4 活动区与志愿者弹窗

- 发布弹窗字段：活动名称*(100)、地点(200)、时间 datetime-local*、涉及部门 checkbox×8（书记处/团总支/社团部/记者站/宣传部/组织部/青志协/办公室）、need_volunteers checkbox（`fd.get('need_volunteers')==='on'`）；POST `/api/activities`。
- 卡片操作：报名志愿者（登录→直接 `doSignup`；游客→弹窗姓名*+验证码 → `confirmVolunteerSignup`）；志愿者数按钮 `viewVolunteers` → 模态表格（序号/姓名/部门/报名时间）+ footer「导出表格」`exportVolunteers()`：从 DOM 表格生成 CSV（`\uFEFF` BOM，字段引号包裹，文件名 `志愿者报名表_YYYY-MM-DD.csv`）；admin 删除活动。
- 已报名者按钮置灰「已报名」disabled（`_signedUp` 内存标记，来自接口 signed_up）。

### 3.5 admin.html + admin.js

#### 3.5.1 分区结构（手风琴 `.set-group`，`toggleSetting(header)` maxHeight 动画）

| 分区 id | 可见性 | 内容 |
|---|---|---|
| `syncBtn`（header 右上） | 所有管理侧 | cacheDel 7 个 admin 缓存键 → loadAll()（9 个 loader 并行 Promise.allSettled + nav 进度 `加载中 n/9 项`） |
| `ownerSection` 网站状态 | owner | siteToggle 开关；关闭走倒计时 5s 危险弹窗 + 关闭提示 textarea（PUT `/api/admin/settings {site_closed:'true',site_closed_by,site_closed_message}`）；显示关闭者/文案/最后清理 last_cleanup/最近检查时间 |
| `storageSection` 存储用量 | owner | limitGB=5；图片字节主条（percent，>80 accent/>50 warning 色）+ 文本字节次条 + 十格计数网格（财务/反馈/公告/审核/动态/千报/投票/评论/用户/志愿） |
| 注册审批 | 所有管理侧 | `registrationList`：全选框 + 批量通过按钮（实时显示选中数）+ 每条 通过/拒绝 |
| 成员管理 | 所有管理侧 | `memberSummary`（共 N 名成员·管理员 X 人）+「查看详情」「批量导入」两个按钮 |
| 问题反馈 | 所有管理侧 | 计数 + 待处理数摘要 + 查看详情模态（全量列表 + 倒计时删除确认 DELETE `/api/issues/<id>`） |
| 公告审核 | 所有管理侧 | 计数 + 待审核数 + 审核模态（见下） |
| 财务记录 | 所有管理侧 | 总收入/总支出摘要（全量求和）+ 管理模态（缩略图 lightbox + 删除 DELETE `/api/admin/finance/<id>`） |
| 审核记录 | 所有管理侧 | `/api/reviews` 列表 + 删除 |
| 用户反馈 | 所有管理侧 | `/api/admin/feedback` 列表（时间/页面/版块/版本/联系方式）+ 删除 |
| `featuresSection` 功能开关 | owner | 见 §3.5.4 |
| `dangerSection` 危险操作 | owner | `confirmClearAll()`：**三连环倒计时确认**（第1/2/最终次，标题警号递增）→ POST `/api/admin/clear-all` |

#### 3.5.2 成员管理模态

- 搜索框 200ms debounce；角色过滤 tab（全部/管理员/成员/网站管理者/老师/公共）；排序权重 `{owner:0,admin:1,teacher:2,member:3,public:4}`。
- 每行：姓名链到 `settings.html?userId=<id>`、班级/部门/成就数徽章、角色徽章、「操作」弹出 action-menu（任管理 promoteToAdmin / 任老师 promoteToTeacher / 降成员 demoteToMember / 降管理 demoteOwnerToAdmin(owner) / 设为公共账号 setAsPublic（仅当系统中尚无 public 角色） / 重置密码（confirm 后 PUT reset-password，固定 `Yali@1234`） / 改名（模态 ≥2 字） / 部门（select DEPARTMENTS））+「删除」（`showConfirmWithCountdown` 5s 倒计时，DELETE `/api/admin/users/<id>`）。
- 分页：`/api/admin/users?offset=N`，每页 200，`loadMoreMembers` 追加按钮。

#### 3.5.3 批量导入 UI 三模式（openBatchImportModal，admin.js:531-622）

| 模式 | 输入 | 解析 |
|---|---|---|
| CSV | `<input type=file accept=.csv>` | FileReader 按行 split(',') → `{name,password,class_name,department}`，name/password 空者丢弃 |
| JSON | `<input type=file accept=.json>` | JSON.parse 必须为数组，元素同上字段 |
| 手动输入 | textarea，每行 `姓名 密码 班级 部门`（空白分隔） | split(/\s+/)，同样过滤 |

- 统一进入 `importPreview`（条数 + 预览表）→「确认导入」POST `/api/admin/users/batch-import {users}`；结果 toast（成功/跳过/失败数），失败明细二次弹窗逐条列出 `name：reason`；完成后 loadMembers()。
- 三个模式切换按钮 `data-action=setImportMode data-mode=csv|json|manual`，切换区互斥 display。

#### 3.5.4 功能开关面板（owner）

- `GET /api/admin/features` → feature-card 列表：icon/name/key/描述/全局开关（POST `/api/admin/features {key,globally_enabled}`）/四态统计徽章（accepted✓/pending⏳/later🕐/never🚫）/三个动作按钮：
  - **全员邀请** `inviteAllUsers(key)`：原生 confirm → POST `/api/admin/features/<key>/invite {all:true}`；
  - **邀请用户** `openInviteUserModal(key)`：并发拉用户首页 + 该 feature invitations；用户列表排除 public；「never」用户 disabled 且提供「重置」；搜索为纯 DOM 过滤；滚动到底 50px 触发 offset 分页；勾选集合 `_inviteSelected` → POST invite `{user_ids}`；
  - **邀请详情** `openInvitationsModal(key)`：全部邀请记录 + never 可重置。
- `resetUserResponse(key,userId)` POST `/api/admin/features/<key>/reset {user_id}`；能感知当前处于哪个弹窗分别刷新。

#### 3.5.5 公告审核模态

- 过滤 tab：待审核/已通过/已拒绝/全部（`_announceFilter`）。
- 每条：标题 + 状态徽章 + 全文 + 多图缩略（`renderReviewImages`，blob URL + lightbox）+ 元信息（作者/时间/审核人/reject_reason 红字）。
- 待审核项：「通过」PUT `/api/announcements/<id>/status {status:'已通过'}`；「拒绝」弹理由必填模态 → PUT `{status:'已拒绝', reject_reason}`。所有变更后 `cacheDel('/api/announcements')` 并刷新模态 body（依赖 `_activeListModal` 标记）。

### 3.6 duty-admin.html + duty-admin.js

#### 3.6.1 排班生成入口

- 「自动生成」按钮 `generateSchedule()` → POST `/api/duty/schedule/generate` → toast「已生成 N 天排班」→ renderDutyCalendar()。（⚠️按钮文字初始化为「自动生成」，完成后被硬编码重置为「自动生成排班」，与初始文案不一致——duty-admin.js:155）
- 月历（`prevMonth/nextMonth` + `#calTitle`）：`GET /api/duty/schedule?start&end` 当月起止；6 行 7 列 table；过去日期 `cal-day-disabled` + button disabled；今日高亮；有排班的格子显示 A/B 姓氏首字母；点格 `openScheduleModal`（静态 `#scheduleModal`）→ 干事 A/B 下拉（来自 `/api/duty/staff`）→ 保存 POST `/api/duty/schedule/manual {date,staff_a_id,staff_b_id}`（A=B 拒绝）；已有排班显示「删除排班」DELETE `/api/duty/schedule/manual?date=`。
- 「重置排班数据」`clearAllSchedules()` confirm → POST `/api/duty/schedule/clear-all`（清排班+签到+扣分）。

#### 3.6.2 干事名单与导入

- 「上传干事表」静态 `#uploadModal`：textarea 每行 `部门,班级,姓名` → `handleUpload` 解析（<3 段跳过）→ POST `/api/duty/staff/upload {staffList}` → toast 成功 N 人 + warnings 逐条（row—reason）。
- 「添加干事」`#addStaffModal`（部门/班级/姓名）→ POST `/api/duty/staff`。
- 「查看名单」`#staffModal`：卡片流，未映射 user_id 的干事带「未映射」warning 徽章，可移除（DELETE `/api/duty/staff/<id>`）。

#### 3.6.3 评分操作流（扣分）

- 数据：`loadAdminScores()` 拉 `GET /api/duty/scores?date_from=<30天前>`；时段字典 `GET /api/duty/periods`（过滤 `slot_type!=='no_duty'`）。
- 摘要 `#scoreCount`：`共 N 条（有效 X 条，扣分 Y 条 Z 分）`。
- 查看扣分 `#scoresModal`：
  - 筛选：部门下拉（从数据去重生成）/ 状态（全部/仅有效/仅已销分，默认仅有效）/ 姓名包含（oninput 即筛）；
  - 列表截断前 200 条；负分且未销分的记录可选（checkbox）+「销分」单条按钮 `showCancelModal`；
  - 批量条 `#scoreBatchBar`（选中数 + 批量销分 + 取消选择）→ `#batchCancelModal`；
  - **销分凭据**（单个/批量同构）：销分理由*(200) + 销分人下拉（GET `/api/duty/admins`，显示 姓名（角色））+ 密码* → POST `/api/duty/scores/cancel {score_record_id,...}` / `/api/duty/scores/batch-cancel {score_record_ids:[...],...}`。
- 手动加减分 `#addScoreModal`：干事*/日期*(默认今天)/时段*/分值*(step 0.5，可负可正)/原因(200) → POST `/api/duty/scores/add`；toast 按正负区分文案。
- 导出：`showExportTimePicker(type)` 模态给「本周/本月」两档（周一起始算周，自然月算月）→ `downloadCSV(filename, apiUrl, headers, rowMapper)`：拉 JSON 自行拼 CSV（`\uFEFF` BOM）。排班表头 `日期,干事A,干事B`；扣分表头 `姓名,班级,部门,日期,时段,分数,原因`（`show_cancelled=false`）。
- 部门统计：同 duty 页接口 weeks=2，但条形为渐变色 `deptBarGrow` 动画（width 0→100%，delay i*0.08s）。

### 3.7 personalize.html — 全部设置项与存储

存储结构：`localStorage['personalize']`（JSON）+ 同步镜像 Cookie `personalize=<encodeURIComponent(json)>;path=/;max-age=31536000`（供服务端/SSR 读取 ⚠️当前未见读取方）：

```js
{
  theme: 'light' | 'dark' | 'auto',
  style: 'default',              // 历史上曾有 newspaper 等，现强制回退 default（M3 唯一风格）
  color: '#0B57D0',              // 六选一：雅礼深蓝#0B57D0/中国红#C41E24/翡翠绿#0D7C3F/琥珀橙#E67E22/罗兰紫#6C3483/青瓷#1A8A8A
  fontSize: 15,                  // slider 13–20，step 0.1，change 时四舍五入取整
  animation: true,               // 华丽动画总开关（false→reduce-animation 类，页面淡入淡出）
  noAnimation: false,            // 仅 animation=false 时出现；完全禁用过渡（no-animation 类）；二者互斥
  superGraphic: false,           // 仅 animation=true 时出现
  stack: false                   // 公告卡片图片堆叠（移动端 <768 强制 off+disabled）
}
```

各设置项与生效方式：

| 设置项 | 控件 | 应用 |
|---|---|---|
| 外观模式 | themeOptions 三钮 light/dark/auto | `html.dark` 类；auto 跟随 `prefers-color-scheme` |
| 主题风格 | styleOptions 单钮 M3(default) | 仅存储兼容，无 CSS 切换 |
| 强调色 | colorOptions 动态生成 6 钮 | 设 `--md-primary` + `--md-primary-dim=rgba(...,.8)` |
| 字体大小 | `#fontSlider` range 13–20 | `html.style.fontSize=<n>px` |
| 华丽的动画效果 | `#animationToggle` switch | `reduce-animation` 类切换；关闭时隐藏 stack/superGraphic 行并强制复位它们 |
| 公告卡片图片堆叠 | `#stackToggle` | 被 announcements.js 读取（§3.2.1） |
| 关闭所有动态效果 | `#noAnimationToggle` | `no-animation` 类 |
| Super Graphic Effects for fun | `#superGraphicToggle` | 开启需 `confirmAction`（allowHtml，光敏癫痫警告）→ 注入 `/css/graphic.css` + `/js/graphic.js`（id sgCss/sgJs），触发 `window._sgFirework()`（未就绪则挂 `_sgPendingFirework`）；关闭移除标签 + `_sgDestroy()` + 清除 `.sg-particle/.sg-firework-canvas` |
| 重置所有设置 | `#resetBtn` | confirm → 删 personalize（localStorage+cookie）、移除四个 html 类、还原 CSS 变量与字号、UI 复位（theme 回 auto 高亮、字号 15、动画开）→ 解锁 `reset_master` |

**成就彩蛋触发**：

| 成就 id | 触发条件 | 实现 |
|---|---|---|
| `color_freak`（五彩斑斓的黑） | 10 秒窗口内点击强调色 >6 次 | `_trackColorClick`：计数 + 10s 定时器清零，>6 立即结算（personalize.html:179-195） |
| `ocd`（黑白无常） | 明暗切换累计 ≥20 次 | `_ocdCount` localStorage 计数，theme 按钮点击时 +1 |
| `super_graphic` | 开启 Super Graphic（确认后） | superGraphicToggle change |
| `reset_master`（删繁就简） | 确认重置所有设置 | resetBtn handler |

---

## 4. 页面间导航约定

### 4.1 `renderNav(currentPage)` 的 currentPage 取值全集（自各页调用处收集）

| 取值 | 使用页面 |
|---|---|
| `'index'` | index.html |
| `'services'` | services.html |
| `'moment'` | moment.html |
| `'announcements'` | announcements.html、announcement.html（详情页复用列表高亮） |
| `'polls'` | polls.html、poll.html |
| `'finance'` | finance.html |
| `'activities'` | activities.html |
| `'duty'` | duty.html、duty-admin.html |
| `'admin'` | admin.html |
| `'settings'` | settings.html |
| `'login'` | login.html |
| `'about'` | about.html、changelog.html、thanks.html |
| `'feedback'` | feedback.html |
| `'messages'` | messages.html |
| `'debug'` | debug.html |
| *(undefined)* | personalize.html 调用 `renderNav()` 无参 |

**⚠️待确认**：nav.js:15 用 `currentPage === 'personalize'` 决定个性化图标 active 态，但 personalize.html 从未传 `'personalize'` → 该高亮永不生效（疑似遗漏）。

### 4.2 currentPage 的两类用途

1. **顶栏 active 态**（personalize/settings/login 三处比对）。
2. **胶囊导航使用频率统计**：`renderCapsuleBar` 里 `if (currentPage) recordTabUsage(currentPage)` → `localStorage.tabCapsuleUsage`。任何字符串都会被记录（含 index/settings/login/about/debug/messages），但只有胶囊 9 页 id 参与排序。

### 4.3 胶囊导航（nav.js:66-209）要点

- 固定 9 项：services/moment/announcements/polls/finance(member+)/activities/duty(public+)/**admin(adminOnly)**/feedback。
- 排序：services 恒首位 → 其余按 `tabCapsuleUsage` 降序 → feedback 强制垫尾；desktop 显示 6 个、mobile 4 个，超出进 `tab-cap-extra` 折叠（当前页若超限会被交换进可见区）。
- 翻页位移动画：跳转前把各项坐标存 `sessionStorage.capsuleFlip`，新页面渲染后按位移差做 FLIP 反向过渡（transform .5s cubic-bezier(.2,0,0,1)）。
- 自动隐藏：下滑 >80px 藏、上滑现；moment 页整体隐藏（鼠标移到上下 1/4 边缘区或触屏近底部时临时唤出）。

### 4.4 其它跨页跳转约定

- 登录成功 → `services.html`；登出（nav data-action=logout）→ 清 token/user → `services.html`。
- 404 跳板带来源：`/404.html?from=<页名中文>`（auth.js `_go404`）；410 跳板带英文页名（cultural/tasks/review）。
- 公告编辑跨页：详情页「编辑」→ `/announcements.html?edit=<id>`。
- 成员管理 → `settings.html?userId=<id>`。
- about 页脚三连击 → debug.html。

---

## 5. localStorage / sessionStorage 键速查（页面视角）

| 键 | 类型 | 写入方 | 用途 |
|---|---|---|---|
| `token` / `user` | LS | auth/api/nav | JWT 与用户对象（含 achievements 数组缓存） |
| `yc_*` | LS | api.js cache* | API 缓存，TTL 3 天，单条 ≤4MB |
| `personalize` (+cookie) | LS | personalize.html | §3.7 结构 |
| `tabCapsuleUsage` | LS | nav.js | 胶囊排序计数 |
| `achievements` | LS | api.js unlockAchievement 兜底 | 离线成就，登录时合并后删除 |
| `_rd` | LS | announcement.js | 公告阅读计数（reader，≥50 清零） |
| `_fc` | LS | feedback.html | 反馈计数（1/10 成就） |
| `_hf` | LS | nav.js | logo 连点（high_five，≥10 清零） |
| `_ocdCount` | LS | personalize.html | 明暗切换计数 |
| `_emblemClicks` | LS | about.html | 校徽连点 |
| `_loginFail` / `_lastLogin` / `_loginDates` / `_regDate` | LS | login.html | 登录系成就 |
| `_nightOwlDates` | LS | api.js | 连续凌晨登录 |
| `_404count` / `_410count` | LS | 404/410.html | 常客成就 |
| `_noviceDone` | LS | api.js checkNovice | novice 幂等标记 |
| `site_status` | SS | api.js | 站点关闭状态缓存 TTL 30s |
| `feed_openComments` | SS | moment.js | feed 展开的评论 |
| `capsuleFlip` | SS | nav.js | 胶囊 FLIP 动画坐标 |

游标/分页参数一览：moment `before/after/limit=20`（游标）；messages `limit=20&offset`（偏移）；admin users `offset` 步长 200；feature 邀请列表 `offset` 滚动加载；comments/feeds 全量无分页。

---

## 6. 疑点清单（⚠️待确认）

1. **personalize 高亮失效**：nav.js 比较 `'personalize'` 但页面传 undefined（§4.1）。
2. **settings.js `userInfo`**：向不存在的 `#userInfo` 写文本（settings.js:7-9），疑似旧版布局遗留。
3. **duty.js `past` 变量**：计算了 auto_absent 缺岗截止但未用于渲染（duty.js:72-75），缺岗判定应完全在服务端。
4. **duty-admin generateSchedule 按钮文案**：完成后重置为「自动生成排班」而初始是「自动生成」（duty-admin.js:145-156）。
5. **messages 删除入口**：注释称"长按（移动端）/右键（桌面端）"，实际只绑定了 touch 长按，桌面无 contextmenu 处理（messages.js:192-207）。
6. **moment 页成就缺口**：chatty/extrovert/introvert 依赖发消息计数，但 moment.js 未调用 `checkCountAchievements`，解锁时机依赖其它页面的调用 ⚠️。
7. **announcements 评论不触发 novice**：services/poll 的同类操作会 `checkNovice()`，公告评论不会——口径不一致 ⚠️。
8. **services 横幅随机图 vs 放大首图**：slide 缩略随机取 `_images` 之一，lightbox 却固定打开 `_images[0]`，可能图文不符（services.js:87）。
9. **finance 汇总口径**：summary 卡不受收入/支出筛选影响（有意为之，代码有注释），但"近30天报销率"基于全量而非当月——两处口径并存，需产品确认。
10. **cookie `personalize` 的消费方**：仅写入未见读取（可能为未来 SSR/边缘中间件预留）。
11. **debug.html 电池 API**：使用 `navigator.getBattery`（标准为 `navigator.getBattery()`，Chrome 实际暴露的是 `navigator.getBattery` 已废弃别名 ⚠️多数环境将走 "(unavailable)" 分支）。
12. **404 审计日志真实性**：`generateDeviceLines` 会真实枚举并打印 localStorage 前 10 条（含 token/user 原文片段，slice(0,80)）到屏幕，属演出性质但确有敏感信息上屏。

---

## 提取来源

- 页面 HTML：`public/*.html` 全部 26 个（index/services/announcements/announcement/moment/polls/poll/finance/activities/duty/duty-admin/admin/messages/feedback/settings/login/personalize/about/changelog/thanks/cultural/tasks/review/debug/404/410）。
- 页面级 JS：`public/js/{services,announcements,announcement,moment,polls,poll,finance,activities,duty,duty-admin,admin,messages,settings}.js`（auth.js、nav.js 为共享层一并核对）。
- 共享层关键行：`api.js`（CACHE 3-42、fetchWithCache 57-85、checkSiteClosed 301-323、data-action 委托 439-455、compressImage 461-488、成就系统 752-900）、`utils.js`（progressiveRender 57-69、createImageGallery 84-146）、`auth.js`（全文 111 行）。
- 内联脚本：login.html（142-271）、feedback.html（26-63）、personalize.html（110-373）、settings.html（183-446）、about.html（68-201）、changelog.html（42-109）、debug.html（51-220）、404.html（83-384）、410.html（77-135）、duty-admin.html 静态模态（79-291）。
- 相关既有文档交叉引用：`specs/01-database-and-utils.md`、`specs/02-api-platform.md`、`specs/03-api-content-business.md`、`specs/04-api-duty.md`（本文不重复其 API 契约）。
