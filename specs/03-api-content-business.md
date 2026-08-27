# 03 · API 规格：内容与业务模块

> 范围：`functions/api/` 下 announcements.js、comments.js、feed.js、activities.js、reviews.js、feedback.js、issues.js、polls.js、halls.js，结合 `[[path]].js` 路由挂载与 `_utils.js` 公共设施。
> 所有错误消息均照抄源码原文；不确定处标注 ⚠️待确认。

---

## 0. 公共约定（全站生效）

### 0.1 响应包装

| 类型 | 结构 | 说明 |
|---|---|---|
| 成功 | `{ success: true, data, _cleanup? }` | `_cleanup` 仅当日清理删除行数 >0 时附带 |
| 失败 | `{ success: false, error }` | `error` 为中文消息字符串 |

统一安全头：`X-Content-Type-Options: nosniff`、CSP、`Referrer-Policy: strict-origin-when-cross-origin`、`Cache-Control: no-cache`。

### 0.2 路由分发与鉴权（[[path]].js）

| 步骤 | 行为 |
|---|---|
| 1 | `initDB(env)`：建表/迁移，失败返回 `500 '服务器初始化失败'` |
| 2 | `autoCleanup(env)`：每日一次数据清理（失败静默） |
| 3 | `checkSiteClosed`：`settings.site_closed==='true'` 时返回 `503 '网站已关闭，请联系管理员'`；豁免路径：`/api/auth/login|signin|register|me|change-department`、`/api/sync`、`/api/settings`、`/api/chat*`、`/api/feed*`、`/api/admin*`、`/api/captcha/generate` |
| 4 | `requireMember(request, env)`：JWT（Bearer 头或 `token` Cookie），校验 `token_version`；`role==='pending'` 视为 null。**解析失败不报错，user=null 向下透传** |
| 5 | 路由表匹配；仅 `/api/admin/*` 带 `gate: 'admin'/'owner'` 强制校验（403 `'需要管理员权限'` / `'需要网站管理者权限'`），其余模块自行判空 |
| 6 | 无匹配 → `404 '接口不存在'`；handler 抛异常 → `500 '服务器内部错误，请稍后重试'` |

角色判定：`isAdmin(user)` = role ∈ `admin|owner|teacher`；`isOwner(user)` = role === `owner`；`isHallReviewer(user)` = `isAdmin(user) || user.department === '社团部'`。

### 0.3 限流（checkRateLimit，按 IP 内存计数）

| Key | 上限 | 窗口 | 触发消息（429） |
|---|---|---|---|
| `createAnnouncement` | 5 | 60s | `操作过于频繁，请稍后再试` |
| `updateAnnouncement` / `deleteAnnouncement` / `addAnnouncementImage` | 10 | 60s | `操作过于频繁` |
| `reviewAnnouncement` | 20 | 60s | `操作过于频繁` |
| `comment` / `updateComment` / `deleteComment` | 10 | 60s | `评论过于频繁，请稍后再试`（仅创建）/ `操作过于频繁` |
| `addFeedComment` | 5 | 10s | `操作过于频繁` |
| `deleteChatMessage` | 10 | 60s | `操作过于频繁` |
| `createActivity` / `deleteActivity` / `unsignupVolunteer` | 10 | 60s | `提交过于频繁` / `操作过于频繁` |
| `volunteerSignup`（游客报名） | 3 | 30min | `操作过于频繁，每30分钟最多报名3次` |
| `createReview` / `deleteReview` | 10 | 60s | `操作过于频繁` |
| `reviewItem` | 20 | 60s | `操作过于频繁` |
| `feedback` | 5 | 60s | `提交过于频繁，请稍后再试` |
| `issue` / `deleteIssue` | 10 | 60s | `提交过于频繁，请稍后再试` / `操作过于频繁` |
| `updateIssueStatus` | 20 | 60s | `操作过于频繁` |
| `createPoll` / `deletePoll` | 10 | 60s | `提交过于频繁` / `操作过于频繁` |
| `vote` | 3 | 1h | `投票过于频繁，每小时最多提交3次` |
| `hallBooking` | 5 | 60s | `操作过于频繁` |
| `reviewHall` | 20 | 60s | `操作过于频繁` |

### 0.4 缓存 hash（sync.js）

`computeHash(obj)` = `SHA-256(JSON.stringify(data))` 的 hex。`POST /api/sync` 入参 `{ pages: { "<path>": "<oldHash>" } }`，逐页比对：未变 → `{ changed: false }`；有变 → `{ changed: true, data, hash }`。支持键：`/api/announcements`（排除已拒绝+attach 图）、`/api/banner`、`/api/issues`、`/api/reviews`、`/api/polls`、`/api/comments/{announcement|issue}/:id`、`/api/polls/:id`、`/api/polls/:id/results` 等；无权限时该页**不出现在结果中**（跳过而非报错）。

---

## 1. 端点契约总表

图例：鉴权列 `公开`=无需登录；`登录`=user 为 null 则 401；`Admin`=isAdmin；`审核`=isHallReviewer（admin 或社团部）；`创建者/Admin`。

### 1.1 公告 announcements.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/announcements` | 公开 | - | `Announcement[]`（排除 `已拒绝`，LIMIT 200，附 `comment_count`、`image_url[]`） | 500 `获取公告失败` |
| GET | `/api/announcements/:id` | 公开 | - | 单条 Announcement（同上附加字段） | 404 `公告不存在` |
| POST | `/api/announcements` | 登录 | `{ title, content, image_urls? }` | 201 Announcement 行 | 400 `标题和内容不能为空` / `标题不能超过200字` / `内容不能超过5000字` / `单张图片过大`；429 |
| PUT | `/api/announcements/:id` | 创建者/Admin | `{ title, content, image_urls? }` | 更新后行（status 重置 `待审核`） | 403 `无权编辑此公告`；400 同上；404 |
| DELETE | `/api/announcements/:id` | 创建者/Admin | - | `{ message: '公告已删除' }` | 403 `无权删除此公告`；404 |
| PUT | `/api/announcements/:id/status` | Admin | `{ status: '已通过'\|'已拒绝', reject_reason? }` | `{ message: '审核结果: 已通过'\|'审核结果: 已拒绝' }` | 403 `需要管理员权限`；400 `状态必须为已通过或已拒绝` / `拒绝时请填写理由` / `拒绝理由不能超过500字` |
| POST | `/api/announcements/:id/images` | 创建者/Admin | `{ image_url }`（dataUrl ≤1,000,000 字符） | 追加后的完整行 | 400 `请提供图片` / `图片数据异常`；403 `无权修改此公告` |

### 1.2 评论 comments.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/comments/(announcement\|issue)/:id` | 公开 | - | `Comment[]`（created_at ASC） | 400 `无效的类型` |
| POST | `/api/comments` | 登录 | `{ target_type, target_id, content }` | 201 Comment 行 | 400 `无效的类型` / `目标ID不能为空` / `评论内容为1-500字`；429 `评论过于频繁，请稍后再试` |
| PUT | `/api/comments/:id` | 仅作者 | `{ content }` | 更新后行 | 403 `无权编辑此评论`；404 `评论不存在` |
| DELETE | `/api/comments/:id` | 作者/Admin | - | `{ message: '评论已删除' }` | 403 `无权删除此评论`；404 |

### 1.3 动态 feed.js（挂载于 /api/chat、/api/feed）

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/chat/messages` | 公开 | Query: `limit`(默认20,≤50)、`before`、`after`（均为消息 id 游标） | `{ messages[], nextCursor, hasMore }`（type ∈ system/notification） | - |
| DELETE | `/api/chat/messages/:id` | Admin | - | `{ message: '已删除' }` | 403 `需要管理员权限`；404 `消息不存在` |
| POST | `/api/feed/:id/comment` | 登录 | `{ content }`（trim 后 1-200 字） | 201 `{ message: '评论成功' }` | 400 `评论内容为1-200字`；404 `动态不存在` |
| GET | `/api/feed/:id/comments` | 公开 | - | `feed_comments[]`（ASC） | - |

### 1.4 活动 activities.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/activities` | 可选登录 | - | `Activity[]` + `volunteer_count`（登录时另附本人 `signed_up`） | - |
| POST | `/api/activities` | 登录 | `{ name, time, location?, departments?, need_volunteers? }` | 201 `{ ...row, volunteer_count: 0 }` | 400 `请填写活动名称` / `请填写活动时间`；401 `需要登录` |
| DELETE | `/api/activities/:id` | Admin | - | `{ message: '活动已删除' }` | 403 `需要管理员权限`；404 `活动不存在` |
| POST | `/api/activities/:id/volunteer` | 可选登录（游客需姓名+验证码） | 登录者无 body；游客 `{ name, captcha_token, captcha_code }` | 201 `{ message: '报名成功' }` | 400 `该活动不需要志愿者` / `您已报名` / `请填写姓名`；403 `人机验证失败，请刷新后重试`；404 `活动不存在` |
| DELETE | `/api/activities/:id/volunteer` | 登录（仅本人记录） | - | `{ message: '已取消报名' }` | 404 `未找到报名记录` |
| GET | `/api/activities/:id/volunteers` | 公开 | - | `{ activity_name, volunteers[] }` | 404 `活动不存在` |

### 1.5 审核 reviews.js（独立图片送审模块）

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/reviews` | 登录 | - | `Review[]`（DESC LIMIT 200） | 401 `需要登录` |
| POST | `/api/reviews` | 登录 | `{ image_url }`（dataUrl ≤2,000,000 字符） | 201 Review 行（status 默认 `待审核`） | 400 `图片不能为空` / `图片过大` / `无效图片格式` |
| PUT | `/api/reviews/:id/review` | Admin | `{ status: '通过'\|'拒绝', reject_reason? }` | `{ message: '审核结果: 通过'\|'审核结果: 拒绝' }` | 403 `无权限`；400 `状态必须为通过或拒绝` / `拒绝时请填写理由` / `拒绝理由不能超过500字` |
| DELETE | `/api/reviews/:id` | Admin | - | `{ message: '审核记录已删除' }` | 403 `需要管理员权限` |

### 1.6 反馈 feedback.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| POST | `/api/feedback` | 公开 | `{ content, contact?, page?, section?, version?, captcha_token, captcha_code }` | 201 `{ message: '反馈已发送，感谢你的意见' }` | 400 `反馈内容为1-2000字` / `联系方式不能超过100字` / `请完成人机验证`；403 `人机验证失败，请刷新后重试` |
| GET | `/api/admin/feedback` | Admin(gate) | - | `Feedback[]`（LIMIT 200） | - |
| DELETE | `/api/admin/feedback/:id` | Admin(gate) | - | `{ message: '反馈已删除' }` | 404 `反馈不存在` |

### 1.7 报修 issues.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/issues` | 可选登录 | - | `Issue[]` + `comment_count`；**匿名只返回字段子集**（不含 contact/submitted_by），LIMIT 200 | - |
| POST | `/api/issues` | 公开（需验证码） | `{ location, description, contact?, notes?, submitted_by?, image_url?, captcha_token, captcha_code }` | 201 Issue 行（status `待处理`，submitted_by 默认 `访客`） | 400 `地点和报修问题不能为空` / `地点不能超过200字` / `问题描述不能超过2000字` / `联系方式不能超过100字` / `姓名不能超过50字` / `备注不能超过50字` / `图片过大` / `无效图片格式` / `请完成人机验证`；403 `人机验证失败，请刷新后重试` |
| PUT | `/api/issues/:id/status` | Admin | `{ status: '待处理'\|'处理中'\|'已完成' }` | `{ message: '状态已更新' }` | 403 `需要管理员权限`；400 `无效状态` |
| DELETE | `/api/issues/:id` | Admin | - | `{ message: '问题已删除' }`（级联删 issue 评论） | 403 `需要管理员权限` |

### 1.8 投票 polls.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/polls` | 公开 | - | `Poll[]`（LIMIT 200，含 `total_votes`/`status`） | - |
| GET | `/api/polls/:id` | 公开 | - | Poll + `questions[]`（options 解析为数组） | 404 `投票不存在` |
| POST | `/api/polls` | Admin | `{ title, description?, require_name?, min_role?, allowed_classes?, questions[] }` | 201 `{ id, message: '投票已创建' }` | 403 `需要管理员权限`；400 `标题字数在1-200之间` / `至少需要一个题目` / `题目内容字数需在1-500之间` / `题目类型无效` / `选择题至少需要2个选项` / `选择题最多26个选项` / `图片过大` |
| POST | `/api/polls/:id/vote` | 公开（受 min_role/allowed_classes 限制，需验证码） | `{ answers: [{question_id, answer}], voter_name?, captcha_token, captcha_code }` | 201 `{ message: '投票成功' }` | 400 `投票已结束` / `选项无效` / `多选题至少选一个` / `题目不存在` / `主观题回答字数超过限制（最多N字）` / `您已参与过此投票` / `请完成人机验证`；403 `您没有权限参与此投票` / `您的班级不在本次投票范围内` / `人机验证失败，请刷新后重试`；404 `投票不存在` |
| GET | `/api/polls/:id/results` | 创建者/Admin | - | `{ poll, questions, responses, questionResults }` | 403 `无权查看结果`；404 |
| GET | `/api/polls/:id/export` | 创建者/Admin | - | CSV 文件（UTF-8 BOM） | 403 `无权导出`；404 |
| GET | `/api/polls/:id/my-vote` | 公开 | - | `{ voted: false }` 或 `{ voted: true, response, answers }` | 404 |
| DELETE | `/api/polls/:id` | 创建者/Admin | - | `{ message: '投票已删除' }` | 403 `无权删除此投票`；404 |

### 1.9 报告厅预约 halls.js

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 主要错误 |
|---|---|---|---|---|---|
| GET | `/api/hall/bookings/pending` | 审核 | - | `[{ booking, conflicts[] }]` | 403 `需要审核权限` |
| GET | `/api/hall/bookings` | 登录 | - | `Booking[]`（所有人可见 approved/cancelled；自己可见 pending/rejected） | 401 `需要登录` |
| POST | `/api/hall/bookings` | 登录 | `{ date, start_time, end_time, purpose }` | 201 Booking 行 | 400 `请填写完整信息` / `用途不超过200字` |
| POST | `/api/hall/bookings/:id/withdraw` | 本人 | - | `{ message: '已撤回' }`（pending → cancelled） | 403 `只能撤回自己的预约`；400 `只能撤回待审核的预约`；404 `预约不存在` |
| DELETE | `/api/hall/bookings/:id` | 本人/Admin | - | `{ message: '已删除' }` | 403 `无权删除`；404 |
| POST | `/api/hall/bookings/:id/review` | 审核 | `{ action: 'approve'\|'reject' }` | `{ message: '已批准' }` / `{ message: '已拒绝' }` | 403 `需要审核权限`；400 `参数错误` / `已审核，不可重复操作`；404 |

---

## 2. 逐端点详述

### 2.1 公告

**GET /api/announcements（列表）**
1. SQL：`SELECT a.*, COALESCE(c.cnt,0) AS comment_count ... WHERE a.status IS NULL OR a.status != '已拒绝' ORDER BY created_at DESC LIMIT 200`（LEFT JOIN 评论计数子查询）。
2. `attachAnnounceImages` 合并图片（见 §4.2）。
3. 异常 → `500 获取公告失败`。

**POST /api/announcements**
1. 401/429/格式校验（见总表）。
2. `INSERT INTO announcements (title, content, image_url, created_by)` —— **status 未指定，落库为表默认值 `'已通过'`**（ALTER 与 CREATE 两处 DEFAULT 均为 `'已通过'`）⚠️待确认：与第 5 步聊天消息的 `待审核` 不一致，疑似历史遗留。
3. 若传 `image_urls` 数组：逐张校验长度 ≤1,000,000，超限即返回 `单张图片过大`（此时**公告主行已写入但图片全部未写入**，非原子 ⚠️）；否则批量 INSERT `announcement_images`（sort_order=下标）。
4. 回读整行并 attach 图片。
5. 副作用：`insertChatSystemMessage({action:'发布公告', from_dept: user.department||user.name, status:'待审核', ref_type:'announcement'})`（仅聊天流展示文案，不改 DB status）。**不发站内通知**。
6. 返回 201 + 完整行。

**PUT /api/announcements/:id（编辑重置审核）**
1. 权限：`user.name === created_by || isAdmin`，否则 `403 无权编辑此公告`。
2. `UPDATE ... SET title=?, content=?, status='待审核', reviewed_by='', reviewed_at=NULL, reject_reason=''` —— **编辑必然重置进待审**。
3. `image_urls !== undefined` 时调用 `replaceAnnounceImages`（先 DELETE 该公告全部子图再按序重插；传 `[]` 即清空图片；不传则保留原图）。
4. 无通知副作用。

**PUT /api/announcements/:id/status（审核）**
1. Admin 校验 → 403 `需要管理员权限`。
2. `UPDATE SET status=?, reviewed_by=user.name, reviewed_at=datetime('now'), reject_reason=?`。
3. 副作用（status=`已通过`）：① 聊天流消息 `公告已通过`（ref_type announcement）；② 给作者发站内通知 `review_result`/`公告已通过`（icon check-circle，经 getUserIdByName 解析，且仅在作者启用 messages 功能时落库）；③ **全员通知**：查所有 role ∈ member/admin/owner/teacher 用户，批量插入 `announcement`/`新公告` 通知。
4. 副作用（status=`已拒绝`）：仅给作者发 `review_result`/`公告未通过`（正文含拒绝理由，缺失时用 `未提供`）。

**POST /api/announcements/:id/images**
- sort_order 取 `MAX(sort_order)+1` 追加一张；校验 `isValidImageUrl`（`^data:image\/(jpeg|png|gif|webp);base64,`）且 ≤1,000,000 字符。**不改变审核状态**。前端在「新建」流程中使用（先建公告再循环上传压缩图）；「编辑」流程不用它，走 PUT image_urls。

**DELETE /api/announcements/:id**
- 级联：DELETE `announcement_images` → DELETE `comments(target_type='announcement')` → DELETE 主行。无系统消息副作用。

状态机小结：

```
            ┌────────────────────────────────────────────┐
新建(POST) ─┤→ '已通过'(DB默认 ⚠️) ──编辑(PUT)──→ '待审核' ─┤
            │        ↑                              │     │
            │        └──────── 审核通过 ←── 审核 ────┤     │
            │                                   审核拒绝 ↓    │
            └──────────────────────────────→ '已拒绝'(需理由)┘
```
- 可见性：列表/同步排除 `已拒绝`；banner 只取 `status IS NULL OR '已通过'`；`待审核` 条目**会出现在普通列表中**（无过滤）⚠️待确认是否有意。

### 2.2 评论

**POST /api/comments**
1. 校验 `target_type ∈ {announcement, issue}`、`target_id` 必填、content 1-500 字。**不校验目标是否存在** ⚠️。
2. INSERT `comments(target_type, target_id, content, created_by=user.name)`。
3. 通知原内容作者：announcement → 查 `announcements.created_by`；issue → 查 `issues.submitted_by`；作者 ≠ 评论者时经 `getUserIdByName` 发 `comment_reply`/`收到新评论` 通知（功能门控 messages）。失败静默。

**PUT /api/comments/:id**：仅 `created_by === user.name` 可改（**管理员也不可代改**）。**DELETE**：作者或 Admin。

### 2.3 动态 feed（chat_messages 只读视图 + 评论）

**GET /api/chat/messages（游标分页）**
- 数据源：`chat_messages WHERE type IN ('system','notification')`（纯文本消息不对 API 暴露）。
- 参数：`limit` 默认 20、上限 50；游标为消息 `id`。
- 分支逻辑：

| 参数组合 | SQL 排序 | 取量 | hasMore 判定 |
|---|---|---|---|
| 有 `after` | `id > ? ORDER BY id ASC LIMIT n` | n | `messages.length === limit`（不弹出） |
| 有 `before` | `id < ? ORDER BY id DESC LIMIT n+1` | n+1 | `length > limit`，超出则 pop 尾部 |
| 均无 | `ORDER BY id DESC LIMIT n+1` | n+1 | 同上（首页取最新） |

- `after` 分支结果 reverse 成升序返回。返回 `{ messages, nextCursor: 最后一条的 id（空则 null）, hasMore }`。
- 注意：`before` 与 `after` 同时给时 **`after` 优先**。

**DELETE /api/chat/messages/:id**：仅 Admin；硬删单条；**不级联删 feed_comments**（孤儿由每日清理任务回收）。

**POST /api/feed/:id/comment**：目标必须存在且 `type='system'`（404 `动态不存在`）；content trim 后 1-200 字；INSERT `feed_comments(feed_id, user_name, content)`；无通知。

**GET /api/feed/:id/comments**：公开，created_at ASC。

### 2.4 活动

**POST /api/activities**
1. 必填 `name`、`time`；`departments` 为逗号分隔部门串；`need_volunteers` truthy → 1（**只是开关位，没有容量数字**）。
2. 副作用：① 聊天流 `发布活动`（from_dept 默认 `团委`，to_dept `全体`，ref_type activity）；② 定向通知：解析 departments ∩ DEPARTMENTS 白名单，命中则通知这些部门的活跃用户，否则**全员**通知 `activity_invite`/`新活动`。

**POST /api/activities/:id/volunteer（志愿者报名）**
- 双通道：登录用户直接以 `user.name/user.department` 报名（无限流）；游客须提供姓名 + 自研验证码，限流 3 次/30 分钟。
- 校验链：活动存在（404）→ `need_volunteers=1`（400 `该活动不需要志愿者`）→ 按 `(activity_id, member_name)` 查重（400 `您已报名`）→ INSERT。
- **容量规则：无人数上限**，`need_volunteers` 仅表示"需要/不需要"，报满即止的逻辑不存在。

**DELETE /api/activities/:id/volunteer（取消报名）**：仅能删 `member_name = user.name` 的自己的记录；游客无法取消（需登录）。

### 2.5 审核 reviews

- 对象类型：独立的**图片送审**记录（`reviews.image_url` 存单个 dataUrl），字段 `status('待审核'默认)/'通过'/'拒绝'`、`reject_reason`、`reviewed_by/at`。
- POST 后聊天流 `提交审核`（status `待审核`，ref_type review）。
- PUT /:id/review 批准/拒绝后：更新自身四字段 + 聊天流消息（action 映射 `审核已通过`/`审核未通过`，展示 status 映射 `已通过`/`未通过`）。**没有任何跨模块联动**——不会导致公告上架或其他数据变化 ⚠️（与公告审核完全独立）。
- 不校验记录存在性，对不存在 id UPDATE 静默成功 ⚠️。
- GET 对所有登录用户开放全量列表（无"仅自己"过滤）。

### 2.6 反馈 feedback

- 匿名公开提交，自研验证码强制（`TURNSTILE_BYPASS`/`CAPTCHA_BYPASS` 环境变量可绕过）；`turnstile_bypass` 列固定写 0。
- 管理端读取/删除挂在 `/api/admin/*` 由路由 gate 强制 Admin。

### 2.7 报修 issues

**状态枚举与流转**

```
'待处理' ──Admin──→ '处理中' ──Admin──→ '已完成'
   ↑ ________________│__________________↑   （任意双向，均可重复设置）
```
- 只有 Admin 能改（403 `需要管理员权限`）；同时写 `updated_by=user.name`、`updated_at=now`。
- 副作用：置 `处理中` → 聊天流 `报修已处理`；置 `已完成` → 聊天流 `报修已完成`；回退 `待处理` **无**聊天消息。三种状态变更都会尝试给提交者发 `issue_status`/`报修状态更新` 站内通知（文本映射：处理中→`正在处理`，已完成→`已完成`；提交者为注册用户才发）。
- 自动清理：每日删除 `status='已完成' AND updated_at < now-90天`。

**评论关联**：`comments.target_type='issue'`；列表接口 LEFT JOIN 出 `comment_count`；删除报修级联删评论；匿名 GET 返回字段子集 `id,location,status,description,notes,created_at,updated_by,updated_at,image_url,comment_count`（隐藏 contact、submitted_by）。

### 2.8 投票 polls

**三表关系**

```
polls (1) ──< poll_questions (N)          type: 'single'|'multiple'|'text'
   │              │
   │              └──< poll_answers (每题一行)  answer = JSON.stringify(选项下标或下标数组或字符串)
   └──< poll_responses (每人一次)             user_id(登录) / ip+user_id IS NULL(游客), voter_name
poll_answers.response_id → poll_responses.id（经 response 间接归属 poll）
```

**数据结构细节**
- `single.answer` = 选项下标 number；`multiple.answer` = 下标 number 数组（≥1）；`text.answer` = 字符串（1~max_length，max_length 建题时钳制 1..10000，默认 1000）。
- `options` 以 JSON 字符串存 `poll_questions.options`；读接口 safeParse 还原。
- 选择题 2~26 个选项。

**POST /api/polls**：Admin only。⚠️ 主行先 INSERT、随后逐题校验，若第 i 题校验失败会留下**零题目的空 poll**（非原子）。
**匿名模式实现**：`require_name` 只约束**游客**——游客提交时 `voter_name = body.voter_name || '匿名'`；登录用户一律记真名 `user.name`（即使 require_name=0 也记名，仅 results/export 层面区分）。
**重复投票防护**：登录 → `(poll_id, user_id)` 已存在即 400 `您已参与过此投票`；游客 → `(poll_id, ip, user_id IS NULL)`；另有 IP 级限流 3 次/小时。IP 无论登录与否都写入 `poll_responses.ip`。
**准入控制**：`status !== 'open'` → `投票已结束`；`min_role` 权重比较 `{member:2, admin:3, owner:4}`，不足 → 403 `您没有权限参与此投票`（**teacher 权重为 0，会被拒** ⚠️）；`allowed_classes` 非空时要求登录且 `class_name` 在名单内，否则 403 `您的班级不在本次投票范围内`。

**results 权限**：`user.name === poll.created_by || isAdmin(user)`（按名字匹配而非 userId），否则 403 `无权查看结果`。聚合输出：single/multiple → `{ options, counts[], total }`；text → `{ answers: string[] }`；另附原始 `responses` 全量（含 ip/voter_name）。

**CSV 导出格式**
- 响应头：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="poll_{id}_results.csv"`、nosniff/CSP 等。
- 编码：**带 BOM**（前缀 `\uFEFF`）。
- 列：`序号, 投票人, 投票时间` + 每题标题一列（按 sort_order）。投票人为空写 `匿名`。
- 单选写选项文本；多选用 `; ` 连接选项文本；主观题原文；无答案留空。
- 转义：整体双引号包裹、`"`→`""`；公式注入防护：值以 `= + - @ \t` 开头时前置 `'`。

**DELETE**：级联顺序 answers（按 response 子查询）→ responses → questions → polls。

### 2.9 报告厅预约 halls

**时间段模型**：`date` TEXT（YYYY-MM-DD）、`start_time`/`end_time` TEXT（`HH:MM`）。比较时转分钟数 `toMin(t)=h*60+m`。创建时**不校验格式、不校验 start<end、不做冲突检测** ⚠️。

**生命周期**：`pending` ──withdraw(本人)──→ `cancelled`；`pending` ──approve──→ `approved` / ──reject──→ `rejected`（写 reviewed_by/at）。`cancelled`/`rejected` 为终态（不可再审）。过期策略：`date < now-14天` 的行在 initDB、GET 列表、每日清理三处被物理删除。

**审核人判定**：`isHallReviewer(user)` = `isAdmin(user) || user.department === '社团部'` —— 即管理员三角色之外，**社团部普通成员也可审核**。

**冲突检测算法（approve 时，精确描述）**
1. 原子批次 `env.DB.batch([approveStmt, conflictStmt])`：
   - approveStmt：`UPDATE ... SET status='approved', reviewed_by=?, reviewed_at=now WHERE id=? AND status='pending'`（条件更新防并发重复审批；changes=0 → 400 `已审核，不可重复操作`）。
   - conflictStmt：`SELECT * FROM hall_bookings WHERE id != 本单 AND date = 同日 AND start_time < 本单.end_time AND end_time > 本单.start_time AND status IN ('approved','pending') ORDER BY start_time`（区间相交的标准代数：A.start < B.end AND A.end > B.start）。
2. 逐条计算重叠分钟 `o = min(本单end, b.end) − max(本单start, b.start)`，`o > 0` 计入；累加得 `totalOverlap`；按对方状态分桶：`approved` → toCancel（将改为 cancelled）、`pending` → toDelete（**将被物理删除**）。
3. **阈值判定：`totalOverlap > 10`（分钟）才处理冲突**——即与新批准预约总重叠 ≤10 分钟的旧预约被容忍保留；>10 分钟则批量执行取消/删除。
4. 通知：每个被取消/删除的旧预约向全局聊天流写一条 `千报告厅预约冲突：…已被取消/因重叠已被删除`（含新预约人与时段）；最后写批准通知（有冲突时附 `共处理N个冲突预约`）；并给预约人本人发 `review_result`/`预约已批准` 站内通知。reject 分支同样有全局聊天流 + 个人 `预约已拒绝` 通知。

**撤销/删除规则**：withdraw 仅本人 + 仅 pending → cancelled；DELETE 本人或 Admin，硬删（无通知）。提交预约时向全局聊天流写 `千报告厅预约已提交：…`。

---

## 3. 领域规则重点速查

| 模块 | 关键规则 |
|---|---|
| 公告状态机 | `已通过`(新建默认⚠️) ⇄ `待审核`(编辑强制重置) → `已通过`/`已拒绝`(必填理由)；拒绝不可见；审核人=Admin；通过触发全员+作者通知 |
| 公告图片 | 双存储：legacy `announcements.image_url`（JSON 数组兼容）+ 子表 `announcement_images(sort_order)`；读取合并；编辑整体替换、追加用独立端点 |
| 投票去重 | 登录按 user_id、游客按 IP；限流 3 次/小时/IP |
| 投票结果 | 仅创建者（按名字）/Admin 可看可导出；导出 CSV 带 BOM |
| 报修状态 | 待处理/处理中/已完成，仅 Admin 改；处理中/已完成发聊天流+提交通知 |
| 报厅冲突 | 同日区间相交判定；approve 原子条件更新；重叠总和 >10 分钟才清理冲突（approved→cancelled、pending→删除）；审核人=Admin 或社团部 |
| 活动志愿 | 无容量上限；`need_volunteers` 为开关；游客可凭姓名+验证码报名 |
| feed 分页 | id 游标（before/after），limit≤50；after 优先；仅 system/notification 类型 |
| feed 评论 | 目标必须是 system 动态；1-200 字；删除动态不级联删评论 |

---

## 4. 图片处理约定

### 4.1 存储：D1 内嵌 base64，无 R2

- `wrangler.toml` 仅绑定 D1（`binding = "DB"`），**全项目无 R2/bucket**；所有图片均以 `data:image/...;base64,` dataUrl 字符串存入 D1 TEXT 列。
- 存储位置：公告 → `announcement_images.image_url`（+ legacy `announcements.image_url`）；报修 → `issues.image_url`；送审 → `reviews.image_url`；投票题 → `poll_questions.image_url`。
- 服务端合法格式正则（isValidImageUrl）：`/^data:image\/(jpeg|png|gif|webp);base64,/`。
- 服务端大小上限（dataUrl 字符串长度）：公告单图 **1,000,000**（`单张图片过大`/`图片数据异常`）；报修/送审/投票题 **2,000,000**（`图片过大`）。

### 4.2 前端压缩 compressImage（public/js/api.js:458-488）

| 参数 | 值 | 说明 |
|---|---|---|
| `IMG_MAX_DIM` | 1920 | 宽或高超出则等比缩到 ≤1920px（canvas drawImage） |
| 初始质量 | 0.85 | 输出 `canvas.toDataURL('image/jpeg', q)`（GIF 也会转成静态 JPEG） |
| `IMG_MAX_SIZE` | 900×1024 | 以 **dataUrl 字符串长度**（≈二进制 675KB）为阈值 |
| 降质循环 | q -= 0.1 | `while (result.length > IMG_MAX_SIZE && q > 0.1)` 重编码，最低 0.1 |

### 4.3 上传入口与 25MB 限制

| 入口 | 函数 | 限制 |
|---|---|---|
| finance / services(报修) / polls 单图选择 | `previewImageFile(input, preview, label, maxSize)`（utils.js:71） | `file.size > maxSize` 即拒绝并 toast `文件过大，最大 ${Math.round(maxSize/1024)}KB`；三处均传 `25 * 1024 * 1024`（25MB，toast 显示为 25600KB ⚠️文案单位） |
| 公告多图画廊 | `createImageGallery({maxMB})`（utils.js:84，默认 maxMB=25） | 超限文件跳过：toast `图片 ${file.name} 超过 ${maxMB}MB，已跳过` |

### 4.4 attachAnnounceImages / replaceAnnounceImages 使用时机（_utils.js:467-495）

| 函数 | 行为 | 调用方 |
|---|---|---|
| `attachAnnounceImages(env, rows)` | 批量查子表按 sort_order 组装，`row.image_url = [...legacy解析, ...child]`；查询失败降级为仅 legacy | GET 列表/详情、banner、sync、以及 POST/PUT/images 的返回组装 |
| `replaceAnnounceImages(env, id, urls)` | DELETE 该公告全部子图 → 逐条 INSERT（sort_order=i） | 仅 PUT 编辑且 `body.image_urls !== undefined` 时（含清空场景） |

前端时序：**新建** = POST 主行（image_urls 空数组）→ 循环 compressImage 后逐张 POST `/images` → GET 详情刷新；**编辑** = 循环压缩后一次性 PUT `image_urls` 整体替换。

---

## 5. 提取来源

- `functions/api/[[path]].js`（路由表、gate、site_closed、限流外层）
- `functions/api/_utils.js`（json/error 包装、isAdmin/isHallReviewer、checkRateLimit、attachAnnounceImages、replaceAnnounceImages、computeHash、autoCleanup、getBannerData、initDB 表结构）
- `functions/api/announcements.js`、`comments.js`、`feed.js`、`activities.js`、`reviews.js`、`feedback.js`、`issues.js`、`polls.js`、`halls.js`
- `functions/api/sync.js`（hash 缓存协议）
- `public/js/api.js`（compressImage、IMG_MAX_SIZE/IMG_MAX_DIM）
- `public/js/utils.js`（previewImageFile、createImageGallery）
- `public/js/announcements.js`（postAnnouncement 图片上传时序）
- `wrangler.toml`（无 R2 绑定佐证）
