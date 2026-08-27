<div align="center">

<img src="./public/images/emblem.png" alt="" height="72" />

# 雅礼团委-通办

[![version](https://img.shields.io/badge/version-2.6.0.0--beta-blue?style=flat-square)]()
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square&logo=node.js&logoColor=white)]()
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-Functions-f38020?style=flat-square&logo=cloudflare&logoColor=white)]()
[![Vanilla JS](https://img.shields.io/badge/前端-原生%20JS%20%7C%20CSS%20%7C%20HTML-f7df1e?style=flat-square)]()

**长沙市雅礼中学团委工作管理平台** — 一站式线上办事与服务系统。

[功能](#功能) · [技术架构](#技术架构) · [安全设计](#安全设计) · [项目结构](#项目结构) · [快速开始](#快速开始) · [部署指南](#部署指南) · [API 概览](#api-概览) · [成就系统](#成就系统) · [个性化](#个性化) · [致谢](#致谢)

</div>

> [!NOTE]
> 此为展示用途的示例项目，非雅礼中学官方平台。至少现在不是 :)

---

## 功能

### 报修服务

用户可提交校园设施报修工单，实时跟踪处理进度。

- **分类提交**：选择问题类型（课桌椅、照明、多媒体、门窗、其他）
- **图片凭证**：支持上传现场照片辅助定位问题
- **状态流转**：待处理 → 处理中 → 已完成，更新可追溯
- **管理员指派**：管理员查看全部工单，分配处理人并添加处理备注
- **工单评论**：用户与管理员可在工单下留言沟通

### 公告通知

团委信息发布平台，支持图文混排、审核流程与评论互动。

- **图文混排**：支持多张图片上传与内联展示
- **审核流程**：提交后进入待审状态，管理员批准后公开发布
- **评论回复**：用户可在公告下评论，支持编辑与删除
- **分类标签**：公告可按类别组织

### 动态

实时的团委动态信息流。

- **实时信息流**：按时间倒序排列的团委动态
- **图片发布**：支持配图动态
- **游标分页**：基于游标的无限滚动加载
- **评论互动**：对动态消息进行评论

### 投票系统

创建和参与各类投票，支持多种题型。

- **题型支持**：单选题、多选题、主观题混合编排
- **配图选项**：选项可附带图片说明
- **匿名投票**：支持匿名模式
- **CSV 导出**：投票结果可导出为 CSV 文件
- **防刷票**：Turnstile 人机验证保护

### 财务管理

团委收支记录与报销管理体系。

- **收支记录**：逐笔记录收入与支出明细
- **月汇总图表**：按月自动生成收支汇总与趋势图
- **标签过滤**：按类型（收入/支出）和标签筛选
- **报销流程**：提交报销申请 → 审批 → 标记已完成
- **部门隔离**：非管理员仅查看本部门记录

### 千人报告厅预约

报告厅时间线预约与审核系统。

- **时间线拖选**：可视化时间线选择空闲时段
- **冲突检测**：自动检测时段冲突，提示调整
- **审核流程**：提交后由审核人批准或拒绝
- **撤销与删除**：用户可撤销自己的待审申请
- **甘特图**：审核时以甘特图展示冲突情况

### 值日考勤

双人值岗签到/签退与自动评分系统。

- **双人签到**：每个时段两名值日生，需分别签到与签退
- **自动评分**：根据签到时长自动计算得分（签退时计算）
- **排班生成**：自动生成未来 60 个工作日的排班（跳过周末）
- **缺勤自动标记**：时段结束后系统自动标记缺勤并扣分
- **CSV 导出**：排班表与考勤记录可导出
- **扣分管理**：管理员可手动调整分数或取消记录

### 审核系统

图片与公告的审核机制。

- **图片审核**：用户上传图片后进入待审，管理员批准后可见
- **公告审核**：新公告需管理员批准方可发布
- **审核意见**：拒绝时填写审核原因，反馈给提交者
- **状态跟踪**：提交者可查看审核进度

### 成员管理

用户注册、角色分配与批量管理。

- **角色体系**：公共用户 → 成员 → 干事 → 教师 → 管理员 → 所有者
  - `public`：仅查看值日面板
  - `member`：访问大部分功能
  - `officer`：干事权限
  - `teacher`：教师权限（财务、值日管理）
  - `admin`：管理面板全权限
  - `owner`：网站所有者（超级管理员）
- **注册审批**：新用户注册需管理员批准
- **批量导入**：三阶段导入（验证 → 批量去重 → 并发 bcrypt 哈希），支持大量用户快速导入
- **部门管理**：预设 8 个团委部门，用户归属管理
- **密码重置**：管理员可重置任意用户密码

### 成就系统

34 个隐藏成就，通过特定行为触发解锁。

| 类别 | 示例成就 |
|---|---|
| 探索发现 | 夜猫子、早起的鸟儿、时间旅行者、考古学家 |
| 交互操作 | 击掌！、入侵者、截图侠、开发者 |
| 数据累计 | 社交恐怖分子、键盘侠、提案王、阅览室常客 |
| 时间关联 | 全勤奖、月光族、周年庆、鸽子 |
| 趣味彩蛋 | 五彩斑斓的黑、黑白无常、真的会有人看这个吗？ |

详细触发条件见[成就系统](#成就系统)章节。

### 个性化

用户可自定义界面外观与交互效果。

- **主题模式**：浅色模式、深色模式、跟随系统
- **主题风格**：Material（默认 Material 3）、Newspaper（现代报纸风，哥特体标题 + Georgia 衬线，纯黑白灰；早期测试功能，需站长邀请启用）
- **强调色**：6 种强调色（蓝色、绿色、紫色、橙色、红色、青色）
- **字体大小**：三级字体缩放（小、中、大）
- **Super Graphic**：粒子特效、卡片倾斜、烟花动画、彩纸散落

### 反馈

用户可提交建议与问题报告。

- **建议提交**：填写反馈内容，供管理员查看
- **后台管理**：管理员可查看、删除反馈记录

---

## 技术架构

### 前端架构

| 层次 | 技术选型 | 说明 |
|---|---|---|
| **核心** | 原生 HTML5 + CSS3 + JavaScript (ES Modules) | 无框架依赖，零构建步骤 |
| **设计系统** | Material 3 (Material You) | 基于 CSS 自定义属性实现动态主题体系 |
| **页面路由** | 多页应用 (MPA) | 20+ 静态 HTML 页面，通过 Cloudflare Pages 直接托管 |
| **导航** | 固定顶部导航栏 + 自适应底部胶囊标签栏 | 使用频率排序，滚动隐藏/显示 |
| **缓存** | localStorage LRU 缓存 | 3 天 TTL，基于 hash 的变更检测（`/api/sync`） |
| **动画** | View Transitions API | 跨页面平滑过渡动画 |
| **图标** | 内联 SVG（~50 个，Lucide 风格） | 零外部请求 |

### 后端架构

| 层次 | 技术选型 | 说明 |
|---|---|---|
| **运行时** | Cloudflare Workers (ES Modules) | 边缘计算，全球分发 |
| **路由** | `[[path]].js` catch-all pattern | 自动匹配 ~106 个路由端点 |
| **认证** | JWT（`jose` 库）| 无状态认证，HTTP-only Cookie |
| **密码** | bcryptjs (10 rounds) | 密码哈希存储 |
| **数据库** | Cloudflare D1 (SQLite) | 自动复制、强一致性 |
| **存储** | Cloudflare R2 | 图片上传与存取，兼容 S3 API |
| **人机验证** | Cloudflare Turnstile | 前端 widget + 服务端验证 |
| **安全** | CSP 安全头 + Rate Limiting | Token bucket 算法，每分钟限制 |

### 数据流

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  浏览器端    │    │  Cloudflare  │    │  Workers Runtime  │    │   D1 / R2        │
│  fetch()     │───→│  CDN Edge    │───→│  JWT Verify →     │───→│  SQL / Object    │
│  Cache Lookup│    │  (缓存/压缩)  │    │  Router → Handler  │    │  Storage         │
└─────────────┘    └──────────────┘    └──────────────────┘    └──────────────────┘
       ↑                                       │
       └───────────────── 缓存响应 ──────────────┘
                         (localStorage Sync)
```

---

## 安全设计

| 层次 | 措施 |
|---|---|
| **认证** | JWT（`jose`），HTTP-only + Secure + SameSite=Strict Cookie |
| **授权** | 6 级角色层级（public < member < officer < teacher < admin < owner） |
| **人机验证** | Turnstile CAPTCHA（登录、注册、投票、财务敏感操作） |
| **XSS 防护** | `escapeHtml()` 文本转义、`attrEscape()` 属性转义、`data-*` 属性 + 事件委托 |
| **SQL 注入** | D1 参数化查询（`?` 占位符绑定） |
| **速率限制** | Token bucket 算法，按 IP 地址限制请求频率 |
| **传输安全** | CSP 安全策略头、CORS 白名单、HSTS |
| **空闲超时** | 20 分钟无操作自动登出，18 分钟预警提示 |
| **密码安全** | bcryptjs（10 轮 salt），密码最小 6 位、最大 50 位 |
| **数据隔离** | 基于角色的数据访问控制，部门级可见性隔离 |

> [!TIP]
> 所有用户输入均经过服务端参数化查询处理，XSS 防护在前端渲染层完成（`escapeHtml` + `attrEscape` 双重保障）。

---

## 项目结构

```
├── functions/api/                     后端 API（18 个领域模块）
│   ├── [[path]].js                     路由入口（~106 个路由端点）
│   ├── _utils.js                       工具函数（DB 初始化、JWT、bcrypt、速率限制、验证）
│   ├── auth.js                         认证（登录、注册、JWT 校验、个人信息修改）
│   ├── admin.js                        管理面板（成员、注册、角色、批量操作、导入、设置）
│   ├── announcements.js                公告（CRUD、审核、图片管理）
│   ├── issues.js                       报修服务（CRUD、状态更新）
│   ├── polls.js                        投票系统（CRUD、投票、结果导出）
│   ├── finance.js                      财务（CRUD、报销、完成标记）
│   ├── halls.js                        报告厅预约（CRUD、冲突检测、审核）
│   ├── duty.js                         值日考勤（人员、排班、签到、评分、时段配置）
│   ├── reviews.js                      审核（图片/公告审核）
│   ├── feed.js                         动态（消息列表、评论）
│   ├── comments.js                     评论（CRUD）
│   ├── activities.js                   活动（CRUD、志愿者报名）
│   ├── achievements.js                 成就（解锁、计数检查）
│   ├── banner.js                       横幅（首页公告+预约数据）
│   ├── settings.js                     公共设置（站点开关状态）
│   ├── sync.js                         数据同步（hash 变更检测）
│   ├── feedback.js                     反馈（提交、管理）
│
├── public/                             前端静态文件
│   ├── index.html                      首页（1.8s 后自动跳转至服务面板）
│   ├── services.html                   服务面板（报修、公告横幅、快捷操作）
│   ├── login.html                      登录/注册（Turnstile 验证）
│   ├── moment.html                     动态信息流（无限滚动）
│   ├── announcements.html              公告列表（创建/编辑/删除）
│   ├── announcement.html               公告详情 + 评论
│   ├── polls.html                      投票列表
│   ├── poll.html                       投票详情 + 投票（Turnstile 防护）
│   ├── finance.html                    财务仪表盘（记录、图表、报销）
│   ├── activities.html                 活动列表 + 志愿者报名
│   ├── duty.html                       值日签到面板（无需登录）
│   ├── duty-admin.html                 值日管理（人员、排班、评分）
│   ├── admin.html                      管理面板（成员、注册、角色、危险操作）
│   ├── settings.html                   个人设置（修改信息、密码）
│   ├── personalize.html                个性化（主题、颜色、字体、特效）
│   ├── feedback.html                   反馈提交
│   ├── about.html                      关于页面（系统状态、彩蛋）
│   ├── changelog.html                  更新日志
│   ├── thanks.html                     开源软件致谢
│   ├── 404.html                        404 页面（含越权检测成就）
│   ├── 410.html                        410 页面（已删除功能）
│   ├── debug.html                      调试页面
│   │
│   ├── css/
│   │   ├── style.css                   全局样式入口（@import 主题文件）
│   │   ├── graphic.css                 Super Graphic 特效样式
│   │   ├── material/                   Material 3 主题（默认）
│   │   │   ├── style.css               主题入口（@import tokens/base/components/pages）
│   │   │   ├── theme-light.css         浅色主题 Design Tokens
│   │   │   ├── theme-dark.css          深色主题 Design Tokens 与组件覆盖
│   │   │   ├── base/                   基础样式（reset、排版、工具类）
│   │   │   ├── components/             组件样式（按钮、卡片、表单、导航、模态框等）
│   │   │   └── pages/                  页面样式（值日、个性化、财务等）
│   │   └── newspaper/                  Newspaper 报纸主题（可选）
│   │       ├── style.css               主题入口（@import tokens/base/components/pages）
│   │       ├── theme-tokens.css        .theme-newspaper 变量覆盖（黑白灰、哥特体、直角）
│   │       ├── base/                   纸张纹理背景、链接下划线、双线分隔
│   │       ├── components/             报头导航、细线卡片、直角按钮、哥特体徽章
│   │       └── pages/                  非对称大标题、公告横幅、移动端适配
│   │
│   ├── js/
│   │   ├── api.js                      核心 API 客户端、图标库、弹窗系统、成就引擎、个性化
│   │   ├── nav.js                      导航渲染、胶囊标签栏、使用频率排序
│   │   ├── auth.js                     前端认证守卫（requireAuth / requireAdmin / requireMember）
│   │   ├── utils.js                    工具函数（时间格式化、HTML 转义、班级验证）
│   │   ├── services.js                 服务面板业务逻辑
│   │   ├── moment.js                   动态页业务逻辑（游标分页、评论）
│   │   ├── announcements.js            公告列表页业务逻辑
│   │   ├── announcement.js             公告详情页业务逻辑
│   │   ├── polls.js                    投票列表页业务逻辑
│   │   ├── poll.js                     投票详情页业务逻辑
│   │   ├── finance.js                  财务页业务逻辑（筛选、图表、模态框）
│   │   ├── activities.js              活动页业务逻辑（志愿者报名、CRUD）
│   │   ├── duty.js                     值日签到面板业务逻辑（状态机）
│   │   ├── duty-admin.js               值日管理业务逻辑（CRUD、排班生成）
│   │   ├── admin.js                    管理面板业务逻辑（成员、注册、设置）
│   │   ├── settings.js                 个人设置业务逻辑
│   │   ├── feedback.js                 反馈提交业务逻辑
│   │   ├── changelog-data.js           更新日志数据（版本发布记录）
│   │   ├── lightbox.js                 图片灯箱查看器（缩放、平移、键盘导航）
│   │   └── graphic.js                  Super Graphic 粒子引擎（烟花、彩纸、卡片倾斜）
│   │
│   └── images/
│       ├── emblem.png                  雅礼中学校徽（logo）
│       ├── league-emblem.png           共青团团徽
│       └── the-office.png              "The Office" 彩蛋图片
│
├── wrangler.toml                       Cloudflare Pages 配置（D1 绑定、环境变量、路由）
├── package.json                        npm 配置（依赖、脚本命令）
├── setup.ps1                           一键部署脚本（PowerShell 7+）
└── LICENSE                             AGPL-3.0 许可
```

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 20 LTS 或更新版本
- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- Git

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/ChidcGithub/Yali-Tongban-Platform.git
cd Yali-Tongban-Platform

# 2. 安装依赖
npm install

# 3. 登录 Cloudflare（获取 D1 数据库访问权限）
npx wrangler login

# 4. 启动本地开发服务器
npm run dev
```

> [!TIP]
> 本地开发时 D1 和 R2 使用 wrangler 的模拟实现，无需实际创建远程资源即可开发调试。

### 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动本地开发服务器（含热重载） |
| `npm run deploy` | 编译并部署到 Cloudflare Pages |
| `npm run db:init` | 手动初始化数据库（部署脚本已自动处理） |

---

## 部署指南

### 手动部署

```bash
# 登录 Cloudflare
npx wrangler login

# 部署到 Cloudflare Pages
npm run deploy
```

### 一键部署

项目包含 `setup.ps1` PowerShell 脚本，适用于全新项目初始化：

```powershell
# 在项目根目录执行
.\setup.ps1
```

脚本自动完成以下步骤：

1. 创建 D1 数据库 `yali-tongban-db`
2. 创建 R2 存储桶 `yali-tongban-images`
3. 生成并设置 `JWT_SECRET` 环境变量
4. 初始化数据库表结构
5. 创建默认管理员账号
6. 部署到 Cloudflare Pages

### 环境变量配置

以下变量需在 Cloudflare Pages 项目面板 → Settings → Environment variables 中设置：

| 变量 | 说明 | 必填 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥（任意长随机字符串） | 是 |
| `TURNSTILE_SECRET` | Cloudflare Turnstile 服务端密钥 | 是 |
| `R2_BUCKET` | R2 存储桶名称 | 是 |
| `R2_ACCESS_KEY_ID` | R2 API 访问密钥 ID | 是 |
| `R2_SECRET_ACCESS_KEY` | R2 API 访问密钥 Secret | 是 |

> [!IMPORTANT]
> 切勿将上述密钥提交至版本控制系统。在 `wrangler.toml` 中使用 `[vars]` 引用环境变量名，实际值在 Cloudflare 面板设置。

### 数据库

D1 数据库由 `functions/api/_utils.js` 中的 `initDB()` 函数自动初始化，该函数在首次请求时执行以下操作：

- 创建 `users` 表（含 `achievements` JSON 列）
- 创建 `announcements`、`issues`、`polls`、`finance`、`comments`、`chat_messages` 等业务表
- 创建 5 个值日考勤表（`duty_staff`、`duty_schedule`、`duty_attendance`、`duty_score_record`、`duty_period_config`）
- 插入值日时段默认配置数据

---

## API 概览

系统共约 **106 个 API 端点**，按模块分组如下。

<details>
<summary><b>认证 (10 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| POST | `/api/auth/login` | 用户登录（返回 JWT Cookie） | 否 |
| POST | `/api/auth/signin` | 登录别名 | 否 |
| POST | `/api/auth/register` | 用户注册（需审批） | 否 |
| GET | `/api/auth/me` | 获取当前用户信息 | 是 |
| GET | `/api/auth/check-name` | 检查用户名是否可用 | 否 |
| POST | `/api/auth/logout` | 退出登录（清除 Cookie） | 否 |
| POST | `/api/auth/change-password` | 修改密码 | 是 |
| POST | `/api/auth/change-name` | 修改显示名 | 是 |
| POST | `/api/auth/change-class` | 修改班级 | 是 |
| POST | `/api/auth/change-department` | 修改部门 | 是 |

</details>

<details>
<summary><b>报修服务 (4 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/issues` | 获取报修列表（未登录仅公开信息） | 否 |
| POST | `/api/issues` | 创建报修 | 否 |
| PUT | `/api/issues/{id}/status` | 更新报修状态 | admin |
| DELETE | `/api/issues/{id}` | 删除报修 | admin |

</details>

<details>
<summary><b>公告 (7 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/announcements` | 获取公告列表 | 否 |
| GET | `/api/announcements/{id}` | 获取公告详情 | 否 |
| POST | `/api/announcements` | 创建公告 | 是 |
| PUT | `/api/announcements/{id}` | 编辑公告（重置审核状态） | 是 |
| DELETE | `/api/announcements/{id}` | 删除公告 | owner/admin |
| PUT | `/api/announcements/{id}/status` | 审核公告（批准/拒绝） | admin |
| POST | `/api/announcements/{id}/images` | 添加公告图片 | 是 |

</details>

<details>
<summary><b>投票 (8 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/polls` | 获取投票列表 | 否 |
| POST | `/api/polls` | 创建投票 | admin |
| GET | `/api/polls/{id}` | 获取投票详情 | 否 |
| POST | `/api/polls/{id}/vote` | 提交投票 | 否（Turnstile） |
| GET | `/api/polls/{id}/results` | 获取投票结果 | creator/admin |
| GET | `/api/polls/{id}/export` | 导出 CSV 结果 | creator/admin |
| GET | `/api/polls/{id}/my-vote` | 获取我的投票 | 否 |
| DELETE | `/api/polls/{id}` | 删除投票 | creator/admin |

</details>

<details>
<summary><b>财务 (6 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/finance` | 获取财务记录 | 是 |
| POST | `/api/finance` | 创建财务记录 | 是 |
| PUT | `/api/finance/{id}/complete` | 标记完成 | admin |
| PUT | `/api/finance/{id}/reimburse` | 标记已报销 | admin |
| PUT | `/api/finance/{id}/unreimburse` | 取消报销标记 | admin |
| DELETE | `/api/finance/{id}` | 删除记录 | admin |

</details>

<details>
<summary><b>报告厅预约 (6 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/hall/bookings` | 获取预约列表 | 是 |
| POST | `/api/hall/bookings` | 创建预约 | 是 |
| POST | `/api/hall/bookings/{id}/withdraw` | 撤销待审预约 | 是 |
| DELETE | `/api/hall/bookings/{id}` | 删除预约 | 是 |
| POST | `/api/hall/bookings/{id}/review` | 审核预约 | reviewer |
| GET | `/api/hall/bookings/pending` | 待审预约（含冲突检测） | reviewer |

</details>

<details>
<summary><b>值日考勤 (18 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/duty/staff` | 获取所有值日人员 | 否 |
| POST | `/api/duty/staff` | 添加值日人员 | admin |
| POST | `/api/duty/staff/upload` | 批量导入值日人员 | admin |
| DELETE | `/api/duty/staff/{id}` | 删除值日人员 | admin |
| POST | `/api/duty/schedule/generate` | 自动生成 60 天排班 | admin |
| GET | `/api/duty/schedule` | 获取排班表（日期范围） | 否 |
| GET | `/api/duty/schedule/export` | 导出排班表 CSV | 否 |
| GET | `/api/duty/attendance/today` | 获取今日排班+考勤（含自动缺勤标记） | 否 |
| POST | `/api/duty/attendance/sign-in` | 签到 | 否 |
| POST | `/api/duty/attendance/sign-out` | 签退（计算得分） | 否 |
| GET | `/api/duty/scores` | 获取评分记录 | 否 |
| POST | `/api/duty/scores/modify` | 手动修改评分 | admin |
| POST | `/api/duty/scores/cancel` | 取消评分记录（需管理员密码验证） | admin |
| POST | `/api/duty/schedule/manual` | 手动设置某日排班 | admin |
| DELETE | `/api/duty/schedule/manual` | 删除某日排班 | admin |
| POST | `/api/duty/schedule/clear-all` | 清空所有排班/考勤/评分 | admin |
| GET | `/api/duty/periods` | 获取时段配置 | 否 |
| PUT | `/api/duty/periods` | 更新时段配置 | admin |
| GET | `/api/duty/admins` | 获取管理员列表 | 否 |

</details>

<details>
<summary><b>动态 (4 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/chat/messages` | 获取动态消息（游标分页） | 是 |
| DELETE | `/api/chat/messages/{id}` | 删除动态消息 | admin |
| POST | `/api/feed/{id}/comment` | 添加动态评论 | 是 |
| GET | `/api/feed/{id}/comments` | 获取动态评论 | 是 |

</details>

<details>
<summary><b>评论 (5 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/comments/{type}/{id}` | 获取评论（type: announcement/issue） | 否 |
| POST | `/api/comments` | 创建评论 | 是 |
| PUT | `/api/comments/{id}` | 编辑评论 | 是 |
| DELETE | `/api/comments/{id}` | 删除评论 | 是/admin |

</details>

<details>
<summary><b>活动 (6 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/activities` | 获取活动列表 | 否 |
| POST | `/api/activities` | 创建活动 | 是 |
| DELETE | `/api/activities/{id}` | 删除活动 | admin |
| POST | `/api/activities/{id}/volunteer` | 报名志愿者 | 否（Turnstile） |
| DELETE | `/api/activities/{id}/volunteer` | 取消报名 | 是 |
| GET | `/api/activities/{id}/volunteers` | 获取志愿者名单 | 否 |

</details>

<details>
<summary><b>审核 (4 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/reviews` | 获取审核列表 | 是 |
| POST | `/api/reviews` | 提交审核 | 是 |
| PUT | `/api/reviews/{id}/review` | 审核操作（批准/拒绝） | admin |
| DELETE | `/api/reviews/{id}` | 删除审核记录 | admin |

</details>

<details>
<summary><b>管理面板 (20 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/api/admin/members` | 获取已批准成员列表 | admin |
| GET | `/api/admin/registrations` | 获取待审批注册 | admin |
| POST | `/api/admin/registrations/{id}/approve` | 批准注册 | admin |
| POST | `/api/admin/registrations/{id}/reject` | 拒绝注册 | admin |
| GET | `/api/admin/users/{id}` | 获取用户详情 | admin |
| DELETE | `/api/admin/users/{id}` | 删除用户 | admin |
| GET | `/api/admin/users` | 获取所有用户 | admin |
| PUT | `/api/admin/users/{id}/role` | 修改角色 | admin |
| PUT | `/api/admin/users/{id}/reset-password` | 重置密码 | admin |
| PUT | `/api/admin/users/{id}/name` | 修改用户姓名 | admin |
| PUT | `/api/admin/users/{id}/department` | 设置部门 | admin |
| POST | `/api/admin/users/batch-import` | 批量导入用户 | admin |
| POST | `/api/admin/users/batch-approve` | 批量批准注册 | admin |
| GET | `/api/admin/settings` | 获取站点设置 | admin |
| PUT | `/api/admin/settings` | 更新站点设置 | owner |
| GET | `/api/admin/storage` | 获取存储统计 | admin |
| POST | `/api/admin/clear-all` | 清空全部数据 | owner |
| DELETE | `/api/admin/finance/{id}` | 删除任意财务记录 | admin |
| GET | `/api/admin/feedback` | 获取反馈列表 | admin |
| DELETE | `/api/admin/feedback/{id}` | 删除反馈 | admin |

</details>

<details>
<summary><b>其他 (4 个端点)</b></summary>

<br>

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| POST | `/api/achievements/unlock` | 解锁成就 | 是 |
| POST | `/api/achievements/check-counts` | 检查计数类成就 | 是 |
| GET | `/api/banner` | 获取横幅数据 | 否 |
| GET | `/api/settings` | 获取公共设置（站点开关） | 否 |
| POST | `/api/sync` | 数据同步（hash 变更检测） | 否 |

</details>

---

## 成就系统

系统内置 34 个隐藏成就，通过特定用户行为触发解锁。

### 解锁机制

成就解锁采用 **客户端检测 + 服务端验证** 的双重确认机制：

1. **客户端检测**：用户执行特定操作时，前端代码检测条件是否满足
2. **服务端验证**：调用 `POST /api/achievements/unlock`，服务端验证成就 ID 合法性并写入数据库
3. **离线缓存**：网络不可用时，成就暂存 localStorage，下次登录时自动同步
4. **计数检查**：计数类成就（如消息数、评论数）通过 `POST /api/achievements/check-counts` 由服务端查询数据库统计

### 全部成就列表

| ID | 名称 | 触发条件 | 检测位置 |
|---|---|---|---|
| `read_all_changelog` | 真的会有人看这个吗？ | 展开所有更新日志条目并停留 30 秒 | changelog.html |
| `color_freak` | 五彩斑斓的黑 | 10 秒内切换 6 次以上主题色 | personalize.html |
| `night_owl` | 夜猫子 | 凌晨 00:00–05:00 登录 | api.js |
| `early_bird` | 早起的鸟儿 | 清晨 06:00–08:00 登录 | api.js |
| `high_five` | 击掌！ | 连续点击 logo 10 次 | nav.js |
| `collector` | 收藏家 | 解锁半数以上（17+）成就 | api.js |
| `chatty` | 社交恐怖分子 | 发送 50+ 条动态消息 | 服务端计数 |
| `commenter` | 键盘侠 | 累计 10+ 评论或议题 | 服务端计数 |
| `proposer` | 提案王 | 创建 5+ 议题 | 服务端计数 |
| `time_traveler` | 时间旅行者 | 查看 90 天前的内容 | announcement.js |
| `intruder` | 入侵者 | 触发 404 越权警告 | 404.html |
| `reset_master` | 删繁就简 | 在个性化页面重置所有设置 | personalize.html |
| `locked_out` | 被拒之门外 | 连续 3 次输错密码 | login.html |
| `reader` | 阅览室常客 | 累计查看 50 条公告 | announcement.js |
| `power` | Power...?Point. | 成为管理员或站长 | api.js |
| `extrovert` | e人 | 发送 100+ 条动态消息 | 服务端计数 |
| `introvert` | i人 | 浏览动态 5+ 次而不发一言 | 未实现 |
| `lightning` | 闪电侠 | 消息发出后 3 秒内撤回 | 未实现 |
| `archaeologist` | 考古学家 | 查看 180 天前的公告 | api.js |
| `ocd` | 黑白无常 | 深色/浅色模式切换 20+ 次 | personalize.html |
| `night_owl2` | 夜猫子2.0 | 连续 3 天凌晨登录 | api.js |
| `novice` | 初来乍到 | 首次提交议题、评论或投票 | api.js |
| `pigeon` | 鸽子 | 注册后超过 31 天未登录 | login.html |
| `dev` | 开发者 | 在控制台输入特定指令 | api.js |
| `easter_egg` | 不是彩蛋 | 点击关于页面校徽 5 次 | about.html |
| `screenshot` | 截图侠 | 尝试复制页面图片 | api.js |
| `frequent_404` | 404常客 | 累计访问 404 页面 3+ 次 | 404.html |
| `super_graphic` | Super Graphic | 开启华丽动画效果 | personalize.html |
| `attendance` | 全勤奖 | 连续 7 天登录 | login.html |
| `moonlight` | 月光族 | 在月底最后一天登录 | login.html |
| `anniversary` | 周年庆 | 注册满一整年那天登录 | login.html |
| `cookie_monster` | 浏览器吃下了所有饼干 | 接受 Cookie 告知 | api.js |
| `feedback_first` | 我有话要说 | 首次提交反馈 | feedback.html |
| `feedback_tenth` | 反馈反馈反馈反馈！ | 累计提交 10 次反馈 | feedback.html |

### 解锁反馈

- **Toast 提示**：解锁时自动弹出 Toast 通知，显示成就名称和图标
- **成就备份**：所有成就通过 JWT token 更新同步至服务端，下次登录时自动恢复

---

## 个性化

### 主题系统

支持三种主题模式与两种主题风格：

**主题模式**（明暗）：

| 模式 | 实现方式 | 说明 |
|---|---|---|
| 浅色模式 | CSS 变量 + `data-theme="light"` | 默认明亮主题 |
| 深色模式 | `data-theme="dark"` | 基于 Material 3 暗色调色板 |
| 跟随系统 | `prefers-color-scheme` 媒体查询 | 自动匹配系统设置 |

**主题风格**（设计语言）：

| 风格 | 实现方式 | 说明 |
|---|---|---|
| Material | 默认，无额外类 | Material 3 (Material You) 设计系统 |
| Newspaper | `<html>` 添加 `.theme-newspaper` 类 | 现代报纸风：哥特体（UnifrakturCook）大标题 + Georgia 衬线正文，纯黑白灰配色，非对称布局，直角形状与细线分隔。可与深色模式叠加（`.theme-newspaper.dark`）。**早期测试功能**：纳入功能开关系统，站长需启用并邀请后用户才能在个性化中切换 |

主题 CSS 采用分层架构，每个主题独立文件夹（`css/material/`、`css/newspaper/`），内部按 `base/components/pages` 三层组织，由 `style.css` 入口文件 `@import` 装载。

用户选择存储在 `localStorage['personalize']` 中（含 `theme`、`style` 字段），页面加载时检测并应用。

### 强调色

| 颜色 | CSS 变量 `--md-source` | 视觉效果 |
|---|---|---|
| 蓝色 | `#1562ff` | 默认，稳重 |
| 绿色 | `#2e7d32` | 自然 |
| 紫色 | `#7b1fa2` | 典雅 |
| 橙色 | `#e65100` | 活力 |
| 红色 | `#c62828` | 醒目 |
| 青色 | `#00838f` | 清新 |

### Super Graphic

当开启 Super Graphic 后，`<html>` 元素添加 `super-graphic` 类，触发以下效果：

- **粒子烟花**：Canvas 粒子系统，页面交互时触发
- **卡片倾斜**：CSS 3D transforms，鼠标悬停卡片时产生 3D 倾斜效果
- **彩纸散落**：动态生成的 DOM 碎片 + CSS 动画
- **按钮破碎**：点击按钮时以 `clip-path` 切割为 4 块飞出

Super Graphic 状态存储在 `localStorage['personalize']` 中 `super-graphic` 字段。

---

## 致谢

本项目使用了大量开源软件，完整列表见 [`/thanks`](https://yali-tongban.pages.dev/thanks.html)。

---

## 许可证

[GNU Affero General Public License v3.0](LICENSE) — 详见 LICENSE 文件。
