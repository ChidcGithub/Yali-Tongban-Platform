/**
 * 构建期守卫：代码里不得出现「调用了但没声明/没导入」的标识符
 * ══════════════════════════════════════════════════════════
 * 覆盖范围：`functions/` + 本站自研前端（`src/pages` `src/shared` `src/components`）。
 * 刻意**不含** `src/winui/` —— 那是 vendor 进来的上游组件库（GPL-3.0），
 * 跟着上游走，扫它只会带来噪声。
 *
 * ── 为什么需要它（两个真实事故） ──
 * ① 后端 `functions/api/activities.js` 的**未登录报名**分支调了 `checkRateLimit`，
 *    而它没写在 import 清单里（函数本身在 `_utils.js` 里有）。
 *    一行代码只在匿名分支执行 → 一走到就 ReferenceError → 路由兜底成 **500**。
 * ② 前端 `src/components/YaliShell.vue` 的 `loadUnread()` 调了 `apiGet`，
 *    同样没导入。这次更隐蔽：调用点外面裹着 `try/catch`，
 *    于是 ReferenceError 被吞成「静默失败」—— 侧栏「消息」未读徽标恒为 0，
 *    页面零报错、构建通过、回归全绿。**只有人肉读代码才发现得了**。
 *
 * ── 为什么现有检查都拦不住 ──
 *   - `node --check` 只查**语法**，不查作用域（`apiGet(...)` 语法完全合法）
 *   - `npm run build` 原本只构建前端、根本不看 `functions/`
 *   - `check-components.mjs` 只查「组件有没有注册」，不看脚本里的标识符
 *   - 冒烟测试把 `/api/*` 全打桩，真实 handler 从来不执行
 *
 * ── 两条判据 ──
 *   判据一：以**裸标识符形式被调用**（`foo(...)` / `foo?.(...)`，非 `obj.foo(...)`）的名字，
 *           必须出现在「导入 / 声明 / 平台与浏览器全局」三者之一里。
 *   判据二：`import { x } from './y'` 里的 `x`，必须在目标模块里**真的有导出**。
 *           写错名字在 ESM 里是**链接期错误**：不只是那一行失效，
 *           而是**整个模块的所有请求都 500** —— 比判据一更致命。
 * ══════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/* 解析器：@babel/parser 在 devDependencies 里显式声明。
   注：它同时是 @vue/compiler-sfc 的依赖，版本必须对齐到同一个 7.x，只装一份。 */
let parser
try {
  parser = require('@babel/parser')
} catch {
  console.error('✗ 找不到 @babel/parser（npm i -D @babel/parser）。它用于解析 AST。')
  process.exit(1)
}
/** 解析 .vue 的 script 块。缺了就降级成正则抽取，不阻断构建 */
let compilerSfc = null
try {
  compilerSfc = require('@vue/compiler-sfc')
} catch {
  /* 降级路径见 scriptBlocks() */
}

/** 运行时 / 平台 / 浏览器自带 —— 不算「漏导入」 */
const GLOBALS = new Set([
  // 语言内建
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'EvalError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Function',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'escape', 'unescape', 'eval', 'structuredClone', 'Intl',
  'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'DataView',
  'globalThis', 'undefined', 'NaN', 'Infinity', 'arguments',
  // Cloudflare Workers / Web 平台通用
  'console', 'fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File',
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'atob', 'btoa', 'crypto', 'performance', 'caches', 'WebSocket',
  // 浏览器环境（前端页面才有）
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'scrollTo',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'Event', 'CustomEvent', 'EventTarget', 'Node', 'Element', 'HTMLElement', 'SVGElement',
  'Image', 'FileReader', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'DOMParser', 'XMLSerializer', 'DOMException', 'CSS', 'Notification',
  // Vue 编译器宏（<script setup> 里免导入）
  'defineProps', 'defineEmits', 'defineExpose', 'defineOptions', 'defineSlots',
  'defineModel', 'withDefaults', 'useSlots', 'useAttrs'
])

/* ── 站点遗留全局（`public/js/*.js` 是**经典脚本**）──
   classic script 的顶层 `function` 与 `var` 会挂到 window 上，
   而 ESM 里的自由标识符会沿作用域链**回落到全局对象** —— 所以 `src/` 里
   「裸用」这些名字是能跑通的：
     · 404 彩蛋的 `unlockAchievement` / `showAchievementToast`（api.js）
     · `YaliShell.vue` 曾长期裸用 `apiGet` —— 没导入也能跑，纯靠这条回落
   它们因此不算「漏导入」。
   ⚠️ 但这份清单是**从源码现算**的，不是手写：哪天某个遗留函数被删掉或改名，
   `src/` 里还裸调着它就会立刻变红 —— 这才是这份白名单真正的价值。
   ⚠️ 顶层 `const`/`let` 不挂 window（经典脚本的既有事实），所以刻意只收 `var`。 */
function legacyGlobals() {
  const out = new Set()
  const dir = 'public/js'
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue
    let ast
    try {
      ast = parser.parse(readFileSync(join(dir, name), 'utf8'), {
        sourceType: 'script',
        errorRecovery: true
      })
    } catch {
      continue
    }
    const body = ast.program?.body || []
    for (const stmt of body) {
      if (stmt.type === 'FunctionDeclaration') {
        if (stmt.id) out.add(stmt.id.name)
      } else if (stmt.type === 'VariableDeclaration' && stmt.kind === 'var') {
        for (const d of stmt.declarations) collectPattern(d.id, out)
      } else if (stmt.type === 'ExpressionStatement') {
        // window.foo = …  /  globalThis.foo = function …
        const e = stmt.expression
        if (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression') {
          const o = e.left.object
          const p = e.left.property
          if (
            o.type === 'Identifier' &&
            (o.name === 'window' || o.name === 'globalThis') &&
            p.type === 'Identifier'
          ) {
            out.add(p.name)
          }
        }
      }
    }
  }
  return out
}
const LEGACY_GLOBALS = legacyGlobals()

/* ── source 抽取：普通文件直读；.vue 取 <script> / <script setup> ── */

/** 返回 [{ code, baseLine }]，baseLine = 该段第 1 行在**原文件**里的行号 */
function scriptBlocks(file) {
  if (!file.endsWith('.vue')) {
    return [{ code: readFileSync(file, 'utf8'), baseLine: 1 }]
  }
  const src = readFileSync(file, 'utf8')

  if (compilerSfc) {
    const { descriptor, errors } = compilerSfc.parse(src, { filename: file })
    if (errors && errors.length) throw new Error(String(errors[0].message || errors[0]))
    const out = []
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) out.push({ code: block.content, baseLine: block.loc.start.line })
    }
    return out
  }

  /* 降级：正则抽取（lang 属性随便，反正只是给 babel 看） */
  const out = []
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(src))) {
    const before = src.slice(0, m.index + m[0].indexOf(m[1]))
    out.push({ code: m[1], baseLine: before.split('\n').length })
  }
  return out
}

function parse(src) {
  return parser.parse(src, { sourceType: 'module', errorRecovery: true, plugins: ['typescript'] })
}

/** 遍历 AST（只看对象型节点即可） */
function walk(node, fn) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn)
    return
  }
  if (typeof node.type === 'string') fn(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    const v = node[key]
    if (v && typeof v === 'object') walk(v, fn)
  }
}

/** 从「绑定位置」的 pattern 里收名字（含解构 / 默认值 / rest） */
function collectPattern(node, out) {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      out.add(node.name)
      break
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'RestElement') collectPattern(p.argument, out)
        else collectPattern(p.value, out)
      }
      break
    case 'ArrayPattern':
      for (const el of node.elements) collectPattern(el, out)
      break
    case 'AssignmentPattern':
      collectPattern(node.left, out)
      break
    case 'RestElement':
      collectPattern(node.argument, out)
      break
    default:
      break
  }
}

/** 判据一：裸标识符调用 */
function bareCalls(ast, baseLine, declared, called) {
  walk(ast, (node) => {
    /* ── 收集所有声明出来的名字 ── */
    if (
      node.type === 'ImportSpecifier' ||
      node.type === 'ImportDefaultSpecifier' ||
      node.type === 'ImportNamespaceSpecifier'
    ) {
      declared.add(node.local.name)
    } else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      if (node.id) declared.add(node.id.name)
    } else if (node.type === 'TSDeclareFunction') {
      if (node.id) declared.add(node.id.name)
    } else if (node.type === 'VariableDeclarator') {
      collectPattern(node.id, declared)
    } else if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      for (const p of node.params) collectPattern(p, declared)
      if (node.id) declared.add(node.id.name)
    } else if (node.type === 'CatchClause') {
      collectPattern(node.param, declared)
    } else if (node.type === 'TSTypeAliasDeclaration' || node.type === 'TSInterfaceDeclaration') {
      declared.add(node.id.name)
    } else if (node.type === 'TSEnumDeclaration') {
      declared.add(node.id.name)
    }

    /* ── 裸标识符调用：foo(...) 与 foo?.(...) ── */
    if (
      (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') &&
      node.callee &&
      node.callee.type === 'Identifier'
    ) {
      const name = node.callee.name
      if (!called.has(name)) called.set(name, node.loc ? node.loc.start.line + baseLine - 1 : 0)
    }
  })
}

function analyze(file) {
  const declared = new Set()
  const called = new Map()
  for (const { code, baseLine } of scriptBlocks(file)) {
    if (!code.trim()) continue
    bareCalls(parse(code), baseLine, declared, called)
  }

  const missing = []
  for (const [name, line] of called) {
    if (declared.has(name) || GLOBALS.has(name) || LEGACY_GLOBALS.has(name)) continue
    missing.push({ name, line })
  }
  return missing
}

/* ── 判据二：导入的名字必须在目标模块里真的有导出 ── */

/** 目标模块导出了哪些名字 */
function exportedNames(file) {
  const names = new Set()
  let hasStar = false
  /* SFC 的默认导出是**编译期隐式产生**的（<script setup> 把整个组件当 default），
     源码里根本没有 `export default` 语句 → 不补这一行会把每个 .vue 导入都误报 */
  if (file.endsWith('.vue')) names.add('default')
  for (const { code } of scriptBlocks(file)) {
    if (!code.trim()) continue
    walk(parse(code), (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        const d = node.declaration
        if (d) {
          if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') {
            if (d.id) names.add(d.id.name)
          } else if (d.type === 'VariableDeclaration') {
            for (const decl of d.declarations) collectPattern(decl.id, names)
          } else if (d.type === 'TSTypeAliasDeclaration' || d.type === 'TSInterfaceDeclaration') {
            names.add(d.id.name)
          } else if (d.type === 'TSEnumDeclaration') {
            names.add(d.id.name)
          }
        }
        for (const sp of node.specifiers || []) {
          if (sp.type === 'ExportSpecifier') names.add(sp.exported.name || sp.exported.value)
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        names.add('default')
      } else if (node.type === 'ExportAllDeclaration') {
        hasStar = true // export * from … → 静态判断不了，放行
      }
    })
  }
  return { names, hasStar }
}

const exportCache = new Map()
function exportsOf(file) {
  if (!exportCache.has(file)) exportCache.set(file, exportedNames(file))
  return exportCache.get(file)
}

/** 相对路径 → 真实文件。前端没有构建期路径别名，逐个补扩展名即可 */
const EXTS = ['', '.ts', '.js', '.mjs', '.vue', '/index.ts', '/index.js']
function resolveModule(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  for (const ext of EXTS) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

/** 返回该文件里「导入了但目标模块没有」的清单 */
function badImports(file) {
  const bad = []
  for (const { code, baseLine } of scriptBlocks(file)) {
    if (!code.trim()) continue
    const ast = parse(code)
    const at = (n) => (n?.loc?.start.line ?? 1) + baseLine - 1
    walk(ast, (node) => {
      if (node.type !== 'ImportDeclaration') return
      const spec = String(node.source.value || '')
      if (!spec.startsWith('.')) return // 裸模块名（vue 等）
      const target = resolveModule(file, spec)
      if (!target) {
        bad.push({ line: at(node), name: `（模块不存在）${spec}` })
        return
      }
      /* 目标是 css / 静态资源：没有 JS 导出可查 */
      if (!/\.(ts|js|mjs|vue)$/.test(target)) return
      const { names, hasStar } = exportsOf(target)
      if (hasStar) return
      for (const s of node.specifiers || []) {
        if (s.type === 'ImportNamespaceSpecifier') continue
        if (s.type === 'ImportDefaultSpecifier') {
          if (!names.has('default')) bad.push({ line: at(s), name: `default ← ${spec}` })
          continue
        }
        const imported = s.imported.name || s.imported.value
        if (!names.has(imported)) bad.push({ line: at(s), name: `${imported} ← ${spec}` })
      }
    })
  }
  return bad
}

/* ── 扫描 ── */
/** 默认扫后端 + 自研前端；`src/winui/` 是 vendor 代码，刻意排除 */
const DEFAULT_ROOTS = ['functions', 'src/pages', 'src/shared', 'src/components']
const roots = process.argv.slice(2).filter((a) => !a.startsWith('-')).length
  ? process.argv.slice(2).filter((a) => !a.startsWith('-'))
  : DEFAULT_ROOTS

const EXTS_SCAN = ['.js', '.ts', '.vue']
const files = []
for (const root of roots) {
  if (!existsSync(root)) continue
  ;(function collect(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) collect(p)
      else if (EXTS_SCAN.some((e) => name.endsWith(e))) files.push(p)
    }
  })(root)
}

let bad = 0
let importBad = 0
for (const f of files) {
  let missing
  try {
    missing = analyze(f)
  } catch (err) {
    console.log(`✗ ${f}\n   解析失败：${String(err.message || err).split('\n')[0]}`)
    bad += 1
    continue
  }
  if (missing.length) {
    bad += missing.length
    console.log(`✗ ${f}`)
    for (const m of missing) {
      console.log(`   第 ${m.line} 行：${m.name}(…) ← 未声明也未导入`)
    }
  }

  let wrongImports
  try {
    wrongImports = badImports(f)
  } catch {
    wrongImports = []
  }
  if (wrongImports.length) {
    importBad += wrongImports.length
    console.log(`✗ ${f}`)
    for (const m of wrongImports) {
      console.log(`   第 ${m.line} 行：导入了不存在的名字 ${m.name}`)
    }
  }
}

if (bad || importBad) {
  console.log('')
  if (bad) {
    console.log(
      `✗ ${bad} 处「调用了但没导入/声明」的标识符 —— 运行时 ReferenceError。` +
        `后端表现为 500；前端若外面裹着 try/catch 会被吞成静默失败（连报错都没有）`
    )
  }
  if (importBad) {
    console.log(`✗ ${importBad} 处「导入了不存在的名字」—— ESM 链接期错误，整个模块全部请求都会 500`)
  }
  process.exit(1)
}
console.log(`✅ 标识符检查通过（${files.length} 个文件：无未声明的调用、无错误的导入）`)
