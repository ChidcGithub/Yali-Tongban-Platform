/**
 * 主题桥接：把站点既有的 .dark 机制映射为 WinUIonWeb 期望的 html.theme-dark / theme-light
 *
 * 站点现状（public/js/api.js 的 applyPersonalize）：
 *   在 <html> 上增删 .dark 类，支持 深色 / 浅色 / 跟随系统 三态
 * WinUIonWeb 现状（src/winui/styles/theme.css）：
 *   令牌挂在 html.theme-light 与 html.theme-dark 两个类下
 *
 * 所以不复制那 574 个令牌，只做一次类名镜像 —— 站点怎么切，WinUI 就怎么切。
 */

const root = document.documentElement

let lastDark: boolean | null = null

function sync(): void {
  const isDark = root.classList.contains('dark')
  // 守卫：本函数自身会改 class 属性，进而再次触发观察器；
  // 状态未变时直接返回，避免自激循环
  if (isDark === lastDark) return
  lastDark = isDark
  root.classList.toggle('theme-dark', isDark)
  root.classList.toggle('theme-light', !isDark)
}

/** 立即同步一次，并监听站点后续的主题切换 */
export function initWinUITheme(): void {
  sync()
  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ['class']
  })
}
