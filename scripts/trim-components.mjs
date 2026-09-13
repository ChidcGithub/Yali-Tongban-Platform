/**
 * 按依赖闭包裁剪控件注册表（重建版）
 *
 * 背景：src/winui/index.ts 为方便页面书写而 import 了全部上游控件，
 * Rollup 因此把它们全部打进共享 chunk（816KB JS+CSS）。
 * 实测模板只用到 23 个标签，闭包后只需 32 个组件文件，可省约 40%。
 *
 * 实现要点：**整体重建**注册表，而不是逐条删除原文件里的行 ——
 * 后者会漏掉别名注册（如 `SymbolIconSource: SymbolIcon,`，
 * 标识符被删但引用还在，运行时 ReferenceError）。曾因此翻车一次。
 *
 * 用法：
 *   node scripts/trim-components.mjs --dry    仅报告
 *   node scripts/trim-components.mjs          执行
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')

/* 1. 拿到闭包分析给出的保留文件清单 */
const analysis = execFileSync(process.execPath, [join(root, 'scripts/analyze-components.mjs')], {
  encoding: 'utf8'
})
const keepFiles = new Set(
  (analysis.split('保留清单:')[1] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)
)

/* 2. 解析原 index.ts 的结构 */
const src = readFileSync(resolve(root, 'src/winui/index.ts'), 'utf8')
const lines = src.split('\n')

/* import 行 → { line, idents[], rel } */
const imports = []
for (const line of lines) {
  if (!/^import\s/.test(line)) continue
  const m = line.match(/from\s+'\.\/components\/([^']+)'/)
  if (!m) continue
  const rel0 = m[1]
  const cands = [rel0, `${rel0}.vue`, `${rel0}.ts`]
  const rel = cands.find((c) => keepFiles.has(c))
  const idents = []
  const def = line.match(/import\s+([A-Za-z][A-Za-z0-9]*)\s*(?:,|from)/)
  if (def) idents.push(def[1])
  const braces = line.match(/import\s*\{([^}]+)\}/)
  if (braces) {
    for (const part of braces[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (n && /^[A-Za-z]/.test(n)) idents.push(n)
    }
  }
  imports.push({ line, idents, rel, keep: !!rel })
}

const keptIdents = new Set(imports.filter((i) => i.keep).flatMap((i) => i.idents))
const droppedIdents = new Set(imports.filter((i) => !i.keep).flatMap((i) => i.idents))

/* 3. 解析注册表条目与导出 */
const regStart = src.indexOf('export const COMPONENTS')
const regBody = src.slice(regStart, src.indexOf('\n}', regStart))
const regEntries = []
for (const line of regBody.split('\n')) {
  const m = line.match(/^\s*(?:'([^']+)'|([A-Za-z][A-Za-z0-9]*))\s*:\s*([A-Za-z][A-Za-z0-9]*)\s*,?\s*$/)
  if (m) regEntries.push({ key: m[1] ?? m[2], val: m[3], quoted: !!m[1] })
  else {
    const short = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*,?\s*$/)
    if (short) regEntries.push({ key: short[1], val: short[1], quoted: false })
  }
}

const exportBlock = src.slice(src.indexOf('export {'), src.indexOf('\n}', src.indexOf('export {')))
const exportNames = exportBlock
  .split('\n')
  .slice(1)
  .map((l) => l.trim().replace(/,$/, '').trim())
  .filter((n) => /^[A-Za-z]/.test(n))

/* 4. 过滤：只保留引用了全为保留标识符的条目 */
const keepEntries = regEntries.filter((e) => keptIdents.has(e.val))
const dropEntries = regEntries.filter((e) => !keptIdents.has(e.val))
const keepExports = exportNames.filter((n) => keptIdents.has(n))
const dropExports = exportNames.filter((n) => !keptIdents.has(n))

console.log(`import: 保留 ${imports.filter((i) => i.keep).length} / 裁掉 ${imports.filter((i) => !i.keep).length}`)
console.log(`注册表条目: 保留 ${keepEntries.length} / 裁掉 ${dropEntries.length}`)
console.log(`具名导出: 保留 ${keepExports.length} / 裁掉 ${dropExports.length}`)

if (dry) {
  console.log('\n将裁掉的注册表条目:')
  console.log('  ' + dropEntries.map((e) => e.key).join(', '))
  process.exit(0)
}

/* 5. 重建文件 */
const header = lines.slice(0, lines.findIndex((l) => /^import\s/.test(l))).join('\n')
const importLines = imports.filter((i) => i.keep).map((i) => i.line)
const i18nImport = lines.find((l) => l.includes("'./components/i18n/index'")) ?? ''

const fmtKey = (e) => (e.quoted || /[.\-]/.test(e.key) ? `'${e.key}'` : e.key)
const regLines = keepEntries.map((e) =>
  fmtKey(e) === e.val ? `  ${e.val},` : `  ${fmtKey(e)}: ${e.val},`
)

const tail = src.slice(src.indexOf('export interface WinUIOptions'))

const rebuilt = [
  header,
  importLines.join('\n'),
  i18nImport,
  '',
  '/** 注册表：键即模板中使用的标签名。条目按依赖闭包裁剪，详见 scripts/trim-components.mjs */',
  'export const COMPONENTS: Record<string, Component> = {',
  regLines.join('\n'),
  '}',
  '',
  '/* 具名导出，供页面按需直接 import */',
  'export {',
  keepExports.map((n) => `  ${n}`).join(',\n'),
  '}',
  '',
  tail
].join('\n')

writeFileSync(resolve(root, 'src/winui/index.ts'), rebuilt)
console.log('\n已重建 src/winui/index.ts')
console.log('接着跑：npm run check:components && npm run build')
