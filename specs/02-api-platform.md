# 02 · API 平台规格（auth / admin / features / messages / settings / banner / sync）

> 提取自 `functions/api/[[path]].js`（声明式路由分发）及 `functions/api/{auth,admin,features,messages,settings,banner,sync}.js`，公共工具见 `functions/api/_utils.js`。
> 所有错误消息字符串均照抄源码原文。不确定处以 ⚠️待确认 标注。

---

## 0. 全局约定

### 0.1 响应封装（`_utils.js`）

| 项 | 约定 |
|---|---|
| 成功响应 | `{ success: true, data: <payload> }`；若本次请求触发了 `autoCleanup` 且清理数 > 0，额外附带 `_cleanup: <n>` 字段 |
| 错误响应 | `{ success: false, error: "<消息>" }` |
| 默认状态码 | `error()` 默认 400 |
| 公共响应头 | `X-Content-Type-Options: nosniff`、CSP、`Referrer-Policy: strict-origin-when-cross-origin`、`Cache-Control: no-cache` |
| 鉴权载体 | JWT（HS256，24h 过期，aud/iss 均为 `yali-tongban`），取自 `Authorization: Bearer <t>` 或 Cookie `token`（HttpOnly; Secure; SameSite=Strict） |
| token 失效机制 | `users.token_version`：DB 中版本 > token 内版本时视为无效（改密码会 +1） |

### 0.2 路由分发与鉴权语义（`[[path]].js`）

请求流水线 `onRequest`：

1. `initDB(env)` — 失败返回 `'服务器初始化失败'` 500。
2. `autoCleanup(env)` — 每日一次孤儿数据/过期数据清理，失败静默。
3. `checkSiteClosed(request, env)` — 若 `settings.site_closed === 'true'` 且路径不在白名单，返回 `'网站已关闭，请联系管理员'` **503**。白名单：`/api/auth/login`、`/api/auth/signin`、`/api/auth/register`、`/api/auth/me`、`/api/auth/change-department`、`/api/sync`、`/api/settings`、前缀 `/api/chat`、前缀 `/api/feed`、**前缀 `/api/admin`**。
4. 特例：`GET /api/captcha/generate`（免登录）→ `{ token, svg }`，`Cache-Control: no-store`；自研 HMAC 图形验证码，5 分钟有效。
5. 解析 JWT 得 `user`（可能为 null）。
6. 遍历路由表匹配 → `gate:'admin'` 要求 `isAdmin(user)`（role ∈ admin/owner/teacher），否则 `'需要管理员权限'` **403**；`gate:'owner'` 要求 role === owner，否则 `'需要网站管理者权限'` **403**。
7. 未匹配 → `'接口不存在'` 404；admin 兜底路由 → `'未知的管理接口'` 404；未捕获异常 → `'服务器内部错误，请稍后重试'` 500。

⚠️待确认：仅 `/api/admin/*` 在路由层强制校验；其余模块（auth/messages/features 等）自行判空 user，行为"按原样透传"是有意设计（注释已说明防回归）。

### 0.3 关键常量（`_utils.js`）

| 常量 | 值 | 用途 |
|---|---|---|
| `SALT_ROUNDS` | 10 | bcrypt |
| `PASSWORD_MIN / MAX` | 6 / 50 | 密码长度 |
| `NAME_MIN / MAX` | 2 / 20 | 姓名长度 |
| `DEPARTMENTS` | 书记处、团总支、社团部、记者站、宣传部、组织部、青志协、办公室（8 个白名单部门） | department 合法值 |
| 角色枚举 | `pending / member / admin / owner / teacher / public` | users.role（`officer` 出现于 features 邀请 SQL，见 ⚠️§6.4） |
| `isAdmin(user)` | role ∈ {admin, owner, teacher} | 管理判定 |
| `isOwner(user)` | role === owner | 站长判定 |

### 0.4 密码校验规则 `validatePassword`

| 校验 | 失败消息（原文） |
|---|---|
| 长度 6–50 | `` 密码长度需在${PASSWORD_MIN}-${PASSWORD_MAX}位之间 ``（实际输出「密码长度需在6-50位之间」） |
| 至少一个字母和一个数字（正则 `/[a-zA-Z]/` 与 `/[0-9]/`） | `密码需包含至少一个字母和一个数字` |

### 0.5 班级校验规则 `isValidClass`

4 位数字字符串；数值 n 需落在基于当年年份 year（base = year-2000）的 4 个区间之一：
`(base-1)*100+1 ~ (base-1)*100+27`、`(base-2)*100+1 ~ (base-2)*100+29`、`(base-3)*100+1 ~ (base-3)*100+29`、`base*100+1 ~ base*100+27`。
（即近三年每班 27~29 个班的编号范围。）失败消息统一：`班级格式无效，请输入4位班级编号`。

### 0.6 限流（内存 Map，按 IP+动作键）

| 动作键 | 上限 | 窗口 | 超限消息 | 状态码 |
|---|---|---|---|---|
| login | 5 | 60s | `登录尝试过于频繁，请稍后再试` | 429 |
| register | 3 | 60s | `注册尝试过于频繁，请稍后再试` | 429 |
| changePassword | 5 | 60s | `操作过于频繁，请稍后再试` | 429 |
| changeName | 10 | 60s | 同上 | 429 |
| changeClass | 10 | 60s | 同上 | 429 |
| changeDepartment | 10 | 60s | 同上 | 429 |
| approveRegistration / rejectRegistration | 20 | 60s | `操作过于频繁` | 429 |
| deleteUser | 10 | 60s | 同上 | 429 |
| clearAll | 3 | 3600s | `操作过于频繁，请稍后再试` | 429 |
| updateSettings | 10 | 60s | `操作过于频繁` | 429 |
| updateRole | 20 | 60s | `操作过于频繁，请稍后再试` | 429 |
| resetPassword | 10 | 60s | 同上 | 429 |
| adminChangeName / setDepartment | 20 | 60s | `操作过于频繁` | 429 |
| batchImport | 5 | 60s | `操作过于频繁，请稍后再试` | 429 |
| batchApprove | 10 | 60s | `操作过于频繁` | 429 |

---

## 1. 端点契约总表

鉴权列：公开=无需登录；登录=任意非 pending 用户；admin=路由层强制；owner=路由层强制站长。

| # | 方法 | 路径 | 鉴权 | 请求参数 | 成功响应 data 结构 | 主要错误 |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/auth/login`（别名 `/api/auth/signin`） | 公开 | body: name*, password*, captcha_token*, captcha_code* | `{ token, user{id,name,role,class_name,department,created_at,achievements[]}, password_reset }` + Set-Cookie | 429 限流；400 缺字段/格式；403 验证码；401 凭证错/pending |
| 2 | POST | `/api/auth/register` | 公开 | body: name*, password*, class_name*, captcha_token*, captcha_code*, department? | `{ message: '注册成功，请等待管理员审核' }` | 429/400 各校验/403 验证码/400 重名 |
| 3 | GET | `/api/auth/me` | 登录 | — | users 行（含 achievements 数组） | 401 `未登录`；400 `用户不存在` |
| 4 | GET | `/api/auth/check-name` | 公开 | query: name | `{ available: boolean }` | 400 `姓名不能为空且不超过50字` |
| 5 | POST | `/api/auth/logout` | 公开 | — | `{ message: '已登出' }` + 清 Cookie | 无（固定成功） |
| 6 | POST | `/api/auth/change-password` | 登录 | body: old_password*, new_password* | `{ message: '密码已更改' }` | 401 未登录/旧密码错；429；400 校验 |
| 7 | POST | `/api/auth/change-name` | 登录（owner 禁止） | body: new_name*, password* | `{ token, user{...}, message: '姓名已更改' }` + Set-Cookie | 403 owner/密码错；401；429；400 |
| 8 | POST | `/api/auth/change-class` | 登录 | body: class_name*, password* | `{ token, user{...}, message: '班级已更新' }` + Set-Cookie | 401；429；400 校验 |
| 9 | POST | `/api/auth/change-department` | admin（仅管理员可改自己） | body: department?, password* | `{ token, user{...}, message: '部门已更新' }` + Set-Cookie | 403 非 admin/密码错；401；429 |
| 10 | POST | `/api/sync` | 公开（页级权限内嵌） | body: `pages: { "<key>": "<hash>" }`* | `{ pages: { key: {changed:false} \| {changed:true,data,hash} } }` | 400 `缺少 pages`/格式 |
| 11 | GET | `/api/banner` | 公开 | — | `{ announcements[3], hallBookings[≤3] }` | 500 `横幅数据获取失败` |
| 12 | GET | `/api/settings` | 公开 | — | `{ site_closed: bool, site_closed_message }` | 无（异常时兜底默认值） |
| 13 | GET | `/api/messages` | 登录 | query: type?, unread=1?, limit(≤100,def20)?, offset? | `{ messages[], total, unread }` | 未登录返回空集而非报错 |
| 14 | GET | `/api/messages/unread-count` | 登录 | — | `{ count }` | 未登录返回 `{count:0}` |
| 15 | POST | `/api/messages/:id` | 登录 | path: id | `{ message: '已标记已读' }` | 401 `需要登录` |
| 16 | POST | `/api/messages/read-all` | 登录 | body: type? | `{ message: '全部已读' }` | 401 |
| 17 | DELETE | `/api/messages/:id` | 登录 | path: id | `{ message: '已删除' }` | 401 |
| 18 | DELETE | `/api/messages` | 登录 | — | `{ message: '已清空已读消息' }` | 401 |
| 19 | GET | `/api/admin/members` | admin | query: offset?（limit 固定 200） | `{ results[{id,name,role,class_name,achievement_count}], hasMore }` | 403 |
| 20 | GET | `/api/admin/registrations` | admin | — | 数组 `[{id,name,class_name,department,created_at}]`（≤200，pending） | 403 |
| 21 | POST | `/api/admin/registrations/:id/approve` | admin | path: id | `{ message: '注册已通过' }` | 429 |
| 22 | POST | `/api/admin/registrations/:id/reject` | admin | path: id | `{ message: '注册已拒绝' }` | 429 |
| 23 | GET | `/api/admin/users/:id` | admin | path: id | 单用户行（含 achievements 数组） | 404 `用户不存在` |
| 24 | DELETE | `/api/admin/users/:id` | admin | path: id | `{ message: '成员已删除' }` | 400 自删/角色不符；404 |
| 25 | DELETE | `/api/admin/clear-all` | owner | — | `{ message: '已清除全部数据' }` | 429 |
| 26 | GET | `/api/admin/settings` | admin | — | 全量 settings 键值对象 | 403 |
| 27 | PUT | `/api/admin/settings` | owner | body: 仅接受 site_closed / site_closed_by / site_closed_message | `{ message: '设置已更新' }` | 400 格式；429 |
| 28 | GET | `/api/admin/storage` | admin | — | 存储统计对象（见 §4.6） | 403 |
| 29 | PUT | `/api/admin/users/:id/role` | admin（授 owner 需 owner） | path: id；body: role* | `{ message: "角色已更新为 ${role}" }` | 400 无效角色/公共账号重复；403 owner 保护；404 |
| 30 | GET | `/api/admin/users` | admin | query: offset?（limit 200） | `{ results[...含 public 角色], hasMore }` | 403 |
| 31 | PUT | `/api/admin/users/:id/reset-password` | admin | path: id；body: password* | `{ message: '密码已重置' }` | 400 校验/缺参；403 站长保护；404 |
| 32 | PUT | `/api/admin/users/:id/name` | admin | path: id；body: name* | `{ message: '姓名已更新' }` | 400 长度/重名；403 站长保护；404 |
| 33 | PUT | `/api/admin/users/:id/department` | admin | path: id；body: department? | `{ message: '部门已更新' }` | 404；429 |
| 34 | POST | `/api/admin/users/batch-import` | admin | body: `users: [{name,password,class_name?,department?}]`* | `{ success, skipped, failed:[{index,name,reason}] }` | 400 `请提供用户列表`；500 `导入失败：…` |
| 35 | POST | `/api/admin/users/batch-approve` | admin | body: `ids: number[]`* | `{ message: "已通过 N 个注册申请" }` | 400 `请提供ID列表`；429 |
| 36 | GET | `/api/admin/features` | admin | — | `{ features: [{key,name,description,icon,globally_enabled,stats{status:cnt}}] }` | 403 |
| 37 | POST | `/api/admin/features` | admin | body: key*, globally_enabled? | `{ message: '已启用'\|'已禁用' }` | 400 `key 必填`/`该功能不存在于预定义列表中` |
| 38 | POST | `/api/admin/features/:key/invite` | admin | path: key；body: `all:true` 或 `user_ids:number[]` | `{ message, invited, skipped }` | 404 `功能不存在`；400 未启用/参数缺失 |
| 39 | POST | `/api/admin/features/:key/reset` | admin | path: key；body: user_id* | `{ message: '已重置，可重新邀请' }` | 404 `功能不存在`；400 `user_id 必填` |
| 40 | GET | `/api/admin/features/:key/invitations` | admin | path: key | `{ invitations: [{user_id,status,invited_at,responded_at,name}] }` | 404 |
| 41 | GET | `/api/features/pending` | 登录（软） | — | `{ pending: [{key,name,description,icon,invited_at}] }` | 未登录返回空数组 |
| 42 | GET | `/api/features/enabled` | 登录（软） | — | `{ enabled: [{key,name,icon}] }` | 未登录返回空数组 |
| 43 | POST | `/api/features/:key/respond` | 登录 | path: key；body: status*（accepted/later/never） | `{ message: '已记录', status }` | 401 `需要登录`；404 `功能不存在`；400 `无效的状态` |

---

## 2. auth.js 逐端点详述

### 2.1 POST /api/auth/login（别名 /signin）

业务步骤：
1. IP 限流（login 5/60s）。
2. 解析 JSON body，取 `name, password, captcha_token, captcha_code`；缺 name/password → `姓名和密码不能为空` 400。
3. **验证码先于数据库查询**：`verifyCaptcha(token, code, env)` 失败 → `人机验证失败，请刷新后重试` **403**。（自研 HMAC SVG 验证码；`CAPTCHA_BYPASS=true` 时跳过）
4. 按 name 查 users；**三种失败统一返回** `用户名或密码错误` **401**：用户不存在 / `role === 'pending'`（待审账号拒绝登录）/ bcrypt.compare 不匹配。
5. 成功：签发含 userId/name/role/class_name/department/achievements/token_version 的 JWT；若 `password_reset === 1` 则回写 `password_reset = 0` 并在响应中带 `password_reset: true`（提示前端强制改密）。
6. 响应附 `Set-Cookie: token=…; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`。

副作用：可能 UPDATE `users.password_reset`。无通知、无 sync 影响、无成就触发。

### 2.2 POST /api/auth/register

字段与校验顺序：

| 顺序 | 字段 | 规则 | 失败消息 | 状态码 |
|---|---|---|---|---|
| 1 | name, password | 必填 | `姓名和密码不能为空` | 400 |
| 2 | class_name | 必填 | `请填写班级` | 400 |
| 3 | class_name | isValidClass（§0.5） | `班级格式无效，请输入4位班级编号` | 400 |
| 4 | name | 长度 2–20 | `姓名长度需在2-20字之间` | 400 |
| 5 | password | validatePassword（§0.4） | 见 §0.4 | 400 |
| 6 | captcha_token/code | verifyCaptcha | `人机验证失败，请刷新后重试` | 403 |
| 7 | name 唯一性 | SELECT 已存在 | `该姓名已被注册` | 400 |

审批流：INSERT users（role=**'pending'**，department 非白名单则存 `''`）→ 返回 `{message:'注册成功，请等待管理员审核'}`。副作用：写 `chat_messages`（type='notification'，内容 `` 新成员注册：${name} ``，即管理端动态流通知）。不创建 notifications 表消息。

### 2.3 GET /api/auth/me

requireMember（pending 视为未登录）→ `未登录` 401；查无此行 → `用户不存在` 400。返回 id/name/role/class_name/department/created_at/achievements（JSON 解析为数组，解析失败给 `[]`）。

### 2.4 GET /api/auth/check-name

query `name`：非空且长度 1–50，否则 `姓名不能为空且不超过50字` 400。返回 `{ available: !row }`。纯查询，无副作用。注意此处上限是 **50**（与注册的 20 不同，仅做粗筛）。

### 2.5 四个 change-* 对比

| 端点 | 允许修改 | 身份门槛 | 密码确认 | 其他关键规则 | 成功后 token |
|---|---|---|---|---|---|
| change-password | 自己的密码 | 登录 | 需 old_password（bcrypt 比对，错→`旧密码错误` 401） | 新密码过 validatePassword；**token_version+1 使旧 JWT 全失效** | 不换发（旧 token 即刻失效） |
| change-name | 自己的姓名 | 登录；owner → `站长不可更改姓名` 403 | 需 password（错→`密码错误` 401） | 长度 2–20；排除自己后重名 → `该姓名已被使用` | signTokenForUser 重签（name 覆盖），Set-Cookie |
| change-class | 自己的班级 | 登录 | 需 password（缺→`请输入密码确认`；错→`密码错误` 401） | isValidClass 必须通过 | 重签 token，Set-Cookie |
| change-department | 自己的部门 | **仅 isAdmin**（member 不可用）→ 否则 `需要管理员权限` 403 | 需 password | department 不在 DEPARTMENTS 白名单则**清空为 ''**（传非法值=清除部门） | 重签 token，Set-Cookie |

共同点：均限流；body 解析失败 → `请求格式错误` 400；查不到用户行 → `操作失败` 400；只写 `users` 表，无通知/成就/sync 副作用。

⚠️待确认：`handleChangeClass` 中 `if (!password) return …` 之后又有 `if (password) {…}` 包裹比对——后者恒真，属冗余死代码；`handleUpdateRole` 第 121 行 `target.role==='owner' && !isOwner` 在第 120 行已 return 后不可达。

---

## 3. admin.js 逐端点详述

### 3.1 成员列表 / 注册审批

**GET /api/admin/members**：分页 offset（limit 固定 200）；角色集合 `('member','admin','owner','teacher')`，`ORDER BY role DESC, name ASC`；每行附加 `achievement_count`（JSON 解析 achievements 长度，异常计 0）；返回 `{results, hasMore}`（hasMore = offset+200 < total）。

**GET /api/admin/registrations**：pending 用户 ≤200 条，按 created_at ASC，直接返回裸数组。

**POST /api/admin/registrations/:id/approve**：
1. 限流 approveRegistration 20/60s（超限消息 `操作过于频繁` 429）。
2. `UPDATE users SET role='member' WHERE id=? AND role='pending'`（幂等，非 pending 不动）。
3. 副作用双通道：
   - `insertNotification` → chat_messages(type='notification')：`` 通过注册：${name} ``；
   - `createNotification(id,'system','注册已通过','欢迎加入雅礼团委·通办！您的账号已审核通过。','', 'user-check')` —— 仅当该用户已 accept messages 功能且功能全局启用时才真正落 notifications 表。
4. 返回 `{message:'注册已通过'}`。

**POST /api/admin/registrations/:id/reject**：限流同上；`DELETE FROM users WHERE id=? AND role='pending'`；返回 `{message:'注册已拒绝'}`。**不给被拒者任何通知**（记录直接删除）。

**POST /api/admin/users/batch-approve**：body.ids 必填数组否则 `请提供ID列表` 400；循环逐条执行与单条 approve 相同的 UPDATE（但**不发 per-user createNotification**）；insertChatSystemMessage（action 批量通过，title `${ids.length} 名注册`）；返回 `` {message:`已通过 ${ids.length} 个注册申请`} ``。
⚠️待确认：返回计数 = ids.length，即使部分 id 非 pending 也照报；且逐条 await 循环而非 batch。

### 3.2 删除成员 DELETE /api/admin/users/:id

1. 限流 deleteUser 10/60s。
2. `idNum === currentUserId` → `不能删除自己` 400。
3. 目标不存在 → `用户不存在` 404。
4. 可删角色集合：目标是 teacher → 仅 ['teacher']；否则 ['member','pending']。DELETE 影响 0 行 → `只能删除普通成员或老师` 400。**admin / owner 无法被删**（不在集合内）。
5. 级联清理（env.DB.batch）：`comments(created_by=name)`、`issues(submitted_by=name)`、`poll_responses(user_id 或 voter_name)`、`chat_messages(user_id 或 user_name)`、`activity_volunteers(member_name)`、`announcements(created_by)`、`finance(created_by)`、`reviews(created_by)`、`feed_comments(user_name)`、`polls(created_by)`。
6. 返回 `{message:'成员已删除'}`。

⚠️待确认：级联未覆盖 `notifications`、`user_feature_responses`、`duty_*`、`hall_bookings`、`feedback`、`announcement_images`（公告图片随 announcements 删除后成孤儿，靠 autoCleanup 收敛）。

### 3.3 clear-all（owner 专属）DELETE /api/admin/clear-all

限流 3 次/3600s。顺序清空：

| 清理 | 保留 |
|---|---|
| issues、announcements、finance、reviews、comments、poll_responses、poll_answers、poll_questions、chat_messages、feed_comments、activity_volunteers、announcement_images、`users WHERE role='member'`、`users WHERE role='pending'` | settings、features、user_feature_responses、notifications、feedback、hall_bookings、activities 本体、全部 duty_* 表、admin/owner/teacher/public 账号 |

返回 `{message:'已清除全部数据'}`。
⚠️待确认：`activities`（活动本体）与 `hall_bookings` 不在清理范围，但 activity_volunteers 被清——活动报名关系被抹而活动仍在。

### 3.4 设置

**GET /api/admin/settings**：全表 settings 转 `{key:value}` 对象返回。

**PUT /api/admin/settings**（owner gate）：
- 白名单 `ALLOWED_SETTINGS_KEYS = ['site_closed','site_closed_by','site_closed_message']`，其余 key **静默忽略**（不报错）。
- 值一律 `String(value)` 写入（INSERT OR REPLACE）。
- 可配置项全集：

| key | 取值 | 语义 |
|---|---|---|
| site_closed | `'true'` / `'false'`（字符串比较） | 关站开关；true 时多数 API 返回 503 `网站已关闭，请联系管理员`（白名单见 §0.2） |
| site_closed_by | 任意字符串 | 记录关站操作人（展示用） |
| site_closed_message | 任意字符串 | 关站文案，经 GET /api/settings 公开 |

另有系统内部 key（不可经此接口写）：`_db_init_done`、`last_cleanup`、`achievement_batch`。

### 3.5 storage 统计口径 GET /api/admin/storage

`getStorageStats`（_utils.js）：
- 容量基准 `D1_LIMIT = 5GB`（5×1024³ 字节）。
- **imageBytes** = finance/issues/announcements/reviews 四表 `SUM(LENGTH(image_url))` + announcement_images 全表 `SUM(LENGTH(image_url))`，合计后 **×0.75**（base64 → 二进制估算）。
- **textBytes** = 各文本字段 LENGTH 之和：chat_messages(content+system_data)、comments(content)、announcements(title+content+reject_reason)、issues(location+description+contact+notes)、finance(notes+tags)、hall_bookings(purpose+applicant+reviewed_by)、polls(title+description)、feed_comments(content+user_name)。
- totalBytes = imageBytes + textBytes；percent/totalPercent 封顶 100。
- 附各实体行数：financeCount、userCount、issueCount、announceCount、reviewCount、chatCount、hallCount、pollCount、commentCount、volunteerCount、feedCommentCount。
- ⚠️待确认口径不含 duty_*、notifications、settings 等表，属估算而非真实 D1 用量。

### 3.6 角色变更 PUT /api/admin/users/:id/role —— 谁能改谁

| 规则 | 消息/状态 |
|---|---|
| role 必须 ∈ member/admin/owner/teacher/public | `无效角色` 400 |
| 授予 'owner' 需操作者是 owner | `需要网站管理者权限` 403 |
| 目标不存在 | `用户不存在` 404 |
| 目标是 owner：任何人（含 owner 本人路径）都命中 `不能修改站长的角色` 403 | `不能修改站长的角色` 403 |
| 设为 'public' 时全库唯一（已有其他 public → 拒绝） | `已存在公共账号` 400 |

结论：admin/teacher 可在 member↔admin↔teacher↔public 间互转；只有 owner 能授予 owner；owner 目标完全锁定。**没有"不能降级同级 admin"的保护**（admin 可改另一 admin）⚠️待确认是否有意。

副作用：insertChatSystemMessage（action 任命，title 形如 `${部门}的${操作者}任命${部门}的${目标}为${中文角色}`，角色标签映射 admin:管理员/teacher:老师/member:成员/owner:站长/public:公共）；createNotification(target, 'system', '角色已变更', `` 您的角色已被变更为「${label}」。 ``, '', 'shield')。**不改 token_version**（旧 token 中旧 role 仍生效至过期 ⚠️待确认是否接受）。

### 3.7 reset-password PUT /api/admin/users/:id/reset-password

body.password 必填 → `请提供新密码` 400；validatePassword；目标 404；**站长保护** → `不能重置站长密码` 403。写入新 hash 并置 `password_reset = 1`（用户下次登录时 login 返回 `password_reset: true` 并自动清零标志）。**不递增 token_version** ⚠️待确认：被重置者的现存 JWT 在 24h 内仍可用。

### 3.8 改名 / 改部门（管理侧）

**PUT /api/admin/users/:id/name**：name 长度 2–20；目标 404；站长保护 `不能修改站长姓名` 403；重名 `该姓名已被使用`。仅 UPDATE users.name，无通知、无聊天系统消息。

**PUT /api/admin/users/:id/department**：department 非白名单 → 存 ''；目标 404；insertChatSystemMessage（action 分配部门，title `${name} → ${dept || '未分配'}`）。返回 `{message:'部门已更新'}`。

### 3.9 batch-import 三阶段 POST /api/admin/users/batch-import

入参：`{ users: [{name, password, class_name?, department?}, ...] }`，空/非数组 → `请提供用户列表` 400。

| 阶段 | 内容 | 失败去向 |
|---|---|---|
| Phase 1 纯内存校验（无 DB/bcrypt） | 逐用户：password 规则（reason=校验消息原文）、name 长度 2–20（reason `姓名长度不合法`）、可选 class_name 过 isValidClass（reason `班级格式无效`）；批内重名 → skipped++（不算 failed） | failed.push({index, name, reason}) |
| Phase 2 批量查重 | 一条 `SELECT name FROM users WHERE name IN (…)` 查已有名 → skipped++ | skipped |
| Phase 3 并发哈希+插入 | bcrypt 并发 5 个/批；INSERT role=**'member'**（跳过审批流！）；department 白名单外存 ''；env.DB.batch 一次提交 | 整体异常 → `` 导入失败：${e.message \|\| '服务器错误'} `` 500 |

返回 `{success, skipped, failed}`；副作用 insertChatSystemMessage（action 批量导入，title `${success} 名成员`，status 已完成）。
⚠️待确认：Phase 3 先 push 再统一 batch，若 batch 中途失败 success 计数已加但实际未插入。

---

## 4. settings.js / banner.js

### 4.1 GET /api/settings（公开）

仅取 `site_closed`、`site_closed_message` 两 key，返回 `{site_closed: s.site_closed==='true', site_closed_message: s.site_closed_message||''}`。任何异常兜底返回 `{site_closed:false, site_closed_message:''}`。

### 4.2 GET /api/banner（公开）

`getBannerData`：最新 3 条公告（status 为 NULL 或 '已通过'，附第一张图，兼容旧 image_url JSON 数组格式）+ 未来 3 条已批准报告厅预约（date ≥ today，status='approved'，按 date/start_time ASC）。结构 `{announcements:[{id,title,content,created_by,created_at,image_url,_images}], hallBookings:[{date,start_time,end_time,purpose,applicant}]}`。异常 → `横幅数据获取失败` 500。

---

## 5. sync 机制 POST /api/sync

### 5.1 请求体

```json
{ "pages": { "/api/announcements": "<上次hash或空串>", "/api/finance": "<hash>", "...": "" } }
```
- `pages` 缺失或非对象 → `缺少 pages` 400；body 解析失败 → `请求格式错误` 400。
- value 为客户端缓存的 hash；首次请求传空串即可。

### 5.2 hash 计算

`computeHash(data)` = SHA-256( `JSON.stringify(data)` ) 的 hex 字符串（crypto.subtle）。服务端对每个 page 重算数据后比对传入 hash。

### 5.3 数据源覆盖（key → 数据 & 权限）

| key | 权限 | 数据口径 |
|---|---|---|
| /api/announcements | 公开 | 全部非"已拒绝"公告 DESC + attachAnnounceImages |
| /api/banner | 公开 | getBannerData |
| /api/issues | 需登录 | issues LEFT JOIN 评论计数，DESC |
| /api/finance | 需登录 | 非 admin 且有 department 者**仅本部门**，LIMIT 200 DESC |
| /api/reviews | 需登录 | LIMIT 200 DESC |
| /api/polls | 需登录 | LIMIT 200 DESC |
| /api/admin/members | admin | 4 角色成员简表 |
| /api/admin/registrations | admin | pending 列表 ASC |
| /api/admin/storage | admin | getStorageStats |
| /api/settings | 公开 | 同 GET /api/settings |
| /api/admin/settings | admin | 全量 settings |
| `/api/comments/(announcement\|issue)/:id`（正则） | 公开 | 该目标评论 ASC LIMIT 200 |
| `/api/polls/:id/results`（正则） | 创建者或 admin | questions+responses+answers 聚合统计 |
| `/api/polls/:id`（正则） | 公开 | 投票详情 + questions |

权限不足/未知 key/查询异常 → 该 key 的 data 保持 undefined，**结果中整个省略**（不报错）。纯只读：不写任何表、不影响任何 hash 存储、无通知。

### 5.4 响应结构与前端用法

```json
{ "pages": {
    "/api/finance": { "changed": false },
    "/api/announcements": { "changed": true, "data": [...], "hash": "ab12…" }
}}
```

前端（public/js/api.js `fetchWithCache`）流程：
1. localStorage 键 `yc_<key>` 缓存 `{data, hash, ts}`，TTL 3 天（>4MB 跳过写缓存；满了淘汰最旧 5 条之外再试）。
2. 有缓存先立即 renderFn(cached.data)。
3. POST /api/sync 带 `{pages:{key:hash}}`；`changed:false` 且有缓存 → 什么都不做；`changed:true` → **忽略服务端返回的 data**，另行调用 fetchFn()（走常规 GET 接口）取新数据并 cacheSet(key, freshData, pr.hash)。
4. 无缓存或请求异常 → 直接 fetchFn() 兜底。
⚠️待确认：服务端 changed:true 时携带的 data 字段当前前端并不使用（冗余带宽），疑似为未来切换预留。

---

## 6. messages.js 通知系统

### 6.1 数据模型

`notifications` 表：`(id, user_id, type, title, body, link, icon, is_read INTEGER 0/1, created_at)`，索引 `(user_id, is_read, created_at)`。**已读/未读 = is_read 列**，按用户隔离（所有语句都带 `AND user_id = ?`）。

注意区分两套"通知"：
| 机制 | 表 | 受众 | 门控 |
|---|---|---|---|
| 个人消息中心（messages.js） | notifications | 单个用户 | createNotification 仅当该用户 accept 了 messages 功能且功能 globally_enabled=1 |
| 全局动态流通知（insertNotification） | chat_messages(type='notification') | 所有人 | 无门控 |

### 6.2 通知类型枚举（8 类，与 BUILTIN_FEATURES 描述一致）

| type | 来源场景 | icon 示例 |
|---|---|---|
| system | 注册已通过 / 角色已变更 | user-check / shield |
| announcement | 新公告广播 | megaphone |
| review_result | 公告审核通过/未通过、报告厅预约批准/拒绝 | check-circle / x-circle |
| issue_status | 报修状态更新 | wrench |
| finance_update | 财务完成 / 报销完成 | check-circle / wallet |
| comment_reply | 公告/报修收到新评论 | message-square |
| activity_invite | 新活动广播 | calendar |
| duty | 值日分数修改 / 值日扣分 | clock |

### 6.3 端点细节

| 端点 | 逻辑要点 |
|---|---|
| GET /api/messages | limit=min(传入\|\|20, 100)，offset 默认 0；`type!=='all'` 时按 type 过滤；`unread=1` 加 `is_read=0`；并行查 total/unread（unread 口径 = SUM(is_read=0)，受相同 type 过滤影响）；未登录返回 `{messages:[],total:0}` 而非报错 |
| GET /api/messages/unread-count | 全类型未读 COUNT；未登录 `{count:0}` |
| POST /api/messages/:id | UPDATE is_read=1（限本人行）；无论是否存在都返回 `{message:'已标记已读'}` |
| POST /api/messages/read-all | body.type 存在则仅该类型，否则全部；只动 is_read=0 的行；返回 `{message:'全部已读'}` |
| DELETE /api/messages/:id | 删本人该条；恒返回 `{message:'已删除'}` |
| DELETE /api/messages | 删本人全部 is_read=1；返回 `{message:'已清空已读消息'}` |

未登录调用写操作统一 `需要登录` 401。

---

## 7. features.js 功能开关与邀请

### 7.1 内置功能清单（代码硬编码 BUILTIN_FEATURES）

| key | name | description | icon |
|---|---|---|---|
| messages | 消息提醒 | 在导航栏显示消息铃铛，接收公告、审核结果、报修状态、财务变动、评论回复、活动邀请、值日分数等 8 类消息通知。 | bell |

站长不能新建功能，只能对内置功能启用/邀请（注释明示）。

### 7.2 globally_enabled 语义

- 存于 `features.globally_enabled`（0/1）；无行视为 **false**。
- 三处生效：① invite 前置检查（未启用 → `请先启用功能再邀请用户`）；② 用户端 pending/enabled 查询 JOIN 条件 `f.globally_enabled = 1`（关闭功能即刻隐藏所有邀请/已启用项，但不删记录）；③ createNotification(Batch) 落库前校验。
- toggle 采用 UPSERT：首插时固定 `invite_mode='manual'`，冲突只更新 globally_enabled。返回消息 `已启用` / `已禁用`。

### 7.3 邀请-响应状态机

```
            invite(all/user_ids)              respond(status)
  (无记录) ────────────────► pending ──────► accepted   → 用户可见该功能(enabled)
                               │  ▲            later     → 暂不启用
                               │  │            never     → 永不
                               │  └─ respond 可随时改写任一状态（UPSERT）
  admin reset ──► 删除整行回到 (无记录)，可重新邀请
```

- invite：`all=true` 时圈定 roles IN ('member','officer','admin','owner','teacher')（⚠️待确认：`officer` 不是系统其他地方存在的角色，疑为遗留）；指定 `user_ids` 时过滤非正整数项；已存在记录（含已响应）的用户 skip；批量 INSERT status='pending' + invited_at（ON CONFLICT DO NOTHING）。响应 `{message:'邀请已发送'|'没有可邀请的用户'|'所有用户已被邀请', invited, skipped}`。
- respond：合法 status ∈ accepted/later/never，否则 `无效的状态` 400；**未被邀请也可响应**（防御性 UPSERT，注释明示）；记录 responded_at。
- enabled 生效条件 = 用户行 status='accepted' **且** f.globally_enabled=1。
- admin invitations 列表：JOIN users 取 name，按 invited_at DESC。

---

## 8. 副作用速查矩阵（本文档覆盖端点）

| 端点 | users | settings | notifications | chat_messages | 其他 | sync hash 影响 | 成就触发 |
|---|---|---|---|---|---|---|---|
| login | U:password_reset 清零 | — | — | — | — | 无 | 无 |
| register | I(pending) | — | — | notification | — | 无 | 无 |
| change-password | U(hash,token_version) | — | — | — | — | 无 | 无 |
| change-name/class/department | U | — | — | — | — | 无 | 无 |
| approve registration | U(role) | — | ✓(system) | notification | — | 无 | 无 |
| reject registration | D(pending) | — | — | — | — | 无 | 无 |
| delete user | D | — | ✗(残留) | D(本人) | 10 表级联 D | 无 | 无 |
| update role | U(role) | — | ✓(system) | system(任命) | — | 无 | 无 |
| reset-password | U(hash,password_reset=1) | — | — | — | — | 无 | 无 |
| admin change-name / set-department | U | — | — | system(分配部门) | — | 无 | 无 |
| batch-import | I(member×N) | — | — | system(批量导入) | — | 无 | 无 |
| batch-approve | U(role)×N | — | ✗ | system(批量通过) | — | 无 | 无 |
| update settings(owner) | — | U/I | — | — | — | 无 | 无 |
| clear-all(owner) | D(member,pending) | 保留 | 保留 | 全清 | 12 表清 | 无 | 无 |
| messages 系列 | — | — | U/D notifications | — | — | 无 | 无 |
| features 系列 | — | — | — | — | features / user_feature_responses U/D | 无 | 无 |
| sync / banner / settings(GET) | 只读 | 只读 | — | — | — | 无 | 无 |

---

## 9. 提取来源

| 文件 | 说明 |
|---|---|
| `functions/api/[[path]].js` | 路由表、gate 语义、onRequest 流水线、captcha 特例、全局错误 |
| `functions/api/auth.js` | login/register/me/check-name/logout/四个 change-* |
| `functions/api/admin.js` | members、registrations 审批、deleteUser、clear-all、settings、storage 入口、updateRole、reset-password、admin 改名/部门、batch-import、batch-approve |
| `functions/api/features.js` | BUILTIN_FEATURES、admin 启用/邀请/重置/列表、用户 pending/enabled/respond |
| `functions/api/messages.js` | 消息 CRUD、unread-count |
| `functions/api/settings.js` | 公开设置读取 |
| `functions/api/banner.js` | banner 聚合入口 |
| `functions/api/sync.js` | sync 分发逻辑与数据源 |
| `functions/api/_utils.js` | 常量、json/error 封装、JWT、验证码、限流、isValidClass/validatePassword、getStorageStats、getBannerData、insertNotification/createNotification(Batch)、autoCleanup、checkSiteClosed |
| `functions/api/{finance,announcements,duty,issues,halls,comments,activities}.js` | （仅用于枚举 8 类通知 type 的调用点核对） |
| `public/js/api.js` | fetchWithCache / localStorage 缓存策略（sync 前端用法） |
