# 07 · Design System 规格提取（Material 3 Expressive）

> 提取对象：`public/css/material/` 全部 15 个文件、`public/css/graphic.css`、`public/_headers`、`public/index.html`、运行时注入逻辑（`public/js/api.js`、`public/personalize.html`）。
> 所有数值均照抄源文件，未做推算。

---

## 1. 加载架构

### 1.1 @import 顺序图

入口：每个页面 `<link rel="stylesheet" href="/css/material/style.css">`（零构建，浏览器原生 @import）。

```
style.css
├─ ① theme-light.css        （:root Design Tokens）
├─ ② theme-dark.css         （.dark 覆盖 + 深色组件补丁）
├─ ③ base/reset.css         （@font-face GSF / reset / body 背景 / 选区焦点 / 滚动条 / 打印）
├─ ④ components/navigation.css   （顶栏 / 底部胶囊 / View Transitions / page-header）
├─ ⑤ components/controls.css     （按钮 / 开关 / 表单 / FAB / 上传区）
├─ ⑥ components/cards.css        （卡片 / 徽章 / 图片网格与堆叠 / action-menu）
├─ ⑦ components/overlay.css      （Modal / Toast / Lightbox / 成就Toast / Cookie横幅 / 空状态）
├─ ⑧ components/content.css      （公告横幅 / Feed / 评论 / chat-status）
├─ ⑨ components/responsive.css   （全局移动端断点 600/480/380）
├─ ⑩ pages/login.css
├─ ⑪ pages/admin.css
├─ ⑫ pages/personal.css
├─ ⑬ pages/hall.css
├─ ⑭ pages/duty.css
└─ ⑮ pages/messages.css

按需异步加载（super-graphic 开启时由 JS 注入 <link>）：
└─ graphic.css（+ graphic.js）
```

顺序敏感点：`cards.css:82` 重复定义了 `.section-title::after`（48px×2px、radius 1px），因加载晚于 `navigation.css:131`（48px×3px、radius shape-full）而**实际生效**——两处定义冲突。

### 1.2 CSS 变量三层覆盖模型

```
第 1 层  :root            theme-light.css 定义全部亮色令牌（默认值）
第 2 层  .dark (html.dark) theme-dark.css 覆盖颜色类令牌；
                          由 JS 给 documentElement 加 class（prefs.theme === 'auto' 时跟随
                          matchMedia('(prefers-color-scheme: dark)') 并监听 change）
第 3 层  inline style     document.documentElement.style.setProperty('--md-primary', 用户强调色)
                          + setProperty('--md-primary-dim', rgba(r,g,b,.8))
                          （api.js applyPersonalize()，每次页面加载执行）
```

- `.dark` 只覆盖颜色/elevation/badge 语义；shape、motion、typography、z-index、布局 legacy 别名（radius/nav-height/max-width/font）仅在 `:root` 定义一次，暗色继承。
- inline style 优先级最高，故用户强调色在亮/暗两态下都生效。

### 1.3 index.html 启动闪屏结构

- `#sco`：`position:fixed;inset:0;z-index:99999;background:var(--md-primary);opacity:0;pointer-events:none;transition:opacity .2s`（站点关闭遮罩，内联样式）。
- `.splash-wrap`：`min-height:calc(100vh - var(--nav-height,56px) - 48px)`，flex 居中；`.splash-emblem img` 90×90 徽标；标题用 `"Noto Serif SC", serif` 1.3rem/700。
- `.splash-bar` 200×4px 进度槽（bg `--md-surface-variant`），内 `.splash-bar-track` 宽 40%，渐变 `linear-gradient(90deg, var(--md-primary), var(--md-tertiary))`，动画 `splashIndeterminate 1.4s ease-in-out infinite`（translateX(-100%)→150%→350%）。
- 版本号 `document.write('v' + APP_VERSION)`；`.splash-version` .72rem opacity .4；跳过提示 `.splash-skip` .78rem opacity .35。
- 逻辑：`load` 后 1800ms 跳转 `services.html`；任意点击立即清除定时器并跳转。

---

## 2. Design Tokens 全表

### 2.1 Primary / Secondary / Tertiary

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--md-primary` | `#0B57D0` | `#A8C7FA` | 主色（可被用户强调色 inline 覆盖） |
| `--md-on-primary` | `#FFFFFF` | `#062E6F` | 主色上的文字 |
| `--md-primary-container` | `#D3E3FD` | `#0842A0` | 主色容器 |
| `--md-on-primary-container` | `#041E49` | `#D3E3FD` | 主色容器上的文字 |
| `--md-primary-dim` | `#0842A0` | `#7CACF8` | 主色按压/hover 深化（可被 inline 覆盖为 rgba(r,g,b,.8)） |
| `--md-primary-light` | `#0B57D0` | `#A8C7FA` | 链接色/浅主色 |
| `--md-secondary` | `#455169` | `#BBC7DB` | 次要色 |
| `--md-secondary-container` | `#DBE2F4` | `#39455A` | nav-link.active 底色 |
| `--md-on-secondary-container` | `#101C2B` | `#DBE2F4` | 其上文字 |
| `--md-tertiary` | `#6E5676` | `#DBBDDF` | 第三色（渐变端点/消息类型） |
| `--md-tertiary-container` | `#F8D9FF` | `#553E5D` | 第三容器 |
| `--md-on-tertiary-container` | `#1C0A22` | `#F8D9FF` | 其上文字 |

### 2.2 Surface 六层

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--md-surface` | `#FBFCFF` | `#111318` | 页面底色 |
| `--md-surface-dim` | `#DBE1EC` | `#111318` | 压暗表面 |
| `--md-surface-container-lowest` | `#FFFFFF` | `#0C0E12` | 输入框/Modal/action-menu 底 |
| `--md-surface-container-low` | `#F3F6FC` | `#171A20` | 卡片默认底（--bg-card） |
| `--md-surface-container` | `#EDF1F9` | `#1D2026` | 胶囊底/duty表头/时间线标尺 |
| `--md-surface-container-high` | `#E7EBF4` | `#272A31` | hover 面/tab-btn 默认底 |
| `--md-surface-container-highest` | `#E1E5EF` | `#32353D` | switch 未选轨道/tab-btn hover |
| `--md-on-surface` | `#1A1C20` | `#E3E4E9` | 正文 |
| `--md-on-surface-variant` | `#45474F` | `#C5C6D1` | 次级文字 |
| `--md-surface-variant` | `#E0E2EC` | `#45474F` | splash 进度槽/cancelled 时间块 |

### 2.3 Outline / Error / Inverse

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--md-outline` | `#75777F` | `#8F919C` | 强描边/switch 边框 |
| `--md-outline-variant` | `#DEE1EA` | `#45474F` | 分隔线/输入框边/点阵纹理 |
| `--md-error` | `#BA1A1A` | `#FFB4AB` | 错误/危险 |
| `--md-on-error` | `#FFFFFF` | `#690005` | 错误色上文字 |
| `--md-error-container` | `#FFDAD6` | `#93000A` | 错误容器 |
| `--md-on-error-container` | `#410002` | `#FFDAD6` | 其上文字 |
| `--md-inverse-surface` | `#2E3038` | `#E3E4E9` | Snackbar 反色底 |
| `--md-inverse-on-surface` | `#F1F2F8` | `#1B1C21` | Snackbar 反色文字 |

### 2.4 自定义语义色（Custom semantic）

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--accent` | `#C62828` | `#FF7B72` | 强调红/支出/图片角标 |
| `--success` | `#1B7D4A` | `#6DD59A` | 成功/收入 |
| `--success-light` | `#D4F5E2` | `#1D3328` | 成功容器 |
| `--warning` | `#E67E22` | `#F2A65A` | 警告 |
| `--warning-light` | `#FDEBD0` | `#3A2D1C` | 警告容器 |
| `--info` | `var(--md-primary)` | `var(--md-primary)` | 信息 |
| `--info-light` | `var(--md-primary-container)` | `var(--md-primary-container)` | 信息容器 |

### 2.5 Elevation 六档（0–5）

| 变量名 | Light 值 | Dark 值 |
|---|---|---|
| `--md-elevation-0` | `none` | （未覆盖，继承 none） |
| `--md-elevation-1` | `0 1px 2px rgba(11,42,94,.09), 0 1px 3px rgba(11,42,94,.05)` | `0 1px 2px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.22)` |
| `--md-elevation-2` | `0 1px 3px rgba(11,42,94,.09), 0 4px 12px rgba(11,42,94,.07)` | `0 1px 3px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.28)` |
| `--md-elevation-3` | `0 4px 12px rgba(11,42,94,.10), 0 10px 28px rgba(11,42,94,.09)` | `0 4px 12px rgba(0,0,0,.36), 0 10px 28px rgba(0,0,0,.30)` |
| `--md-elevation-4` | `0 8px 18px rgba(11,42,94,.11), 0 18px 44px rgba(11,42,94,.12)` | `0 8px 18px rgba(0,0,0,.38), 0 18px 44px rgba(0,0,0,.34)` |
| `--md-elevation-5` | `0 14px 34px rgba(11,42,94,.14), 0 26px 60px rgba(11,42,94,.13)` | `0 14px 34px rgba(0,0,0,.42), 0 26px 60px rgba(0,0,0,.38)` |

### 2.6 Shape 圆角档位（实际 6 档）

| 变量名 | Light/Dark 共用值 | 典型用途 |
|---|---|---|
| `--md-shape-xs` | `8px` | action-menu-item |
| `--md-shape-sm` | `12px` | legacy --radius-sm / 验证码图 / ach-item |
| `--md-shape-md` | `16px` | form-input / legacy --radius-lg |
| `--md-shape-lg` | `22px` | upload-zone / cookie-banner 顶角 / hall-cal-day |
| `--md-shape-xl` | `28px` | card / modal / banner / feed-item / summary-card |
| `--md-shape-full` | `999px` | 按钮 / badge / switch / FAB / 胶囊 |

> 注：任务预期「七档」，源文件实际只有上述 **6 档**。

### 2.7 Motion 弹簧曲线令牌

| 变量名 | 值 | 备注 |
|---|---|---|
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | 常规过渡 |
| `--ease-emphasized` | `cubic-bezier(.2, 0, 0, 1)` | **定义后全站未使用（死令牌）** |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | 过冲弹簧（按钮/拇指/FAB/堆叠图） |
| `--ease-spring-soft` | `cubic-bezier(.22, 1.18, .36, 1)` | 柔和弹簧（modal/toast/feed 入场） |
| `--dur-fast` | `160ms` | hover/色彩过渡 |
| `--dur-med` | `300ms` | 阴影/位移 |
| `--dur-long` | `480ms` | **定义后全站未使用（死令牌）** |

### 2.8 Typography 两族

| 变量名 | Light/Dark 共用值 | 用途 |
|---|---|---|
| `--md-font-display` | `'Google Sans Flex', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif` | 标题（page-header h1、section-title、modal-title、nav-brand、login h1、cal-nav-title、banner title） |
| `--md-font-body` | `'Google Sans Flex', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif` | 正文（body、legacy --font） |

### 2.9 Legacy 别名映射（保持旧类兼容）

| Legacy 变量 | 映射到 | 备注 |
|---|---|---|
| `--primary` | `var(--md-primary)` | |
| `--primary-light` | `var(--md-primary-light)` | |
| `--primary-lighter` | `var(--md-primary-container)` | 仅 :root 定义 |
| `--primary-dark` | `var(--md-primary-dim)` | 仅 :root 定义 |
| `--bg` | `var(--md-surface)` | dark 中重复声明同映射 |
| `--bg-card` | `var(--md-surface-container-low)` | 同上 |
| `--text` | `var(--md-on-surface)` | 同上 |
| `--text-secondary` | `var(--md-on-surface-variant)` | 同上 |
| `--text-light` | `var(--md-outline)` | 同上 |
| `--border` | `var(--md-outline-variant)` | 同上 |
| `--shadow` | `var(--md-elevation-1)` | 同上 |
| `--shadow-lg` | `var(--md-elevation-3)` | 同上 |
| `--radius` | `var(--md-shape-sm)` | 仅 :root |
| `--radius-sm` | `var(--md-shape-xs)` | 仅 :root |
| `--radius-lg` | `var(--md-shape-md)` | 仅 :root |
| `--nav-height` | `64px` | 仅 :root（body padding-top 使用） |
| `--max-width` | `1100px` | 仅 :root（.nav-inner 用；注意 `.container` 实际 max-width 是硬编码 960px） |
| `--font` | `var(--md-font-body)` | 仅 :root |

### 2.10 Badge 语义色 & 按钮 hover 色

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--badge-pending-text` | `#7B5A00` | `#F2A65A` | 待处理徽章文字 |
| `--badge-done-text` | `#0D5E3A` | `#6DD59A` | 已完成/通过徽章文字 |
| `--badge-review-bg` | `#F0E6F6` | `#3A2D3F` | 审核中徽章底 |
| `--badge-review-text` | `#5B3A70` | `#DBBDDF` | 审核中徽章文字 |
| `--badge-expiring-bg` | `#FFF0E0` | `#3A2D1C` | 即将到期徽章底 |
| `--badge-expiring-text` | `#A35000` | `#F2A65A` | 即将到期徽章文字 |
| `--btn-success-hover` | `#15653E` | （未覆盖） | btn-success hover 底 |
| `--btn-danger-hover` | `#8F1313` | （未覆盖） | btn-danger hover 底 |
| `--btn-warning-hover` | `#C96B14` | （未覆盖） | btn-warning hover 底 |

> `.badge-public` 未走令牌：硬编码 `background:#F0E6F6; color:#5B3A70`（cards.css:125），暗色下仍为浅底。

### 2.11 Z-index 全表（令牌）

| 变量名 | 值 | 用途 |
|---|---|---|
| `--z-base` | `0` | 基准 |
| `--z-fab` | `900` | FAB |
| `--z-nav` | `1000` | 顶栏 + 底部胶囊 |
| `--z-toast` | `3000` | Snackbar 容器 |
| `--z-lightbox` | `5000` | 图片灯箱 |
| `--z-overlay` | `9999` | 投票成功遮罩 |
| `--z-modal` | `9999` | 对话框 |
| `--z-ach-toast` | `100000` | 成就 Toast |
| `--z-top` | `100000` | Cookie 横幅 |

代码中的硬编码 z-index（非令牌）：`.action-menu: 100`、`.img-stack-badge: 10/z-index:10`、`.hall-timeline-selection: 4`、`.img-picker-close: 10000`、`index.html #sco 内联: 99999`、`.sg-firework-canvas: 99999`、`.sg-btn-shard/.sg-shard-small/.sg-particle: 100000`。

---

## 3. 组件类目清单

### 3.1 按钮 `.btn` 全变体 + 尺寸（controls.css）

基础：`padding:10px 26px; min-height:40px; border-radius:var(--md-shape-full); font-size:.88rem; font-weight:600; gap:8px; letter-spacing:.008em; overflow:hidden`。
状态集：
- hover：`translateY(-1px)`（transition transform 160ms spring）
- active：`scale(.955)`，transition-duration 收窄至 `80ms`
- focus-visible：`outline:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--md-primary) 35%, transparent)`
- disabled：`opacity:.4; cursor:not-allowed`

变体：

| 类 | 关键参数 |
|---|---|
| `.btn-primary` | bg primary / on-primary，elev-1；hover bg `--md-primary-dim` + elev-2 |
| `.btn-success` | bg `--success`，白字；hover `--btn-success-hover` + elev-1 |
| `.btn-danger` | bg error / on-error；hover `--btn-danger-hover` + elev-1 |
| `.btn-warning` | bg warning 白字；hover `--btn-warning-hover` |
| `.btn-outline` | 透明底 primary 字，`border:1.5px solid color-mix(in srgb, var(--md-primary) 55%, transparent)`；hover bg primary-container、border 实色 |
| `.btn-ghost` | 透明底 on-surface-variant 字，`border:1.5px solid var(--md-outline-variant)`；hover bg container-high |
| `.btn-text` | 透明底 primary 字，`padding:6px 14px; min-height:32px; font-size:.82rem`；hover bg primary-container |
| `.btn-danger-outline` | 透明底 error 字，`1.5px solid color-mix(error 55%, transparent)`；hover bg error-container |
| `.btn-error` | bg error-container / error 字；hover `color-mix(in srgb, var(--md-error-container), var(--md-error) 12%)` |

尺寸：`.btn-sm`（`6px 18px` / 32px / `.82rem`）、`.btn-xs`（`4px 12px` / 26px / `.75rem`）、`.btn-block{width:100%}`、`.btn-group{gap:8px; flex-wrap:wrap}`。
派生 chip 形态：`.filter-tab { border:1.5px solid var(--md-outline); }` hover/active 边框转 primary（叠加在 tab-btn 上使用）。

### 3.2 输入 `.form-input/.form-select/.form-textarea`

- `padding:12px 18px; border:1.5px solid var(--md-outline-variant); border-radius:var(--md-shape-md); font-size:.95rem; background:container-lowest`
- focus：`border-color:var(--md-primary); box-shadow:0 0 0 3.5px color-mix(in srgb, var(--md-primary) 16%, transparent)`
- `.form-textarea{min-height:100px; resize:vertical}`；`.form-row{grid 1fr 1fr; gap:20px}`
- `.form-label` .88rem/600；`.required` error 红。
- 验证码组 `.captcha-img`（120×42、radius shape-sm、hover 边框 primary）、`.captcha-input`（110px 宽、focus 边框 primary）。
- 暗色：`.dark input/textarea/select` → bg container-low。

### 3.3 开关 `.switch`（M3E 拇指动效）

- 轨道 52×32，未选：bg container-highest + `2px solid outline`，full 圆角。
- 拇指 16×16（left 7px top 6px），bg on-surface-variant，elev-1。
- 动效：checked 时拇指放大至 `24px`（left/top 2px）并 `translateX(22px)`，transform/width/height 均 300ms；transform 用 `--ease-spring`，宽高用 `--ease-standard`；背景/边框 160ms。
- hover（未禁用）：`::before scale(1.15)`。
- focus-visible：input 上 `outline:3px solid color-mix(primary 50%, transparent); outline-offset:4px` 打在 slider 上。
- disabled：整体 `opacity:.4`，拇指去阴影。
- 旧款 `.admin-toggle`（admin 页）：52×28、拇指 22px、选中 bg 为 `--accent`（非 primary）。

### 3.4 卡片族

| 类 | 关键视觉参数 |
|---|---|
| `.card` | bg container-low，radius xl(28)，padding 20，margin-bottom 16；transition shadow 300ms standard + transform 300ms spring-soft；hover elev-2 + translateY(-2px)。`.card-header` 底部分隔线、`.card-body` .95rem/1.75、`.card-footer` 上分隔线 |
| `.img-card` | radius xl、overflow hidden；img 高 200 cover；body padding `16px 20px`；hover elev-2 + -2px（cubic-bezier(.4,0,.2,1) 300ms） |
| `.summary-card` | flex:1、radius xl、padding `24px 20px 20px` 居中、elev-1；hover elev-3 + -2px；`.active` elev-3 + `0 0 0 2px var(--md-primary)`（报销卡 active 用 accent）；数值 tabular-nums 700 |
| `.activity-card` | radius xl、padding 20、margin-bottom 12；hover elev-2 + -2px |
| `.feature-card`（admin） | 与 .card 同壳；40px 圆形 icon 容器 primary-container；key 用 monospace |
| `.msg-item`（messages） | radius xl、padding `14px 16px`、hover elev-2 + -1px、active scale(.99)；unread：bg primary-container + 左侧 4×24px primary 圆条 |
| `.form-card` | radius xl、padding 20；`::before` 左侧 3px 渐变竖条（primary-light→primary） |
| `.login-card` | radius xl、padding `40px 36px`、max-width 420px；login-tab 下划线式 active（2px primary） |

### 3.5 徽章 `.badge-*` 全色映射（cards.css）

基础：`height:22px; padding:2px 12px; radius full; font-size:.78rem; font-weight:600; letter-spacing:.01em`。

| 类 | background | color |
|---|---|---|
| `.badge-pending` | `--warning-light` | `--badge-pending-text` |
| `.badge-processing` | `--md-primary-container` | `--md-on-primary-container` |
| `.badge-done` | `--success-light` | `--badge-done-text` |
| `.badge-pass` | `--success-light` | `--badge-done-text` |
| `.badge-review` | `--badge-review-bg` | `--badge-review-text` |
| `.badge-reject` | `--md-error-container` | `--md-on-error-container` |
| `.badge-expiring` | `--badge-expiring-bg` | `--badge-expiring-text`；`animation:pulse 2s infinite`（opacity 1→.6→1） |
| `.badge-public` | `#F0E6F6`（硬编码） | `#5B3A70`（硬编码） |

辅助：`.chat-status-*`（pending/done/progress，68rem 小号药丸，暗色加 opacity .85）；`.hall-review-badge`（error 底白字圆角计数）；`.msg-badge`（16px 计数泡，error 底 + 1.5px surface 描边，入场 `msgBadgePop .3s` spring）；`.img-stack-badge`（accent 底 20px 圆角 10px 角标）。

### 3.6 Tab `.tab-btn`（chip 式）

- `padding:7px 18px; radius full; bg container-high; color on-surface-variant; font-size:.82rem; font-weight:500`
- transition：bg/color 160ms ease + transform 160ms spring。
- hover：bg container-highest + `translateY(-1px)`。
- active：bg primary / on-primary、600 字重、elev-1。
- 无独立 focus-visible/disabled 规则（依赖全局 :focus-visible）。`.hall-section-tab.hall-tab-active` 变体用 primary-container 底。

### 3.7 顶栏 `.nav`（表面浮层 + 玻璃参数）

- `position:fixed; height:var(--nav-height)=64px; z-nav=1000`
- 玻璃：`background:color-mix(in srgb, var(--md-surface) 76%, transparent)` + `backdrop-filter:blur(18px) saturate(1.6)`；底边 1px outline-variant。
- 暗：`rgba(17,19,24,.82)` + blur(18px) **saturate(1.5)**（与亮色 1.6 不一致）。
- `.nav-brand` display 族 1.2rem/700 primary；左侧徽标 `.nav-emblem` 高 1.6em，≤768px 隐藏。
- `.nav-link`：padding `7px 16px` 药丸、.88rem/500；hover bg container-high；active bg secondary-container / on-secondary-container / 600。
- `.nav-loading .spinner`：16px 圆环 `spin .65s linear infinite`。
- `.page-header h1`：clamp(1.75rem, 4vw, 2.1rem)/700，底部 72×4px 主色渐变条；`.section-title::after` 48px 条（生效版 2px/radius 1px）。

### 3.8 底部胶囊 `.tab-capsule`

结构：`.tab-capsule > .tab-cap-body > (.tab-cap-main + .tab-cap-extra[展开区]) + .tab-cap-expand`；item = icon(svg 24px)+span。

- 定位：`bottom:calc(20px + env(safe-area-inset-bottom,0px)); left:50%; translateX(-50%); z-nav`；`max-width:94vw; max-height:78px; overflow:hidden`。
- 玻璃：`color-mix(container 88%, transparent)` + blur(18px) saturate(1.6)；radius full；`elev-4 + 0 0 0 1px rgba(255,255,255,.06)` 白描边。
- 展开 `.expanded`：纵向排列、radius xl(28)、padding `12px 16px 14px`、elev-5 + 白环 .08；extra 区顶部 1px 分隔线。
- item：padding `6px 14px`、radius lg、字 .62rem/500；hover container-high；active bg primary-container / on-primary-container / 600 且 svg `scale(1.18)`（300ms spring）；按下 `scale(.94)`。
- 展开钮 `.tab-cap-expand`：38px 圆、bg container-high；svg stroke-width 3，展开旋转 180°（.35s standard）。
- 隐藏态 `.capsule-hidden{bottom:-100px}`；≤768px 整体收紧（padding `8px 10px`、item 字 .55rem、icon 22px、expand 34px）。
- 暗色覆写：bg `rgba(23,26,33,.92)` + saturate(1.5)。

### 3.9 FAB

- 56×56 正圆，`bottom:80px; right:28px; z-fab=900`；bg primary-container/on-primary-container，font-size 28px，elev-2。
- hover：`scale(1.07)` + bg `color-mix(primary-container, primary 14%)` + elev-4（300ms spring）。
- active：`scale(.92)`。
- ≤768px：50×50、right 16px、字号 24px。无 disabled/focus-visible 专规。

### 3.10 对话框 `.modal`（圆角与入场弹簧曲线）

- 遮罩 `.modal-overlay`：`rgba(16,20,28,.45)` + `backdrop-filter:blur(8px)`，fadeIn 160ms；closing fadeOut 160ms forwards。
- 本体 `.modal`：bg container-lowest、**radius xl(28)**、elev-5、max-width 480px、max-height 90vh、padding 32px。
- 入场 `modalIn .42s var(--ease-spring-soft)`：from `translateY(32px) scale(.92)`；退场 `modalOut .22s ease` → `translateY(20px) scale(.95)`。
- `.modal-title` display 族 1.3rem/700；actions/footer 右对齐 gap 12/8；`.modal-close` 32px 圆 hover container-high。
- ≤480px（admin.css）：遮罩去 padding、modal 全屏直角（radius 0、100vh）、改 slideUp .3s 入场。

### 3.11 Toast Snackbar

- 容器 `.toast-container`：`bottom:calc(96px + env(safe-area-inset-bottom,0px))` 底部居中，column-reverse，`max-width:min(92vw,440px)`，`aria-live="polite"`（api.js 创建时设置）。
- 单条 `.toast`：反色 `inverse-surface/inverse-on-surface`、radius full、padding `13px 24px 13px 20px`、.88rem/500、elev-3；入场 `snackbarIn .38s ease-spring-soft`（translateY(18px) scale(.94)→0），退出 `snackbarOut .25s`。
- 状态圆点：`::before` 8×8 圆；默认 `--md-primary-light`，`.toast-success::before`= success，`.toast-error::before`= error，`.toast-info::before`= primary-light。
- 暗色显式覆写 bg/color + elev-4。

### 3.12 Cookie 横幅 `.cookie-banner`

- `bottom:0; left/right:12px; z-top(100000)`；bg container-high、blur(14px)、radius `lg lg 0 0`、阴影 `0 -4px 24px rgba(0,0,0,.14)`、.85rem/500。
- 初始 `translateY(calc(100% + 12px))` → `.show` 归零（transform .4s ease-standard）。
- 内置按钮：`.btn` 药丸 `padding:6px 20px; min-height:34px`。
- 暗色：bg `rgba(29,32,38,.96)` + 四周 1px 边框（去 bottom）。

### 3.13 成就 Toast `.ach-toast`（Minecraft 风）

- `top:-120px` 起，show 时 `top:24px`；transition `top .5s cubic-bezier(.34,1.56,.64,1), opacity .4s, transform .4s spring`（初始 scale .6 → 1）。
- 皮肤：`linear-gradient(135deg,#2a2a2a,#1a1a1a)` 底 + `3px solid #555`（top #777/left #666 不对称像素风描边）+ radius 6px + 双层阴影（外发光 `0 0 20px rgba(0,0,0,.6)` + inset 高光）。
- 图标 2.4rem 金色 `#ffd700` 带 drop-shadow；title .7rem 大写字距 1px #aaa；name 1rem/700 #fff；desc .78rem #999。
- z-ach-toast = 100000；打印媒体下隐藏。

### 3.14 空状态 `.empty-state`

- `text-align:center; padding:60px 20px 56px`；`::before` 100px 径向光晕（primary-container，opacity .4）。
- icon 3.2rem opacity .3；正文 .95rem；副文本 `.empty-state-subtext` .82rem。
- 移动端（≤600px）：padding `40px 16px`、光晕 80px、icon 2.6rem。

### 3.15 上传区 `.upload-zone`

- `border:2px dashed var(--md-outline-variant); radius lg(22); padding:28px` 居中。
- hover：border 转 primary + bg `color-mix(primary-container 45%, transparent)`。
- 预览图 `.upload-preview`：max-height 200px、radius sm、object-fit contain。

### 3.16 时间线与甘特（hall.css `hall-timeline-*` / `hall-gantt*`）

- 时间线容器 `.hall-timeline`：flex、max-height 72vh、radius lg、bg surface。
- 标尺 `.hall-timeline-ruler`：宽 56px、bg container、小时刻度字 .72rem/700 + 左侧 3×16px primary 短杠（opacity .5）。
- 网格 `.hall-timeline-grid`：crosshair 光标；整线 1px 实线 outline-variant，半线 1px dashed opacity .3。
- 预约卡 `.hall-timeline-card`：absolute、elev-1、hover `scale(1.02)` + elev-3 + z 3；四态配色全部 color-mix：
  - `-others`：`color-mix(error 14%, surface)` 底 + `1px solid color-mix(error 35%, transparent)` 边
  - `-self`：`color-mix(primary 14%, surface)` + primary 35% 边
  - `-pending`：`color-mix(#f0a030 10%, surface)` + 25% 边 + opacity .75（**#f0a030 为硬编码**）
  - `-cancelled`：surface-variant 底 + opacity .4 + grayscale(1)
- 框选层 `.hall-timeline-selection`：`color-mix(primary 18%, transparent)` + 2px primary 边 + radius md；标签药丸 primary 底白字带下箭头 ::after。
- 甘特条 `.hall-gantt`：高 24px 容器 radius sm；`-self` = color-mix(primary 40%)、`-approved` = error opacity .7、`-pending` = `#f0a030` opacity .7（硬编码）；刻度字 .6rem。

### 3.17 值日表格 `.duty-table`（duty.css）

- grid 列 `90px 1fr 1fr auto`（≤480px 收窄 `70px 1fr 1fr auto`）；表头 sticky top 0、bg container、600/.82rem。
- 行 hover bg container-high；分数列右对齐 600。
- 状态按钮 `.duty-btn`（min-width 60px，≤480px 44px）：disabled opacity .6。
  - `-pending`：surface 底 outline 边（暗色 bg container-high）；hover primary-container + primary 字
  - `-active`：`#FFF3CD/#856404/#FFC107` 硬编码 + `dutyPulse 1.5s infinite`（金色 ring `rgba(255,193,7,.4)`→0）；暗色 `#3D2E00/#FFE082`
  - `-done`：success-light/success；暗色硬编码 `#1B5E20/#81C784`
  - `-warn`：error-container/error；暗色硬编码 `#B71C1C/#EF9A9A`
  - `-absent`：container-high/on-surface-variant/outline-variant；暗色硬编码 `#424242/#BDBDBD/#616161`
- 部门统计条 `.dept-stat-track/fill`：高 14px 药丸槽，填充 `linear-gradient(90deg, primary, tertiary)` + `deptBarGrow .8s cubic-bezier(.34,1.56,.64,1)` + primary 40% 发光。

### 3.18 图片堆叠

小尺寸 `.img-stack`（100×100，announcements 列表用）：

| 子图 | 偏移原值 | z | filter | opacity |
|---|---|---|---|---|
| nth-child(1) | 0,0 | 4 | — | — |
| nth-child(2) | top 3px left 3px | 3 | blur(1px) | .85 |
| nth-child(3) | top 6px left 6px | 2 | blur(2px) | .7 |
| nth-child(4) | top 9px left 9px | 1 | blur(3px) | .5 |

大卡片 `.img-stack-card`（feed/moment 用，perspective 900px）：

| 子图 | 偏移原值 | z | filter | opacity |
|---|---|---|---|---|
| first-child | 主体，max-height 200px | 4 | — | — |
| nth-child(2) | top 5px left 5px | 3 | brightness(.82) saturate(.75) | .82 |
| nth-child(3) | top 10px left 10px | 2 | brightness(.66) saturate(.55) | .64 |
| nth-child(4) | top 15px left 15px | 1 | brightness(.5) saturate(.35) | .46 |

hover 展开（transition .45s spring cubic-bezier(.34,1.56,.64,1)）：
- 2：`rotate(-1.8deg) translate(-3px,-2px)`、brightness(.95) saturate(.9)、opacity .95
- 3：`rotate(1.2deg) translate(-6px,-4px)`、brightness(.8) saturate(.7)、opacity .78
- 4：`rotate(-.8deg) translate(-9px,-6px)`、brightness(.65) saturate(.5)、opacity .6

另有平铺行 `.img-row`（横向滚动、4px 滚动条、img hover scale 1.02）。

### 3.19 View Transitions 动画曲线（navigation.css）

- `@view-transition { navigation: auto }`；`html{view-transition-name:none}`；`.container{view-transition-name:page-content}`。
- 旧页 `::view-transition-old(page-content)`：`vt-slide-out .38s var(--ease-standard)`（→ translateX(-100%), opacity .4）。
- 新页 `::view-transition-new(page-content)`：`vt-slide-in .5s var(--ease-spring-soft)`（from translateX(90px), opacity .3）。
- `prefers-reduced-motion: reduce` 下两者 duration 强制 `0.01ms`。

---

## 4. 背景系统

| 层 | 参数（原值） |
|---|---|
| body 亮色底 | `radial-gradient(ellipse 80% 40% at 20% 0%, rgba(11,42,94,.035) 0%, transparent 70%), radial-gradient(ellipse 60% 30% at 80% 100%, rgba(11,42,94,.03) 0%, transparent 60%), var(--md-surface)` |
| body 暗色底 | 同结构换 `rgba(168,199,250,.05)` / `.04` + surface |
| body::before 点阵 | `radial-gradient(circle, var(--md-outline-variant) .6px, transparent .6px)`，`background-size:32px 32px`，`opacity:.28`（暗色 `.dark body::before{opacity:.15}`），fixed inset 0 z:-1 |
| body::after 徽章水印 | `url('/images/emblem.png') center / 320px auto no-repeat`，`opacity:.045`，fixed z:-1 |
| 公告横幅装饰 | `::before` `radial-gradient(circle at 30% 50%, rgba(255,255,255,.06), transparent 50%)`；`::after` 300×300 圆 `rgba(255,255,255,.04)` 于右上角外溢 |
| 公告横幅底 | `linear-gradient(135deg, var(--md-primary), var(--md-primary-dim))` |
| 个人中心头图 | `linear-gradient(135deg, var(--md-primary) 0%, var(--md-primary-dim) 100%)` radius md |
| Feed 卡片底 | `color-mix(in srgb, var(--md-primary) 5%, var(--md-surface-container-lowest))`；图标圈 `color-mix(primary 16%, transparent)` |
| 投票成功遮罩 | `rgba(11,42,94,.9)` 全屏（z-overlay） |
| 灯箱 | `rgba(0,0,0,.92)`（z-lightbox） |
| 成就 Toast | 见 §3.13（#2a2a2a→#1a1a1a 渐变） |

---

## 5. 响应式断点汇总

全局无任何 `min-width` 断点（报纸双栏已确认删除）。全部清单：

| 断点 | 文件:位置 | 规则摘要 |
|---|---|---|
| `max-width:768px` | navigation.css:44 | `.nav-emblem` 隐藏 |
| `max-width:768px` | navigation.css:303 | 胶囊紧凑化：padding 8/10、max-height 64、item 字 .55rem/icon 22px、expand 34px |
| `max-width:768px` | controls.css:247 | FAB 缩至 50px、right 16px |
| `max-width:700px` | admin.css:99 | `.admin-grid.cols-3`→2 列、cols-2→1 列（**非标准断点，与 600 并存不一致**） |
| `max-width:640px` | content.css:351 | feed 收紧：list padding `6px 14px 16px`、item 12px、评论时间换行独占一行 |
| `max-width:600px` | responsive.css:5 | section-title 1.1rem、summary-card 16/12、empty-state 收紧、form-card 22/20 |
| `max-width:600px` | personal.css:24 | pcTrophy 90px；personal.css:64 头图 padding 24/16、pc-name 1.35rem 等 |
| `max-width:480px` | responsive.css:18 | 品牌 .92rem、btn 8/18、img-grid 2 列/img 120px、container 16/12、财务卡纵排、reimburseRatioCard 系列 !important 微调 |
| `max-width:480px` | admin.css:103 | modal 全屏直角、admin-grid 单列、用户项换行 |
| `max-width:480px` | duty.css:81 | 日历 spacing 2px、字号降档；duty.css:216 duty-table 列距 70px、duty-btn 44px；duty.css:280 dept-stat 收紧 |
| `max-width:480px` | personal.css:27 | pcTrophy 70px；personal.css:77 头图 radius sm、set-group expanded max-height 500px |
| `max-width:380px` | responsive.css:54 | img-grid 单列、summary-value .88rem |
| `@media print` | base/reset.css:67 | 隐藏 nav/胶囊/FAB/toast/modal/lightbox/#sco/水印；去阴影加边框；img-grid 2 列 |
| `prefers-reduced-motion: reduce` | navigation.css:343 | view-transition 动画 0.01ms（仅此一处响应系统减动效） |

---

## 6. 个性化运行时注入（api.js `applyPersonalize()`，每页执行）

数据源：`localStorage.personalize`（回退读 cookie `personalize`，max-age 一年）。写入端为 personalize.html。

1. **主题**：`dark` → html 加 `.dark`；`auto` → 按 `matchMedia('(prefers-color-scheme: dark)')` toggle 并监听 change。
2. **强调色**（COLORS 预设 6 色：雅礼深蓝 `#0B57D0`、中国红 `#C41E24`、翡翠绿 `#0D7C3F`、琥珀橙 `#E67E22`、罗兰紫 `#6C3483`、青瓷 `#1A8A8A`）：
   ```js
   documentElement.style.setProperty('--md-primary', prefs.color);
   // 并解析 hex 后：
   documentElement.style.setProperty('--md-primary-dim', `rgba(${r},${g},${b},.8)`);
   ```
   即第三层 inline 覆盖；`--md-primary-container` 等衍生色不跟随（保持雅礼蓝容器色）。
3. **根字号**：`documentElement.style.fontSize = prefs.fontSize + 'px'`；滑杆范围 `min="13" max="20" value="15"`（personalize.html font-slider），带取整吸附逻辑。
4. **动效两档差异**：
   - `animation===false` → html 加 `.reduce-animation` —— **CSS 中不存在任何 `.reduce-animation` 规则，当前该开关无实际效果（缺陷）**。
   - `noAnimation===true` → `.no-animation`：`overlay.css` 定义 `.no-animation *, *::before, *::after { animation:none!important; transition:none!important }`，全站动画+过渡全灭。
5. **super-graphic**：html 加 `.super-graphic`，动态注入 `/css/graphic.css` + `/js/graphic.js`（幂等，按 id `sgCss`/`sgJs` 判重）。效果概览（graphic.css）：
   - 发光令牌 `--sg-glow`（0 0 12px primary 25%）/ `--sg-glow-strong`（24px/40%）；
   - 卡片入场 `sgCardEnter .5s spring`（translateY(30px) rotateX(8deg) scale(.95) → 70% 回弹）+ 待机漂浮 `sgIdleFloat 6s infinite`（perspective 400px 3D 摆动），子项错峰 delay .08s 步进至 .4s（第 2–6 个）;
   - hover 3D 倾斜：JS 写入 `--rx/--ry`，CSS `perspective(400px) rotateX/rotateY translateY(-3px)` + glow 阴影（graphic.js 从计算样式的 `--md-primary` 取色调和）；
   - 按钮 hover `scale(1.04)` + strong glow、active `.94`；FAB `sgFloat 3s` ±6px 浮动；
   - 导航/胶囊图标 hover `scale(1.2) rotate(-5deg)`；h1 彩虹渐变字 `sgRainbow 4s`；badge 呼吸 `sgBadgePulse 2s scale(1.06)`；toast 弹入 `sgToastIn .4s`；
   - JS 特效粒子/碎片/烟花 canvas（z 99999–100000）。

---

## 7. `_headers` 安全与缓存策略（Cloudflare Pages 格式）

全局响应头（原值）：

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-XSS-Protection: 1; mode=block
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

缓存规则表：

| 匹配 | Cache-Control |
|---|---|
| `/`（首页） | `public, max-age=0, must-revalidate` |
| `*.js` | `public, max-age=0, must-revalidate` |
| `*.css` | `public, max-age=0, must-revalidate` |
| `*.svg` / `*.png` / `*.jpg` / `*.ico` / `*.woff2` | `public, max-age=31536000, immutable` |

缺口：`*.ttf` 无规则 → `GSF.ttf` 只有全局安全头、无缓存指令（每次协商缓存）；`webp/gif` 等图片扩展同样未列。

---

## 8. 字体资产

- **本地可变字体**：base/reset.css `@font-face`，family `'Google Sans Flex'`，`src:url('../../../fonts/GSF.ttf') format('truetype')`（即 `public/fonts/GSF.ttf`，实测 ≈3.9MB），`font-weight:100 900` 可变区间，normal 体。两族 typography 变量均以其为首选项。
- **页面级 Google Fonts**（全部 23 个 HTML 相同模式）：
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="…同 URL…"></noscript>
  ```
  即 preload+onload 异步交换模式，noscript 兜底；Noto Serif SC 仅用于 index 闪屏标题等少数衬线场景。

---

## 9. 无障碍现状

- **`:focus-visible`**：全局规则 `outline:3px solid color-mix(in srgb, var(--md-primary) 55%, transparent); outline-offset:2px; border-radius:4px`（reset.css）；组件级补充：`.switch input:focus-visible + .slider`（50%/offset 4px）、`.btn:focus-visible` 改用 box-shadow ring 35%、`.font-slider:focus-visible`（2px primary offset 4px）。
- **`prefers-reduced-motion`**：仅 navigation.css 一处，把 view-transition 新旧页动画压到 `0.01ms`。其余弹簧/脉冲/漂浮动画不受系统设置影响；站点内减动效靠自建 `.reduce-animation`（无效）/`.no-animation`（有效）开关。
- **`aria-live`**：grep 全站仅 **1 处** —— `api.js:250` toast 容器创建时 `setAttribute('aria-live','polite')`。Modal/Lightbox/Cookie 横幅等无 live region 或 role 声明。

---

## 提取来源

| 来源文件 | 内容 |
|---|---|
| `public/css/material/style.css` | @import 顺序 |
| `public/css/material/theme-light.css` / `theme-dark.css` | 全部 Design Tokens、深色组件补丁 |
| `public/css/material/base/reset.css` | @font-face、body 背景三层、点阵/水印、selection/focus-visible、打印 |
| `components/navigation.css` | 顶栏、胶囊、View Transitions、page-header |
| `components/controls.css` | 按钮、开关、表单、上传区、FAB、验证码 |
| `components/cards.css` | 卡片族、徽章、img-grid/stack/row、action-menu |
| `components/overlay.css` | modal、toast、lightbox、ach-toast、cookie、空状态、no-animation |
| `components/content.css` | 公告横幅、feed、评论、chat-status |
| `components/responsive.css` | 全局 600/480/380 |
| `pages/login.css` / `admin.css` / `personal.css` / `hall.css` / `duty.css` / `messages.css` | 各页组件与页内断点 |
| `public/css/graphic.css` + `public/js/graphic.js` | super-graphic 效果 |
| `public/_headers` | CSP 与缓存 |
| `public/index.html` | 启动闪屏、字体加载模式 |
| `public/js/api.js`（applyPersonalize/initCookieConsent/toast） | 运行时注入、aria-live |
| `public/personalize.html` | 强调色预设、字号滑杆 13–20、动效开关语义 |
