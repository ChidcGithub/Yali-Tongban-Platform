/**
 * WinUI 页面脚手架生成器
 *
 * 为指定页面生成：
 *   <name>.html               WinUI 外壳（挂载点 + 桥接脚本 + 遗留脚本 + 模块入口）
 *   src/pages/<name>/main.ts  入口
 *
 * 内容组件（<Name>App.vue）由人工编写，不由本脚本生成。
 *
 * 用法：node scripts/gen-winui-page.mjs index thanks changelog ...
 *       node scripts/gen-winui-page.mjs --all
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 各页面需要的遗留脚本（按需裁剪；nav.js 一律不要，由 NavigationView 承担） */
const SCRIPTS = {
  base: ['/js/winui-legacy-bridge.js', '/js/features.js', '/js/modal.js', '/js/api.js', '/js/utils.js'],
  captcha: ['/js/captcha.js'],
  auth: ['/js/auth.js'],
  lightbox: ['/js/lightbox.js'],
  changelogData: ['/js/changelog-data.js'],
  version: ['/version.js']
}

/** 页面 → 需要的脚本组合 */
const PAGE_SCRIPTS = {
  // 最早的两个试点页（生成器出现之前手写），必须登记：
  // 未登记会被静默跳过 —— 公共部分（如 design token 的 <link>）就永远同步不过去
  services: ['base', 'captcha', 'auth', 'lightbox'],
  announcements: ['base', 'auth', 'lightbox'],
  index: ['version', 'base'],
  thanks: ['base', 'auth'],
  changelog: ['base', 'auth', 'changelogData'],
  about: ['version', 'base', 'auth', 'changelogData'],
  debug: ['base', 'auth'],
  '404': ['base'],
  '410': ['base'],
  feedback: ['version', 'base', 'captcha'],
  messages: ['base'],
  moment: ['base', 'auth'],
  polls: ['base', 'auth'],
  poll: ['base', 'captcha', 'auth', 'lightbox'],
  activities: ['base', 'captcha', 'auth'],
  announcement: ['base', 'auth', 'lightbox'],
  finance: ['base', 'captcha', 'auth', 'lightbox'],
  duty: ['base', 'auth'],
  'duty-admin': ['base', 'auth'],
  admin: ['base', 'auth', 'lightbox'],
  settings: ['base', 'auth'],
  personalize: ['base', 'auth'],
  login: ['base', 'captcha'],
  ai: ['base', 'auth'],
}

const ALL = Object.keys(PAGE_SCRIPTS)

/* 有意不迁移的页面：纯重定向桩（12 行，meta refresh 跳 /410）。
   它们没有内容可迁移，也不是 WinUI 页面，自检时排除。 */
const REDIRECT_STUBS = ['cultural', 'review', 'tasks']

/* 自检：根目录下的每个页面 HTML 都必须登记脚本组合。
   没登记就会被静默跳过，公共部分（如 design token 的 <link>）永远同步不过去 ——
   services / announcements 正是这样漏掉过。 */
const unregistered = readdirSync(root)
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.replace(/\.html$/, ''))
  .filter((n) => !PAGE_SCRIPTS[n] && !REDIRECT_STUBS.includes(n))
if (unregistered.length) {
  console.error(`✗ 以下页面 HTML 存在但未在 PAGE_SCRIPTS 登记，无法生成：${unregistered.join(', ')}`)
  console.error('  请在 PAGE_SCRIPTS 中补上它们的脚本组合（或加入 REDIRECT_STUBS）后重跑。')
  process.exit(1)
}

const argNames = process.argv.slice(2)
const targets = argNames.includes('--all') || argNames.length === 0 ? ALL : argNames

/** 页面标题：优先沿用原页面的 title，否则用文件名 */
function resolveTitle(name) {
  const src = resolve(root, `${name}.html`)
  if (existsSync(src)) {
    const m = readFileSync(src, 'utf8').match(/<title>([^<]*)<\/title>/i)
    if (m) return m[1].trim()
  }
  return `${name} - 雅礼团委-通办`
}

/** 组件名：duty-admin → DutyAdmin */
function componentName(name) {
  return name
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

/* 特例：组件文件名与「由页面名推导」的结果不同。
   数字开头的名字（404 / 410）无法作为合法 JS 标识符，必须显式映射，
   否则生成出的 import 会指向不存在的 404App.vue 并把构建打断。 */
const COMPONENT_OVERRIDE = {
  404: 'NotFoundApp',
  410: 'GoneApp'
}

/* 页面专属的站点样式表（同样来自 public/，单一来源）。
   这些文件只依赖站点自己的 --md-* token，而外壳已经引入了 token 文件，
   所以可以直接复用，不必把样式抄一份。 */
const PAGE_STYLES = {
  activities: ['/css/material/pages/hall.css']
}

function buildHtml(name) {
  const title = resolveTitle(name)
  const keys = PAGE_SCRIPTS[name] ?? ['base']
  const scripts = [...new Set(keys.flatMap((k) => SCRIPTS[k] ?? []))]
  const scriptTags = scripts.map((s) => `  <script src="${s}"></script>`).join('\n')
  const pageStyles = (PAGE_STYLES[name] ?? [])
    .map((h) => `  <link rel="stylesheet" href="${h}">`)
    .join('\n')
  const pageStyleBlock = pageStyles
    ? `\n  <!-- 本页专属的站点样式（报告厅时段表等） -->\n${pageStyles}`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="icon" href="/icon/emblem.ico" type="image/x-icon">
  <!-- 站点自己的 M3 design token（现行 UI 路线就是以这套 --md-* 为基础）。
       除了作为 WinUI accent 的来源，遗留脚本注入的浮层（toast / 模态框 / 灯箱 /
       Cookie 提示 / 成就提示）也依赖这些 token，否则会渲染成无样式裸元素。 -->
  <link rel="stylesheet" href="/css/material/theme-light.css">
  <link rel="stylesheet" href="/css/material/theme-dark.css">
  <!-- 上述浮层组件的布局样式（纯 overlay 层，不复用旧设计系统的其它部分） -->
  <link rel="stylesheet" href="/css/material/components/overlay.css">${pageStyleBlock}
</head>
<body>
  <!-- 站点维护模式的遮罩容器。api.js 的 applyOverlay()/showSiteClosedOverlay()
       都从 document.getElementById('sco') 取元素，拿不到就直接 return ——
       旧页面在 HTML 里提供这个空容器，这里必须保持一致，否则维护模式形同虚设。 -->
  <div id="sco" style="position:fixed;inset:0;z-index:99999;background:var(--md-primary);opacity:0;pointer-events:none;transition:opacity .2s"></div>

  <div id="winui-root"></div>

  <!-- 遗留脚本：提供 getUser / isAdmin / toast / fetchWithCache / apiGet 等全局能力。
       winui-legacy-bridge.js 必须最先加载（api.js 会调用 nav.js 的加载指示函数，
       而 WinUI 页面不加载 nav.js）。nav.js 本身一律不要 —— 导航由 NavigationView 承担。 -->
${scriptTags}

  <script type="module" src="/src/pages/${name}/main.ts"></script>
</body>
</html>
`
}

function buildMain(name) {
  const override = COMPONENT_OVERRIDE[name]
  const comp = componentName(name)
  // 组件名可以被覆盖（如 404 → NotFoundApp），但导入标识符必须合法
  const ident = override ? override.replace(/\.vue$/, '') : `${comp}App`
  const file = override ? override.replace(/\.vue$/, '') : `${comp}App`
  return `import { mountWinUI } from '../../shared/bootstrap'
import ${ident} from './${file}.vue'

mountWinUI(${ident})
`
}

let created = 0
for (const name of targets) {
  if (!PAGE_SCRIPTS[name]) {
    console.warn(`跳过未登记脚本组合的页面：${name}`)
    continue
  }
  mkdirSync(resolve(root, 'src/pages', name), { recursive: true })
  writeFileSync(resolve(root, `${name}.html`), buildHtml(name))
  writeFileSync(resolve(root, 'src/pages', name, 'main.ts'), buildMain(name))
  created++
  console.log(`✓ ${name}.html + src/pages/${name}/main.ts`)
}
console.log(`\n共生成 ${created} 个页面外壳。内容组件需人工编写：src/pages/<name>/<Name>App.vue`)
