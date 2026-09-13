/**
 * 图标字体子集化
 *
 * 随包分发的 SEGOEICONS.TTF 原本 454 KB（Windows 的系统图标字体，cmap 2008 个码位），
 * 但整站实际只用到约 100 个字形 —— 字体是每页都要下载的资源，白白多传 430 KB。
 *
 * 本脚本扫描 src/ 下所有字形引用（icons.ts 常量、组件里的 &#xNNNN; 实体、
 * \uNNNN 转义、以及组件内部图标名映射表里的十六进制字面量），
 * 用 pyftsubset 生成子集并**原地替换** src/winui/assets/Fonts/SEGOEICONS.TTF。
 *
 * 完整字体保留为 SEGOEICONS.full.ttf，仅作为本脚本的输入，
 * 不被任何 CSS 引用 → 不会进入构建产物。
 *
 * 用法：node scripts/subset-icons.mjs
 * 依赖：fontTools（用 WorkBuddy 托管的 Python venv）
 *       C:/Users/chidc/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m pip install fonttools
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, copyFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = join(root, 'src/winui/assets/Fonts')
const FULL = join(FONT_DIR, 'SEGOEICONS.full.ttf')
const SUBSET = join(FONT_DIR, 'SEGOEICONS.TTF')

const PY = 'C:/Users/chidc/.workbuddy/binaries/python/envs/default/Scripts/python.exe'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.vue', '.ts', '.css', '.js'].includes(extname(name))) out.push(p)
  }
  return out
}

/** 收集所有可能用到的图标码位 */
function collectCodepoints() {
  const codes = new Set()
  for (const file of walk(join(root, 'src'))) {
    const s = readFileSync(file, 'utf8')
    for (const m of s.matchAll(/&#x([0-9A-Fa-f]{4,5});/g)) codes.add(parseInt(m[1], 16))
    for (const m of s.matchAll(/\\u([EFef][0-9A-Fa-f]{3})/g)) codes.add(parseInt(m[1], 16))
    // 组件内部的图标名映射表用的是裸十六进制字符串，如 { home: 'E80F' }
    for (const m of s.matchAll(/'([EFef][0-9A-Fa-f]{3})'/g)) codes.add(parseInt(m[1], 16))
  }
  return [...codes].sort((a, b) => a - b)
}

if (!existsSync(FULL)) {
  console.error(`✗ 找不到完整字体 ${FULL}`)
  console.error('  它是子集化的输入源，必须保留（从上游 WinUIonWeb 仓库的')
  console.error('  WinUIonWeb/src/assets/Fonts/SEGOEICONS.TTF 取一份改名即可）。')
  process.exit(1)
}
if (!existsSync(PY)) {
  console.error(`✗ 找不到 Python：${PY}`)
  console.error('  先建 venv 并装 fonttools：')
  console.error('    <managed python> -m venv C:/Users/chidc/.workbuddy/binaries/python/envs/default')
  console.error('    .../Scripts/pip install fonttools')
  process.exit(1)
}

const codes = collectCodepoints()
console.log(`扫描到 ${codes.length} 个字形码位`)

const before = statSync(FULL).size
const unicodes = codes.map((c) => 'U+' + c.toString(16).toUpperCase()).join(',')

execFileSync(
  PY,
  [
    '-m', 'fontTools.subset', FULL,
    `--unicodes=${unicodes}`,
    `--output-file=${SUBSET}`,
    '--no-hinting',
    '--desubroutinize',
    '--drop-tables+=DSIG',
    '--name-IDs=',
    '--layout-features='
  ],
  { cwd: root, stdio: 'inherit' }
)

const after = statSync(SUBSET).size
console.log(`\n原始字体 ${(before / 1024).toFixed(1)} KB → 子集 ${(after / 1024).toFixed(1)} KB`)
console.log(`节省 ${((before - after) / 1024).toFixed(1)} KB（${(100 * (before - after) / before).toFixed(1)}%）`)

/* 生成后立即用修正过的 cmap 解析器自检覆盖情况 */
const { readFontCodepoints } = await import('./font-cmap.mjs')
const sub = readFontCodepoints(SUBSET)
const full = readFontCodepoints(FULL)
const lostUsable = codes.filter((c) => full.has(c) && !sub.has(c))
if (lostUsable.length) {
  console.error(`\n✗ 子集丢失了原本可用的字形：${lostUsable.map((c) => 'U+' + c.toString(16).toUpperCase()).join(', ')}`)
  process.exit(1)
}
console.log(`✅ 子集覆盖正常（原字体存在的 ${codes.filter((c) => full.has(c)).length} 个字形全部保留）`)
