/**
 * 交互冒烟测试（Playwright）
 *
 * 为什么需要它：`regress.mjs` 只能证明「页面没崩」，证明不了「按钮点了有用」。
 * 实测在一次全 23 页渲染回归全绿的构建里，标签页切换、下拉框、手动排班、
 * 志愿者名单、注册验证码等十几处功能是完全不工作的 —— 它们不报错，只是静默失效。
 *
 * 所以这里用真浏览器**真点**，断言状态确实变了，而不是断言「没有错误」。
 *
 * 用法：
 *   node scripts/smoke-winui.mjs            # 跑 dist
 *   node scripts/smoke-winui.mjs --dev      # 跑 dist-dev（保留 Vue prop 校验）
 *
 * 每个用例的结构：
 *   1. 用 verify-page.mjs 生成打桩页（真实 HTML + 真实脚本，只替换 window.fetch）
 *   2. 起静态服务、开浏览器、goto
 *   3. 断言哨兵存在（防「页面根本没起来」被当成通过）
 *   4. 执行交互 → 断言结果
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { startStaticServer } from './static-server.mjs'

const execFileAsync = promisify(execFile)

/* Playwright 装在 WorkBuddy 托管的 node 工作区里（站点自己的 node_modules 没有它） */
const require = createRequire(import.meta.url)
const PLAYWRIGHT = 'C:/Users/chidc/.workbuddy/binaries/node/workspace/node_modules/playwright'
const { chromium } = require(PLAYWRIGHT)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const distName = argv.includes('--dev') ? 'dist-dev' : 'dist'
const dist = join(root, distName)

if (!existsSync(dist)) {
  console.error(`✗ 找不到 ${dist}（先跑 npm run build）`)
  process.exit(1)
}

/* 组件库的真实类名（别猜 —— 之前猜 .win-selector-bar-item 时就是先从组件源码里核过的） */
const SEL = {
  selectorItem: '.win-selector-bar-item',
  comboRoot: '.win-combo-box',
  comboBtn: '.win-combo-btn',
  comboItem: '.win-combo-item',
  sliderRoot: '.win-slider-root',
  sliderThumb: '.win-slider-thumb'
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`)
}

/** 生成打桩页（真实 HTML + 真实脚本，只替换 fetch）
    必须用**异步** execFile：execFileSync 会卡住事件循环，
    同进程的静态服务（以及浏览器可能挂着的 keep-alive 连接）就都动不了。 */
async function buildVerifyPage(entry, query = '') {
  await execFileAsync(
    process.execPath,
    [join(root, 'scripts/verify-page.mjs'), entry, query],
    { cwd: root, env: { ...process.env, VERIFY_DIST: distName } }
  )
}

const server = await startStaticServer(dist, 0)
const base = server.origin

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })

async function openPage(entry, query = '') {
  await buildVerifyPage(entry, query)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)))
  await page.goto(`${base}/__verify.html`, { waitUntil: 'load' })
  await page.waitForSelector('#__loaded', { timeout: 15000 })
  await page.waitForTimeout(350)
  return { page, pageErrors }
}

/** 断言「页内无 JS 错误」——渲染回归已经查过，这里再兜一次交互引入的 */
function noErrors(pageErrors) {
  return pageErrors.length === 0
}

/* ══════════════════════════════════════════════════════════
   用例
   ══════════════════════════════════════════════════════════ */

/** 登录页：两个验证码容器都必须真的有验证码；提交只能发一次请求 */
async function smokeLogin() {
  const { page, pageErrors } = await openPage('login')
  try {
    const loginCaptcha = await page.locator('#yaliLoginCaptcha .captcha-img').count()
    check('login：登录验证码已渲染', loginCaptcha === 1, `${loginCaptcha} 张`)

    /* 关键回归点：注册表单用 v-show 而不是 v-if，所以注册验证码容器也必须在 DOM 里。
       CaptchaWidget 构造时拿不到容器会**静默 return** → getData() 永远空 token →
       注册 100% 报「人机验证失败」。 */
    const regCaptcha = await page.locator('#yaliRegCaptcha .captcha-img').count()
    check('login：注册验证码在挂载时就已渲染（v-show 而非 v-if）', regCaptcha === 1, `${regCaptcha} 张`)

    /* 单次点击只应发一次 /api/auth/signin。
       拦截 fetch 并让签到请求永不 resolve，避免 handleLogin 成功后整页跳转。 */
    await page.evaluate(() => {
      window.__signinCalls = 0
      const orig = window.fetch
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        if (url.indexOf('/api/auth/signin') === 0) {
          window.__signinCalls++
          return new Promise(() => {})
        }
        return orig.apply(this, arguments)
      }
    })
    const form = page.locator('form').first()
    await page.fill('#yaliLoginCaptcha .captcha-input', 'abcd')
    /* 注意：WinUIonWeb 的 TextBox / PasswordBox 底层都是 `<input type="text">`
       （密码靠 InputScope 遮罩，不是原生 type=password），别按原生习惯选。 */
    const inputs = form.locator('.win-textbox-field')
    await inputs.nth(0).fill('测试用户')
    await form.locator('.win-password-box .win-textbox-field').first().fill('abc123')
    await page.locator('.login-submit').first().click()
    await page.waitForTimeout(700)
    const calls = await page.evaluate(() => window.__signinCalls)
    check('login：点一次「登录」只发一次请求', calls === 1, `实际 ${calls} 次`)

    // 验证码挂载失败时会显式 console.warn（CAPTCHA_WIDGET_NOT_MOUNTED），这里也断言一下
    const warns = await page.evaluate(() => (window.__warns || []).join(' | '))
    check('login：无验证码挂载告警', warns.indexOf('CAPTCHA_WIDGET_NOT_MOUNTED') < 0, warns.slice(0, 120))

    check('login：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 管理面板：标签页必须真的能切（SelectorBar 的 SelectionChanged 不带 SelectedIndex） */
async function smokeAdminTabs() {
  const { page, pageErrors } = await openPage('admin')
  try {
    const tabs = page.locator(SEL.selectorItem)
    const n = await tabs.count()
    check('admin：8 个标签都渲染出来', n === 8, `实际 ${n}`)

    await tabs.nth(1).click()
    await page.waitForTimeout(400)
    const memberRows = await page.locator('.ad-role').count()
    check('admin：切到第 2 个标签「成员管理」', memberRows > 0, `角色下拉 ${memberRows} 个`)

    // 第 6 个标签 = 报修管理（本轮补回的标签，此前 /api/issues 的删除入口没有消费者）
    await tabs.nth(5).click()
    await page.waitForTimeout(500)
    const issueItems = await page.locator('.yali-item').count()
    check('admin：切到第 6 个标签「报修管理」并渲染条目', issueItems > 0, `${issueItems} 条`)

    // 第 7 个标签 = 财务记录
    await tabs.nth(6).click()
    await page.waitForTimeout(500)
    const financeRows = await page.locator('.ad-row').count()
    check('admin：切到第 7 个标签「财务记录」并渲染条目', financeRows > 0, `${financeRows} 条`)

    check('admin：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 活动页：标签切到「千报预约」；自定义时间的 4 个下拉必须能选 */
async function smokeActivitiesTabs() {
  const { page, pageErrors } = await openPage('activities')
  try {
    const tabs = page.locator(SEL.selectorItem)
    await tabs.nth(1).click()
    await page.waitForTimeout(600)
    const customRow = await page.locator('.hall-custom-row').count()
    check('activities：切到「千报预约」后自定义时间行出现', customRow > 0, `${customRow} 处`)

    const combos = await page.locator('.hall-custom-h, .hall-custom-m').count()
    check('activities：自定义时间的 4 个下拉框都在', combos === 4, `${combos} 个`)

    // 起点小时改成第 10 项（09 点），断言它没有被事件回调重置回 0
    const firstCombo = page.locator('.hall-custom-h').first()
    await firstCombo.click()
    await page.waitForTimeout(250)
    const items = page.locator(SEL.comboItem)
    if ((await items.count()) >= 10) {
      await items.nth(9).click()
      await page.waitForTimeout(300)
    }
    const shown = (await firstCombo.innerText()).trim()
    const before = shown
    check('activities：自定义起始小时选完不被重置', !/^07:?00|^7$/.test(before) && before.length > 0, `显示 "${before}"`)

    check('activities：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 值日管理：4 个标签都要能进 */
async function smokeDutyAdminTabs() {
  const { page, pageErrors } = await openPage('duty-admin')
  try {
    const tabs = page.locator(SEL.selectorItem)
    const n = await tabs.count()
    check('duty-admin：4 个标签都渲染出来', n === 4, `实际 ${n}`)

    await tabs.nth(1).click()
    await page.waitForTimeout(500)
    const staffRows = await page.locator('.da-row').count()
    check('duty-admin：切到第 2 个标签「干事」', staffRows > 0, `${staffRows} 行`)

    await tabs.nth(2).click()
    await page.waitForTimeout(500)
    const scoreRows = await page.locator('.da-score').count()
    check('duty-admin：切到第 3 个标签「评分」', scoreRows > 0, `${scoreRows} 条`)

    await tabs.nth(3).click()
    await page.waitForTimeout(500)
    const periodRows = await page.locator('.da-period').count()
    check('duty-admin：切到第 4 个标签「时段」', periodRows > 0, `${periodRows} 行`)

    // 回到排班：日历格子应该是可点按钮（本轮补回的手动排班）
    await tabs.nth(0).click()
    await page.waitForTimeout(600)
    const calBtns = await page.locator('button.da-cal-cell').count()
    check('duty-admin：日历格子是可点击按钮（手动排班入口）', calBtns > 0, `${calBtns} 格`)

    check('duty-admin：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 财务页：月份选择不能被事件回调重置回「本月」 */
async function smokeFinanceMonth() {
  const { page, pageErrors } = await openPage('finance')
  try {
    const month = page.locator('.fin-month').first()
    const before = (await month.innerText()).trim()
    await month.click()
    await page.waitForTimeout(300)
    const items = page.locator(SEL.comboItem)
    const itemCount = await items.count()
    if (itemCount >= 2) {
      await items.nth(1).click()
      await page.waitForTimeout(400)
    }
    const after = (await month.innerText()).trim()
    check(
      'finance：选完月份后不被重置回「本月」',
      !!after && after !== before,
      `"${before}" → "${after}"（候选 ${itemCount}）`
    )

    // 管理员应能看到部门筛选，且默认「全部部门」
    const dept = page.locator('.fin-dept').first()
    const hasDept = await dept.count()
    check('finance：管理员可见部门筛选', hasDept === 1, `${hasDept} 个`)
    if (hasDept) {
      const deptText = (await dept.innerText()).trim()
      check('finance：部门默认「全部部门」而非强制自己部门', deptText.indexOf('全部') >= 0, `"${deptText}"`)
    }

    check('finance：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 公告列表：点条目要能进详情（旧版点击行为，迁移时丢了） */
async function smokeAnnouncementsNavigation() {
  const { page, pageErrors } = await openPage('announcements')
  try {
    await page.evaluate(() => {
      window.confirm = () => false
    })
    const items = page.locator('.ann-item')
    const n = await items.count()
    check('announcements：列表渲染出可点击条目', n > 0, `${n} 条`)

    if (n > 0) {
      await items.first().click()
      const ok = await page
        .waitForURL(/announcement\.html\?id=\d+/, { timeout: 4000 })
        .then(() => true)
        .catch(() => false)
      check('announcements：点条目跳转到公告详情', ok, page.url().replace(base, ''))
    }
    check('announcements：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 动态：ref_type/ref_id 住在 system_data 里 → 卡片可点击 + 通知类无评论框 */
async function smokeMomentFeed() {
  const { page, pageErrors } = await openPage('moment')
  try {
    const total = await page.locator('.feed-item').count()
    const linkable = await page.locator('.feed-item.is-linkable').count()
    check('moment：动态条目渲染', total > 0, `${total} 条`)
    check(
      'moment：从 system_data 解析出 ref_type，条目识别为可跳转',
      linkable > 0,
      `${linkable}/${total} 可跳转`
    )

    const notices = await page.locator('.feed-item-notification').count()
    check('moment：通知类条目走独立排版（无评论框）', notices > 0, `${notices} 条通知`)

    // 展开一条可跳转动态的评论，确认作者列读的是 user_name
    await page.locator('.feed-item.is-linkable').first().locator('button').first().click()
    await page.waitForTimeout(500)
    const author = await page
      .locator('.yali-comment-author')
      .first()
      .innerText()
      .catch(() => '')
    check('moment：评论作者取自 user_name', author.trim().length > 0, `"${author.trim()}"`)

    // 点条目应真的跳转（不再全部不可点）。
    // 注意点内容区：评论区是 @click.stop 的，点整块元素的中心可能落在评论框上。
    await page.locator('.feed-item.is-linkable').first().locator('.feed-content').first().click()
    const jumped = await page
      .waitForURL(/(services|finance|activities|announcement|poll|admin)\.html/, { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    check('moment：点动态条目会跳转到对应页面', jumped, page.url().replace(base, ''))

    check('moment：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 投票详情：题目配图要从 image_url 渲染出来；主观题字数上限生效 */
async function smokePollImage() {
  const { page, pageErrors } = await openPage('poll', '?id=5')
  try {
    const imgs = await page.locator('.pv-q-image img').count()
    check('poll：题目配图渲染', imgs > 0, `${imgs} 张`)

    const captcha = await page.locator('#yaliPollCaptcha .captcha-input').count()
    check('poll：验证码已挂载', captcha === 1, `${captcha} 个`)

    const warns = await page.evaluate(() => (window.__warns || []).join(' | '))
    check('poll：无验证码挂载告警', warns.indexOf('CAPTCHA_WIDGET_NOT_MOUNTED') < 0, warns.slice(0, 120))

    const textarea = page.locator('.pv-textarea .win-textbox-textarea, .pv-textarea textarea').first()
    const maxLen = await textarea.getAttribute('maxlength').catch(() => null)
    check('poll：主观题字数上限取自 max_length', !!maxLen, `maxlength=${maxLen}`)

    check('poll：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 个性化：字号滑块必须真的改到 <html> 上（Slider 的负载是 {OldValue,NewValue}） */
async function smokePersonalizeSlider() {
  const { page, pageErrors } = await openPage('personalize')
  try {
    const readFont = () => page.evaluate(() => document.documentElement.style.fontSize || '')
    const before = await readFont()
    const thumb = page.locator(SEL.sliderThumb).first()
    const box = await thumb.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 4, box.y + box.height / 2, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
    const after = await readFont()
    const label = await page.locator('.pz-value').first().innerText().catch(() => '')
    check(
      'personalize：拖动字号滑块真的改了字号',
      !!after && after !== before,
      `"${before}" → "${after}"（显示 ${label.trim()}）`
    )
    check('personalize：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 410：?from= 要改写文案（cultural / review / tasks 三个墓碑页靠它） */
async function smokeGone() {
  const { page, pageErrors } = await openPage('410', '?from=cultural')
  try {
    const text = await page.locator('.err-question').first().innerText().catch(() => '')
    check('410：?from= 改写了标题文案', text.indexOf('cultural') >= 0, `"${text.trim()}"`)
    const feedback = await page.locator('.err-feedback').count()
    check('410：反馈入口已补回', feedback === 1, `${feedback} 处`)
    check('410：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 对话框内的验证码：容器只在 IsOpen 之后才 teleport 进 body，
    实例化早一帧就会静默失败（这是踩过两次的坑） */
async function smokeDialogCaptchas() {
  // 报修：点 FAB 打开表单
  {
    const { page, pageErrors } = await openPage('services')
    try {
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(600)
      const n = await page.locator('#yaliIssueCaptcha .captcha-input').count()
      check('services：打开报修表单后验证码已挂载', n === 1, `${n} 个`)
      const warns = await page.evaluate(() => (window.__warns || []).join(' | '))
      check('services：无验证码挂载告警', warns.indexOf('CAPTCHA_WIDGET_NOT_MOUNTED') < 0, warns.slice(0, 100))
      check('services：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 100))
    } finally {
      await page.close()
    }
  }

  // 财务：点 FAB 打开表单（仅管理员可见）
  {
    const { page, pageErrors } = await openPage('finance')
    try {
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(600)
      const n = await page.locator('#yaliFinanceCaptcha .captcha-input').count()
      check('finance：打开新增表单后验证码已挂载', n === 1, `${n} 个`)
      const warns = await page.evaluate(() => (window.__warns || []).join(' | '))
      check('finance：无验证码挂载告警', warns.indexOf('CAPTCHA_WIDGET_NOT_MOUNTED') < 0, warns.slice(0, 100))
      check('finance：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 100))
    } finally {
      await page.close()
    }
  }

  // 活动：登录后报名走的是「直接报名」分支（不出验证码），
  // 要验匿名报名表单必须用 anon=1 切到未登录态
  {
    const { page, pageErrors } = await openPage('activities', '?anon=1')
    try {
      await page.locator('.yali-item-actions button').first().click()
      await page.waitForTimeout(700)
      const c = await page.locator('#yaliVolunteerCaptcha .captcha-input').count()
      check('activities：匿名报名表单的验证码已挂载', c === 1, `${c} 个`)
      const warns = await page.evaluate(() => (window.__warns || []).join(' | '))
      check('activities：无验证码挂载告警', warns.indexOf('CAPTCHA_WIDGET_NOT_MOUNTED') < 0, warns.slice(0, 100))
      check('activities：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 100))
    } finally {
      await page.close()
    }
  }
}

/* ══════════════════════════════════════════════════════════ */

const CASES = [
  ['登录页：验证码挂载 + 单次提交', smokeLogin],
  ['对话框内验证码（报修 / 财务 / 活动报名）', smokeDialogCaptchas],
  ['管理面板：标签页切换 + 补回的标签', smokeAdminTabs],
  ['活动页：标签页切换 + 自定义时间', smokeActivitiesTabs],
  ['值日管理：标签页切换 + 手动排班入口', smokeDutyAdminTabs],
  ['财务：月份选择 + 部门筛选', smokeFinanceMonth],
  ['公告列表：进入详情', smokeAnnouncementsNavigation],
  ['动态：可跳转 / 评论作者 / 通知分类', smokeMomentFeed],
  ['投票：题目配图 + 验证码 + 字数上限', smokePollImage],
  ['个性化：字号滑块', smokePersonalizeSlider],
  ['410：?from= 文案改写 + 反馈入口', smokeGone]
]

console.log(`产物目录：${distName}   地址：${base}`)
console.log('─'.repeat(78))
for (const [title, fn] of CASES) {
  try {
    await fn()
  } catch (err) {
    check(`${title}：执行异常`, false, String((err && err.message) || err).slice(0, 180))
  }
}
console.log('─'.repeat(78))

const failed = results.filter((r) => !r.ok)
console.log(`通过 ${results.length - failed.length} · 失败 ${failed.length}`)

await browser.close()
await server.close()
if (failed.length) process.exit(1)
