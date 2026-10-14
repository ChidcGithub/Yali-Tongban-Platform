/**
 * 全站渲染回归（Playwright 版）
 *
 * 为什么需要「哨兵」断言：早先的检查只看「有没有 __errors 标记」，
 * 于是预览服务没起来、Chrome 拿到连接错误页时，一律显示为「✅ 零错误」——
 * 一次完整的假绿。现在必须先确认哨兵元素（桩脚本同步创建的 #__loaded）存在，
 * 才算页面真的加载出来了。
 *
 * 服务由本脚本**自己起**（端口交给系统分配）；页面渲染走 Playwright
 * （与 smoke 同一通道；本机直接拉起 chromium 二进制已无法访问 localhost，见下方说明）。
 *
 * 用法：
 *   node scripts/regress.mjs                  # 跑 dist（生产构建）
 *   node scripts/regress.mjs --dev            # 跑 dist-dev（保留 Vue prop 校验）
 *     ⚠️ 先跑 `npm run build:dev` —— dist-dev 不会自动重建，
 *        忘了构建就是在验上一次的旧产物（这条 dev 路径曾经整条都是假绿）
 *   node scripts/regress.mjs --dist dist-dev
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { startStaticServer } from './static-server.mjs'

const execFileAsync = promisify(execFile)

/* Playwright 装在 WorkBuddy 托管的 node 工作区里（站点自己的 node_modules 没有它）。
   为什么渲染器从 `chrome.exe --headless=new --dump-dom` 换成 Playwright：
   2026-10-14 起，本机直接拉起的 chromium 二进制再也访问不了 http://127.0.0.1
   （headless shell 加载任何 http 页面都 "Page load timed out"，chrome.exe 则静默无输出），
   而 Playwright 拉起的同一批二进制一切正常（smoke 全绿可证）—— 疑与系统代理/防火墙
   对进程的差异化处理有关，属环境问题而非代码问题。改走 Playwright 后回归恢复可用，
   且断言从「dump DOM 再正则」变成直接读桩内的 window.__errors/__warns，更直接。 */
const require = createRequire(import.meta.url)
const PLAYWRIGHT = 'C:/Users/chidc/.workbuddy/binaries/node/workspace/node_modules/playwright'
const { chromium } = require(PLAYWRIGHT)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const useDev = argv.includes('--dev')
const distName = (() => {
  const i = argv.indexOf('--dist')
  return i >= 0 ? argv[i + 1] : useDev ? 'dist-dev' : 'dist'
})()

const dist = join(root, distName)

/** 页面 → { query, budget }
    budget 是 Chrome 的 virtual-time-budget（毫秒）。
    index 是启动闪屏，1.8 秒后会自动跳到 services.html；预算必须短于它，
    否则 dump 到的是跳转后的页面（而且那页会去打真实接口，容易一直挂着）。 */
const PAGES = [
  ['index', { query: '', budget: 1200 }],
  ['services', { query: '' }],
  ['ai', { query: '' }],
  ['announcements', { query: '' }],
  ['announcement', { query: '?id=21' }],
  ['messages', { query: '' }],
  ['moment', { query: '' }],
  ['polls', { query: '' }],
  ['poll', { query: '?id=5' }],
  ['activities', { query: '' }],
  ['login', { query: '' }],
  ['settings', { query: '' }],
  ['personalize', { query: '' }],
  ['thanks', { query: '' }],
  ['changelog', { query: '' }],
  ['about', { query: '' }],
  ['feedback', { query: '' }],
  ['finance', { query: '' }],
  ['duty', { query: '' }],
  ['duty-admin', { query: '' }],
  ['admin', { query: '' }],
  ['404', { query: '' }],
  ['410', { query: '?from=cultural' }],
  ['debug', { query: '' }]
]

const server = await startStaticServer(dist, 0)
const base = server.origin
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

let failed = 0
const rows = []

for (const [entry, opts] of PAGES) {
  const query = opts?.query ?? ''
  const budget = opts?.budget ?? 14000
  if (!existsSync(join(dist, `${entry}.html`))) {
    rows.push([entry, 'skip', '产物不存在'])
    continue
  }

  try {
    await execFileAsync(
      process.execPath,
      [join(root, 'scripts/verify-page.mjs'), entry, query],
      { cwd: root, env: { ...process.env, VERIFY_DIST: distName } }
    )
  } catch (err) {
    rows.push([entry, 'fail', `验证页生成失败：${String(err).slice(0, 80)}`])
    failed++
    continue
  }

  /* index 的启动闪屏 1.8s 后会跳 services.html，等太久读到的就是下一页了 ——
     所以 index 的 settle 压到 300ms；其余页面给足挂载与异步取数的时间。 */
  const settle = entry === 'index' ? 300 : Math.min(budget, 2000)

  const page = await context.newPage()
  try {
    await page.goto(`${base}/__verify.html`, { waitUntil: 'load', timeout: 20000 })
    await page.waitForSelector('#__loaded', { timeout: 10000 })

    /* 哨兵一出现就先读一次（防 index 的定时跳转把执行环境带走），
       settle 之后再读一次取后到的错误/警告，两份合并。 */
    const snapEarly = await page
      .evaluate(() => ({
        errors: window.__errors || [],
        warns: window.__warns || []
      }))
      .catch(() => ({ errors: [], warns: [] }))
    await page.waitForTimeout(settle)
    const snapLate = await page
      .evaluate(() => ({
        errors: window.__errors || [],
        warns: window.__warns || []
      }))
      .catch(() => ({ errors: [], warns: [] }))

    const errors = [...new Set([...snapEarly.errors, ...snapLate.errors])]
    const warns = [...new Set([...snapEarly.warns, ...snapLate.warns])]

    if (errors.length) {
      rows.push([entry, 'fail', `JS 错误：${errors.join(' || ').slice(0, 160)}`])
      failed++
      continue
    }
    if (warns.length) {
      /* 生产构建里出现 console.warn 一律判失败。
         理由：这个项目最大的风险是**静默失效**（功能不工作但什么都不报），
         所以应用自己打出的警告必须变成硬失败，而不是一句「⚠️」被忽略过去。
         dev 构建例外：Vue 的开发期警告（prop 类型、未知属性等）是**故意**要看的，
         数量也不稳定，所以 --dev 下仍然只记为警告，不判失败。 */
      const msg = warns.join(' || ').slice(0, 200)
      if (useDev) {
        rows.push([entry, 'warn', msg])
        continue
      }
      rows.push([entry, 'fail', `console 警告：${msg}`])
      failed++
      continue
    }
    rows.push([entry, 'ok', ''])
  } catch (err) {
    rows.push([entry, 'fail', `页面加载失败：${String(err).split('\n')[0].slice(0, 100)}`])
    failed++
  } finally {
    await page.close()
  }
}

await browser.close()

console.log(`产物目录：${distName}   地址：${base}（脚本自起）`)
console.log('─'.repeat(78))
for (const [entry, state, msg] of rows) {
  const mark = state === 'ok' ? '✅' : state === 'warn' ? '⚠️ ' : state === 'skip' ? '－ ' : '❌'
  console.log(`${mark} ${entry.padEnd(14)}${msg}`)
}
console.log('─'.repeat(78))
const oks = rows.filter((r) => r[1] === 'ok').length
const skips = rows.filter((r) => r[1] === 'skip').length
console.log(`通过 ${oks} · 跳过 ${skips} · 失败 ${failed}`)

await server.close()
if (failed > 0) process.exit(1)
