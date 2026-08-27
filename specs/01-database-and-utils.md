# 01 · 数据库与工具函数规格（D1 Schema + `functions/api/_utils.js`）

> 项目：yali-tongban（Cloudflare Pages + D1）
> 数据绑定：`env.DB` → D1 `yali-tongban-db`（`wrangler.toml:5-8`）。**未发现任何 R2/KV 绑定或调用**——图片全部以 base64 data-URL 存放在 D1 TEXT 列中。
> 本文档所有 SQL 均为源码原文照抄；行号以当前工作区文件为准。

---

## 1. 数据库全景

Schema 唯一权威来源是 `functions/api/_utils.js` 的 `initDB()`（`_utils.js:224-360`），在每次 API 请求入口被调用（`[[path]].js:215`）。全项目 grep 确认除 `_utils.js`（及其构建产物 `_worker.bundle`）外无其他 CREATE/ALTER TABLE。

共 **26 张活表** + 2 张被删除的历史表。下文按业务域分组；每张表给出：建表 SQL 原文、字段表、约束/索引、读写端点。

### 1.1 settings — 键值配置表

```sql
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)
```
（fallback 分支 `_utils.js:325`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| key | TEXT PK | — | 配置键 |
| value | TEXT NOT NULL | — | 配置值 |

**运行时已知键**：`site_closed`('false')、`site_closed_message`('')、`site_closed_by`('')、`last_cleanup`('')、`_db_init_done`('1')、`achievement_batch`(成就批量播报缓冲 JSON)。

- **读**：`checkSiteClosed`(site_closed)、GET /api/settings、POST /api/sync(`/api/settings`、`/api/admin/settings` 页)、GET /api/admin/settings、autoCleanup(last_cleanup)、addAchievementBatchEntry(achievement_batch)、initDB(_db_init_done)
- **写**：PUT /api/admin/settings(仅白名单 `site_closed/site_closed_by/site_closed_message`)、autoCleanup(last_cleanup)、addAchievementBatchEntry、initDB(_db_init_done)

### 1.2 users — 用户表

```sql
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))
```
（fallback `_utils.js:320`；增量列来自逐条 ALTER，见下）

后续 ALTER 追加的列（legacy 路径 `_utils.js:278,280,281,283,284`）：

```sql
ALTER TABLE users ADD COLUMN class_name TEXT NOT NULL DEFAULT ''
ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''
ALTER TABLE users ADD COLUMN password_reset INTEGER DEFAULT 0
ALTER TABLE users ADD COLUMN achievements TEXT NOT NULL DEFAULT '[]'
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0
```

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | — | 用户 ID |
| name | TEXT UNIQUE NOT NULL | — | 姓名（唯一） |
| password_hash | TEXT NOT NULL | — | bcrypt hash |
| role | TEXT NOT NULL | 'pending' | pending/member/admin/owner/teacher/public（代码中还出现幽灵角色 officer，见 §7） |
| created_at | TEXT | datetime('now') | 注册时间 |
| class_name | TEXT NOT NULL | '' | 4 位班级编号 |
| department | TEXT | '' | 部门，取值限 DEPARTMENTS |
| password_reset | INTEGER | 0 | 管理员重置密码后置 1，登录时清零并提示改密 |
| achievements | TEXT NOT NULL | '[]' | 已解锁成就 id 的 JSON 数组 |
| token_version | INTEGER NOT NULL | 0 | 改密 +1 使旧 JWT 失效 |

UNIQUE：`name`。索引：`idx_users_name ON users(name)`（`_utils.js:298`）。

- **读**：login/me/check-name、signTokenForUser、getUserFromRequest(token_version 校验)、getUserIdByName、admin 成员/注册列表、duty 干事匹配(class_name+name)、features 全员邀请、activities/announcements 全员通知目标、achievements 计数、sync(members/registrations)
- **写**：POST /api/auth/register(INSERT role='pending')、change-password/-name/-class/-department、POST /api/achievements/unlock 与 check-counts(UPDATE achievements)、admin: approve/reject registrations、users/:id/role|name|department|reset-password、batch-import(role='member')、batch-approve、DELETE /api/admin/users/:id、POST /api/admin/clear-all(删 member/pending)、autoCleanup(删超 30 天 pending)

### 1.3 issues — 报修

```sql
CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, location TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT '待处理', submitted_by TEXT NOT NULL, updated_by TEXT, contact TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)
```
（fallback `_utils.js:321`）＋ legacy ALTER（`_utils.js:238,273`）：
```sql
ALTER TABLE issues ADD COLUMN notes TEXT DEFAULT ''
ALTER TABLE issues ADD COLUMN image_url TEXT DEFAULT ''
```

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| id | INTEGER PK | — | |
| location | TEXT NOT NULL | — | 地点 |
| description | TEXT NOT NULL | — | 问题描述（≤2000 字） |
| status | TEXT NOT NULL | '待处理' | 待处理/处理中/已完成 |
| submitted_by | TEXT NOT NULL | — | 提交者姓名，匿名时 '访客' |
| updated_by | TEXT | NULL | 最后处理人 |
| contact | TEXT | '' | 联系方式（≤100 字） |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | NULL | |
| notes | TEXT | '' | 备注（≤50 字） |
| image_url | TEXT | '' | base64 图片（≤2000000 字符） |

索引：`idx_issues_created(created_at)`、`idx_issues_status(status)`（`_utils.js:299-300`）。

- **读**：GET /api/issues、POST /api/sync(/api/issues)、achievements check-counts(submitted_by 计数)
- **写**：POST /api/issues、PUT /api/issues/:id/status(admin)、DELETE /api/issues/:id(admin，级联删 issue 评论)、DELETE /api/admin/users/:id(按 submitted_by 级联)、POST /api/admin/clear-all、autoCleanup(已完成且 updated_at < now-90d)

### 1.4 announcements — 公告

```sql
CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, image_url TEXT DEFAULT '', status TEXT DEFAULT '已通过', reviewed_by TEXT DEFAULT '', reviewed_at TEXT, reject_reason TEXT DEFAULT '', created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))
```
（fallback `_utils.js:322`；legacy 路径通过 ALTER 逐一补齐同名列，`_utils.js:268-272`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| id | INTEGER PK | — | |
| title | TEXT NOT NULL | — | ≤200 字 |
| content | TEXT NOT NULL | — | ≤5000 字 |
| image_url | TEXT | '' | 旧版单图/JSON 数组遗留字段，新图走子表 |
| status | TEXT | '已通过' | 待审核/已通过/已拒绝 |
| reviewed_by | TEXT | '' | 审核人姓名 |
| reviewed_at | TEXT | NULL | 审核时间 |
| reject_reason | TEXT | '' | 拒绝理由（≤500 字） |
| created_by | TEXT NOT NULL | — | 作者姓名 |
| created_at | TEXT | datetime('now') | |

索引：`idx_announcements_created(created_at)`（`_utils.js:301`）。

- **读**：GET /api/announcements(:id)、POST /api/sync(/api/announcements、banner 页)、getBannerData(最新 3 条已通过)
- **写**：POST /api/announcements(image_url 固定插 ''，图片入子表)、PUT /api/announcements/:id(编辑后重置为待审核)、DELETE /api/announcements/:id(作者或 admin，级联删子图与公告评论)、PUT /api/announcements/:id/status(admin 审核，通过时全员通知)、DELETE /api/admin/users/:id(按 created_by 级联)、POST /api/admin/clear-all

### 1.5 announcement_images — 公告图片子表

```sql
CREATE TABLE IF NOT EXISTS announcement_images (id INTEGER PRIMARY KEY AUTOINCREMENT, announcement_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0)
```
（`_utils.js:291`＝fallback `:335`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| announcement_id | INTEGER NOT NULL | — | 父公告 id |
| image_url | TEXT NOT NULL | — | base64 data-URL，单张 ≤1000000 字符 |
| sort_order | INTEGER | 0 | 排序 |

索引：`idx_announce_images_aid(announcement_id)`（`:292`）。

- **读**：attachAnnounceImages(GET 公告/sync/banner 复用)、getStorageStats
- **写**：创建/编辑公告(replaceAnnounceImages 先 DELETE 后批量 INSERT)、POST /api/announcements/:id/images(追加)、删除公告/用户/clear-all/autoCleanup 孤儿清理

### 1.6 finance — 财务

```sql
CREATE TABLE IF NOT EXISTS finance (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT NOT NULL, tags TEXT DEFAULT '[]', notes TEXT DEFAULT '', type TEXT NOT NULL DEFAULT '支出', amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT '待完成', created_by TEXT NOT NULL, completed_by TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT, department TEXT DEFAULT '', fund_type TEXT DEFAULT '基金账单', internal_activity INTEGER DEFAULT 0)
```
（fallback `_utils.js:323`；legacy 路径经 `_utils.js:239-241,274-275` 五条 ALTER 补齐 type/amount/department/fund_type/internal_activity）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| image_url | TEXT NOT NULL | — | 凭证图 base64（≤2000000 字符） |
| tags | TEXT | '[]' | JSON 数组 |
| notes | TEXT | '' | 备注（≤500 字） |
| type | TEXT NOT NULL | '支出' | 收入/支出 |
| amount | REAL NOT NULL | 0 | ≥0 |
| status | TEXT NOT NULL | '待完成' | 待完成/已完成/已报销 |
| created_by | TEXT NOT NULL | — | 提交人 |
| completed_by | TEXT | NULL | 完成/报销操作人 |
| completed_at | TEXT | NULL | |
| department | TEXT | '' | 归属部门；GET 时非管理员只见本部门 |
| fund_type | TEXT | '基金账单' | 基金账单/流动资金库（收入或 internal_activity 时为后者） |
| internal_activity | INTEGER | 0 | 是否内部活动 |

索引：`idx_finance_created(created_at)`、`idx_finance_department(department)`（`:302-303`）。

- **读**：GET /api/finance、sync(/api/finance)
- **写**：POST /api/finance(需验证码)、complete/reimburse/unreimburse(admin)、DELETE /api/finance/:id 与 /api/admin/finance/:id(admin)、clear-all、用户删除级联
- ⚠️ **GET 是副作用读**：`handleGetFinance` 每次先执行 `UPDATE finance SET fund_type = '流动资金库' WHERE fund_type IS NULL`（finance.js:6）

### 1.7 reviews — 展柜审核

```sql
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT '待审核', reject_reason TEXT, created_by TEXT NOT NULL, reviewed_by TEXT, created_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT)
```
（fallback `_utils.js:324`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| image_url | TEXT NOT NULL | — | base64 图（≤2000000 字符） |
| status | TEXT NOT NULL | '待审核' | 待审核/通过/拒绝 |
| reject_reason | TEXT | NULL | 拒绝理由（≤500 字） |
| created_by | TEXT NOT NULL | — | |
| reviewed_by | TEXT | NULL | |
| created_at / reviewed_at | TEXT | datetime('now')/NULL | |

索引：`idx_reviews_created(created_at)`（`:304`）。

- **读**：GET /api/reviews(需登录)、sync(/api/reviews)
- **写**：POST /api/reviews、PUT /api/reviews/:id/review(admin)、DELETE /api/reviews/:id(admin)、clear-all、用户删除级联

### 1.8 comments — 通用评论（announcement/issue 两类 target）

```sql
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))
```
（`_utils.js:285`＝fallback `:329`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| target_type | TEXT NOT NULL | — | 仅允许 'announcement' \| 'issue' |
| target_id | INTEGER NOT NULL | — | 目标 id |
| content | TEXT NOT NULL | — | 1-500 字 |
| created_by | TEXT NOT NULL | — | 评论人姓名 |

索引：`idx_comments_target(target_type,target_id)`、`idx_comments_created_by(created_by)`（`:296,313`）。

- **读**：GET /api/comments/(announcement|issue)/:id、issues/announcements 列表的 comment_count 子查询、sync 评论页
- **写**：POST /api/comments、PUT/DELETE /api/comments/:id(本人或 admin)、删除 issue/公告时按 target 级联、DELETE /api/admin/users/:id(按 created_by)、clear-all、autoCleanup 孤儿清理、成就 commenter 计数

### 1.9 polls — 投票主表

```sql
CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'open', require_name INTEGER NOT NULL DEFAULT 0, min_role TEXT, created_by TEXT NOT NULL, total_votes INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))
```
（`_utils.js:286`＝fallback `:331`）＋ legacy ALTER（`:279`）：`ALTER TABLE polls ADD COLUMN allowed_classes TEXT DEFAULT ''`

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| title | TEXT NOT NULL | — | 1-200 字 |
| description | TEXT | '' | |
| status | TEXT NOT NULL | 'open' | open/关闭态（投票时校验 !== 'open' 即拒） |
| require_name | INTEGER NOT NULL | 0 | 匿名投票是否强制署名 |
| min_role | TEXT | NULL | 最低角色门槛（见 §3 权重表） |
| allowed_classes | TEXT | '' | JSON 数组，限定班级 |
| total_votes | INTEGER NOT NULL | 0 | 投票成功 +1 |
| created_by | TEXT NOT NULL | — | |

索引：`idx_polls_created(created_at)`（`:305`）。

- **读**：GET /api/polls、GET /api/polls/:id、results/export/my-vote、sync(polls/results/detail)
- **写**：POST /api/polls(admin)、DELETE /api/polls/:id(创建者或 admin，级联删 questions/responses/answers)、clear-all、autoCleanup 孤儿链清理

### 1.10 poll_questions

```sql
CREATE TABLE IF NOT EXISTS poll_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, options TEXT DEFAULT '[]', image_url TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)
```
（legacy `_utils.js:287`）＋ `ALTER TABLE poll_questions ADD COLUMN max_length INTEGER DEFAULT 1000`（`:276`）
fallback 版本（`:332`）直接含 `max_length INTEGER NOT NULL DEFAULT 1000` —— ⚠️ 两条路径的 max_length 约束不一致（是否 NOT NULL）。

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| poll_id | INTEGER NOT NULL | — | |
| type | TEXT NOT NULL | — | single/multiple/text |
| title | TEXT NOT NULL | — | 1-500 字 |
| options | TEXT | '[]' | 选择题选项 JSON（2-26 个）；text 为 '[]' |
| image_url | TEXT | '' | 题图（≤2000000 字符） |
| sort_order | INTEGER NOT NULL | 0 | |
| max_length | INTEGER | 1000 | text 题字数上限（1-10000） |

索引：`idx_poll_questions_pid(poll_id)`（`:293`）。
读写：随 polls CRUD 与 sync；clear-all、孤儿清理。

### 1.11 poll_responses

```sql
CREATE TABLE IF NOT EXISTS poll_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, user_id INTEGER, voter_name TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```
（legacy `_utils.js:288`）＋ `ALTER TABLE poll_responses ADD COLUMN ip TEXT DEFAULT ''`（`:277`）
fallback 版本（`:333`）直接含 `ip TEXT DEFAULT ''`。

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| poll_id | INTEGER NOT NULL | — | |
| user_id | INTEGER | NULL | 登录投票时记录；NULL=游客 |
| voter_name | TEXT | '' | require_name 时游客填 '匿名' 或自报姓名；登录时=user.name |
| ip | TEXT | '' | 游客防重复投票依据 |

索引：`idx_poll_responses_pid(poll_id)`、`idx_poll_responses_poll_user(poll_id,user_id)`、`idx_poll_responses_poll_ip(poll_id,ip)`（`:294,310-311`）。

### 1.12 poll_answers

```sql
CREATE TABLE IF NOT EXISTS poll_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, question_id INTEGER NOT NULL, answer TEXT NOT NULL)
```
（`_utils.js:289`＝fallback `:334`）

answer 为 JSON.stringify 后的答案：single=数字索引、multiple=索引数组、text=字符串。索引：`idx_poll_answers_rid(response_id)`、`idx_poll_answers_qid(question_id)`（`:295,309`）。

### 1.13 chat_messages — 动态流（text/system/notification 三类）

```sql
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', system_data TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```
（`_utils.js:290`＝fallback `:336`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| user_id | INTEGER | NULL | system/notification 消息为空 |
| user_name | TEXT NOT NULL | — | 系统消息插 '' |
| content | TEXT NOT NULL | — | 渲染文本 |
| type | TEXT NOT NULL | 'text' | text/system/notification；feed 只展示后两类 |
| system_data | TEXT | '' | system 消息的结构化 JSON {action,from_dept,to_dept,title,status,ref_type,ref_id} |

索引：`idx_chat_messages_type_created(type,created_at)`、`idx_chat_messages_user_id(user_id)`（`:297,314`）。

迁移语句（每次 initDB 都跑，`:232`）：
```sql
UPDATE chat_messages SET type = 'notification' WHERE type = 'system' AND (system_data LIKE '%\"action\":\"新成员注册\"%' OR system_data LIKE '%\"action\":\"通过注册\"%')
```

- **读**：GET /api/chat/messages(feed，type IN ('system','notification'))、feed 评论存在性检查、成就 chatty/extrovert 按 user_id 计数
- **写**：insertChatSystemMessage / insertNotification（由 auth/admin/announcements/finance/issues/reviews/polls/activities/halls/achievements 各端点触发）、DELETE /api/chat/messages/:id(admin)、用户删除级联(user_id/user_name)、clear-all、autoCleanup(created_at < now-90d)

### 1.14 feed_comments — 动态评论

```sql
CREATE TABLE IF NOT EXISTS feed_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id INTEGER NOT NULL, user_name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))
```
（`_utils.js:230`＝fallback `:339`）

content 限 1-200 字；feed_id 必须指向 type='system' 的 chat_message。索引：`idx_feed_comments_fid(feed_id)`（`:231`）。
读写：POST/GET /api/feed/:id/comments、DELETE /api/chat/messages/:id 不级联（靠 autoCleanup 清孤儿）、用户删除按 user_name 级联、clear-all。

### 1.15 feedback — 匿名反馈

legacy 建（`_utils.js:233`）：
```sql
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, contact TEXT DEFAULT '', page TEXT DEFAULT '', turnstile_bypass INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))
ALTER TABLE feedback ADD COLUMN section TEXT DEFAULT ''   -- :234
ALTER TABLE feedback ADD COLUMN version TEXT DEFAULT ''   -- :235
```
fallback 全量版（`:340`）一次建成（含 section/version）。

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| content | TEXT NOT NULL | — | 1-2000 字 |
| contact | TEXT | '' | ≤100 字 |
| page | TEXT | '' | 来源页面 |
| section | TEXT | '' | 页面区块 |
| version | TEXT | '' | 前端版本号 |
| turnstile_bypass | INTEGER | 0 | 历史 Turnstile 遗留，现恒插 0 |

索引：`idx_feedback_created(created_at)`（`:312`）。
读写：POST /api/feedback（公开，需验证码）；GET /api/admin/feedback、DELETE /api/admin/feedback/:id（gate: admin）。

### 1.16 hall_bookings — 千报告厅预约 ⚠️ 仅存在于主路径

```sql
CREATE TABLE IF NOT EXISTS hall_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, purpose TEXT NOT NULL, applicant TEXT NOT NULL, user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
ALTER TABLE hall_bookings ADD COLUMN reviewed_at TEXT DEFAULT ''   -- :237
```
（`:236-237`）

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| date / start_time / end_time | TEXT NOT NULL | — | 预约时段 |
| purpose | TEXT NOT NULL | — | 用途 ≤200 字 |
| applicant | TEXT NOT NULL | — | 申请人姓名 |
| user_id | INTEGER NOT NULL | — | 关联用户 |
| status | TEXT NOT NULL | 'pending' | pending/approved/rejected/cancelled |
| reviewed_by / reviewed_at | TEXT | ''/'' | 审核人/时间 |

索引：`idx_hall_bookings_date(date)`、`idx_hall_bookings_status(status)`、`idx_hall_bookings_user_id(user_id)`（`:306-307,315`）。

- **读**：GET /api/hall/bookings、GET /api/hall/bookings/pending(含冲突 JOIN)、banner(getBannerData 取未来 3 条 approved)
- **写**：POST /api/hall/bookings、withdraw(→cancelled)、review(approve/reject，批准时自动取消/删除重叠冲突)、DELETE /api/hall/bookings/:id、initDB 与 autoCleanup 清 14 天前旧数据
- ⚠️ fallback 引导 SQL 数组里**没有** hall_bookings 的 CREATE（全新库首次请求不会建它，第二次请求自愈，详见 §6）

### 1.17 duty_staff — 值日干事

```sql
CREATE TABLE IF NOT EXISTS duty_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, department TEXT NOT NULL, class TEXT NOT NULL, name TEXT NOT NULL, password TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))
```
（`:243`＝fallback `:341`）

user_id：能在 users 表按 class_name+name 匹配到则填其 id，否则 0 并生成 6 位随机密码 bcrypt 存储。索引：无专用索引。
读写：GET/POST /api/duty/staff、POST /api/duty/staff/upload(批量)、DELETE /api/duty/staff/:id(admin，级联删 attendance/score_record)；排班与考勤各端点大量 JOIN。

### 1.18 duty_schedule — 按日排班

```sql
CREATE TABLE IF NOT EXISTS duty_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, staff_a_id INTEGER NOT NULL, staff_b_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))
```
（`:244`＝fallback `:342`）
UNIQUE 索引：`CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_schedule_date ON duty_schedule(date)`（`:248`）——每天最多一条排班，手动排班用 `ON CONFLICT(date) DO UPDATE` UPSERT。
读写：schedule/generate(自动排 60 天内工作日)、schedule/manual(UPSERT)、manual-delete、clear-all、range/export/today 查询。

### 1.19 duty_attendance — 签到考勤

```sql
CREATE TABLE IF NOT EXISTS duty_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, period TEXT NOT NULL, sign_in_time TEXT, sign_out_time TEXT, duration_sec INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', score_absent REAL DEFAULT 0, score_duration REAL DEFAULT 0, is_manual INTEGER DEFAULT 0, modified_by TEXT DEFAULT '', modified_reason TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```
（`:245`＝fallback `:343`）

status 流转：pending → signed_in → completed；超时未签到被 autoMarkAbsent 置 absent 且 score_absent=-1。
索引：`idx_duty_attendance_schedule(schedule_id)`；UNIQUE `idx_duty_attendance_unique(schedule_id,staff_id,period)`（`:249-250`）。

### 1.20 duty_score_record — 加扣分流水

```sql
CREATE TABLE IF NOT EXISTS duty_score_record (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, date TEXT NOT NULL, period TEXT NOT NULL, score REAL NOT NULL, reason TEXT DEFAULT '', recorder TEXT DEFAULT 'system', is_cancelled INTEGER DEFAULT 0, cancel_reason TEXT DEFAULT '', cancel_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```
（`:246`＝fallback `:344`）

reason 典型值：'缺岗'、'在岗不足'、'手动扣分'、'管理员修改'。销分 = is_cancelled=1 + cancel_reason/cancel_by。索引：`idx_duty_score_record_staff(staff_id)`（`:251`）。

### 1.21 duty_period_config — 时段配置

```sql
CREATE TABLE IF NOT EXISTS duty_period_config (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL UNIQUE, slot_type TEXT NOT NULL, sort_order INTEGER NOT NULL, start_time TEXT DEFAULT '08:00', auto_absent_min INTEGER DEFAULT 10)
```
（`:247`＝fallback `:345`）UNIQUE：`label`。

种子数据（INSERT OR IGNORE，每次 initDB 执行，`:252`）：

| label | slot_type | sort_order | start_time | auto_absent_min |
|---|---|---|---|---|
| 第一节课后 | small_break | 1 | 09:00 | 9 |
| 上午大课间 | big_break | 2 | 09:50 | 34 |
| 第三节课后 | small_break | 3 | 11:05 | 39 |
| 第五节课后 | small_break | 4 | 14:50 | 214 |
| 下午大课间 | no_duty | 5 | 15:00 | 74 |
| 第七节课后 | small_break | 6 | 16:55 | 74 |

随后 6 条 UPDATE（`:254-259`）把已部署库的旧行修正为上表值（幂等迁移）。slot_type 合法值：small_break/big_break/no_duty（PUT /api/duty/periods 校验）。

### 1.22 features — 功能开关

```sql
CREATE TABLE IF NOT EXISTS features (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT 'bell', globally_enabled INTEGER DEFAULT 0, invite_mode TEXT DEFAULT 'manual', created_at TEXT DEFAULT (datetime('now')))
```
（`:261`＝fallback `:348`）UNIQUE：`key`。预定义功能仅 `messages`（features.js BUILTIN_FEATURES）。索引：`idx_features_key(key)`（`:265`）。
读写：GET/POST /api/admin/features(gate admin)、createNotification/isFeatureEnabled/createNotificationBatch 的 globally_enabled 校验。

### 1.23 user_feature_responses — 功能邀请响应

```sql
CREATE TABLE IF NOT EXISTS user_feature_responses (user_id INTEGER NOT NULL, feature_key TEXT NOT NULL, status TEXT DEFAULT 'pending', invited_at TEXT, responded_at TEXT, PRIMARY KEY(user_id, feature_key))
```
（`:262`＝fallback `:349`）PK：(user_id, feature_key)。status ∈ pending/accepted/later/never。
读写：invite/reset/invitations(admin)、pending/enabled/respond(用户端)、通知函数过滤 accepted。

### 1.24 notifications — 站内私信通知

```sql
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '', link TEXT DEFAULT '', icon TEXT DEFAULT '', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))
```
（`:263`＝fallback `:350`）

实际出现的 type：system / review_result / comment_reply / issue_status / finance_update / activity_invite / duty / announcement。
索引：`idx_notifications_user(user_id,is_read,created_at)`（`:264`）。
读写：GET /api/messages、unread-count、POST read-all、POST /api/messages/:id(标记已读)、DELETE 单条/清已读；写入只经 createNotification / createNotificationBatch。

### 1.25 activities — 活动

```sql
CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT DEFAULT '', time TEXT NOT NULL, departments TEXT DEFAULT '', need_volunteers INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))
```
（`:227`＝fallback `:337`）

departments 为逗号分隔部门串。索引：`idx_activities_created(created_at)`（`:308`）。
读写：GET /api/activities(公开，带 volunteer_count 子查询)、POST /api/activities、DELETE /api/activities/:id(admin，级联删报名)。

### 1.26 activity_volunteers — 活动报名

```sql
CREATE TABLE IF NOT EXISTS activity_volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, member_name TEXT NOT NULL, department TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```
（`:228`＝fallback `:338`）

唯一性靠应用层查询（activity_id+member_name 查重，无 DB 约束 ⚠️）。索引：`idx_activity_volunteers_aid(activity_id)`（`:229`）、`idx_activity_volunteers_activity_member(activity_id,member_name)`（`:316`）。
读写：volunteer 报名/取消/列表、活动删除级联、用户删除按 member_name 级联、clear-all、孤儿清理。

### 1.27 已删除的历史表

每请求无条件执行（`_utils.js:358-359`）：
```sql
DROP TABLE IF EXISTS tasks
DROP TABLE IF EXISTS cultural_items
```

---

## 2. 常量与配置

### 2.1 导出常量（`_utils.js:4-21`）

| 常量 | 值 | 用途 |
|---|---|---|
| SALT_ROUNDS | `10` | bcrypt cost |
| PASSWORD_MIN / MAX | `6` / `50` | 密码长度 |
| NAME_MIN / MAX | `2` / `20` | 姓名长度 |
| DEPARTMENTS | `['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']` | 合法部门枚举 |

模块内部常量：`RL_CLEANUP_INTERVAL = 3600000`（限流 Map 清理间隔，`:24`）、`CAPTCHA_CHARS`（55 字符，排除易混淆 0/O/1/I/l/o，`:384`）、`CAPTCHA_TTL = 5 * 60 * 1000`（`:385`）。

### 2.2 ACH_NAMES 成就映射（`_utils.js:11-21`，共 33 条）

| id | 名称 | id | 名称 |
|---|---|---|---|
| read_all_changelog | 真的会有人看这个吗？ | night_owl2 | 夜猫子2.0 |
| color_freak | 五彩斑斓的黑 | novice | 初来乍到 |
| night_owl | 夜猫子 | pigeon | 鸽子 |
| early_bird | 早起的鸟儿 | dev | 开发者 |
| high_five | 击掌！ | easter_egg | 不是彩蛋 |
| collector | 收藏家 | screenshot | 截图侠 |
| chatty | 社交恐怖分子 | frequent_404 | 404常客 |
| commenter | 键盘侠 | attendance | 全勤奖 |
| proposer | 提案王 | moonlight | 月光族 |
| time_traveler | 时间旅行者 | anniversary | 周年庆 |
| intruder | 入侵者 | super_graphic | Super Graphic |
| reset_master | 删繁就简 | feedback_first | 我有话要说 |
| locked_out | 被拒之门外 | feedback_tenth | 反馈反馈反馈反馈！ |
| reader | 阅览室常客 | power | Power...?Point. |
| extrovert | e人 | introvert | i人 |
| lightning | 闪电侠 | archaeologist | 考古学家 |
| ocd | 黑白无常 | | |

⚠️ achievements.js 的 `ACH_DEFS`（34 条）额外包含 **`cookie_monster`**，ACH_NAMES 中没有 → 解锁该成就时动态流标题会退化为原始 id（addAchievementBatchEntry 的 `|| achId` 回退）。

### 2.3 环境变量

| 变量 | 用途 | 缺失行为 |
|---|---|---|
| JWT_SECRET | HS256 签名密钥 | getSecret throw `'JWT_SECRET 未设置'` |
| TURNSTILE_SECRET | Turnstile + 验证码 HMAC 的回退密钥 | verifyTurnstile 直接返回 false |
| TURNSTILE_BYPASS | === 'true'\|\|\|true 时跳过 Turnstile（仅服务端变量，客户端参数不可信） | 正常校验 |
| CAPTCHA_SECRET | 自研验证码 HMAC 首选密钥 | 回退 TURNSTILE_SECRET，再回退 `'captcha-default-fallback-secret'` |
| CAPTCHA_BYPASS | === 'true'\|\|\|true 时验证码恒真 | 正常校验 |

⚠️ `verifyTurnstile`（`_utils.js:362-377`）与 `parseImages` 导出后在 functions/api 内**零调用**（前端 public/js 有同名 parseImages 但实现独立），属死代码。

---

## 3. 认证体系

### 3.1 JWT 签发/校验流程

- **signToken(payload, env)**（`:113-120`）：jose `SignJWT`，HS256，`setExpirationTime('24h')`，aud=`'yali-tongban'`，iss=`'yali-tongban'`。
- **signTokenForUser(userId, env, extra={})**（`:122-126`）：从 users 表实时读取 `{userId,name,role,class_name||'',department||'',achievements||'[]',token_version||0}`，merge extra 后调 signToken；查无此人返回 null。用于 change-name/class/department 及成就解锁后的令牌刷新。
- **verifyToken(token, env)**（`:132-138`）：`jwtVerify` 校验 aud+iss。
- **getUserFromRequest(request, env)**（`:140-167`）：
  1. 优先 `Authorization: Bearer <jwt>`；
  2. 否则正则 `/(?:^|;\s*)token=([^;]+)/` 提取 Cookie；
  3. 验签成功后做 **token_version 陈旧检查**：`SELECT token_version FROM users WHERE id=?`，若 `!dbUser || dbUser.token_version > payload.token_version` 则返回 null（旧令牌作废）；payload 无 token_version 字段则跳过检查；
  4. 任一步异常静默吞掉返回 null。
- **requireMember(request, env)**（`:169-173`）：getUserFromRequest 结果为 null 或 `role==='pending'` → null；否则放行（public 也算 member 级）。
- **respondWithToken(data, token, status)**（`:128-130`）：json 包裹并附 Set-Cookie。

登录（auth.js handleLogin）：验限流→验图形验证码→bcrypt.compare→`signToken` 直签（不走 signTokenForUser）→ 若 `password_reset===1` 则清零并在响应带 `password_reset:true`。改密码会 `token_version = token_version + 1` 但**不重发令牌**——当前会话立即失效。

### 3.2 Cookie 属性

```
token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400
```
登出：同名 Cookie `Max-Age=0`（[[path]].js:60 内联）。

### 3.3 角色体系

| 角色 | isAdmin | isOwner | polls min_role 权重 | 能被 admin 删除？ | 典型权限 |
|---|---|---|---|---|---|
| public | ✗ | ✗ | 0（无权重） | ✗（deletableRoles 不含） | 唯一"公共账号"（role='public' 全库至多一个，handleUpdateRole 强制）；等同登录用户但非管理员 |
| member | ✗ | ✗ | 2 | ✓ | 基础成员功能 |
| officer | — | — | 无权重 | — | ⚠️ 幽灵角色：仅 features.js:74 全员邀请查询出现，任何端点都无法授予 |
| teacher | ✓ | ✗ | **0（无权重，疑似遗漏）** | ✓（deletableRoles=['teacher']，任何 admin 可删老师） | 管理员权限（isAdmin=true） |
| admin | ✓ | ✗ | 3 | ✗ | 管理员；不能删其他 admin（deletableRoles 只有 member/pending） |
| owner | ✓ | ✓ | 4 | ✗ | 站长：不可改名（auth.js:93）/改角色/重置密码；独占 gate:'owner' 端点（clear-all、PUT /api/admin/settings） |

- **isAdmin(user)**：`user && (role==='admin' || role==='owner' || role==='teacher')`
- **isOwner(user)**：`user && role==='owner'`
- **isHallReviewer(user)**：`user && (isAdmin(user) || user.department === '社团部')` —— 社团部普通成员也可审报告厅。

路由层 gate（[[path]].js:261-262）：`gate:'admin'` 不满足返回 `error('需要管理员权限', 403)`；`gate:'owner'` 返回 `error('需要网站管理者权限', 403)`。其余路由鉴权由各 handler 自查（如 polls 创建要求 isAdmin、hall review 要求 isHallReviewer）。

polls 投票的 min_role 权重表（polls.js:61）：`{ member: 2, admin: 3, owner: 4 }`——teacher/public/officer 权重 0，设置 min_role='member' 时老师会被拒 ⚠️。

---

## 4. 工具函数清单（`_utils.js` 其余导出）

| 函数 | 签名 | 行为要点 |
|---|---|---|
| checkRateLimit | `(ip, key, maxAttempts=5, windowMs=60000) → bool` | 进程内 `Map`，键 `${ip}:${key}`；固定窗口计数，超窗重置。Map 超 10000 条且距上次清理 >1h 时，清除 windowStart 早于 1h 的条目（硬编码 3600000，与传入 windowMs 无关）。⚠️ 隔离级作用域，非全局 |
| safeParse | `(str, fallback=null)` | try JSON.parse，失败返回 fallback |
| parseImages | `(val) → string` | falsy→`''`；字符串且以 `[` 开头→parse 后重新 stringify（失败原样返回）；数组→stringify；其他→包成 `[val]` 再 stringify。后端无人调用 |
| isValidClass | `(cls) → bool` | 非空字符串、Number 后为整数、长度恰 4 位；设 base=当前年-2000，合法区间：`[(base-1)*100+1, (base-1)*100+27]`、`[(base-2)*100+1, (base-2)*100+29]`、`[(base-3)*100+1, (base-3)*100+29]`、`[base*100+1, base*100+27]`（2026 年即 2501-2527/2401-2429/2301-2329/2601-2627） |
| setCleanupCount | `(val)` | 设置本次请求 autoCleanup 删除行数，供 json() 输出 |
| json | `(data, status=200, extraHeaders={})` | 信封 `{success:true, data}`；若 _cleanupCount>0 附 `_cleanup` 字段并复位。固定头：nosniff、CSP `frame-ancestors 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:`、Referrer-Policy strict-origin-when-cross-origin、Cache-Control no-cache |
| error | `(msg, status=400)` | 信封 `{success:false, error:msg}`，同样安全头 |
| getSecret | `(env)` | 读 JWT_SECRET 编码为 UTF-8 key；缺失 throw `'JWT_SECRET 未设置'` |
| respondWithToken | `(data, token, status=200)` | json + Set-Cookie(setTokenCookie(token)) |
| setTokenCookie | `(token)` | 见 §3.2 |
| isValidImageUrl | `(url) → bool` | `/^data:image\/(jpeg|png|gif|webp);base64,/` 正则 |
| validatePassword | `(pwd) → string\|null` | 长度越界→ `` `密码长度需在${PASSWORD_MIN}-${PASSWORD_MAX}位之间` ``；缺字母或数字→`'密码需包含至少一个字母和一个数字'`；否则 null |
| parseBody | `(request)` | request.json() 失败返回 null |
| getClientIP | `(request)` | `CF-Connecting-IP` → `X-Forwarded-For` → `'unknown'` |
| checkSiteClosed | `(request, env) → string\|null` | 白名单精确路径：`/api/auth/login`、`/api/auth/signin`、`/api/auth/register`、`/api/auth/me`、`/api/auth/change-department`；前缀豁免：`/api/sync`、`/api/settings`、`/api/chat`、`/api/feed`、`/api/admin`。其余路径当 settings.site_closed==='true' 时返回 `'网站已关闭，请联系管理员'`（路由层转为 503） |
| initDB | `(env)` | 见 §6 |
| verifyTurnstile | `(token, env) → bool` | Cloudflare siteverify POST；TURNSTILE_BYPASS 直通；无 token/secret false。（当前无调用方） |
| computeHash | `(obj) → hex string` | SHA-256(JSON.stringify(obj)) 十六进制。用途：/api/sync 把每页数据 hash 与客户端上报 hash 对比，相同则回 `{changed:false}` 实现增量同步（sync.js:154-156） |
| attachAnnounceImages | `(env, rows)` | 批量查 announcement_images 按 sort_order 组装；合并 legacy image_url(safeParse 出数组)；查询异常则退化为仅解析 legacy 字段 |
| replaceAnnounceImages | `(env, announcementId, imageUrls)` | 先 DELETE 该公告全部子图再按序 INSERT |
| autoCleanup | `(env) → number` | 每自然日一次（比对 last_cleanup 前 10 位日期）。依次删除：①已完成且 updated_at<now-90d 的 issues ②date<now-14d 的 hall_bookings ③④issue/announcement 孤儿评论 ⑤⑥⑦孤儿 poll_responses/answers/questions ⑧孤儿 announcement_images ⑨孤儿 feed_comments(feed_id∉chat_messages) ⑩孤儿 activity_volunteers ⑪chat_messages 早于 90 天 ⑫pending 且早于 30 天的 users ⑬早于 14 天的 duty_score_record；最后写 last_cleanup。返回总删除数（变量编号跳过 r2） |
| getStorageStats | `(env)` | D1_LIMIT=5GB；对 finance/issues/announcements/reviews/announcement_images 的 image_url 求 SUM(LENGTH)，×0.75 估算二进制体积（base64→bytes），另汇总各表文本字段长度与行数；percent 封顶 100。供 GET /api/admin/storage 与 sync 使用 |
| insertChatSystemMessage | `(env, data)` | 拼 `from_dept + '向'+to_dept + action (+ '：'+title)` 写入 chat_messages(type='system', user_name='')，system_data 存完整 JSON |
| insertNotification | `(env, content)` | 写 chat_messages(type='notification', user_name='')——全站广播。触发场景：新成员注册、通过注册、财务删除、报告厅预约提交/拒绝/批准/冲突处理 |
| updateChatSystemStatus | `(env, ref_type, ref_id, newStatus)` | LIKE 定位 ref 匹配的 system 消息（`\`、% 、_ 转义），statusMap `{'待完成':'待处理','已完成':'已完成','已报销':'已完成'}` 映射后重写 content 与 system_data。用于财务状态联动动态流 |
| addAchievementBatchEntry | `(env, userName, achId)` | 成就播报缓冲：settings.achievement_batch 存 `{date, entries[]}`；跨天时把昨日条目按用户聚合为 `${user} 解锁了 ${titles.join('、')}`，以 action='昨日成就解锁' 发一条 system 消息 |
| getBannerData | `(env)` | 聚合两块：①最新 3 条 `status IS NULL OR status='已通过'` 公告（附第一张子图，legacy image_url 数组兜底）②未来 3 条 `status='approved' AND date>=date('now')` 的 hall_bookings（按 date,start_time 升序）。供 GET /api/banner 与 sync/banner |
| createNotification | `(env, userId, type, title, body='', link='', icon='', featureKey='messages')` | 先 JOIN 校验该用户对此 featureKey 的 user_feature_responses.status='accepted' 且 features.globally_enabled=1，才 INSERT notifications；否则静默丢弃。触发场景：注册通过、角色变更、公告审核结果与新公告广播、评论回复、报修状态、财务完成/报销、活动邀请、值日分数修改/扣分 |
| createNotificationBatch | `(env, userIds, type, ...)` | 同上过滤后多行 VALUES 批量插入 |
| isFeatureEnabled | `(env, userId, featureKey) → bool` | 与 createNotification 相同的 JOIN 条件，返回 `resp && resp.status==='accepted'`；无 userId 或异常返回 false |
| getUserIdByName | `(env, name)` | `SELECT id FROM users WHERE name=? AND role IN ('member','admin','owner','teacher') LIMIT 1`——注意不含 public/owner 之外……实为不含 public；owner 在列表内。⚠️ public 角色永远查不到 id |

---

## 5. 验证码系统（自研图形验证码，`_utils.js:379-456`）

**生成 generateCaptcha(env)**：
1. 从 `CAPTCHA_CHARS`（55 字符：`23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz`，排除 0/O/1/I/l/o）随机取 4 位 code；
2. `expire = Date.now() + CAPTCHA_TTL`（5 分钟）；
3. `nonce = Math.random().toString(36).slice(2, 10)`；
4. payload = `` `${code}:${expire}:${nonce}` ``；signature = HMAC-SHA256 hex(payload, secret)（secret 链：CAPTCHA_SECRET → TURNSTILE_SECRET → `'captcha-default-fallback-secret'`）；
5. **token = btoa(`${payload}:${signature}`)**，即解码后形如 `CODE:EXPIRE_MS:NONCE:HMAC_HEX`；
6. SVG 由 generateCaptchaSVG 生成：画布 200×70、底色 #f4f4f4；4 个字符 x=28+i×42、y≈48±5、rotate ±15°、字号 36±6 加粗、衬线字体 Georgia/'Times New Roman'、五色调色板 ['#1a1a1a','#2d5b3e','#7a3d3d','#3d4d7a','#6b3d7a']；叠 4 条随机干扰线（stroke-width 1、opacity .4）与 45 个 r=1 噪点（opacity .5）。
7. 路由 GET /api/captcha/generate 返回 `{token, svg}`，Cache-Control: no-store（[[path]].js:232-239）。

**校验 verifyCaptcha(token, code, env)**：
1. `CAPTCHA_BYPASS === 'true'||true` 恒真；
2. atob 解码，按**最后一个冒号**切出 signature 与 payload；重算 HMAC 比对（非常量时间比较 ⚠️）；
3. payload 至少 3 段；`Date.now() > expire` 即过期拒绝；
4. `storedCode.toLowerCase() !== String(code).toLowerCase()` 大小写不敏感比对；
5. 任何异常返回 false。

**防重放**：⚠️ **没有一次性消费机制**。校验完全无状态，服务器不登记 nonce；同一 token+code 在 5 分钟有效期内可反复提交（换 IP/会话亦然）。nonce 仅保证 token 唯一性，不构成防重放。缓解因素：使用方各自叠加了 IP 限流（login 5/min、register 3/min、vote 3/h 等）。

**消费方**：login、register、POST /api/feedback、POST /api/issues、POST /api/finance、vote poll、游客 volunteer 报名。

---

## 6. initDB 幂等性说明（`_utils.js:224-360`）

每次 API 请求都会执行 onRequest → initDB（[[path]].js:215）。结构分三段：

**A. 主路径（settings 表已存在时）**——逐条 `try{...}catch{}` 吞错执行：
1. 探针 `SELECT 1 FROM settings LIMIT 1`；
2. "每次都建"组：activities、activity_volunteers(+索引)、feed_comments(+索引)、feedback(+section/version 两列 ALTER)、hall_bookings(+reviewed_at ALTER)、issues.notes、finance 三列、清 14 天前 hall_bookings、duty 五表 + 三个索引 + duty_period_config 六行种子（INSERT OR IGNORE）+ 六条配置值 UPDATE 迁移；
3. chat_messages 旧 system 消息类型迁移 UPDATE（§1.13）；
4. features / user_feature_responses / notifications + 两个索引（注释明确：必须在 `_db_init_done` 检查之前）；
5. 读 `_db_init_done`：**存在则 return**（跳过第 6 步）；
6. legacy 迁移块：announcements 五列、issues.image_url、finance type/amount、poll_questions.max_length、poll_responses.ip、users 五列、finance department 回填 UPDATE、comments/polls 族四表、announcement_images/chat_messages 建表、20+ 个索引，最后 `INSERT OR IGNORE INTO settings VALUES ('_db_init_done','1')`。

**B. fallback 分支**（探针抛错＝全新库）：一次性顺序执行 sql 数组（`:319-353`）：users/issues/announcements/finance/reviews/settings/comments/polls 族/chat_messages/activities/activity_volunteers/feed_comments/feedback/duty 五表+种子/features/user_feature_responses/notifications + 种子键 site_closed='false'、site_closed_message=''、site_closed_by=''、last_cleanup='' + 仅 2 个 notifications/features 索引。
⚠️ **该数组缺少 hall_bookings 的 CREATE**，也缺绝大多数索引 → 全新库第一次请求后 hall_bookings 不存在， halls 相关接口首请求会失败；第二次请求走 A 路径补建，自我修复。

**C. 收尾（两条路径之后都执行）**：`DROP TABLE IF EXISTS tasks` / `cultural_items`。

幂等性保证手段：全部 `IF NOT EXISTS` / `INSERT OR IGNORE` / ALTER 吞错（重复加列报 duplicate column 被忽略）；duty_period_config 用种子 INSERT OR IGNORE + 无条件 UPDATE 校准值，因此改配置值也能灰度到旧库。代价：每个请求执行约 40+ 条 DDL/DML 探测语句（性能损耗明显）。

---

## 7. 已发现的不一致与疑点汇总

1. **cookie_monster 缺席 ACH_NAMES**（achievements.js:3 vs _utils.js:11-21）→ 动态流成就名退化为原始 id。
2. **幽灵角色 officer**：仅 features.js:74 全员邀请查询引用；handleUpdateRole 合法集合为 member/admin/owner/teacher/public，无法产生 officer 用户。
3. **polls min_role 权重缺 teacher**：`{member:2, admin:3, owner:4}`（polls.js:61），teacher/public 权重 0 会被 min_role 拒绝。
4. **fallback 引导缺 hall_bookings 表**（及大部分索引），全新库首次请求不自洽，依赖第二请求自愈（§6-B）。
5. **关站白名单漏掉 `/api/captcha/generate` 与 `/api/auth/check-name`**（checkSiteClosed，`:215-216`）→ 关站期间登录页拿不到验证码，登录实质不可用（尽管 login 本身在白名单）。
6. **验证码可重放**：无一次性消费登记，TTL 内重复可用（§5）。
7. **副作用读**：GET /api/finance 每次执行 UPDATE fund_type 回填（finance.js:6）；GET /api/hall/bookings 每次顺带 DELETE 过期预约（halls.js:5）。
8. **改密即踢会话但不重发令牌**：handleChangePassword `token_version+1` 后仅返回 message；而管理员重置密码（admin.js:163）只置 password_reset=1、不动 token_version，旧会话仍有效——两种重置语义不一致。
9. **删除用户级联过宽**：DELETE /api/admin/users/:id 会连带删除该用户创建的全部 announcements/finance/reviews/polls 及评论/报名/动态（admin.js:51-62），但不清理其 notifications 与 user_feature_responses。
10. **schema 双轨漂移**：poll_questions.max_length 在 legacy 路径无 NOT NULL、fallback 有；poll_responses.ip 同理仅默认值差异较小。
11. **死代码**：verifyTurnstile、parseImages（后端侧）无调用方；feedback.turnstile_bypass 恒插 0。
12. **autoCleanup 变量编号跳过 r2**（r1,r3…r14，`:504-529`）——纯命名瑕疵。
13. **handleDutyStaffDelete 用 `SELECT changes()` 且以 `dr['changes()']` 取值**（duty.js:67-68）——依赖 D1 对裸表达式列名的序列化行为 ⚠️待确认（若驱动返回列名不同则误报 404）。
14. **限流为 isolate 级内存 Map**：多实例部署下阈值形同虚设；且窗口清理的 1 小时阈值硬编码，与业务 windowMs 无关。

---

## 8. 提取来源

| 文件 | 行数 | 提取内容 |
|---|---|---|
| functions/api/_utils.js | 738（全文精读） | 全部 SQL、常量、认证/验证码/工具函数 |
| functions/api/[[path]].js | 270 | 路由表、gate、onRequest 流程 |
| functions/api/auth.js | 150 | login/register/me/change-* |
| functions/api/admin.js | 269 | 用户管理、settings、clear-all、batch-* |
| functions/api/announcements.js | 152 | 公告 CRUD/审核/图片 |
| functions/api/activities.js | 104 | 活动与报名 |
| functions/api/achievements.js | 46 | 成就解锁/计数 |
| functions/api/banner.js | 9 | banner 端点 |
| functions/api/comments.js | 76 | 评论 CRUD |
| functions/api/duty.js | 493 | 值日全模块 |
| functions/api/features.js | 176 | 功能开关/邀请 |
| functions/api/feed.js | 64 | 动态流与评论 |
| functions/api/feedback.js | 28 | 反馈 |
| functions/api/finance.js | 126 | 财务 |
| functions/api/halls.js | 123 | 报告厅预约 |
| functions/api/issues.js | 78 | 报修 |
| functions/api/messages.js | 87 | 站内通知 |
| functions/api/polls.js | 232 | 投票 |
| functions/api/reviews.js | 53 | 展柜审核 |
| functions/api/settings.js | 12 | 公开站点设置 |
| functions/api/sync.js | 163 | 增量同步聚合 |
| wrangler.toml | 8 | D1 绑定确认 |

> grep 范围：全项目 `CREATE TABLE|ALTER TABLE`（命中仅 _utils.js 与构建产物 _worker.bundle）；`rg` 不可用，表↔端点矩阵由 PowerShell Select-String 对 functions/api/*.js 的 FROM/INTO/UPDATE/JOIN 全量扫描归纳。
