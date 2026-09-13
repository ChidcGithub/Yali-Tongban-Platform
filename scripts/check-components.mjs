/**
 * 组件注册校验
 *
 * Vue 对**未注册**的 PascalCase 标签不会报错 —— 它会当成未知 HTML 元素
 * 原样输出。后果是页面零 JS 错误、构建通过，但控件根本没渲染
 * （本项目已因此踩过两次：TextBlock/NavigationView 那批，以及后来的 Slider）。
 *
 * 本脚本扫描所有页面/组件模板里用到的 PascalCase 标签，
 * 校验它们要么在 src/winui/index.ts 的 COMPONENTS 里注册过，
 * 要么在该文件内被显式 import。
 *
 * 用法：node scripts/check-components.mjs   （或 npm run check:components）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 从注册表文件里取出已注册的标签名 */
function readRegistry() {
  const src = readFileSync(resolve(root, 'src/winui/index.ts'), 'utf8')
  const start = src.indexOf('export const COMPONENTS')
  const end = src.indexOf('\n}', start)
  const body = src.slice(start, end)
  const names = new Set()
  // 形如 `  TextBlock,` 或 `  'Expander.Header': ExpanderHeader,`
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*'([^']+)'\s*:/) || line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*,?\s*$/)
    if (m) names.add(m[1])
    // 别名形式 `  SymbolIconSource: SymbolIcon,`
    const alias = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*[A-Za-z]/, )
    if (alias) names.add(alias[1])
  }
  return names
}

/** 递归收集 .vue 文件 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 模板里用到的 PascalCase 标签 */
function templateTags(src) {
  const tpl = src.match(/<template>([\s\S]*)<\/template>/)
  if (!tpl) return []
  const tags = new Set()
  for (const m of tpl[1].matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) tags.add(m[1])
  for (const m of tpl[1].matchAll(/<([A-Z][A-Za-z0-9]*)\.[A-Za-z]+[\s/>]/g)) tags.add(m[1])
  return [...tags]
}

/** 该文件内显式 import 的组件名 */
function localImports(src) {
  const names = new Set()
  for (const m of src.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s+from/g)) names.add(m[1])
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (n && /^[A-Z]/.test(n)) names.add(n)
    }
  }
  return names
}

/**
 * Vue 内置组件：不需要（也不该）在 WinUI 注册表里登记。
 * 不排除的话，模板里写 `<Transition>` 会被报成「控件未注册」——
 * 假警报会让人去注册一个根本不该注册的标签。
 */
const VUE_BUILTINS = new Set([
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Teleport',
  'Suspense',
  'Component',
  'Slot'
])

const registry = readRegistry()
const files = [
  ...walk(resolve(root, 'src/pages')),
  ...walk(resolve(root, 'src/components'))
]

const problems = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const local = localImports(src)
  for (const tag of templateTags(src)) {
    if (registry.has(tag) || local.has(tag) || VUE_BUILTINS.has(tag)) continue
    problems.push({ file: relative(root, file), tag })
  }
}

console.log(`已注册控件 ${registry.size} 个；扫描 ${files.length} 个文件`)
if (problems.length) {
  console.error('\n以下标签未注册，会被 Vue 当成未知 HTML 元素（不报错但控件不渲染）：')
  const byFile = {}
  for (const p of problems) (byFile[p.file] ??= []).push(p.tag)
  for (const [f, tags] of Object.entries(byFile)) {
    console.error(`  ${f}: ${[...new Set(tags)].join(', ')}`)
  }
  console.error('\n请在 src/winui/index.ts 的 COMPONENTS 中登记，或在文件内显式 import。')
  process.exit(1)
}
console.log('✅ 模板用到的控件均已注册')
