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
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { startStaticServer } from './static-server.mjs'
import { readFontCodepoints } from './font-cmap.mjs'

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

/* 随包分发的图标字体覆盖了哪些码位 —— 断言「字形确实能画出来」的依据。 */
const shippedCodepoints = (() => {
  const assets = join(dist, 'assets')
  const font = readdirSync(assets).find((f) => /^segoeicons.*\.ttf$/i.test(f))
  if (!font) return new Set()
  return readFontCodepoints(join(assets, font))
})()

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

async function openPage(entry, query = '', viewport = null) {
  await buildVerifyPage(entry, query)
  const page = await context.newPage()
  /* 注意：context.newPage() 不吃 viewport 选项（那是 browser.newPage / newContext 的），
     必须在 page 上显式设置 —— 否则窄屏用例会一直跑在默认 1280 下，
     断言「容器宽度 ≤ 390」永远失败，而人会以为是 CSS 没生效。 */
  if (viewport) await page.setViewportSize(viewport)
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)))
  await page.goto(`${base}/__verify.html`, { waitUntil: 'load' })
  await page.waitForSelector('#__loaded', { timeout: 15000 })
  // 等挂载完成：WinUI 外壳的导航渲染出来才算页面真的起来了
  await page.waitForSelector('.win-selector-bar-item, .yali-page, .login-page, .err-page', {
    timeout: 15000
  })
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
    check('admin：9 个标签都渲染出来', n === 9, `实际 ${n}`)

    /* 标签栏属于**可见**元素，且页内 CSS 与模板类名对得上。
       这条是给「重命名类名」这类改动兜底的：类名改了而 CSS 没跟上（或反之），
       表现是样式静默丢失（页面上看不出报错），只有 margin/尺寸这类可测量的东西能发现。
       另外也顺带守住「标签栏被外部样式整条隐藏」——那时 box 会是 0 高。 */
    const barBox = await page.locator('.win-selector-bar').first().boundingBox()
    const barMargin = await page
      .locator('.win-selector-bar')
      .first()
      .evaluate((el) => getComputedStyle(el).marginBottom)
    check(
      'admin：标签栏可见（不是 0 高）',
      !!barBox && Math.round(barBox.height) >= 40,
      JSON.stringify(barBox)
    )
    check('admin：标签栏的页内样式生效（类名与 CSS 对得上）', barMargin === '16px', barMargin)

    await tabs.nth(1).click()
    await page.waitForTimeout(400)
    const memberRows = await page.locator('.admin-role').count()
    check('admin：切到第 2 个标签「成员管理」', memberRows > 0, `角色下拉 ${memberRows} 个`)

    // 第 6 个标签 = 报修管理（本轮补回的标签，此前 /api/issues 的删除入口没有消费者）
    await tabs.nth(5).click()
    await page.waitForTimeout(500)
    const issueItems = await page.locator('.yali-item').count()
    check('admin：切到第 6 个标签「报修管理」并渲染条目', issueItems > 0, `${issueItems} 条`)

    // 第 7 个标签 = 财务记录
    await tabs.nth(6).click()
    await page.waitForTimeout(500)
    const financeRows = await page.locator('.admin-row').count()
    check('admin：切到第 7 个标签「财务记录」并渲染条目', financeRows > 0, `${financeRows} 条`)

    // 第 8 个标签 = 功能开关（整套 /api/admin/features* 此前零消费者）
    await tabs.nth(7).click()
    await page.waitForTimeout(600)
    const featureItems = await page.locator('.yali-item').count()
    check('admin：切到第 8 个标签「功能开关」并渲染预定义功能', featureItems > 0, `${featureItems} 项`)

    // 点「邀请详情」应真的把 invitations 渲染出来
    await page.locator('.yali-item-actions button', { hasText: '邀请详情' }).first().click()
    await page.waitForTimeout(600)
    const inviteRows = await page.locator('.content-dialog .admin-row').count()
    check('admin：功能开关的「邀请详情」能拉到名单', inviteRows > 0, `${inviteRows} 条`)

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

    /* 「是不是我的预约」按 user.id 判断（localStorage 里的字段名是 id，不是 userId）。
       桩用户 id=101，而 201 号预约正是 user_id=101 → 应带 self 样式。 */
    const selfCards = await page.locator('.hall-timeline-card-self').count()
    check('activities：能认出「自己的预约」（按 user.id）', selfCards > 0, `${selfCards} 张自己的卡`)

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

/** 公告列表：点条目要能进详情；?edit=<id> 深链要能直接打开编辑器 */
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

  // 详情页「编辑」按钮的目标就是 announcements.html?edit=<id>，必须能真的打开编辑器
  const second = await openPage('announcements', '?edit=21')
  try {
    const dialog = second.page.locator('.content-dialog').last()
    await dialog.waitFor({ timeout: 8000 }).catch(() => null)
    const dialogCount = await second.page.locator('.content-dialog').count()
    check('announcements：?edit=<id> 深链会打开编辑器', dialogCount > 0, `${dialogCount} 个对话框`)
    if (dialogCount > 0) {
      const title = await dialog.locator('.win-textbox-field').first().inputValue()
      check('announcements：编辑器已预填标题', title.length > 0, `"${title}"`)
    }
    check('announcements：无 JS 错误', noErrors(second.pageErrors), second.pageErrors.join(' | ').slice(0, 120))
  } finally {
    await second.page.close()
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

/** 投票详情：题目配图；**未投票时必须能进答题分支**；主观题字数上限 */
async function smokePollImage() {
  const { page, pageErrors } = await openPage('poll', '?id=5')
  try {
    /* ⚠️ `openPage` 只保证**外壳**挂载（`#__loaded` 哨兵），题目、配图、
       验证码都是随后异步拉取的。这里必须等内容真的出来再断言 ——
       否则机器一忙就会偶发「0 个」的假故障（跑全量时踩到过：4 条同时红，
       单独跑这一页却全绿）。 */
    await page
      .locator('.yali-form-actions button', { hasText: '提交投票' })
      .first()
      .waitFor({ state: 'attached', timeout: 8000 })
      .catch(() => {})
    /* 关键回归点：`/api/polls/:id/my-vote` 返回的是对象 `{voted:false}`。
       早先写成 `!!mine && (!Array.isArray(mine) || ...)` → voted 恒为 true，
       **投票表单永远不出现，所有人都投不了票**。 */
    const submitBtn = await page.locator('.yali-form-actions button', { hasText: '提交投票' }).count()
    check('poll：未投票时能进入答题分支（提交按钮存在）', submitBtn > 0, `${submitBtn} 个`)

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

/** 发起投票：把某题改成主观题后，选项编辑器隐藏、字数限制出现（题型只有一个真实来源） */
async function smokePollsQuestionType() {
  const { page, pageErrors } = await openPage('polls')
  try {
    // 打开发起投票对话框
    await page.locator('.yali-fab').first().click()
    await page.waitForTimeout(500)

    const firstQ = page.locator('.poll-question').first()
    check('polls：选择题默认显示选项编辑器', (await firstQ.locator('.poll-option').count()) > 0,
      `${await firstQ.locator('.poll-option').count()} 个选项`)
    check('polls：选择题默认不显示字数限制', (await firstQ.locator('.poll-maxlen').count()) === 0)

    // 题型下拉 → 选「主观题」（第 3 项）
    await firstQ.locator(SEL.comboRoot).first().locator(SEL.comboBtn).first().click()
    await page.waitForTimeout(300)
    const opts = page.locator(`${SEL.comboItem}:visible`)
    const typeCount = await opts.count()
    if (typeCount >= 3) await opts.nth(2).click()
    await page.waitForTimeout(400)

    const maxLenBox = await firstQ.locator('.poll-maxlen').count()
    const optionRows = await firstQ.locator('.poll-option').count()
    check('polls：切到主观题后出现「字数限制」', maxLenBox === 1, `${maxLenBox} 个（题型项 ${typeCount}）`)
    check('polls：切到主观题后选项编辑器隐藏', optionRows === 0, `${optionRows} 个选项`)

    check('polls：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 验证码对话框「打开 → 取消 → 再打开」后必须仍有验证码（关闭会移除容器） */
async function smokeCaptchaReopen() {
  // 报修
  {
    const { page } = await openPage('services')
    try {
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(500)
      const first = await page.locator('#yaliIssueCaptcha .captcha-input').count()
      // 关闭（取消按钮在对话框底部）
      await page.locator('.content-dialog button', { hasText: '取消' }).first().click()
      await page.waitForTimeout(500)
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(600)
      const second = await page.locator('#yaliIssueCaptcha .captcha-input').count()
      check('services：再次打开表单验证码仍在', first === 1 && second === 1, `第一次 ${first}，第二次 ${second}`)
    } finally {
      await page.close()
    }
  }

  // 财务
  {
    const { page } = await openPage('finance')
    try {
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(500)
      const first = await page.locator('#yaliFinanceCaptcha .captcha-input').count()
      await page.locator('.content-dialog button', { hasText: '取消' }).first().click()
      await page.waitForTimeout(500)
      await page.locator('.yali-fab').first().click()
      await page.waitForTimeout(600)
      const second = await page.locator('#yaliFinanceCaptcha .captcha-input').count()
      check('finance：再次打开表单验证码仍在', first === 1 && second === 1, `第一次 ${first}，第二次 ${second}`)
    } finally {
      await page.close()
    }
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
      /* 先断言列表状态：桩里 1 号报修标了 has_image: 1，而图片接口返回空 map
         —— 模拟「标记有图却取不到」。只判 has_image 的话骨架会永远转下去，
         用户看到的就是一个灰框（这正是那条断言要防的回归）。 */
      await page.waitForTimeout(1200)
      const skeletons = await page.locator('.yali-img-skeleton').count()
      check('services：取不到图时骨架会结束（不留永久灰框）', skeletons === 0, `残留 ${skeletons} 个`)

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

/** 记录所有写请求的 URL 与 body，并让它们「成功」，以便走完成功分支。
    用来断言**请求体的字段名**——这类错配不报错，后端直接 400，很难在 UI 上看出来。 */
async function captureWrites(page) {
  await page.evaluate(() => {
    window.__posted = []
    const passthrough = window.fetch
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      const method = ((init && init.method) || 'GET').toUpperCase()
      // 只拦写请求：读请求必须继续走原来的桩，
      // 否则 GET 会拿到假的 {message:'ok'}，页面把它当数组用就会抛异常
      if (method === 'GET' || method === 'HEAD') return passthrough.apply(this, arguments)
      let body = null
      try {
        body = init && init.body ? JSON.parse(init.body) : null
      } catch {
        body = (init && init.body) || null
      }
      window.__posted.push({ url, method, body })
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true, data: { message: 'ok' } }),
        text: () => Promise.resolve('{"success":true,"data":{"message":"ok"}}')
      })
    }
  })
}

/** 值日管理：手动排班的**请求体字段名**（此前这两处就是写错过字段的地方） */
async function smokeDutyAdminManualSchedule() {
  const { page, pageErrors } = await openPage('duty-admin')
  try {
    await captureWrites(page)

    await page.locator('button.da-cal-cell').nth(1).click()
    await page.waitForTimeout(600)
    const dialog = page.locator('.content-dialog').last()
    const combos = dialog.locator(SEL.comboRoot)
    const comboCount = await combos.count()
    for (let i = 0; i < Math.min(comboCount, 2); i++) {
      await combos.nth(i).locator(SEL.comboBtn).first().click()
      await page.waitForTimeout(250)
      const opts = page.locator(`${SEL.comboItem}:visible`)
      if ((await opts.count()) > i) await opts.nth(i).click()
      await page.waitForTimeout(200)
    }
    await dialog.locator('button', { hasText: '保存' }).first().click()
    await page.waitForTimeout(600)

    const post = await page.evaluate(
      () => window.__posted.filter((p) => p.url.indexOf('/schedule/manual') >= 0)[0] || null
    )
    check(
      'duty-admin：手动排班请求体字段正确（date + staff_a_id + staff_b_id）',
      !!post &&
        typeof post.body?.date === 'string' &&
        typeof post.body?.staff_a_id === 'number' &&
        typeof post.body?.staff_b_id === 'number',
      JSON.stringify(post?.body ?? null)
    )
    check('duty-admin：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/** 值日管理：批量销分的**请求体字段名**与「先勾选才可提交」的约束 */
async function smokeDutyAdminBatchCancel() {
  // 直接落在「评分」标签（?tab=2），避免先弹一个对话框再想办法关掉
  const { page, pageErrors } = await openPage('duty-admin', '?tab=2')
  try {
    await page.waitForTimeout(400)
    const scoreRows = await page.locator('.da-score').count()
    check('duty-admin：?tab=2 可直接落在「评分」', scoreRows > 0, `${scoreRows} 条`)

    await captureWrites(page)
    // 等元素真的出现再点（固定 sleep 在机器忙的时候会不够，click 会一直等到超时）
    const firstCheckbox = page.locator('.da-row .win-checkbox').first()
    await firstCheckbox.waitFor({ timeout: 10000 })
    await firstCheckbox.click()
    await page.waitForTimeout(300)

    await page.locator('button', { hasText: '批量销分' }).first().click()
    await page.waitForTimeout(600)
    const dlg = page.locator('.content-dialog').last()
    await dlg.locator(SEL.comboRoot).first().locator(SEL.comboBtn).first().click()
    await page.waitForTimeout(300)
    const adminOpts = page.locator(`${SEL.comboItem}:visible`)
    if ((await adminOpts.count()) > 0) await adminOpts.first().click()
    await dlg.locator('.win-textbox-field').first().fill('排班调整，原扣分作废')
    const pwd = dlg.locator('.win-password-box .win-textbox-field').first()
    if (await pwd.count()) await pwd.fill('Yali@1234')
    await dlg.locator('button', { hasText: '确认销分' }).first().click()
    await page.waitForTimeout(700)

    const post = await page.evaluate(
      () => window.__posted.filter((p) => p.url.indexOf('/scores/batch-cancel') >= 0)[0] || null
    )
    check(
      'duty-admin：批量销分请求体字段正确（score_record_ids + reason + admin_id + password）',
      !!post &&
        Array.isArray(post.body?.score_record_ids) &&
        post.body.score_record_ids.length > 0 &&
        typeof post.body?.reason === 'string' &&
        !!post.body?.admin_id &&
        !!post.body?.password,
      JSON.stringify(post?.body ?? null)
    )
    check('duty-admin：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 站点对话框：确认框 / 输入框
 *
 * 这一组存在的原因：全站原先有 35 处 `window.confirm` + 4 处 `window.prompt`
 * + 1 处 `window.alert`（浏览器原生弹窗，样式完全不受站点控制），
 * 以及 services 页一处遗留 `openModal` 拼的旧设计系统弹窗。
 * 全部换成了站点的 ContentDialog —— 也就是「提交问题」那种样式。
 * 断言必须落在「弹的是 ContentDialog」这个事实上，否则改回原生弹窗也不会被发现
 * （原生弹窗在无头浏览器里是自动 dismissed 的，什么都测不到）。
 */
async function smokeSiteDialogs() {
  const { page, pageErrors } = await openPage('admin')
  try {
    /* ── ① 危险确认框 ── */
    await page.locator('button', { hasText: '拒绝' }).first().click()
    const dlg = page.locator('.content-dialog')
    await dlg.waitFor({ timeout: 5000 }).catch(() => {})
    const count = await dlg.count()
    check('对话框：删除/拒绝类操作弹的是站点 ContentDialog', count === 1, `${count} 个`)

    const title = await page.locator('.content-dialog-title').first().innerText().catch(() => '')
    check('对话框：有语义化标题', title.includes('拒绝'), JSON.stringify(title))

    const btns = await page.locator('.content-dialog-command-space button').allInnerTexts().catch(() => [])
    check('对话框：按钮是「确定 / 取消」', btns.length === 2 && btns.includes('取消'), JSON.stringify(btns))

    const primaryBg = await page
      .locator('.content-dialog-primary')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
      .catch(() => '')
    /* 判「偏红」而不是写死色值：--md-error 换一次就会误报，
       而这条断言真正要防的是「危险按钮退化成了主题蓝强调色」 */
    const rgb = (primaryBg.match(/\d+/g) || []).map(Number)
    const isDanger = rgb.length >= 3 && rgb[0] > 120 && rgb[1] < 80 && rgb[2] < 80
    check('对话框：危险操作主按钮为警示色（非主题蓝）', isDanger, primaryBg)

    /* 取消 → 关闭且不发请求 */
    const before = await page.locator('.yali-item').count()
    await page.locator('.content-dialog-close').first().click()
    await page.waitForTimeout(500)
    check('对话框：点「取消」会关闭', (await page.locator('.content-dialog').count()) === 0)
    check('对话框：点「取消」不发写请求', (await page.locator('.yali-item').count()) === before)

    /* ── ② 输入框（promptDialog）＋ 实时校验 ── */
    await page.locator(SEL.selectorItem).nth(1).click()
    await page.waitForTimeout(700)
    const renameBtn = page.locator('button', { hasText: '改名' }).first()
    if (await renameBtn.count()) {
      await renameBtn.click()
      await page.waitForTimeout(600)
      check('对话框：改名弹的是站点输入框', (await page.locator('.content-dialog .win-textbox').count()) === 1)
      const val = await page.locator('.content-dialog input').first().inputValue().catch(() => '')
      check('对话框：输入框预填当前值', val.length > 0, JSON.stringify(val))

      const primary = page.locator('.content-dialog-primary').first()
      await page.locator('.content-dialog input').first().fill('一')
      await page.waitForTimeout(300)
      check('对话框：非法输入时主按钮被禁用（长度不足）', await primary.isDisabled().catch(() => false))
      const err = await page.locator('.yali-confirm-error').first().innerText().catch(() => '')
      check('对话框：非法输入给出原因', err.includes('2-20'), JSON.stringify(err))

      await page.locator('.content-dialog input').first().fill('张三丰')
      await page.waitForTimeout(300)
      check('对话框：合法输入后主按钮恢复可点', !(await primary.isDisabled().catch(() => true)))

      await page.locator('.content-dialog-close').first().click()
      await page.waitForTimeout(300)
      check('对话框：输入框点「取消」会关闭', (await page.locator('.content-dialog').count()) === 0)
    } else {
      check('对话框：成员管理里有「改名」入口', false, '未找到按钮')
    }

    check('对话框：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 管理页标签栏：窄屏必须能横向滚动
 *
 * 此前 SelectorBar 的根是 `display: inline-grid`，宽度被 9 个标签撑到 710px，
 * 而手机视口只有 ~390px —— 后面的「财务记录 / 功能开关 / 站点设置」既看不到
 * 也滚不到（用户报的「管理页面选项缺失」）。
 */
async function smokeTabsOverflow() {
  const { page, pageErrors } = await openPage('admin', '', { width: 390, height: 844 })
  try {
    const info = await page.locator('.win-selector-bar').first().evaluate((el) => {
      const view = el.querySelector('.win-selector-bar-items-view')
      return {
        barW: Math.round(el.getBoundingClientRect().width),
        scrollW: view.scrollWidth,
        clientW: view.clientWidth
      }
    })
    check(
      '窄屏标签栏：容器不溢出（宽度收敛到视口内）',
      info.barW <= 390,
      `${info.barW}px / 视口 390px`
    )
    check(
      '窄屏标签栏：可横向滚动（内容宽 > 可视宽）',
      info.scrollW > info.clientW + 2,
      `${info.scrollW} > ${info.clientW}`
    )
    check(
      '窄屏标签栏：页面不产生横向滚动',
      !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
    )

    /* 滚到最右，最后一个标签要能真的被点到 */
    const last = await page
      .locator(SEL.selectorItem)
      .last()
      .evaluate((el) => el.innerText.trim())
      .catch(() => '')
    await page.locator('.win-selector-bar-items-view').first().evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    await page.waitForTimeout(300)
    await page.locator(SEL.selectorItem).last().click()
    await page.waitForTimeout(700)
    // 注意别用 `.win-textblock` 这种猜出来的类名 —— 这里取区块文本就够了
    const body = await page.locator('.yali-section').first().innerText().catch(() => '')
    check('窄屏标签栏：能点到最后一个标签（' + last + '）', body.trim().length > 0, body.slice(0, 24))

    check('窄屏标签栏：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 权限守卫：无权访问管理页必须跳 **404**（伪装），而不是把骨架渲染出来
 *
 * 旧版 auth.js 的 requireAuth / requireMember / requireAdmin 都是
 * 「不通过 → /404.html?from=<页面名>」—— 404 页会播「伪装入侵」彩蛋，
 * 这是有意设计，不是随手写的错误处理。
 * 迁移后这一层丢了（改成「非管理员跳回服务页」），
 * 于是未登录用户能直接看到管理面板的标题、标签和部分空数据。
 */
async function smokeGuards() {
  /* 跳转类用例不能复用 openPage：它要等页面外壳渲染出来，
     而这里页面会在渲染完成前就跳走，等待必然超时。 */
  async function openAndWatch(entry, query) {
    await buildVerifyPage(entry, query)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)))
    await page.goto(`${base}/__verify.html`, { waitUntil: 'load' })
    return { page, pageErrors }
  }

  const jumped = (page, ms = 6000) =>
    page.waitForURL(/\/404\.html/, { timeout: ms }).then(() => true).catch(() => false)

  /* ① 未登录访问管理面板 */
  {
    const { page } = await openAndWatch('admin', '?anon=1')
    const ok = await jumped(page)
    check('守卫：未登录访问管理页 → 跳 404', ok, page.url().replace(base, ''))
    check(
      '守卫：404 带 ?from=管理面板（伪装彩蛋要用的页面名）',
      decodeURIComponent(page.url()).includes('from=管理面板'),
      page.url().replace(base, '')
    )
    await page.close()
  }

  /* ② 普通成员访问管理面板 */
  {
    const { page } = await openAndWatch('admin', '?role=member')
    const ok = await jumped(page)
    check('守卫：普通成员访问管理页 → 跳 404', ok, page.url().replace(base, ''))
    await page.close()
  }

  /* ③ 未登录访问个人设置 */
  {
    const { page } = await openAndWatch('settings', '?anon=1')
    check('守卫：未登录访问个人设置 → 跳 404', await jumped(page), page.url().replace(base, ''))
    await page.close()
  }

  /* ④ 未登录访问财务页（旧版是 requireMember） */
  {
    const { page } = await openAndWatch('finance', '?anon=1')
    check('守卫：未登录访问财务页 → 跳 404', await jumped(page), page.url().replace(base, ''))
    await page.close()
  }

  /* ⑤ 反向：管理员访问管理页**不能**跳 404（别把守卫做成一律拦） */
  {
    const { page } = await openPage('admin')
    await page.waitForTimeout(800)
    check('守卫：管理员访问管理页正常渲染（未误跳）', !/404\.html/.test(page.url()), page.url().replace(base, ''))
    await page.close()
  }

  /* ⑥ 反向：成员访问财务页应当放行 */
  {
    const { page } = await openPage('finance', '?role=member')
    await page.waitForTimeout(600)
    check('守卫：成员访问财务页放行（未误跳）', !/404\.html/.test(page.url()), page.url().replace(base, ''))
    await page.close()
  }
}

/**
 * Cookie 告知横幅：WinUI 版
 *
 * 旧实现是 api.js 往 body 注入 `.cookie-banner` + `.btn`（旧设计系统的类名），
 * 在换过皮的界面里一眼就看得出来。现在由 `components/CookieBanner.vue` 渲染，
 * 同时给遗留实现留了 `window.__winuiCookieBanner` 标记让它让位。
 */
async function smokeCookieBanner() {
  const { page, pageErrors } = await openPage('services')
  try {
    const banner = page.locator('.yali-cookie')
    await banner.waitFor({ timeout: 5000 }).catch(() => {})
    check('Cookie 横幅：出现的是 WinUI 版（.yali-cookie）', (await banner.count()) === 1)
    check(
      'Cookie 横幅：旧实现已让位（没有 .cookie-banner）',
      (await page.locator('.cookie-banner').count()) === 0
    )
    check(
      'Cookie 横幅：文案与旧版一致',
      (await banner.innerText().catch(() => '')).includes('本站使用 Cookie 维持登录')
    )
    /* 用的是 WinUI 的 Button（AccentButtonStyle），不是遗留 .btn */
    check(
      'Cookie 横幅：按钮是 WinUI 控件（.win-btn）',
      (await page.locator('.yali-cookie .win-btn').count()) === 1
    )

    await banner.locator('button', { hasText: '知道了' }).click()
    await page.waitForTimeout(700)
    check('Cookie 横幅：点「知道了」后消失', (await page.locator('.yali-cookie').count()) === 0)
    check(
      'Cookie 横幅：已写入 localStorage.cookieConsent',
      await page.evaluate(() => localStorage.getItem('cookieConsent') === 'true')
    )

    check('Cookie 横幅：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 班级补填：未填班级的登录用户会被强制补填
 *
 * 旧版 `auth.js` 的 `checkAuth()` 末尾有 `if (!user.class_name) requireClass(user)`：
 * activities / announcements / announcement / finance / settings / admin / duty-admin
 * 这 7 个页面进入时都会弹出一个**关不掉**的表单要求补填（班级 + 密码确认）。
 * 迁移时整块丢了 —— 缺班级的用户在部门/值日/财务列表里会落到「未分组」，
 * 而他自己完全不知道要补。
 */
async function smokeClassPrompt() {
  const { page, pageErrors } = await openPage('activities', '?noclass=1')
  try {
    const dlg = page.locator('.content-dialog')
    await dlg.waitFor({ timeout: 6000 }).catch(() => {})
    check('班级补填：未填班级时进入页面会自动弹出', (await dlg.count()) === 1, `${await dlg.count()} 个`)

    const title = await page.locator('.content-dialog-title').first().innerText().catch(() => '')
    check('班级补填：标题是「填写班级」', title.includes('填写'), JSON.stringify(title))

    const texts = await page.locator('.content-dialog-body').first().innerText().catch(() => '')
    check('班级补填：有说明文案', texts.includes('请填写你的班级'), JSON.stringify(texts.slice(0, 40)))

    const btns = await page.locator('.content-dialog-command-space button').allInnerTexts().catch(() => [])
    check('班级补填：没有「取消」按钮（关不掉，与旧版一致）', !btns.includes('取消'), JSON.stringify(btns))
    check('班级补填：给了「退出登录」出口', btns.includes('退出登录'), JSON.stringify(btns))

    /* 两个输入框：班级（TextBox）+ 密码（PasswordBox） */
    const inputs = page.locator('.content-dialog input')
    check('班级补填：有两个输入框（班级 + 密码）', (await inputs.count()) === 2, `${await inputs.count()} 个`)

    const primary = page.locator('.content-dialog-primary').first()
    check('班级补填：空表单时「保存」不可点', await primary.isDisabled().catch(() => false))

    /* 班级格式不对 → 禁用 + 提示（规则与后端 isValidClass 一致：4 位、在学段区间内） */
    await inputs.first().fill('1234')
    await inputs.nth(1).fill('Yali@1234')
    await page.waitForTimeout(300)
    check('班级补填：非法班级时「保存」仍不可点', await primary.isDisabled().catch(() => false))
    const err = await page.locator('.yali-cls-error').first().innerText().catch(() => '')
    check('班级补填：非法班级给出原因', err.includes('4位班级编号'), JSON.stringify(err))

    /* 合法班级 → 可提交，且请求体字段名正确 */
    await captureWrites(page)
    await inputs.first().fill('2517')
    await page.waitForTimeout(300)
    check('班级补填：合法班级后「保存」可点', !(await primary.isDisabled().catch(() => true)))

    await primary.click()
    await page.waitForTimeout(700)
    const post = await page.evaluate(
      () => window.__posted.filter((p) => p.url.indexOf('/api/auth/change-class') >= 0)[0] || null
    )
    check(
      '班级补填：提交请求体是 {class_name, password}',
      !!post && post.body?.class_name === '2517' && typeof post.body?.password === 'string',
      JSON.stringify(post?.body ?? null)
    )
    check('班级补填：提交成功后对话框关闭', (await page.locator('.content-dialog').count()) === 0)

    check('班级补填：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }

  /* 反向：已经填过班级的用户不该被打扰 */
  {
    const { page } = await openPage('activities')
    await page.waitForTimeout(900)
    check('班级补填：已填班级的用户不弹（未误伤）', (await page.locator('.content-dialog').count()) === 0)
    await page.close()
  }
}

/**
 * 破图兜底
 *
 * 图片加载失败时浏览器会画一个「破图」占位 —— 在界面里就是一个空框，
 * 很容易被当成「图标没渲染」。全站 19 处 <img> 之前一处错误处理都没有。
 * 现在由 bootstrap 的全局 error 捕获（捕获阶段，因为 error 不冒泡）
 * 把 src 换成一张淡色 SVG：这是唯一跨浏览器可靠的消框办法
 * （CSS `content:''` 只有 Chromium 认）。
 */
async function smokeBrokenImage() {
  const { page, pageErrors } = await openPage('services')
  try {
    const result = await page.evaluate(async () => {
      const img = document.createElement('img')
      img.src = '/definitely-missing-' + Date.now() + '.png'
      img.style.width = '60px'
      img.style.height = '40px'
      document.body.appendChild(img)
      await new Promise((r) => setTimeout(r, 900))
      const out = {
        marked: img.classList.contains('yali-img-broken'),
        replaced: img.src.startsWith('data:image/svg+xml'),
        stillOriginal: /definitely-missing/.test(img.src)
      }
      img.remove()
      return out
    })
    check('破图兜底：失败的图片被标记出来', result.marked, JSON.stringify(result))
    check('破图兜底：src 被换成淡色占位（不再画破图图标）', result.replaced && !result.stillOriginal)
    check('破图兜底：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 值日管理：排班日历的翻页步长必须是 14 天（一屏就是两周）
 *
 * 早先按钮叫「上周 / 下周」，绑的却是 shiftWeeks(±2) —— 参数被当成「天数」，
 * 每次只挪 2 天，翻页看起来几乎没动。这类「步长写错」不会报错，
 * 只会让人觉得按钮不好使，必须靠断言把数字钉住。
 */
async function smokeDutyAdminPaging() {
  const { page, pageErrors } = await openPage('duty-admin')
  try {
    const rangeText = () =>
      page.locator('.yali-section-head').first().innerText().catch(() => '')
    const dayOf = (t) => {
      const m = t.match(/(\d{4})-(\d{2})-(\d{2})/)
      return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN
    }

    const start = await rangeText()
    const startDay = dayOf(start)
    check('duty-admin：排班视图显示当前区间', !Number.isNaN(startDay), JSON.stringify(start))

    /* 页面上的按钮文案应为「上一页 / 下一页」（不再是「上周 / 下周」） */
    const btns = await page.locator('.yali-section-head button').allInnerTexts().catch(() => [])
    check('duty-admin：翻页按钮是「上一页 / 下一页」', btns.some((t) => t.includes('下一页')), JSON.stringify(btns))

    await page.locator('button', { hasText: '下一页' }).first().click()
    await page.waitForTimeout(700)
    const next = await rangeText()
    const nextShift = Math.round((dayOf(next) - startDay) / 86400000)
    check('duty-admin：「下一页」平移 14 天', nextShift === 14, `实际 ${nextShift} 天（${start} → ${next}）`)

    await page.locator('button', { hasText: '上一页' }).first().click()
    await page.waitForTimeout(700)
    const back = await rangeText()
    const backShift = Math.round((dayOf(back) - dayOf(next)) / 86400000)
    check('duty-admin：「上一页」平移 -14 天', backShift === -14, `实际 ${backShift} 天`)
    check('duty-admin：来回翻页回到原区间', dayOf(back) === startDay, `${back} vs ${start}`)

    check('duty-admin：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 值日页：签到中的计时精确到秒，并且真的每秒在跳
 *
 * 之前只在格式化时砍到分钟（`min >= 60 ? '1h2m' : '45m'`），
 * 于是「刚签到」和「签到 59 秒」看起来一模一样 —— 用户会以为没记上。
 * 这类问题光看「有数字」是查不出来的，必须断言 ① 格式带秒 ② 隔一秒数值变了。
 */
async function smokeDutyCountdown() {
  const { page, pageErrors } = await openPage('duty')
  try {
    const btn = page.locator('.duty-row button', { hasText: '签退' }).first()
    const count = await btn.count()
    check('duty：存在「签到中」的条目（桩里有 signed_in 记录）', count > 0, `${count} 条`)

    if (count > 0) {
      const first = (await btn.innerText()).replace(/\s+/g, ' ')
      check(
        'duty：计时精确到秒（Xm Ys / Xh Ym Zs）',
        /\d+h\d+m\d+s|\d+m\d+s/.test(first),
        JSON.stringify(first)
      )

      /* 隔一秒再取一次：秒数必须变，否则说明只是格式化写了秒、实际没刷新 */
      await page.waitForTimeout(2200)
      const second = (await btn.innerText()).replace(/\s+/g, ' ')
      const secOf = (t) => {
        const m = t.match(/(\d+)m(\d+)s/)
        return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
      }
      check(
        'duty：计时真的在走（隔两秒读数不同）',
        first !== second && secOf(second) > secOf(first),
        `${first} → ${second}`
      )
    }

    check('duty：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 报修「处理备注」：提交者与解决者都能追加
 *
 * 改动前：`issues.notes` 是**单字段**，只能在创建报修时由提交者填一次
 * （≤50 字），后端连改它的接口都没有 —— 解决者处理完没有地方写说明。
 * 现在备注是 comments 表上的 `issue_note` 类型（零迁移），带作者与时间，
 * 提交者本人与管理员都能追加，其他人只读。
 */
async function smokeIssueNotes() {
  /* ① 管理员（同时也是解决者）视角 */
  {
    const { page, pageErrors } = await openPage('services')
    try {
      await page.waitForTimeout(900)
      const box = page.locator('.yali-note-box').first()
      check('报修备注：备注区渲染出来', (await box.count()) > 0)

      const text = await box.innerText().catch(() => '')
      check(
        '报修备注：已有备注带作者与内容',
        text.includes('张三') && text.includes('已联系厂商'),
        JSON.stringify(text.slice(0, 60))
      )
      check('报修备注：标题是「处理备注」', text.includes('处理备注'))

      const addBtn = page.locator('.yali-note-box button', { hasText: '添加备注' }).first()
      check('报修备注：解决者（管理员）能看到「添加备注」', (await addBtn.count()) > 0)

      await addBtn.click()
      await page.waitForTimeout(400)
      const input = box.locator('input, textarea').first()
      check('报修备注：点开后出现输入框', (await input.count()) > 0)

      await captureWrites(page)
      await input.fill('已更换电源模块，问题已解决')
      await page.waitForTimeout(200)
      await box.locator('button', { hasText: '提交备注' }).first().click()
      await page.waitForTimeout(700)

      const post = await page.evaluate(
        () => window.__posted.filter((p) => p.url.indexOf('/api/comments') >= 0)[0] || null
      )
      check(
        '报修备注：请求体是 {target_type:issue_note, target_id, content}',
        !!post && post.body?.target_type === 'issue_note' && !!post.body?.target_id && !!post.body?.content,
        JSON.stringify(post?.body ?? null)
      )
      check('报修备注：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
    } finally {
      await page.close()
    }
  }

  /* ② 反向：普通成员、且不是这条报修的提交者 → 只读 */
  {
    const { page } = await openPage('services', '?role=member')
    try {
      await page.waitForTimeout(900)
      const addBtn = page.locator('.yali-note-box button', { hasText: '添加备注' })
      check('报修备注：无关成员看不到「添加备注」（只读）', (await addBtn.count()) === 0, `${await addBtn.count()} 个`)
      const box = page.locator('.yali-note-box').first()
      check('报修备注：无关成员仍能看备注', (await box.count()) > 0)
    } finally {
      await page.close()
    }
  }

  /* ③ 未登录 → 只读（submitted_by 本来就不返回，无从判断身份） */
  {
    const { page } = await openPage('services', '?anon=1')
    try {
      await page.waitForTimeout(900)
      const addBtn = page.locator('.yali-note-box button', { hasText: '添加备注' })
      check('报修备注：未登录看不到「添加备注」', (await addBtn.count()) === 0, `${await addBtn.count()} 个`)
    } finally {
      await page.close()
    }
  }
}

/**
 * 密码框的两个图标：清除「X」与显示/隐藏密码
 *
 * 它们曾经是**框框**，而且是两个独立成因叠在一起：
 *   ① 字形没进子集 —— U+E894（清除）与 U+F78D（显示密码）在组件模板里写的是
 *      **字面**私用区字符，而 subset-icons.mjs 只匹配转义写法，于是漏收；
 *      check-glyphs.mjs 用同一套收集逻辑，于是也拦不住。
 *   ② 元素没用图标字体 —— 这两个 span 继承的是 UI 字体（Segoe UI Variable），
 *      私用区字符在 UI 字体里没有字形，就算随包字体有也画不出来。
 *
 * 所以这里断言两件事：字符在**随包字体**的 cmap 里，且元素用的是**图标字体**。
 * 少任何一条，用户看到的都还是一个空框。
 */
async function smokePasswordBoxIcons() {
  const { page, pageErrors } = await openPage('login')
  try {
    const pwd = page.locator('.win-password-box input').first()
    await pwd.fill('Yali@1234')
    await pwd.hover()
    await page.waitForTimeout(450)

    const icons = await page.locator('.win-password-box button').evaluateAll((els) =>
      els.map((el) => {
        /* 要取**真正放字形的那一层** span —— 清除按钮的结构是
           button > span.layout > span.glyph，外层只是布局、内层才声明字体。
           取 el.querySelector('span') 会拿到外层，量出「用的是 UI 字体」的假故障。 */
        const holder =
          [...el.querySelectorAll('span')].reverse().find((sp) => sp.textContent.trim()) || el
        const cs = getComputedStyle(holder)
        return {
          code: [...el.textContent].map((c) => c.codePointAt(0)),
          font: cs.fontFamily
        }
      })
    )
    check('密码框：输入后出现「清除 + 显示密码」两个图标按钮', icons.length === 2, `${icons.length} 个`)

    check(
      '密码框：图标字符用的是图标字体（不是 UI 字体）',
      icons.length > 0 && icons.every((i) => /Segoe (Fluent|MDL2)/.test(i.font)),
      JSON.stringify(icons.map((i) => i.font))
    )

    /* 字形必须在**随包分发**的字体里 —— 这是任何设备上都能画出来的前提 */
    const missing = []
    for (const icon of icons) {
      for (const cp of icon.code) {
        if (!shippedCodepoints.has(cp)) missing.push('U+' + cp.toString(16).toUpperCase())
      }
    }
    check('密码框：图标字形在随包字体子集里', missing.length === 0, missing.join(', '))

    check('密码框：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 侧栏收起成图标栏时，账户区（登录 / 登出）也只显示图标
 *
 * 导航项在收起态由上游组件切成图标栏，但账户区是站点写进 `PaneFooter` 的
 * slot 内容 —— 上游那套紧凑规则够不到它，48px 宽的栏里文字被裁成半截。
 *
 * ⚠️ 收起态的判据必须是 `is-closed-compact`（紧凑 **且** 非最小化）。
 * 手机宽度是最小化模式，那时 `is-compact` 也是真，但侧栏是以浮层展开的、
 * 内容要完整显示 —— 所以专门有一条反向断言盯着「别用 is-compact 单独判定」。
 */
async function smokePaneAccountIcons() {
  /* ① 收起态（800px = LeftCompact）：只留图标 */
  {
    const { page, pageErrors } = await openPage('services', '?anon=1', { width: 800, height: 820 })
    try {
      await page.waitForTimeout(700)
      const rail = page.locator('.win-nav-left-panel')
      check(
        '侧栏收起：800px 进入图标栏（is-closed-compact）',
        await rail.evaluate((el) => el.classList.contains('is-closed-compact'))
      )

      /* 用 computed display 判「隐藏规则是否命中」，而不是 isVisible() ——
         后者在祖先 display:none 时也会是 false，可能让断言因为别的原因通过。 */
      const textDisplay = await page
        .locator('.win-nav-left-panel .yali-account-action-text')
        .first()
        .evaluate((el) => getComputedStyle(el).display)
        .catch(() => '(找不到)')
      check('侧栏收起：登录按钮的文字被隐藏', textDisplay === 'none', textDisplay)

      const icon = page.locator('.win-nav-left-panel .yali-account-action .win-font-icon').first()
      check('侧栏收起：图标还在（不是整块藏掉）', await icon.isVisible().catch(() => false))

      const btn = await page.locator('.win-nav-left-panel .yali-account-action').first().boundingBox()
      const item = await page.locator('.win-nav-left-panel .win-nav-item').first().boundingBox()
      check(
        '侧栏收起：登录图标的尺寸与导航项一致（40×36）',
        !!btn && !!item && Math.round(btn.width) === Math.round(item.width) && Math.round(btn.height) === Math.round(item.height),
        `${JSON.stringify(btn)} vs ${JSON.stringify(item)}`
      )

      const bg = await page.locator('.win-nav-left-panel .yali-account-action').first().evaluate((el) => getComputedStyle(el).backgroundColor)
      check('侧栏收起：登录按钮没有白色底块（与导航项一样透明）', /rgba\(0, 0, 0, 0\)/.test(bg), bg)

      /* 只显示图标不等于变成装饰 —— 还得能点进登录页 */
      await page.locator('.win-nav-left-panel .yali-account-action').first().click()
      const ok = await page
        .waitForURL(/login\.html/, { timeout: 4000 })
        .then(() => true)
        .catch(() => false)
      check('侧栏收起：点图标能进登录页', ok, page.url().replace(base, ''))

      check('侧栏收起：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
    } finally {
      await page.close()
    }
  }

  /* ② 反向：桌面展开态，文字必须在 */
  {
    const { page } = await openPage('services', '?anon=1')
    try {
      await page.waitForTimeout(700)
      const rail = page.locator('.win-nav-left-panel')
      check('侧栏展开：不是收起态', !(await rail.evaluate((el) => el.classList.contains('is-closed-compact'))))
      const text = await page
        .locator('.yali-account-action-text')
        .first()
        .evaluate((el) => getComputedStyle(el).display)
        .catch(() => '(找不到)')
      check('侧栏展开：登录文字正常显示（未被误藏）', text !== 'none', text)
    } finally {
      await page.close()
    }
  }

  /* ③ 反向：手机宽度是最小化模式，不该被当成「图标栏」 */
  {
    const { page } = await openPage('services', '?anon=1', { width: 390, height: 844 })
    try {
      await page.waitForTimeout(700)
      const rail = page.locator('.win-nav-left-panel')
      check(
        '手机宽度：不算图标栏收起态（is-compact ≠ is-closed-compact）',
        !(await rail.evaluate((el) => el.classList.contains('is-closed-compact')))
      )
      const text = await page
        .locator('.yali-account-action-text')
        .first()
        .evaluate((el) => getComputedStyle(el).display)
        .catch(() => '(找不到)')
      check('手机宽度：登录文字没有被隐藏规则命中', text !== 'none', text)
    } finally {
      await page.close()
    }
  }
}

/**
 * 登出：必须真的让后端清掉 cookie，并且**等响应回来再跳转**
 *
 * 用户报「有时候登出并不能正常登出，刷新后还会保持登录」。查下来是两个缺陷叠加：
 *
 * ① `window.logout` 是 `nav.js` 里的旧实现，而 WinUI 页面**刻意不加载 nav.js**
 *    → 它一直是 undefined，调用方只能退化成「只清 localStorage」。
 *    而会话凭据是后端种的 **HttpOnly cookie**，前端删不掉 ——
 *    于是表面登出了，下次进管理页（或刷新）时 `/api/auth/me` 靠 cookie
 *    又把人恢复成登录态。**根子上是「根本没请求后端」。**
 * ② 旧实现是「发完请求立刻 location.href」，请求会被导航中断，cookie 清不掉
 *    → 这才是「有时候」的来源（取决于网络快慢）。
 *
 * 所以这里的两条核心断言是：
 *   - 点登出**确实发出** `POST /api/auth/logout`（原先一次都不发）
 *   - 后端还没响应时**不能跳走**（桩把该接口故意延迟，用来卡这个时间窗）
 */
async function smokeLogout() {
  /* ① 侧栏「登出」按钮 */
  {
    const { page, pageErrors } = await openPage('services')
    try {
      /* ⚠️ 这里**不能**用 captureWrites：它会把写请求的响应直接伪造掉，
         于是桩的登出分支根本不会执行、__loggedOut 永远为假，
         探针就会一直说「还登录着」→ 前端白重试一次。
         计数改用桩自己的调用记录（window.__calls）。 */
      await page.evaluate(() => {
        window.__loggedOut = false
        window.__calls = []
        // 让桩把登出接口拖慢 600ms，好卡住「响应回来之前」那个时间窗
        window.__logoutLatency = 600
      })

      const btn = page.locator('.yali-account-action', { hasText: '登出' }).first()
      check('登出：侧栏有「登出」入口', (await btn.count()) > 0, `${await btn.count()} 个`)
      await btn.click()

      // 250ms 后：请求已发、响应未回 —— 此时必须还停在原页
      await page.waitForTimeout(250)
      check(
        '登出：等后端响应期间不跳转（请求不会被打断）',
        await page.evaluate(() => !!document.getElementById('__loaded')),
        page.url().replace(base, '')
      )

      const posts = await page.evaluate(
        () => (window.__calls || []).filter((u) => u.indexOf('/api/auth/logout') >= 0).length
      )
      check('登出：确实请求了后端清 cookie（原先一次都不发）', posts === 1, `${posts} 次`)

      /* 探针（/api/auth/me）在桩里已随登出变为 401，所以不该出现「重试第二次」——
         多出来的那一次说明前端没能确认会话失效（会白等一轮再弹「登出可能未完成」） */
      check('登出：会话探针一次就确认失效（没有空转重试）', posts === 1, `${posts} 次`)

      /* ⚠️ 不能只 `waitForURL`：桩页把路径伪造成了 /services.html，URL 立刻就"命中"，
         检查会跑在「跳转之前、localStorage 还没清」的时刻（第一次就是这么假红的）。
         要等**真实页面**接管 —— 判据是桩自己的全局 `window.__calls` 消失。 */
      await page.waitForFunction(() => !window.__calls, { timeout: 8000 }).catch(() => {})
      check('登出：随后跳到服务页', /\/services\.html/.test(page.url()), page.url().replace(base, ''))
      check(
        '登出：本地用户信息已清空',
        await page.evaluate(() => !localStorage.getItem('user') && !localStorage.getItem('token'))
      )
      check('登出：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
    } finally {
      await page.close()
    }
  }

  /* ② 班级补填表单里的「退出登录」——它以前调 window.logout，是个**空按钮**：
        点下去只是把表单关掉，人还是登录着的（cookie 还在） */
  {
    const { page } = await openPage('activities', '?noclass=1')
    try {
      const dlg = page.locator('.content-dialog')
      await dlg.waitFor({ timeout: 6000 }).catch(() => {})
      await page.evaluate(() => {
        window.__loggedOut = false
        window.__calls = []
        // 拖慢到 1.5s：好在跳转之前读到请求计数（跳转后这个页面就没了）
        window.__logoutLatency = 1500
      })

      const exitBtn = page.locator('.content-dialog-command-space button', { hasText: '退出登录' }).first()
      check('班级表单：有「退出登录」出口', (await exitBtn.count()) > 0)
      await exitBtn.click()
      await page.waitForTimeout(400)

      const posts = await page.evaluate(
        () => (window.__calls || []).filter((u) => u.indexOf('/api/auth/logout') >= 0).length
      )
      check('班级表单：退出登录真的请求了后端（原先是个空按钮）', posts >= 1, `${posts} 次`)

      await page.waitForURL(/\/services\.html/, { timeout: 8000 }).catch(() => {})
      check(
        '班级表单：退出后本地用户信息已清空',
        await page.evaluate(() => !localStorage.getItem('user') && !localStorage.getItem('token'))
      )
    } finally {
      await page.close()
    }
  }
}

/**
 * 鸣谢页：开源库的署名与源码地址
 *
 * `credits.ts` 是纯静态数据 —— 漏写 `url` 不会报错，
 * 名称只会悄悄退化成普通文字、地址整行消失（页面看起来仍然「正常」）。
 * 而开源库（尤其 GPL-3.0 这类 copyleft）署不出来源是实质问题，
 * 所以要断言「名称可点、地址正确、新窗口且不泄露来源、作者在列」。
 */
async function smokeCredits() {
  const { page, pageErrors } = await openPage('thanks')
  try {
    await page.waitForTimeout(700)
    const items = await page.locator('.yali-thanks-item').evaluateAll((els) =>
      els.map((el) => {
        const link = el.querySelector('a.yali-thanks-url')
        const nameEl = el.querySelector('.yali-thanks-name')
        return {
          name: (nameEl?.textContent || '').trim(),
          clickable: el.querySelector('a.yali-thanks-name') !== null,
          href: link?.getAttribute('href') || null,
          target: link?.getAttribute('target') || null,
          rel: link?.getAttribute('rel') || null,
          author: (el.querySelector('.yali-thanks-meta')?.textContent || '').trim() || null,
          shown: (link?.textContent || '').trim() || null
        }
      })
    )
    const byName = (n) => items.find((i) => i.name === n)
    check('鸣谢：共渲染出条目', items.length > 10, `${items.length} 条`)
    check('鸣谢：组件库 WinUIonWeb 在列', !!byName('WinUIonWeb'))
    check('鸣谢：框架 Vue 在列', !!byName('Vue'))

    for (const name of ['Vue', 'WinUIonWeb']) {
      const it = byName(name)
      if (!it) continue
      check(`鸣谢：${name} 名称可点进源码仓`, it.clickable, JSON.stringify(it))
      check(
        `鸣谢：${name} 外链新窗口且不泄露来源`,
        it.target === '_blank' && (it.rel || '').includes('noopener'),
        `${it.target} / ${it.rel}`
      )
      check(`鸣谢：${name} 有作者署名`, !!it.author && it.author.startsWith('作者'), String(it.author))
      /* 显示去掉协议头、跳转用完整 https —— 卡片窄，带 https:// 会把行撑爆 */
      check(
        `鸣谢：${name} 地址显示去协议头、跳转仍完整`,
        !!it.shown && !it.shown.startsWith('http') && (it.href || '').startsWith('https://'),
        `${it.shown} → ${it.href}`
      )
    }

    check('鸣谢：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
  } finally {
    await page.close()
  }
}

/**
 * 页面宽度：卡片列跟随可用宽度
 *
 * 原先 `.yali-page` 只有 `max-width: 1000px`，且**没有居中**
 * （旧版是 `.container { max-width: 960px; margin: 0 auto }`，迁移时丢了 auto）。
 * 后果：1920 视口下卡片右侧空出 635px、1515 下空出 230px，整页像被挤在左边。
 *
 * 断言分三组，缺一不可：
 *   ① 跟随 —— 宽屏下卡片要撑满可用宽度
 *   ② 有上限 —— 超宽屏不能无限拉长（正文行会难读）
 *   ③ 不回归 —— 窄屏仍是「视口 − 2×16」，且阅读型页面（公告/投票详情）
 *      保留自己的 860 窄栏（那是刻意的版式，不该被一起拉宽）
 */
async function smokePageWidth() {
  const sidebarOf = (page) =>
    page.evaluate(() => {
      const el = document.querySelector('.win-nav-left-panel')
      return el ? Math.round(el.getBoundingClientRect().width) : 0
    })

  /* ① 跟随：1515 视口下卡片要接近「视口 − 侧栏 − 页内边距」 */
  {
    const { page, pageErrors } = await openPage('about', '', { width: 1515, height: 826 })
    try {
      await page.waitForTimeout(700)
      const sidebar = await sidebarOf(page)
      const m = await page.evaluate(() => {
        const sec = document.querySelector('.yali-section')
        const page = document.querySelector('.yali-page')
        const r = sec.getBoundingClientRect()
        return {
          cardW: Math.round(r.width),
          pageW: Math.round(page.getBoundingClientRect().width),
          rightGap: Math.round(window.innerWidth - r.right),
          vw: window.innerWidth
        }
      })
      const expect = m.vw - sidebar - 72 // 页面左右各 36 padding
      check(
        '页面宽度：卡片跟随可用宽度（1515 视口撑满）',
        Math.abs(m.cardW - expect) <= 4,
        `卡片 ${m.cardW} vs 期望 ${expect}`
      )
      check(
        '页面宽度：右侧不再留大片空白',
        m.rightGap <= 48,
        `右侧空白 ${m.rightGap}px（改前 230px）`
      )
      check('页面宽度：不产生横向滚动', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
      check('页面宽度：无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
    } finally {
      await page.close()
    }
  }

  /* ② 上限：超宽屏收在 1400px 并居中（避免一行上百字） */
  {
    const { page } = await openPage('about', '', { width: 2400, height: 900 })
    try {
      await page.waitForTimeout(700)
      const sidebar = await sidebarOf(page)
      const m = await page.evaluate(() => {
        const page = document.querySelector('.yali-page')
        const r = page.getBoundingClientRect()
        return {
          pageW: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(window.innerWidth - r.right)
        }
      })
      check('页面宽度：超宽屏有上限（不无限拉长）', m.pageW <= 1400, `${m.pageW}px`)
      /* ⚠️ 居中的基准是**内容区**不是视口：`left` 里含侧栏宽度（本页 320px），
         直接比较 left 与 right 会得到「没居中」的假故障（第一次就是这么红的）。 */
      check(
        '页面宽度：达到上限后在内容区内居中',
        Math.abs(m.left - sidebar - m.right) <= 2,
        `内容区内 左 ${m.left - sidebar} / 右 ${m.right}（侧栏 ${sidebar}）`
      )
    } finally {
      await page.close()
    }
  }

  /* ③ 反向：阅读型页面保留自己的窄栏（不该被一起拉宽） */
  {
    const { page } = await openPage('announcement', '', { width: 1515, height: 826 })
    try {
      await page.waitForTimeout(700)
      const w = await page.evaluate(() =>
        Math.round(document.querySelector('.yali-page').getBoundingClientRect().width)
      )
      check('页面宽度：公告详情仍是 860 窄栏（阅读型长文刻意收窄）', w <= 860, `${w}px`)
    } finally {
      await page.close()
    }
  }

  /* ④ 不回归：窄屏仍是「视口 − 32」（页内边距 16×2） */
  {
    const { page, pageErrors } = await openPage('about', '', { width: 390, height: 844 })
    try {
      await page.waitForTimeout(700)
      const m = await page.evaluate(() => {
        const sec = document.querySelector('.yali-section')
        const r = sec.getBoundingClientRect()
        return { cardW: Math.round(r.width), vw: window.innerWidth }
      })
      check('页面宽度：窄屏卡片 = 视口 − 32（未被宽屏规则影响）', m.cardW === m.vw - 32, `${m.cardW} vs ${m.vw - 32}`)
      check('页面宽度：窄屏无横向滚动', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
      check('页面宽度：窄屏无 JS 错误', noErrors(pageErrors), pageErrors.join(' | ').slice(0, 120))
    } finally {
      await page.close()
    }
  }
}

/* ══════════════════════════════════════════════════════════ */

const CASES = [
  ['登录页：验证码挂载 + 单次提交', smokeLogin],
  ['对话框内验证码（报修 / 财务 / 活动报名）', smokeDialogCaptchas],
  ['验证码对话框：关闭后再打开仍在', smokeCaptchaReopen],
  ['管理面板：标签页切换 + 补回的标签', smokeAdminTabs],
  ['活动页：标签页切换 + 自定义时间', smokeActivitiesTabs],
  ['值日管理：标签页切换 + 手动排班入口', smokeDutyAdminTabs],
  ['值日管理：手动排班的请求体', smokeDutyAdminManualSchedule],
  ['值日管理：批量销分的请求体', smokeDutyAdminBatchCancel],
  ['财务：月份选择 + 部门筛选', smokeFinanceMonth],
  ['公告列表：进入详情', smokeAnnouncementsNavigation],
  ['动态：可跳转 / 评论作者 / 通知分类', smokeMomentFeed],
  ['投票详情：可答题 + 配图 + 验证码', smokePollImage],
  ['发起投票：题型切换联动', smokePollsQuestionType],
  ['个性化：字号滑块', smokePersonalizeSlider],
  ['410：?from= 文案改写 + 反馈入口', smokeGone],
  ['站点对话框：确认框 / 输入框 / 实时校验', smokeSiteDialogs],
  ['管理页标签栏：窄屏可横向滚动', smokeTabsOverflow],
  ['权限守卫：无权访问管理页跳 404', smokeGuards],
  ['Cookie 横幅：WinUI 版', smokeCookieBanner],
  ['班级补填：未填班级强制补填', smokeClassPrompt],
  ['破图兜底：不显示破图框', smokeBrokenImage],
  ['值日管理：排班翻页步长 14 天', smokeDutyAdminPaging],
  ['值日页：签到计时精确到秒', smokeDutyCountdown],
  ['报修备注：提交者与解决者都能添加', smokeIssueNotes],
  ['密码框：清除与显示密码图标可渲染', smokePasswordBoxIcons],
  ['侧栏收起：账户区只显示图标', smokePaneAccountIcons],
  ['登出：清 cookie 且等响应后再跳转', smokeLogout],
  ['鸣谢：开源库署名与源码地址', smokeCredits],
  ['页面宽度：卡片跟随可用宽度', smokePageWidth]
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
