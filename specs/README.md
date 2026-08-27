# 雅礼团委-通办 · 全量功能规格（AI 重写蓝本）

> 本目录是对现有系统**穷尽式提取**的成果：7 份文档、约 284KB、3600+ 行。
> 目标：任何 AI（或人）凭此包可**完整重写**整个平台，不丢功能、不丢细节，
> 并顺手修掉下文「已知缺陷清单」中的全部历史问题。

---

## 一、系统一句话

长沙市雅礼中学团委一站式工作管理平台：报修工单 / 公告审核 / 动态信息流 / 投票 /
财务报销 / 报告厅预约 / 值日考勤评分 / 成就彩蛋 / 消息通知 / 功能开关，
跑在 Cloudflare Pages Functions + D1 上，前端为零构建原生 JS 多页应用。

## 二、关键事实（提取中确认，纠正旧认知）

| 事实 | 说明 |
|---|---|
| 图片存储 | **全部 base64 dataURL 存 D1 TEXT 列，没有 R2**。wrangler.toml 仅绑定 DB |
| 表数量 | 27 张（含 features / user_feature_responses / notifications） |
| API 规模 | 路由表 123 条目 ≈ 106 对外端点；响应统一 `{success, data\|error}` 包装 |
| 认证 | 自研 HMAC 图形验证码 + JWT(HS256, 24h, HttpOnly Cookie) + bcryptjs(10轮)；`token_version` 支持改密踢会话 |
| 前端架构 | 经典全局脚本（非 ES Module），固定加载序 modal→api→utils→auth→nav→页面JS；交互靠 `data-action` 全局委托调 `window[fn](dataset,target)` |
| 缓存 | localStorage `yc_*` 键 + `{data,hash,ts}` 结构，TTL 3 天，配 `/api/sync` SHA-256 hash 比对增量刷新 |
| 设计语言 | Material 3 Expressive（v2.7.0 起）：鲜活蓝 #0B57D0、28px 圆角层级、弹簧动效令牌、玻璃表面导航 |

## 三、文档索引

| 文件 | 内容 | 规模 |
|---|---|---|
| [01-database-and-utils.md](01-database-and-utils.md) | 27 张表 DDL 原文与字段语义、常量全集（部门/成就名/限制值）、JWT 与角色判定、验证码机制、全部工具函数行为、autoCleanup 清理矩阵 | 48KB |
| [02-api-platform.md](02-api-platform.md) | 平台类端点契约：auth(10)/admin(25)/features/messages/settings/banner/sync/captcha；权限规则矩阵、批量导入三阶段、关站白名单、clear-all 范围 | 35KB |
| [03-api-content-business.md](03-api-content-business.md) | 内容业务端点契约：公告状态机/评论/feed游标分页/活动/审核联动/反馈/报修/投票三表模型与CSV/报厅冲突算法；图片压缩参数 | 32KB |
| [04-api-duty.md](04-api-duty.md) | 值日领域专册：五表模型、默认六时段原值、60天排班滑动窗口轮转算法、签到窗口与自动缺勤惰性触发、评分公式(-0.5/-1)、销分双因子、CSV格式、部门统计口径、前端状态机映射 | 27KB |
| [05-frontend-pages.md](05-frontend-pages.md) | 26 页面逐页规范：用户流程/DOM容器/data-action清单/模态框/缓存键/成就触发点；横幅轮播、3D图片选择器、时间线拖选常量、admin 12分区等实现要点 | 63KB |
| [06-frontend-infra.md](06-frontend-infra.md) | 共享设施全量 API 面：HTTP客户端与重试矩阵、yc_缓存、openModal 配置契约、69个图标键、34成就引擎与分布表、个性化注入链、胶囊导航 FLIP、lightbox/graphic/captcha 契约 | 42KB |
| [07-design-system.md](07-design-system.md) | M3E 设计系统：亮暗双主题全部 Token 原值表、19 类组件视觉参数与动效曲线、断点全表、背景系统、CSP 与缓存策略、字体资产、无障碍现状 | 37KB |

## 四、重写约束（不可违反）

1. **运行时**：Cloudflare Pages Functions（ES Modules）+ D1 绑定 `DB`；兼容日期取北京时间（UTC+8）。
2. **认证语义**：JWT Cookie 属性、6 级角色权重、pending 审批流、token_version 踢会话——见 01 §认证。
3. **对外 API 兼容**：路径与方法保持不变（前端与既有习惯依赖）；响应 `{success,data|error}` 包装不变。
4. **数据兼容**：若沿用现有库，新 schema 必须**向后兼容现有 27 表**（或提供迁移脚本）；D1 中已有真实数据。
5. **业务规则保真**：值日评分公式、缺勤阈值、报厅 10 分钟容忍、投票匿名语义、公告审核流转——按 03/04 文档原样实现，除非列入下方修正清单。
6. **安全底线**：CSP 按 07 §_headers 起步并收紧；所有 SQL 参数化；XSS 双转义约定延续。

## 五、已知缺陷清单（重写时必须修复）

> 提取过程中发现的约 45 个真实问题，按严重度分级。这是本次重写相对旧版的**净改进承诺**。

### 🔴 高危（安全/数据正确性）
| # | 问题 | 位置 | 重写处置建议 |
|---|---|---|---|
| H1 | 值日签到/签退不校验登录人与 staff 归属 → 可匿名代签 | duty.js | 强制登录态 + staff 归属校验 |
| H2 | 验证码 token 无一次性消费，TTL 内可重放 | _utils.js | 引入 nonce 消费表或内存黑名单 |
| H3 | 404 页"越权审计演出"把 localStorage 前 10 条原文上屏（含 token 片段泄漏） | 404.html | 移除敏感值展示，仅展示键名 |
| H4 | 报厅创建预约无时间格式/先后顺序校验、无提交时冲突检测 | halls.js | 服务端强校验 + 冲突预检 |
| H5 | createPoll / 公告配图非原子：主行先写、后续失败留脏数据 | polls/announcements | D1 batch 事务化 |
| H6 | 关站白名单漏 captcha/check-name → 维护期无法登录 | _utils.checkSiteClosed | 补白名单 |
| H7 | admin 可改另一 admin 角色（无同级保护） | admin.js | 定义角色变更权限矩阵 |

### 🟡 中危（逻辑错误/不一致）
| # | 问题 | 处置建议 |
|---|---|---|
| M1 | polls min_role 权重表漏 teacher → 教师被拒投 | 权重表补 teacher=3 |
| M2 | 幽灵角色 officer 仅存在于邀请 SQL，无处授予 | 角色体系裁剪或补授予链路 |
| M3 | reset-password / update-role 不递增 token_version，旧会话仍有效 | 与自助改密对齐递增 |
| M4 | scores/cancel 单条仅密码双因子、batch 却 JWT+密码——策略不一 | 统一双因子 |
| M5 | 排班轮转恢复公式 floor(li/2)+1 与滑窗语义不符（疑 bug） | 以滑窗公式为准重写 |
| M6 | GET /api/finance、GET hall/bookings 内嵌 UPDATE/DELETE（副作用读） | 拆分清理为独立任务/端点 |
| M7 | delete-user 级联缺失（notifications/ufr/duty/hall/images 残留） | 补全级联删除 |
| M8 | clear-all 清理范围不对称（清 volunteers 不清 activities 等） | 明确清空范围白名单并文档化 |
| M9 | 新建公告 status='已通过' 但聊天流写'待审核'，且待审项出现在公开列表 | 统一状态机初值与可见性过滤 |
| M10 | sync changed:true 携带前端弃用的 data 大包 | 只回 hash，让客户端拉取 |
| M11 | batch-approve 对非 pending id 也报成功 | 返回真实成功/跳过计数 |
| M12 | 评论 POST 不校验 target 存在；review/issues 状态更新不校验存在性 | 存在性校验统一前置 |

### 🟢 低危（体验/代码卫生）
| # | 问题 | 处置建议 |
|---|---|---|
| L1 | 成就 introvert/lightning 无任何触发点；early_bird 文案 08:00 ≠ 代码 <9 | 补触发或移除；文案对齐 |
| L2 | cookie_monster 在 ACH_DEFS 有定义但 ACH_NAMES 缺失 → 播报退化为 id | 补名称 |
| L3 | `.reduce-animation` 类 JS 有加、CSS 无规则 → 开关无效 | 补 CSS 或移除开关 |
| L4 | 死令牌 --ease-emphasized/--dur-long；死选择器 .admin-card；section-title::after 双定义靠加载顺序覆盖 | 清理并单一来源化 |
| L5 | 断点不一致（admin 用 700px）；导航玻璃 saturate 亮 1.6/暗 1.5 | 统一断点与参数 |
| L6 | 硬编码色未 token 化且暗色异常（badge-public/甘特橙/duty-btn 系/btn hover 系） | 全面 token 化 |
| L7 | GSF.ttf 3.9MB 未转 WOFF2 且 _headers 无 *.ttf 缓存规则 | 转 woff2 + 补缓存头 |
| L8 | aria-live 仅 toast 一处；弹簧动画不响应 prefers-reduced-motion | 补充 a11y |
| L9 | settings.js 写不存在的 #userInfo；duty.js 计算缺岗 deadline 未使用；moment 缺计数成就拉动点；messages 桌面删除未实现 | 死代码清理 |
| L10 | storage 统计为估算口径 | 标注"估算"或实现精确统计 |
| L11 | features.js 被 nav/api 双路注入，守卫选择器不同可能双加载 | 单一注入点 |
| L12 | personalize 页 renderNav() 无参调用导致高亮永不生效 | 传 'personalize' |

## 六、重写建议架构（供 AI 执行时参考）

```
保留：Cloudflare Pages + Functions + D1 · 零构建可保留（或引入 esbuild 打包前端，二选一需明确）
后端：维持声明式路由表模式（[[path]].js 即 v2.7.1 的 routes 元数据驱动），模块按域拆分
前端：可升级为 ES Modules + importmap（消除全局脚本耦合），或维持现状按 05/06 规范重写
样式：按 07 规范重建 Token 层，组件层单一来源，修复 L4-L6
数据：沿用 D1 现有 27 表结构起步（保证兼容），再按 H5/M7-M9 出增量迁移
顺序建议：01 数据层 → 后端路由+auth → 值日域 → 内容业务域 → 前端基础设施 → 页面逐页搬迁 → 设计系统精修
每阶段以「测试清单」（plan.md）+ 本包各文档的契约表格做验收
```

---

*提取时间：2026-08-26 · 基于 v2.7.1.0 工作区（含未提交变更）· 提取者：ox-alpha 七路并行考古*
