/**
 * WinUI 页面 × 遗留脚本 的桥接层
 *
 * WinUI 页面用 NavigationView 替代了原来的导航（nav.js 的顶部栏 + 底部胶囊栏），
 * 因此不加载 nav.js。但 api.js 与 utils.js 会在每次请求、每批分片渲染时调用
 * nav.js 里的三个加载指示函数 —— 不补上就是 ReferenceError，
 * 而它出现在 fetch 包装器内部，会直接打断请求链路（表现是数据拉不回来）。
 *
 * 这里提供安全兜底：把状态通过事件抛出去，由 WinUI 外壳决定怎么呈现。
 * 若页面确实加载了 nav.js，则让位给 nav.js 自己的实现。
 */
(function () {
  if (typeof window.showNavLoading === 'function') return

  var state = { active: false, text: '', done: 0, total: 0 }

  function emit() {
    window.dispatchEvent(new CustomEvent('yali:nav-loading', { detail: state }))
  }

  window.showNavLoading = function (text) {
    state.active = true
    state.text = text || '加载中...'
    state.done = 0
    state.total = 0
    emit()
  }

  window.showNavLoadingProgress = function (done, total) {
    state.active = true
    state.done = done
    state.total = total
    emit()
  }

  window.hideNavLoading = function () {
    state.active = false
    state.text = ''
    state.done = 0
    state.total = 0
    emit()
  }
})()
