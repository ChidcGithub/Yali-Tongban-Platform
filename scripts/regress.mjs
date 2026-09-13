/**
 * 全站渲染回归
 *
 * 为什么需要「哨兵」断言：早先的检查只看「有没有 __errors 标记」，
 * 于是预览服务没起来、Chrome 拿到连接错误页时，一律显示为「✅ 零错误」——
 * 一次完整的假绿。现在必须先确认页内哨兵元素存在，才算页面真的加载出来了。
 *
 * 用法：
 *   node scripts/regress.mjs                  # 跑 dist（生产构建）
 *   node scripts/regress.mjs --dev            # 跑 dist-dev（保留 Vue prop 校验）
 *   node scripts/regress.mjs --port 4174 --dist dist-dev
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const useDev = argv.includes('--dev')
const distName = (() => {
  const i = argv.indexOf('--dist')
  return i >= 0 ? argv[i + 1] : useDev ? 'dist-dev' : 'dist'
})()
const port = (() => {
  const i = argv.indexOf('--port')
  return i >= 0 ? argv[i + 1] : useDev ? '4174' : '4173'
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
  ['410', { query: '' }],
  ['debug', { query: '' }]
]

const stripTags = (s) => s.replace(/<[^>]*>/g, '').trim()

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
    // headless Chrome 的 DOM 走 stdout；用 shell 重定向拿回来
    dump = execFileSync(
      'bash',
      [
        '-lc',
        `"${CHROME}" --headless=new --disable-gpu --no-sandbox --window-size=1280,900 ` +
          `--virtual-time-budget=${budget} --dump-dom "http://127.0.0.1:${port}/__verify.html"`
      ],
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 180_000, maxBuffer: 96 * 1024 * 1024 }
    ).toString('utf8')
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
    rows.push([entry, 'warn', stripTags(warnMatch[1]).slice(0, 200)])
    continue
  }
  rows.push([entry, 'ok', ''])
}

console.log(`产物目录：${distName}   端口：${port}`)
console.log('─'.repeat(78))
for (const [entry, state, msg] of rows) {
  const mark = state === 'ok' ? '✅' : state === 'warn' ? '⚠️ ' : state === 'skip' ? '－ ' : '❌'
  console.log(`${mark} ${entry.padEnd(14)}${msg}`)
}
console.log('─'.repeat(78))
const warns = rows.filter((r) => r[1] === 'warn').length
const oks = rows.filter((r) => r[1] === 'ok').length
console.log(`通过 ${oks} · 警告 ${warns} · 失败 ${failed}`)

if (failed > 0) process.exit(1)
