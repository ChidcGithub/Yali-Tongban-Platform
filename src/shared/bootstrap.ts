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

import '../winui/styles/theme.css'
import '../winui/styles/animations.css'
import '../theme/winui-yali.css'
import '../theme/winui-page.css'

export function mountWinUI(rootComponent: Component, selector = '#winui-root') {
  initWinUITheme()

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
