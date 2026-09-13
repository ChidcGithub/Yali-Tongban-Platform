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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
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
  login: ['base', 'captcha']
}

const ALL = Object.keys(PAGE_SCRIPTS)

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

function buildHtml(name) {
  const title = resolveTitle(name)
  const keys = PAGE_SCRIPTS[name] ?? ['base']
  const scripts = [...new Set(keys.flatMap((k) => SCRIPTS[k] ?? []))]
  const scriptTags = scripts.map((s) => `  <script src="${s}"></script>`).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="icon" href="/icon/emblem.ico" type="image/x-icon">
</head>
<body>
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
  const comp = componentName(name)
  return `import { mountWinUI } from '../../shared/bootstrap'
import ${comp}App from './${comp}App.vue'

mountWinUI(${comp}App)
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
