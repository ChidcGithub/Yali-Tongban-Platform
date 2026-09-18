/**
 * 构建期守卫：functions/ 里不得「调用了但没声明/没导入」的标识符
 * ══════════════════════════════════════════════════════════
 * 为什么需要它：
 *   `functions/api/activities.js` 的**未登录报名**分支调了 `checkRateLimit`，
 *   而它没写在 import 清单里（函数本身在 `_utils.js` 里有）。
 *   一行代码只在匿名分支执行 → 一走到就 ReferenceError → 路由兜底成 **500**。
 *   用户看到的是「未登录报名失败」，控制台只有一个 500，没有任何提示说少了 import。
 *
 * 为什么现有检查都没拦住：
 *   - `node --check` 只查**语法**，不查作用域（`checkRateLimit(...)` 语法完全合法）
 *   - `npm run build` 只构建前端，**根本不看 functions/**
 *   - 冒烟测试把 `/api/*` 全部打桩，真实 handler 从来不执行
 *   → 后端代码整体处于「没有守卫」的状态。这个脚本补上最要命的那一类。
 *
 * 判据：以**裸标识符形式被调用**（`foo(...)`，非 `obj.foo(...)`）的名字，
 * 必须出现在「导入 / 声明 / 平台全局」三者之一里。
 * ══════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/* 解析器：@babel/parser 在 devDependencies 里显式声明。
   注：它同时是 @vue/compiler-sfc 的依赖，版本对齐到同一个 7.x，只装一份。 */
let parser
try {
  parser = require('@babel/parser')
} catch {
  console.error('✗ 找不到 @babel/parser（npm i -D @babel/parser）。它用于解析 functions/ 的 AST。')
  process.exit(1)
}

/** 运行时/平台自带 —— 不算「漏导入」 */
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
  // Web / Cloudflare Workers 平台
  'console', 'fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File',
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'atob', 'btoa', 'crypto', 'performance', 'caches', 'WebSocket'
])

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

function analyze(file) {
  const src = readFileSync(file, 'utf8')
  const ast = parser.parse(src, { sourceType: 'module', errorRecovery: true })

  const declared = new Set()
  const called = new Map() // name → 首次出现的行号

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
    } else if (node.type === 'VariableDeclarator') {
      collectPattern(node.id, declared)
    } else if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      for (const p of node.params) collectPattern(p, declared)
      if (node.id) declared.add(node.id.name)
    } else if (node.type === 'CatchClause') {
      collectPattern(node.param, declared)
    }

    /* ── 裸标识符调用 ── */
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier') {
      const name = node.callee.name
      if (!called.has(name)) called.set(name, node.loc ? node.loc.start.line : 0)
    }
  })

  const missing = []
  for (const [name, line] of called) {
    if (declared.has(name) || GLOBALS.has(name)) continue
    missing.push({ name, line })
  }
  return missing
}

/* ── 判据二：导入的名字必须在目标模块里真的有导出 ──
   写错名字（或对方改名了）在 ESM 里是**链接期错误**：
   不仅是那一行出错，而是**整个模块的所有请求都 500**。
   这比第一个判据更致命，但同样只有运行时才暴露。 */

/** 目标模块导出了哪些名字 */
function exportedNames(file) {
  const ast = parser.parse(readFileSync(file, 'utf8'), { sourceType: 'module', errorRecovery: true })
  const names = new Set()
  let hasStar = false
  walk(ast, (node) => {
    if (node.type === 'ExportNamedDeclaration') {
      const d = node.declaration
      if (d) {
        if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') {
          if (d.id) names.add(d.id.name)
        } else if (d.type === 'VariableDeclaration') {
          for (const decl of d.declarations) collectPattern(decl.id, names)
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
  return { names, hasStar }
}

const exportCache = new Map()
function exportsOf(file) {
  if (!exportCache.has(file)) exportCache.set(file, exportedNames(file))
  return exportCache.get(file)
}

/** 返回该文件里「导入了但目标模块没有」的清单 */
function badImports(file) {
  const ast = parser.parse(readFileSync(file, 'utf8'), { sourceType: 'module', errorRecovery: true })
  const bad = []
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const spec = String(node.source.value || '')
    if (!spec.startsWith('.')) return // 裸模块名（项目里目前没有）
    const target = resolve(dirname(file), spec)
    if (!existsSync(target)) {
      bad.push({ line: node.loc?.start.line ?? 0, name: `（模块不存在）${spec}` })
      return
    }
    const { names, hasStar } = exportsOf(target)
    if (hasStar) return
    for (const s of node.specifiers || []) {
      const line = s.loc?.start.line ?? node.loc?.start.line ?? 0
      if (s.type === 'ImportNamespaceSpecifier') continue
      if (s.type === 'ImportDefaultSpecifier') {
        if (!names.has('default')) bad.push({ line, name: `default ← ${spec}` })
        continue
      }
      const imported = s.imported.name || s.imported.value
      if (!names.has(imported)) bad.push({ line, name: `${imported} ← ${spec}` })
    }
  })
  return bad
}

/* ── 扫描 ── */
const root = process.argv[2] || 'functions'
const files = []
;(function collect(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p)
    else if (name.endsWith('.js')) files.push(p)
  }
})(root)

let bad = 0
let importBad = 0
for (const f of files) {
  let missing
  try {
    missing = analyze(f)
  } catch (err) {
    console.log(`✗ ${f}\n   解析失败：${err.message.split('\n')[0]}`)
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
  if (bad) console.log(`✗ ${bad} 处「调用了但没导入/声明」的标识符 —— 运行时会 ReferenceError（表现为 500）`)
  if (importBad) console.log(`✗ ${importBad} 处「导入了不存在的名字」—— ESM 链接期错误，整个模块全部请求都会 500`)
  process.exit(1)
}
console.log(`✅ 后端检查通过（${files.length} 个文件：无未声明的调用、无错误的导入）`)
