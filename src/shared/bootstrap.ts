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
  return app
}
