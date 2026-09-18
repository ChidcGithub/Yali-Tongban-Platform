/**
 * WinUI 页面启动器
 *
 * 所有走 WinUI 的页面都从这里挂载，保证初始化顺序一致：
 *   1) 主题类名镜像（必须先于渲染，否则会闪一下亮色）
 *   2) 加载 WinUI 令牌与动画样式
 *   3) 安装 WinUIonWeb 插件（全局布局控件 + i18n）
 *   4) 挂载根组件
 */
import { createApp, type Component } from 'vue'
import WinUIonWeb from '../winui'
import { initWinUITheme } from './theme'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CookieBanner from '../components/CookieBanner.vue'
import ClassPrompt from '../components/ClassPrompt.vue'
import WelcomeDialog from '../components/WelcomeDialog.vue'

import '../winui/styles/theme.css'
import '../winui/styles/animations.css'
import '../theme/winui-yali.css'
import '../theme/winui-page.css'

/** 往 body 上挂一个独立的单例组件（不与页面共用 app 实例） */
function mountSingleton(component: Component, id: string) {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)

  const app = createApp(component)
  app.use(WinUIonWeb, { locale: 'zh-CN' })
  app.mount(el)
}

/**
 * 全局确认框宿主（与「提交问题」等对话框同一套 ContentDialog 样式）。
 *
 * 挂到 body 而不是页面里：它就一个单例，页面切换/重建都不该影响它，
 * 而且 404/410 这种没有 YaliShell 的页面也要能用。
 */
let confirmHostMounted = false

function mountConfirmHost() {
  if (confirmHostMounted) return
  confirmHostMounted = true
  mountSingleton(ConfirmDialog, 'winui-confirm-host')
}

/**
 * Cookie 告知横幅（WinUI 版）。
 * 旧实现在 api.js 里注入 `.cookie-banner`（旧设计系统），
 * 组件挂载时会置 `window.__winuiCookieBanner`，遗留实现见到它就跳过。
 */
let cookieMounted = false

function mountCookieBanner() {
  if (cookieMounted) return
  cookieMounted = true
  mountSingleton(CookieBanner, 'winui-cookie-host')
}

/**
 * 班级补填表单（未填班级的登录用户会被强制补填）。
 * 与旧版 auth.js 的 requireClass 对应 —— 触发点在 guard.ts 的 checkAuth()。
 */
let classPromptMounted = false

function mountClassPrompt() {
  if (classPromptMounted) return
  classPromptMounted = true
  mountSingleton(ClassPrompt, 'winui-class-host')
}

/**
 * 首次使用欢迎引导（只在主页 + 每个浏览器一次）。
 * 触发条件在组件内部判断（路径 + localStorage 标记）。
 */
let welcomeMounted = false

function mountWelcome() {
  if (welcomeMounted) return
  welcomeMounted = true
  mountSingleton(WelcomeDialog, 'winui-welcome-host')
}

/**
 * 图片加载失败的兜底（破图 → 不加处理的话就是浏览器那个「框框」图标）。
 *
 * 站点的图片是 base64 存在 D1、前端再转 blob URL 的，
 * 数据损坏 / blob 失效 / 资源 404 时 `<img>` 会画出浏览器的破图占位图 ——
 * 那东西看起来就是一个空框，和小尺寸图标混在一起时很容易被当成「图标没渲染」。
 * 全站 19 处 `<img>` 之前一处错误处理都没有。
 *
 * 注意：error 事件**不冒泡**，必须用捕获阶段监听才能接住。
 */
let imageFallbackInstalled = false

/** 1×1 的淡色 SVG：作为破图后的替身，任何浏览器都不会再画「破图」图标 */
const BROKEN_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120">' +
      '<rect width="100%" height="100%" fill="rgba(0,0,0,0.05)"/></svg>'
  )

function installImageFallback() {
  if (imageFallbackInstalled) return
  imageFallbackInstalled = true
  document.addEventListener(
    'error',
    (e) => {
      const el = e.target
      if (!(el instanceof HTMLImageElement)) return
      if (el.dataset.broken) return // 替身自己再失败也不能递归下去
      el.dataset.broken = '1'
      el.classList.add('yali-img-broken')
      // 先把出错的地址记下来（下面就把 src 换掉了）
      const failed = el.currentSrc || el.src
      /* 直接换掉 src 是唯一**跨浏览器**可靠的消框办法 ——
         CSS 的 `content:''` 只有 Chromium 认，Firefox 照旧画破图图标。 */
      el.src = BROKEN_PLACEHOLDER
      // 让失败的那张图可见，排查时不用猜（生产构建里这条 warn 会让回归变红）
      console.warn('[winui] 图片加载失败：', failed.slice(0, 120))
    },
    true
  )
}

export function mountWinUI(rootComponent: Component, selector = '#winui-root') {
  installImageFallback()
  initWinUITheme()
  /* Cookie 横幅先挂：它的标记要在 DOMContentLoaded（api.js 检查的时点）之前设好 */
  mountCookieBanner()
  mountConfirmHost()
  mountClassPrompt()
  mountWelcome()

  const app = createApp(rootComponent)
  app.use(WinUIonWeb, { locale: 'zh-CN' })

  const host = document.querySelector(selector)
  if (!host) {
    console.error(`[winui] 找不到挂载点 ${selector}`)
    return null
  }

  app.mount(host)

  /* 站点维护模式：把 checkSiteClosed() 收在这里统一调用。
     旧页面各自在自己 HTML 末尾调一次（login.html:21 / feedback.html:24 / about.html:39
     / changelog.html:33 / thanks.html:23 / debug.html:50）—— 迁移时逐页抄漏，
     结果服务器关了站，这些页面照常能用。
     api.js 未加载或页面没有 #sco 容器时该函数自身会安全返回。 */
  ;(window as unknown as { checkSiteClosed?: () => void }).checkSiteClosed?.()

  return app
}
