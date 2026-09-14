/**
 * 图标字形校验
 *
 * 随包字体 SEGOEICONS.TTF 已按实际用到的码位做过子集化（见 scripts/subset-icons.mjs），
 * 只保留约 100 个字形。因此任何新增图标都必须跑这道校验，
 * 否则在 Android / iOS 上会渲染成豆腐块。
 *
 * 校验两件事：
 *  1. src/shared/icons.ts 的每个字形都在子集字体里
 *  2. src/ 下任何位置引用到的字形，只要原字体本来就有，子集里也必须还有
 *     （防止子集化时漏收 —— 这条由 subset-icons.mjs 保证，这里做回归兜底）
 *
 * 用法：node scripts/check-glyphs.mjs   （或 npm run check:glyphs）
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFontCodepoints } from './font-cmap.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = join(root, 'src/winui/assets/Fonts')
const SUBSET = join(FONT_DIR, 'SEGOEICONS.TTF')
const FULL = join(FONT_DIR, 'SEGOEICONS.full.ttf')

const hex = (c) => 'U+' + c.toString(16).toUpperCase()
const font = readFontCodepoints(SUBSET)

/* ── 1. icons.ts 的字形 ── */
const src = readFileSync(resolve(root, 'src/shared/icons.ts'), 'utf8')
const entries = [...src.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'\\u([0-9A-Fa-f]{4})'/gm)].map(
  (m) => ({ name: m[1], code: m[2].toUpperCase() })
)
const missing = entries.filter((e) => !font.has(parseInt(e.code, 16)))

console.log(`图标表共 ${entries.length} 个字形，子集字体覆盖 ${entries.length - missing.length} 个`)
if (missing.length) {
  console.error('\n以下字形不在字体子集内（会渲染成豆腐块）：')
  for (const m of missing) console.error(`  ${m.name}  U+${m.code}`)
  console.error('\n若是新加的图标，改完 icons.ts 后跑一次：node scripts/subset-icons.mjs')
  process.exit(1)
}

/* ── 2. 全量引用覆盖回归（只有完整字体在时才做） ── */
if (existsSync(FULL)) {
  const full = readFontCodepoints(FULL)
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (['.vue', '.ts', '.css', '.js'].includes(extname(name))) out.push(p)
    }
    return out
  }
  const referenced = new Set()
  for (const file of walk(join(root, 'src'))) {
    const s = readFileSync(file, 'utf8')
    for (const m of s.matchAll(/&#x([0-9A-Fa-f]{4,5});/g)) referenced.add(parseInt(m[1], 16))
    for (const m of s.matchAll(/\\u([EFef][0-9A-Fa-f]{3})/g)) referenced.add(parseInt(m[1], 16))
    for (const m of s.matchAll(/'([EFef][0-9A-Fa-f]{3})'/g)) referenced.add(parseInt(m[1], 16))
    /* 直接写在模板里的**字面**私用区字符（如 <span>󾞍</span>）。
       只扫转义写法会漏掉它们 —— 而漏掉的表现就是「图标是个框框」，
       而且本脚本此前也是这么漏的（PasswordBox 的眼睛 / TextBox 的清除 X）。 */
    for (const ch of s) {
      const cp = ch.codePointAt(0)
      if (cp >= 0xe000 && cp <= 0xf8ff) referenced.add(cp)
    }
  }
  const lost = [...referenced].filter((c) => full.has(c) && !font.has(c)).sort((a, b) => a - b)
  if (lost.length) {
    console.error(`\n✗ 源码引用了 ${lost.length} 个原字体中存在、但子集里缺失的字形：`)
    console.error('  ' + lost.map(hex).join(' '))
    console.error('\n跑一次 node scripts/subset-icons.mjs 重新生成子集。')
    process.exit(1)
  }
  const unusable = [...referenced].filter((c) => !full.has(c)).length
  console.log(`源码引用的字形中，原字体本就缺失的有 ${unusable} 个（不阻塞，渲染时会回退）`)
}

console.log('✅ 全部字形均可用')
