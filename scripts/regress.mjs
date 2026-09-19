/**
 * 全站渲染回归
 *
 * 为什么需要「哨兵」断言：早先的检查只看「有没有 __errors 标记」，
 * 于是预览服务没起来、Chrome 拿到连接错误页时，一律显示为「✅ 零错误」——
 * 一次完整的假绿。现在必须先确认页内哨兵元素存在，才算页面真的加载出来了。
 *
 * 服务由本脚本**自己起**（早先依赖外部先跑 `vite preview`，忘了起就是一次假绿，
 * 虽然哨兵能兜住，但脚本会直接整体失败；自带服务后只剩「构建产物不存在」一种前置条件）。
 *
 * 用法：
 *   node scripts/regress.mjs                  # 跑 dist（生产构建）
 *   node scripts/regress.mjs --dev            # 跑 dist-dev（保留 Vue prop 校验）
 *   node scripts/regress.mjs --dist dist-dev
 */

import { execFileSync, execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { startStaticServer } from './static-server.mjs'

const execFileAsync = promisify(execFile)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const useDev = argv.includes('--dev')
const distName = (() => {
  const i = argv.indexOf('--dist')
  return i >= 0 ? argv[i + 1] : useDev ? 'dist-dev' : 'dist'
})()

const dist = join(root, distName)
const outDir = join(root, '.check-winui')
const CHROME = join(
  homedir(),
  'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
)

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

const stripTags = (s) => s.replace(/<[^>]*>/g, '').trim()

/** 由脚本自己起服务（端口交给系统分配，避免撞上别人占着的 4173/4174） */
const server = await startStaticServer(dist, 0)
const base = server.origin

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
    execFileSync(
      process.execPath,
      [join(root, 'scripts/verify-page.mjs'), entry, query],
      { cwd: root, env: { ...process.env, VERIFY_DIST: distName }, stdio: 'pipe' }
    )
  } catch (err) {
    rows.push([entry, 'fail', `验证页生成失败：${String(err).slice(0, 80)}`])
    failed++
    continue
  }

  const dumpPath = join(outDir, `regress-${entry}.html`)
  let dump = ''
  try {
    /* 必须用**异步** execFile：execFileSync 会把 Node 的事件循环整个卡住，
       而同进程里的静态服务在上面 → 服务永远无法响应，Chrome 只能等到超时。
       （踩过一次：整个回归从 24 秒变成几分钟起步。） */
    const res = await execFileAsync(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1280,900',
        `--virtual-time-budget=${budget}`,
        '--dump-dom',
        `${base}/__verify.html`
      ],
      { timeout: 180_000, maxBuffer: 96 * 1024 * 1024, windowsHide: true }
    )
    dump = res.stdout.toString('utf8')
  } catch (err) {
    rows.push([entry, 'fail', `Chrome 执行失败：${String(err).slice(0, 80)}`])
    failed++
    continue
  }

  writeFileSync(dumpPath, dump)

  const loaded = /<div id="__loaded">ready<\/div>/.test(dump)
  if (!loaded) {
    // 页面压根没加载出来 —— 绝不能算通过
    rows.push([entry, 'fail', '页面未加载（哨兵缺失，多半是预览服务不可达）'])
    failed++
    continue
  }

  const errMatch = dump.match(/<div id="__errors">([\s\S]*?)<\/div>/)
  const warnMatch = dump.match(/<div id="__warns">([\s\S]*?)<\/div>/)

  if (errMatch) {
    rows.push([entry, 'fail', `JS 错误：${stripTags(errMatch[1]).slice(0, 160)}`])
    failed++
    continue
  }
  if (warnMatch) {
    /* 生产构建里出现 console.warn 一律判失败。
       理由：这个项目最大的风险是**静默失效**（功能不工作但什么都不报），
       所以应用自己打出的警告必须变成硬失败，而不是一句「⚠️」被忽略过去。
       实测当前 dist 全站零警告，所以这条规则不会误伤。

       dev 构建例外：Vue 的开发期警告（prop 类型、未知属性等）是**故意**要看的，
       数量也不稳定，所以 --dev 下仍然只记为警告，不判失败。 */
    const msg = stripTags(warnMatch[1]).slice(0, 200)
    if (useDev) {
      rows.push([entry, 'warn', msg])
      continue
    }
    rows.push([entry, 'fail', `console 警告：${msg}`])
    failed++
    continue
  }
  rows.push([entry, 'ok', ''])
}

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
