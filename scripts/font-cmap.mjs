/**
 * TTF cmap 解析（供 check-glyphs.mjs / subset-icons.mjs 共用）
 *
 * 单独成模块的原因：字形校验与子集化必须用**同一份**解析逻辑，
 * 否则两边的判断会不一致 —— 早先就出现过「校验脚本的解析错了，
 * 却因为全字体的分段结构碰巧通过」这种假绿。
 */
import { readFileSync } from 'node:fs'

/**
 * 返回字体已映射的**码位**集合。
 *
 * 注意：format 4 里 idDelta 与 glyphIdArray 给的是字形 ID，不是码位 ——
 * 要加入集合的始终是字符 c 本身。把 `c + idDelta` 当码位是错的。
 */
export function readFontCodepoints(file) {
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
  let f4 = 0
  let f12 = 0
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8
    const sub = cmapOff + buf.readUInt32BE(rec + 4)
    const fmt = buf.readUInt16BE(sub)
    if (fmt === 4 && !f4) f4 = sub
    if (fmt === 12 && !f12) f12 = sub
  }

  const set = new Set()

  if (f4) {
    const segX2 = buf.readUInt16BE(f4 + 6)
    const seg = segX2 / 2
    const endO = f4 + 14
    const startO = endO + segX2 + 2
    const rangeO = startO + segX2 + segX2
    for (let i = 0; i < seg; i++) {
      const end = buf.readUInt16BE(endO + i * 2)
      const start = buf.readUInt16BE(startO + i * 2)
      if (start === 0xffff) continue
      const ro = buf.readUInt16BE(rangeO + i * 2)
      for (let c = start; c <= end && c < 0xffff; c++) {
        if (ro === 0) {
          set.add(c)
        } else {
          // 逐字符查 glyphIdArray：非 0 才说明这个码位真的有字形
          const gi = buf.readUInt16BE(rangeO + i * 2 + ro + (c - start) * 2)
          if (gi !== 0) set.add(c)
        }
      }
    }
  }

  if (f12) {
    const groups = buf.readUInt32BE(f12 + 12)
    for (let i = 0; i < groups; i++) {
      const o = f12 + 16 + i * 12
      const s = buf.readUInt32BE(o)
      const e = buf.readUInt32BE(o + 4)
      for (let c = s; c <= e; c++) set.add(c)
    }
  }

  if (!f4 && !f12) throw new Error('未找到可用的 cmap 子表（format 4 / 12）')
  return set
}
