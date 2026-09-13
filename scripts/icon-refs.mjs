/**
 * 图标引用完整性检查
 *
 * 双向校验：
 *  1. 代码里 GLYPH.x 引用的每个名字，必须在 src/shared/icons.ts 里有定义
 *     （否则构建后是 undefined，FontIcon 会渲染成空白 —— 静态检查抓不到）
 *  2. 表里定义的条目是否真的被用到（未使用的可以删掉，缩小字体子集）
 *
 * 用法：node scripts/icon-refs.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.vue', '.ts'].includes(extname(name))) out.push(p)
  }
  return out
}

const tableSrc = readFileSync(join(root, 'src/shared/icons.ts'), 'utf8')
const defined = new Set(
  [...tableSrc.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'\\u[0-9A-Fa-f]{4}'/gm)].map((m) => m[1])
)

const used = new Map()
for (const file of walk(join(root, 'src'))) {
  if (file.endsWith('shared/icons.ts')) continue
  const s = readFileSync(file, 'utf8')
  for (const m of s.matchAll(/GLYPH\.([A-Za-z][A-Za-z0-9]*)/g)) {
    if (!used.has(m[1])) used.set(m[1], file.replace(root + '\\', '').replace(root + '/', ''))
  }
}

const undefinedRefs = [...used].filter(([name]) => !defined.has(name))
const unused = [...defined].filter((name) => !used.has(name))

console.log(`表内定义 ${defined.size} 个 · 被引用 ${used.size} 个`)

let failed = false
if (undefinedRefs.length) {
  failed = true
  console.error('\n❌ 以下引用在 icons.ts 里没有定义（FontIcon 会渲染空白）：')
  for (const [name, file] of undefinedRefs) console.error(`  GLYPH.${name}   ← ${file}`)
}
if (unused.length) {
  console.log(`\n未使用（可删，能进一步缩小字体子集）：${unused.join(', ')}`)
}

if (failed) process.exit(1)
console.log('\n✅ 图标引用完整')
