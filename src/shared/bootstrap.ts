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

import '../winui/styles/theme.css'
import '../winui/styles/animations.css'
import '../theme/winui-yali.css'
import '../theme/winui-page.css'

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

  const el = document.createElement('div')
  el.id = 'winui-confirm-host'
  document.body.appendChild(el)

  const app = createApp(ConfirmDialog)
  app.use(WinUIonWeb, { locale: 'zh-CN' })
  app.mount(el)
}

export function mountWinUI(rootComponent: Component, selector = '#winui-root') {
  initWinUITheme()
  mountConfirmHost()

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
