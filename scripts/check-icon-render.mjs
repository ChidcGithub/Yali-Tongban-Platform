/**
 * 图标渲染体检（按需运行，不进 build —— 全量跑要十几分钟）
 *
 *   node scripts/check-icon-render.mjs            # 全量：初始态 + 每个标签 + 每个按钮
 *   node scripts/check-icon-render.mjs --fast     # 只扫初始态
 *
 * 为什么需要它：`check-glyphs.mjs` 只扫**源码字面量**，抓不到两类问题 ——
 *   ① 上游组件运行时拼出来的字形（`String.fromCodePoint(...)` / 符号名映射表）
 *   ② 交互后才出现的图标（对话框、切标签后的内容）
 * 更要命的是：开发机（Windows）有系统 Segoe 兜底，
 * **随包字体里缺的字形在本机看不出来**，用户的手机/平板上就是一个方框。
 *
 * 判定依据：页面里走图标字体的字符，是否都在**随包分发的那个字体子集**的 cmap 里。
 * 这是硬判据 —— 只要不在，就一定依赖系统兜底，跨平台必然有设备显示成方框。
 *
 * 已知的三类「框框」来源，别只盯字体：
 *   ① 字体里没这个字形（本脚本负责）
 *   ② 图片骨架占位没收场 —— `.yali-img-skeleton` 会一直转成一个灰框
 *      （条件是「还没拿到结果」，不是「has_image」，见 services / finance 的注释）
 *   ③ 图片本身加载失败（那是破图，不是字形问题）
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { startStaticServer } from './static-server.mjs'
import { readFontCodepoints } from './font-cmap.mjs'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/chidc/.workbuddy/binaries/node/workspace/node_modules/playwright')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const fast = process.argv.includes('--fast')

/** 产物里随包分发的图标字体 */
const fontFile = readdirSync(join(dist, 'assets')).find(
  (f) => /^segoeicons.*\.ttf$/i.test(f)
)
if (!fontFile) {
  console.error('✗ dist/assets 里找不到 SEGOEICONS*.TTF（先 npm run build）')
  process.exit(1)
}
const shipped = readFontCodepoints(join(dist, 'assets', fontFile))

const PAGES = readdirSync(dist)
  .filter((f) => f.endsWith('.html') && f !== '__verify.html')
  .map((f) => f.replace(/\.html$/, ''))

const server = await startStaticServer(dist, 0)
const browser = await chromium.launch({ headless: true })

const COLLECT = () => {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    let own = ''
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue
    own = own.trim()
    if (!own) continue
    const chars = [...new Set(own)]
      .map((c) => c.codePointAt(0))
      .filter((cp) => cp >= 0xe000 && cp <= 0xf8ff)
    if (!chars.length) continue
    const cs = getComputedStyle(el)
    /* 判据二：这个元素到底用没用图标字体。
       字形在字体里、字体也加载了，但只要元素继承的是 UI 字体（Segoe UI …），
       私用区字符照样是豆腐块 —— PasswordBox 的显示密码按钮与
       TextBox 的清除按钮就是这样：它们的 span 从未指定过图标字体。 */
    const family = cs.fontFamily
    out.push({
      chars,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      family,
      usesIconFont: /Segoe (Fluent|MDL2)/i.test(family)
    })
  }
  return out
}

const problems = new Map()

for (const entry of PAGES) {
  await execFileAsync(process.execPath, ['scripts/verify-page.mjs', entry], { cwd: root })
  const page = await browser.newPage()
  await page.goto(`${server.origin}/__verify.html`, { waitUntil: 'load' })
  await page.waitForSelector('#__loaded', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)

  const collect = async (state) => {
    for (const hit of await page.evaluate(COLLECT)) {
      for (const cp of hit.chars) {
        const missingGlyph = !shipped.has(cp)
        const wrongFont = !hit.usesIconFont
        if (!missingGlyph && !wrongFont) continue
        const key = `${cp}:${wrongFont ? 'font' : 'glyph'}`
        if (!problems.has(key)) {
          problems.set(key, {
            cp,
            reason: missingGlyph ? '字体里没有这个字形' : '元素没用图标字体',
            entry,
            state,
            ...hit
          })
        }
      }
    }
  }

  await collect('初始态')

  if (!fast) {
    const tabs = await page.locator('.win-selector-bar-item').count().catch(() => 0)
    for (let i = 1; i < tabs; i++) {
      await page.locator('.win-selector-bar-item').nth(i).click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(400)
      await collect(`标签#${i}`)
    }

    const btns = Math.min(await page.locator('button:visible').count().catch(() => 0), 14)
    for (let i = 0; i < btns; i++) {
      const btn = page.locator('button:visible').nth(i)
      const label = (await btn.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 16)
      await btn.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(400)
      await collect(`「${label}」`)
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(120)
    }
  }

  await page.close()
}

await browser.close()
await server.close()

if (!problems.size) {
  console.log(
    `✅ ${PAGES.length} 个页面${fast ? '（初始态）' : '（含标签切换与逐个按钮）'}：` +
      `渲染出的图标字符全部在随包字体内（${fontFile}，${shipped.size} 个码位）`
  )
  process.exit(0)
}

console.log(`\n✗ 发现 ${problems.size} 处图标渲染问题：\n`)
for (const info of problems.values()) {
  console.log(
    `  U+${info.cp.toString(16).toUpperCase().padStart(4, '0')}  [${info.reason}]` +
      `  ${info.entry} / ${info.state}  <${info.tag} class="${info.cls}">`
  )
  console.log(`       字体：${info.family}`)
}
console.log(`\n字体：dist/assets/${fontFile}`)
process.exit(1)
