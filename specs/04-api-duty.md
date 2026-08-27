# 04 · 值日考勤模块（duty）API 规格

> 范围：`functions/api/duty.js`（493 行）+ `_utils.js` 建表/种子 + `[[path]].js` 挂载 + `public/js/duty.js`、`public/js/duty-admin.js`（调用方视角）。
> 目标：凭此文档可从零重新实现该模块，行为与现网一致。

---

## 1. 数据模型（照抄自 `initDB` 的 CREATE TABLE）

### duty_staff — 值日干事
```sql
CREATE TABLE IF NOT EXISTS duty_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT 0,
  department TEXT NOT NULL,
  class TEXT NOT NULL,
  name TEXT NOT NULL,
  password TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)
```
- `user_id`：映射到 `users.id`；未匹配平台账号时为 `0`（此时 `password` 存 bcrypt 哈希的初始密码）。
- 无唯一约束（同名同班可重复插入）。

### duty_schedule — 每日排班
```sql
CREATE TABLE IF NOT EXISTS duty_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  staff_a_id INTEGER NOT NULL,
  staff_b_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)
CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_schedule_date ON duty_schedule(date)
```
- **每天最多一条**排班（date 唯一索引）；每天固定两名干事 A/B。
- 手动保存用 `ON CONFLICT(date) DO UPDATE` 实现按天覆盖。

### duty_attendance — 签到记录
```sql
CREATE TABLE IF NOT EXISTS duty_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  sign_in_time TEXT,
  sign_out_time TEXT,
  duration_sec INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  score_absent REAL DEFAULT 0,
  score_duration REAL DEFAULT 0,
  is_manual INTEGER DEFAULT 0,
  modified_by TEXT DEFAULT '',
  modified_reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)
CREATE INDEX IF NOT EXISTS idx_duty_attendance_schedule ON duty_attendance(schedule_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_attendance_unique ON duty_attendance(schedule_id, staff_id, period)
```
- 唯一约束 `(schedule_id, staff_id, period)`：同一人同一时段仅一条记录 → 天然防重复签到。
- `status` ∈ {`pending`(隐含/默认), `signed_in`, `completed`, `absent`}。注意"pending"通常不落库——无记录即视为 pending，前端用合成对象兜底。

### duty_score_record — 加扣分流水
```sql
CREATE TABLE IF NOT EXISTS duty_score_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  period TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT DEFAULT '',
  recorder TEXT DEFAULT 'system',
  is_cancelled INTEGER DEFAULT 0,
  cancel_reason TEXT DEFAULT '',
  cancel_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)
CREATE INDEX IF NOT EXISTS idx_duty_score_record_staff ON duty_score_record(staff_id)
```
- `recorder`：`'system'`（自动缺勤/签退不足）或管理员姓名。
- 流水表是**统计的唯一事实来源**；attendance 上的 `score_absent/score_duration` 只是当日展示缓存。
- ⚠️ 保留期：`autoCleanup`（_utils.js:528）每日删除 `created_at < datetime('now','-14 days')` 的流水，部门统计实际只有近 14 天数据。

### duty_period_config — 时段配置
```sql
CREATE TABLE IF NOT EXISTS duty_period_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE,
  slot_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  start_time TEXT DEFAULT '08:00',
  auto_absent_min INTEGER DEFAULT 10
)
```
- `label` UNIQUE（时段名即业务键，attendance.period 以 label 字符串关联）。
- `slot_type` ∈ {`small_break`, `big_break`, `no_duty`}。

### 关系图
```
duty_staff 1──n duty_attendance n──1 duty_schedule (date 唯一, 每天 2 名 staff)
duty_staff 1──n duty_score_record（独立流水，冗余 date/period）
duty_period_config ←— label 弱关联 —→ duty_attendance.period
duty_staff.user_id 0..1 ──→ users.id
```

---

## 2. 时段配置（periods）

### 默认种子数据（INSERT OR IGNORE，_utils.js:252）
| sort_order | label | slot_type | start_time | auto_absent_min |
|---|---|---|---|---|
| 1 | 第一节课后 | small_break | 09:00 | 9 |
| 2 | 上午大课间 | big_break | 09:50 | 34 |
| 3 | 第三节课后 | small_break | 11:05 | 39 |
| 4 | 第五节课后 | small_break | 14:50 | 214 |
| 5 | 下午大课间 | no_duty | 15:00 | 74 |
| 6 | 第七节课后 | small_break | 16:55 | 74 |

⚠️ 注意：紧随种子的 migration UPDATE（_utils.js:254-259）**每次启动都执行**，会把上表值强制写回（含把第七节课后 slot_type 改回 `small_break`）。管理员在后台改了这几行的值后会被部署重置——重新实现时若要可持久自定义需去掉这段。

### GET `/api/duty/periods`
公开（无鉴权）。`SELECT * FROM duty_period_config ORDER BY sort_order`，原样返回行数组。

### PUT `/api/duty/periods`
- 鉴权：handler 内 `isAdmin(user)`，否则 `error('需要管理员权限', 403)`。
- Body：`{ periods: [ { id?, label, slot_type, sort_order, start_time?, auto_absent_min? }, ... ] }`。
- 校验：`slot_type` 必须在 `['small_break','big_break','no_duty']`，否则 `error('无效的时段类型', 400)`。
- 有 `id` → UPDATE 全字段（start_time 缺省 `'08:00'`、auto_absent_min 缺省 `10`）；无 `id` → `INSERT OR REPLACE`（靠 label UNIQUE 覆盖同名时段）。
- 成功返回 `{ message: '已更新' }`。

---

## 3. 排班生成算法（POST `/api/duty/schedule/generate`）

鉴权：admin。精确逻辑：

1. 取活跃干事：`SELECT id FROM duty_staff WHERE is_active=1 ORDER BY id` → 数组 `ids`。
   - `ids.length < 2` → `error('至少需要2名活跃干事', 400)`。
2. **起始日期**：查最新排班 `SELECT date FROM duty_schedule ORDER BY date DESC LIMIT 1`：
   - 有 → `start = new Date(last.date + 'T00:00:00')`；
   - 无 → `start = new Date()`（今天）。
   - 然后 `start.setDate(start.getDate() + 1)` —— **一律从最后排班日的次日（或空库时的明天）开始生成**。
3. **轮转起点恢复**：取插入序最后一条 `lastSch`（ORDER BY id DESC LIMIT 1），`li = ids.indexOf(lastSch.staff_a_id)`，`dayIdx = Math.floor(li / 2) + 1`（找不到则为 0）。
4. **主循环**：扫描 `i = 0..59` 共 **60 个自然日窗口**（非"生成60个工作日"，是往前扫 60 个日历日，跳过的不补）：
   - `d = start + i` 天；`d.getDay() === 0 || === 6`（周日/周六）→ `continue` 跳过；
   - `ds = d.toISOString().slice(0,10)`；该日期已有排班 → `continue`（**幂等：已存在不覆盖也不推进轮转**，dayIdx 不变）；
   - 配对（**顺序滑动窗口轮转，非随机，每时段/每日恒定 2 人**）：
     ```
     aIdx = dayIdx % ids.length
     bIdx = (dayIdx + 1) % ids.length     // 仅 ids.length===1 时才会等于 aIdx，此处不可能
     INSERT OR IGNORE INTO duty_schedule (date, staff_a_id, staff_b_id) VALUES (ds, ids[aIdx], ids[bIdx])
     gen++; dayIdx++;                     // dayIdx 每天只 +1（不是 +2！）
     ```
   - 即第 k 个生成日是 `(ids[k mod n], ids[(k+1) mod n])` —— **相邻两天共享一人**的滑窗配对（day0=A,B；day1=B,C；day2=C,D…），不是两两一组跳着排。
5. `env.DB.batch(inserts)` 批量写入；返回 `{ generated: gen }`（gen 是尝试生成的天数，含被 IGNORE 的冲突行）。

⚠️ 已知怪点：第 3 步恢复公式 `floor(li/2)+1` 与实际"每天 dayIdx+1"语义不符（正确应为 `li+1`）。后果：中途手动改排班/增删干事后再自动生成，轮转接缝可能错位或与既有配对重叠。重复生成本身安全（幂等跳过已有日期）。

### 相关端点
- GET `/api/duty/schedule?start=&end=`：公开。LEFT JOIN 两名 staff 输出 `a_dept/a_class/a_name/b_dept/b_class/b_name` 等，`date>=start`（默认今天）、可选 `date<=end`，按 date 升序。
- POST `/api/duty/schedule/manual`（admin）：body `{date, staff_a_id, staff_b_id}`；缺字段 → `'缺少必填字段'`；两人相同 → `'两名干事不能相同'`；UPSERT 按 date 覆盖；返回 `{message:'已保存'}`。
- DELETE `/api/duty/schedule/manual?date=YYYY-MM-DD`（admin）：级联删 attendance（按该 date 的 schedule_id）→ score_record（按 date）→ schedule；返回 `{message:'已删除'}`。
- POST `/api/duty/schedule/clear-all`（admin）：按 score_record → attendance → schedule 顺序清空三表；返回 `{message:'已重置'}`。

---

## 4. 签到签退状态机

```
            ┌────────────(无记录)───────────► [虚拟 pending]
            │                                     │ sign-in ──► signed_in ──sign-out──► completed
 auto-absent│                                sign-in(重复)          │
            ▼                                    ▼                  ▼
         [absent] ◄──auto-absent(pending被改写)  拒绝            (终态，不可再签到)
```

### POST `/api/duty/attendance/sign-in`（登录即可调用，handler 不校验 user 与 staff_id 归属）
Body：`{ schedule_id, staff_id, period }`。流程：
1. 缺任一字段 → `'缺少必填字段'` 400。
2. 排班不存在 → `'排班不存在'` 404。
3. `staff_id` 不是该日 staff_a/b → `'你不在今日排班中'` 403。（仅校验属于该日，**不校验当前登录人就是该 staff** ⚠️ 可代签）
4. **时间窗（早到拦截，无迟到判定）**：读 `duty_period_config.start_time`（北京时间）。`slot_type !== 'no_duty'` 且当前时刻 < 该日开始时间（构造 `new Date(sch.date+'T'+hh:mm)` 后 `-480` 分钟转 UTC 比较）→ `'未到签到时间，开始时间：' + start_time` 400。
5. 查现有记录 `(schedule_id, staff_id, period)`：
   - status = `signed_in` → `'已签到'` 400（重复签到防护之一）；
   - status ≠ `pending`（completed/absent）→ `'该时段已锁定'` 400（**absent 后不能补签**）；
   - status = `pending`（理论上极少落库）→ UPDATE 为 signed_in；
   - 无记录 → INSERT `(…,'signed_in', datetime('now'))`。
6. 返回 `{ attendance_id, status:'signed_in', sign_in_time: new Date().toISOString() }`。
7. 并发兜底：唯一索引 `idx_duty_attendance_unique` 使竞态下第二条 INSERT 失败。

### POST `/api/duty/attendance/sign-out`（登录即可调用，同样无归属校验 ⚠️）
Body：`{ attendance_id }`。流程：
1. 缺失 → `'缺少 attendance_id'` 400；记录不存在 → `'记录不存在'` 404。
2. `att.status !== 'signed_in'` → `'未在签到状态'` 400。
3. `!att.sign_in_time` → `'签到时间异常'` 500；解析失败（`'T'` 有无均兼容，空格分隔则补 `'Z'` 当 UTC）→ `'签到时间格式异常'` 500。
4. `durSec = floor((Date.now() - signIn)/1000)`。
5. **得分公式（全部规则就这一条）**：
   ```
   score = durSec < 120 ? -0.5 : 0      // 在岗不足 2 分钟 → -0.5 分
   color = durSec < 120 ? 'pink' : 'green'
   ```
   无按时长比例计分、无满勤加分、无迟到扣分。
6. 批量执行：UPDATE attendance → `status='completed', sign_out_time=datetime('now'), duration_sec=durSec, score_duration=score`；若 `score !== 0` 追加 INSERT score_record `(staff_id, sched.date, att.period, score, '在岗不足', 'system')`。
7. 返回 `{ status:'completed', duration_sec:durSec, score, color }`（前端据 color 决定 warn/done 样式）。

### 同一时段两人独立
attendance 按 `(schedule_id, staff_id, period)` 各自一行；A/B 完全独立签到签退，互不影响状态（例外见 §5 的 small_break 免缺岗规则）。

### GET `/api/duty/attendance/today`（≡ GET `/api/duty/schedule/today`，公开）
- "今天"按北京时间算：`new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10)`。
- 先触发惰性缺勤标记（§5），再聚合返回：
  ```jsonc
  {
    "date": "YYYY-MM-DD", "schedule_id": 123,
    "staff_a": { id, department, class, name, user_id },
    "staff_b": { ... },
    "periods": [ { label, slot_type, sort_order, start_time, auto_absent_min,
        "a": { attendance_id, status, sign_in_time, sign_out_time, score_absent, score_duration, total },
        "b": { ... } } ]   // total = score_absent + score_duration
  }
  ```
- 无排班时：`{ date, staff_a:null, staff_b:null, periods:[] }`。
- 无 attendance 记录的格子由服务端合成 `{ id:0, status:'pending', sign_in_time:null, sign_out_time:null, score_absent:0, score_duration:0 }`。

---

## 5. 自动缺勤（autoMarkAbsent）

- **触发时机：查询时惰性标记** —— 仅在 `handleDutyAttendanceToday` 内、返回聚合前同步执行；无定时任务。谁打开页面谁触发。
- 判定期限（每个非 no_duty 时段）：
  ```
  deadline = new Date(today + 'T' + start_time)          // 服务器 UTC 下解析
  deadline += auto_absent_min 分钟                        // 宽限
  deadline -= 480 分钟                                    // 北京→UTC
  if (now <= deadline) skip                              // 未超期不标
  ```
  即北京时间 `start_time + auto_absent_min` 之后仍未签到才判缺勤。
- **big_break（else 分支，独立判定）**：对 A、B 各自查 attendance；`signed_in` 或 `completed` → 跳过该人；否则标缺。
- **small_break（一荣俱荣）**：A、B 任一人 `signed_in`/`completed` → **整时段两人都不标缺**；两人都没有 → 两人一起标缺。
- 标记动作（每人每时段）：
  1. `INSERT OR IGNORE INTO duty_attendance (…, status='absent', score_absent=-1)`；
  2. `UPDATE … SET status='absent', score_absent=-1 WHERE … AND status='pending'`；
  3. 防重：查 `duty_score_record` 中同 staff+date+period+`reason='缺岗'`+`is_cancelled=0` 是否已存在，不存在才 INSERT `(score=-1, reason='缺岗', recorder='system')`。
- 所有操作攒进一个 `env.DB.batch`。
- 扣分值固定 **-1**；写两张表（attendance.status/score_absent 与 score_record 流水）。

---

## 6. 评分体系（scores）

### GET `/api/duty/scores`（公开）
Query：`staff_id? / date_from? / date_to? / show_cancelled?`（仅字面量 `'false'` 时过滤掉已销分，默认显示）。JOIN duty_staff 补 department/class/name；`ORDER BY created_at DESC LIMIT 200`。

### 自动流水的产生点
| 来源 | score | reason | recorder |
|---|---|---|---|
| 自动缺勤 | -1 | `缺岗` | system |
| 签退在岗<120s | -0.5 | `在岗不足` | system |

### POST `/api/duty/scores/add`（admin）
- Body `{staff_id, date, period, score, reason?}`；缺项 → `'缺少必填字段（干事/日期/时段/分值）'` 400；干事不存在 → `'干事不存在'` 404；`Number(score)` NaN → `'分值必须是数字'` 400。
- 正负分皆可（名字叫 add，前端 toast 区分"扣分/加分"）；reason 缺省 `'手动扣分'`；recorder = 当前管理员名。
- 给已映射 user_id 的干事发通知：title `值日扣分记录`，body ``您${date} ${period} 被记录${numScore<0?'扣分':'加分'} ${numScore} 分（原因：${reason||'手动扣分'}，记录人：${user.name}）。``, link `duty.html`, icon `alert-triangle`。
- 返回 `{ message: '已添加扣分记录' }`。

### POST `/api/duty/scores/modify`（admin）—— 改的是 attendance 快照
- Body `{attendance_id, new_score, reason?}`；缺项 `'缺少必填字段'` 400；attendance 不存在 `'记录不存在'` 404；schedule 不存在 `'排班记录不存在'` 404。
- UPDATE attendance：`is_manual=1, modified_by=user.name, modified_reason=reason||'', score_absent=new_score, score_duration=0`。
- 若 `new_score !== 旧(score_absent+score_duration)` → 追加流水 `(new_score, reason||'管理员修改', user.name)`。
- 通知干事：title `值日分数已修改`，body ``您${sched.date} ${att.period} 的值日分数已被修改为 ${new_score} 分${reason?`（原因：${reason}）`:''}。``, icon `clock`。
- 返回 `{ message: '已修改' }`。
- **modify vs cancel 的区别**：modify 重写某条 attendance 的当日得分快照（并记一条新流水，旧流水仍在）；cancel 只是把某条**已有流水**标记作废（is_cancelled=1），并把相关 attendance 计分清零，不改 status。

### POST `/api/duty/scores/cancel` —— **特殊：路由适配器 RQ，不注入 user**
挂载：`{ m:'POST', p:'/api/duty/scores/cancel', h: handleDutyScoreCancel, x: RQ }`（[[path]].js:158），签名 `(request, env)`。**不做 JWT/isAdmin 校验**，改为请求体内的「销分人 + 密码」二次验证，校验逻辑原文：

```js
const body = await parseBody(request);
const { score_record_id, reason, admin_id, password } = body;
if (!score_record_id || !reason) return error('缺少必填字段', 400);

if (!admin_id || !password) return error('需要销分人验证', 403);
const admin = await env.DB.prepare("SELECT id, name, role, password_hash FROM users WHERE id=?").bind(admin_id).first();
if (!admin || !['admin','owner','teacher'].includes(admin.role)) return error('销分人不是管理员', 403);
if (!await bcrypt.compare(password, admin.password_hash)) return error('密码错误', 403);

const rec = await env.DB.prepare("SELECT * FROM duty_score_record WHERE id=?").bind(score_record_id).first();
if (!rec) return error('记录不存在', 404);
if (rec.is_cancelled) return error('已销分', 400);
```
后续动作：UPDATE 流水 `is_cancelled=1, cancel_reason=reason, cancel_by=admin.name`；再找该 `(date, staff_id, period)` 匹配的全部 attendance 行（JOIN duty_schedule 按 ds.date）并清零其 `score_absent/score_duration`。返回 `{ message: '已销分' }`。

### POST `/api/duty/scores/batch-cancel`（双重验证：JWT admin **且** body 密码验证）
- Body `{score_record_ids:[], reason, admin_id, password}`。
- 空数组 → `'未选择记录'` 400；无 reason → `'缺少销分理由'` 400；密码验证错误消息与单条版一致（`'需要销分人验证'/'销分人不是管理员'/'密码错误'` 均 403）。
- 过滤出未销分记录；全无效 → `'所选记录均已销分或不存在'` 400。
- 逐条置 is_cancelled；attendance 清零按 `date|staff_id|period` 键去重（同键多条流水只清一次）。
- 返回 `{ message: '已销分 N 条', cancelled: N }`。

---

## 7. CSV 导出（GET `/api/duty/schedule/export`，公开）

查询参数同 `/api/duty/schedule`（start 默认今天，end 可选）。列结构：

```
文件头:  日期,干事A,干事B
数据行:  YYYY-MM-DD,{a_dept}{a_class} {a_name},{b_dept}{b_class} {b_name}
```
- 姓名 = `department + class + ' ' + name` 再 `.trim()`（缺失部分拼空串）。
- 响应头：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename=schedule.csv`。
- ⚠️ 服务端不加 UTF-8 BOM；且前端 duty-admin.js 实际**不走这个端点**——它调 `/api/duty/schedule` JSON 后在浏览器自己拼 CSV 并加 `\uFEFF` BOM（doExport，duty-admin.js:667-687）。`/export` 目前是无调用方的备用实现。

---

## 8. department-stats（GET `/api/duty/department-stats?weeks=N`，公开）

```sql
SELECT ds.department, SUM(dsr.score) as total_score, COUNT(*) as record_count
FROM duty_score_record dsr
JOIN duty_staff ds ON dsr.staff_id = ds.id
WHERE dsr.date >= date('now', '+8 hours', '-' || ? || ' days')
  AND dsr.is_cancelled = 0
  AND dsr.score < 0
GROUP BY ds.department
ORDER BY total_score ASC
```
- 时间范围：`weeks`（默认 `'2'`，parseInt）× 7 天；`'+8 hours'` 把 UTC now 对齐到北京当日零点起算。
- **只统计负分流水**（扣分榜），正分/零分不计；已销分剔除。
- JOIN 的是全量 duty_staff：**不过滤 is_active、不校验用户是否为"已批准成员"**（user_id=0 的 unmapped 干事也计入其 department）。
- 排序 ASC = 最负（扣分最狠）在前。返回 `{department, total_score, record_count}[]`。

---

## 9. 权限矩阵（Duty 全部 24 条路由）

前置全局链（[[path]].js onRequest）：`initDB` → `autoCleanup`（每日一次）→ `checkSiteClosed`（关站时 duty 也被拦：`'网站已关闭，请联系管理员'` 503）→ `requireMember`（解析 JWT；**结果不强制**，null 也放行给无 gate 的路由）。
`isAdmin(user)` = role ∈ {admin, owner, teacher}（_utils.js:175）。gate 机制只用于 /api/admin/*，duty 全靠 handler 自查。

| # | 方法+路径 | 适配器 | 有效鉴权等级 |
|---|---|---|---|
| 1 | GET `/api/duty/staff` | EN | 公开 |
| 2 | POST `/api/duty/staff/upload` | RU | handler isAdmin（403 `'需要管理员权限'`） |
| 3 | POST `/api/duty/staff` | RU | handler isAdmin |
| 4 | DELETE `/api/duty/staff/:id` | `c => [request, env, user, params[0]]` | handler isAdmin；**传参顺序 `(request,env,user,id)`**（duty.js:60），注意与 RIDU 的 `(request,env,id,user)` 相反 |
| 5 | POST `/api/duty/schedule/generate` | RU | handler isAdmin |
| 6 | GET `/api/duty/schedule/today` | EN | 公开（= #12 同一 handler） |
| 7 | GET `/api/duty/schedule` | EURL | 公开 |
| 8 | GET `/api/duty/schedule/export` | EURL | 公开 |
| 9 | POST `/api/duty/schedule/manual` | RU | handler isAdmin |
| 10 | DELETE `/api/duty/schedule/manual` | RU | handler isAdmin（读 query `date`） |
| 11 | POST `/api/duty/schedule/clear-all` | RU | handler isAdmin |
| 12 | GET `/api/duty/attendance/today` | EN | 公开 |
| 13 | POST `/api/duty/attendance/sign-in` | RU | **仅需可达**（user 可为 null，handler 不看 user、不验归属）⚠️ |
| 14 | POST `/api/duty/attendance/sign-out` | RU | 同上 ⚠️ |
| 15 | GET `/api/duty/scores` | EURL | 公开 |
| 16 | POST `/api/duty/scores/add` | RU | handler isAdmin |
| 17 | POST `/api/duty/scores/modify` | RU | handler isAdmin |
| 18 | POST `/api/duty/scores/cancel` | **RQ** | **无 user 参数**；body `admin_id+password` bcrypt 二次验证（§6） |
| 19 | POST `/api/duty/scores/batch-cancel` | RU | 双重：JWT isAdmin **且** 密码验证 |
| 20 | GET `/api/duty/admins` | EN | 公开（返回 admin/owner/teacher 的 id,name,role） |
| 21 | GET `/api/duty/department-stats` | EURL | 公开 |
| 22 | GET `/api/duty/periods` | EN | 公开 |
| 23 | PUT `/api/duty/periods` | RU | handler isAdmin |
| 24 | （#6/#12 为同 handler 双路由；#7 与 #8 独立） | | |

---

## 10. 干事管理与前端交互约定

### 干事创建/批量导入（admin）
- 单个 POST：匹配 `users.class_name=? AND name=?` → 命中则绑 user_id（不发密码）；未命中则 `user_id=0`，生成随机初始密码 `Math.random().toString(36).slice(2,8)`（6 位），bcrypt(SALT_ROUNDS=10) 入库，响应一次性回传明文 `{ message:'已添加', password }`（映射成功时 password 为 undefined）。
- 批量 upload：body `{staffList:[{department,class,name}]}`，逐条同上；无效行静默丢弃；warning 结构 `{ row: '${class} ${name}', reason: '未在平台注册，已分配初始密码' }`；⚠️ 批量接口**不回传明文密码**（只提示已分配）。返回 `{ inserted, warnings }`。
- DELETE `/api/duty/staff/:id`：级联删 attendance → score_record → staff；以最后一条 DELETE 的 `changes()`===0 判 `'干事不存在'` 404，否则 `'已移除'`。

### duty.html 用户面板状态机（public/js/duty.js renderDutyButton）
后端每格下发 `status`，前端按钮映射：

| status | class | 文案 | 交互 | 对应后端条件 |
|---|---|---|---|---|
| `pending`（多为合成兜底） | duty-btn-pending | 签到 | 点击 → sign-in(sid, staff, period) | 无 attendance 行或 status='pending' |
| `signed_in` | duty-btn-active | mm:ss 计时器（每秒 tick，起始 = sign_in_time 解析为 UTC）+ 点击签退 | 点击 → sign-out(attendance_id)；粒子特效+toast | sign-in 成功后 |
| `completed` 且 total≥0 | duty-btn-done | `签退 ✓` | 无 | sign-out 后 score_duration=0 |
| `completed` 且 total<0 | duty-btn-warn | `签退 ✓ -0.5` | 无 | 在岗<120s |
| `absent` | duty-btn-absent | `✕ 缺岗` | 无 | autoMarkAbsent 已标记 |

- 头部徽标：任一时段有任一人 `signed_in` 显示 `🟡 签到中...`。
- 计分列：双方都 pending → `-`；双方 total 都 0 → 绿色 `0`；否则输出 `姓±分`（≤768px 只显示姓名首字符）。
- 页面加载失败/无排班 → EmptyState（`今日无排班`），管理员可见"排班管理"入口链接。
- 图例 badge：未签到 / 签到中(#FFF3CD) / 已完成(#D4F5E2) / 在岗不足(#FFDAD6) / 缺岗(灰)。
- ⚠️ 前端死代码：render 循环里算了 `past`（超过 auto_absent_min 截止）但从未使用。
- duty-admin.html（requireAdmin 门禁）：月历点选某天弹窗手动排班/删除；评分列表支持筛选、单条销分与勾选批量销分（均要求选销分人下拉 + 输入其密码）；导出走客户端 CSV（周/月范围）。

---

## 提取来源
- `functions/api/duty.js`（全文 493 行，所有 handler 逻辑与错误文案原文）
- `functions/api/_utils.js`：L243-259（五表 DDL、索引、时段种子与每次启动强制的 migration UPDATE）、L175-181（isAdmin）、L497-533（autoCleanup 中 L528 流水 14 天保留）、L678-693（createNotification 仅向接受 messages 功能的用户投递）
- `functions/api/[[path]].js`：L140-163（duty 路由表与适配器 EN/RU/RQ/EURL）、L38-44（适配器定义）、L208-269（全局中间件链与 gate 语义）
- `public/js/duty.js`（全文 254 行：状态渲染、计时器、部门统计展示）
- `public/js/duty-admin.js`（全文 729 行：干事管理、排班月历、评分/销分/批量销分 UI、客户端 CSV 导出）
- `_backups/d1-remote-backup-20260826.sql`（线上库 DDL 与四个 duty 索引佐证）

## ⚠️ 待确认 / 疑点汇总
1. generate 的轮转恢复公式 `floor(li/2)+1` 与"每天 dayIdx+1"的滑窗语义不一致，疑为 bug（正确应约等于 `li+1`）。
2. sign-in/sign-out 不校验当前登录人与目标 staff 的关系 → 理论上任何能打到 API 的请求（甚至未登录，因 router 不强制 user）可代任何人签到/签退。
3. scores/cancel 用 RQ 适配器完全绕过 JWT，仅凭 body 中 admin_id+password；batch-cancel 却要求双因子——两者策略不一致是否有意？
4. cancel 清零 attendance 会波及该 (date,staff,period) 的**所有**计分字段，若同时存在 modify 写入的其他流水，会与流水表不一致。
5. autoMarkAbsent 中 small_break"一人到岗两人免责"、big_break 独立判定 —— 业务意图如此还是历史遗留，待产品确认。
6. 种子后的 migration UPDATE 每次部署都会覆写六个默认时段的管理员修改。
7. duty_score_record 14 天自动清理与"长期积分档案"需求是否冲突。
8. `/api/duty/schedule/export` 服务端导出无 BOM 且无前端调用方，疑似弃用候选。
