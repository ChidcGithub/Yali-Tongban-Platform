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

export function mountWinUI(rootComponent: Component, selector = '#winui-root') {
  initWinUITheme()
  /* Cookie 横幅先挂：它的标记要在 DOMContentLoaded（api.js 检查的时点）之前设好 */
  mountCookieBanner()
  mountConfirmHost()
  mountClassPrompt()

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
