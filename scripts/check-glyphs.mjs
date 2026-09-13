/**
 * 图标字形校验
 *
 * src/shared/icons.ts 里的字形必须真实存在于随包字体 SEGOEICONS.TTF 中，
 * 否则在 Android / iOS 上会渲染成豆腐块（该字体是子集，仅 1993 个码位）。
 *
 * 用法：node scripts/check-glyphs.mjs   （或 npm run check:glyphs）
 * 退出码非 0 表示存在缺失字形。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 解析 TTF 的 cmap，返回已映射的码位集合 */
function readFontCodepoints(file) {
  const buf = readFileSync(file)
  const numTables = buf.readUInt16BE(4)
  let cmapOff = 0
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    if (buf.toString('ascii', off, off + 4) === 'cmap') {
      cmapOff = buf.readUInt32BE(off + 8)
    }
  }
  if (!cmapOff) throw new Error('字体中未找到 cmap 表')

  const n = buf.readUInt16BE(cmapOff + 2)
  let best = 0
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8
    const sub = cmapOff + buf.readUInt32BE(rec + 4)
    if (buf.readUInt16BE(sub) === 4 && !best) best = sub
  }
  if (!best) throw new Error('未找到 cmap format 4 子表')

  const segX2 = buf.readUInt16BE(best + 6)
  const seg = segX2 / 2
  const endO = best + 14
  const startO = endO + segX2 + 2
  const deltaO = startO + segX2
  const rangeO = deltaO + segX2

  const set = new Set()
  for (let i = 0; i < seg; i++) {
    const end = buf.readUInt16BE(endO + i * 2)
    const start = buf.readUInt16BE(startO + i * 2)
    if (start === 0xffff) continue
    const delta = buf.readInt16BE(deltaO + i * 2)
    const ro = buf.readUInt16BE(rangeO + i * 2)
    for (let c = start; c <= end && c < 0xffff; c++) {
      if (ro === 0) {
        set.add((c + delta) & 0xffff)
      } else {
        const gi = buf.readUInt16BE(rangeO + i * 2 + ro + (c - start) * 2)
        if (gi !== 0) set.add((c + delta) & 0xffff)
      }
    }
  }
  return set
}

const font = readFontCodepoints(resolve(root, 'src/winui/assets/Fonts/SEGOEICONS.TTF'))
const src = readFileSync(resolve(root, 'src/shared/icons.ts'), 'utf8')

const entries = [...src.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'\\u([0-9A-Fa-f]{4})'/gm)].map(
  (m) => ({ name: m[1], code: m[2].toUpperCase() })
)

const missing = entries.filter((e) => !font.has(parseInt(e.code, 16)))

console.log(`图标表共 ${entries.length} 个字形，字体覆盖 ${entries.length - missing.length} 个`)
if (missing.length) {
  console.error('\n以下字形不在字体子集内（会渲染成豆腐块）：')
  for (const m of missing) console.error(`  ${m.name}  U+${m.code}`)
  console.error('\n请换用已覆盖的码位。')
  process.exit(1)
}
console.log('✅ 全部字形均可用')
