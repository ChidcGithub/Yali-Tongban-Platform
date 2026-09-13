/**
 * 标签栏（SelectorBar）横向滚动提示
 *
 * 上游 SelectorBar 的根元素宽度由内容撑开，窄屏下会溢出父级 ——
 * 见 winui-page.css 里「标签栏在窄屏必须能横向滚动」那段注释。
 * 样式修好之后，还需要告诉用户「右边还有内容」：
 *   - 还能往右滑  → 右侧渐隐（is-scroll-end 未置位）
 *   - 已经到头    → 去掉渐隐
 *   - 压根没溢出  → 去掉渐隐
 *
 * 这里用一个很轻的实现：观察内容区尺寸变化，给其中每个标签栏的
 * 滚动容器接一次 scroll 回调（WeakSet 去重，Vue 重建 DOM 后自动重新接管）。
 *
 * 之所以不做成 Vue 指令，是因为标签栏由各页面自己渲染（admin / activities /
 * duty-admin …），在 YaliShell 里统一挂一次比逐页改造更不容易漏。
 */

const attached = new WeakSet<HTMLElement>()

function update(scroller: HTMLElement) {
  const bar = scroller.closest('.win-selector-bar') as HTMLElement | null
  if (!bar) return
  const scrollable = scroller.scrollWidth - scroller.clientWidth > 2
  const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2
  bar.classList.toggle('is-not-scrollable', !scrollable)
  bar.classList.toggle('is-scroll-end', atEnd)
}

function attach(scroller: HTMLElement) {
  if (attached.has(scroller)) return
  attached.add(scroller)
  scroller.addEventListener('scroll', () => update(scroller), { passive: true })
  update(scroller)
}

/** 给 root 内所有标签栏接上滚动提示；内容变化时自动重新扫描 */
export function attachTabScrollHints(root: HTMLElement): () => void {
  const scan = () => {
    root.querySelectorAll<HTMLElement>('.win-selector-bar-items-view').forEach(attach)
  }
  scan()

  const ro = new ResizeObserver(() => scan())
  ro.observe(root)

  // 切标签会重建内容（v-if 分支），尺寸不一定变 —— 用 MutationObserver 兜底
  const mo = new MutationObserver(() => scan())
  mo.observe(root, { childList: true, subtree: true })

  return () => {
    ro.disconnect()
    mo.disconnect()
  }
}
