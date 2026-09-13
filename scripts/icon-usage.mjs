/**
 * 图标使用情况分析（仅工具，不参与构建）
 *
 * 用途：确认 src/shared/icons.ts 里哪些字形真的被用到。
 * 未使用的可以直接删掉 —— 图标表越小，子集字体越小、语义错配的机会越少。
 *
 * 用法：node scripts/icon-usage.mjs
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

const table = readFileSync(join(root, 'src/shared/icons.ts'), 'utf8')
const all = [...table.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'\\u([0-9A-Fa-f]{4})'/gm)].map((m) => ({
  name: m[1],
  code: m[2].toUpperCase()
}))

const used = new Set()
for (const file of walk(join(root, 'src'))) {
  if (file.endsWith('shared/icons.ts')) continue
  const s = readFileSync(file, 'utf8')
  for (const m of s.matchAll(/GLYPH\.([A-Za-z0-9]+)/g)) used.add(m[1])
}

const unused = all.filter((i) => !used.has(i.name))
console.log(`图标表共 ${all.length} 个，实际用到 ${all.length - unused.length} 个`)
if (unused.length) {
  console.log(`\n未使用（可删）：`)
  for (const i of unused) console.log(`  ${i.name}  U+${i.code}`)
}
