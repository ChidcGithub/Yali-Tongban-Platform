/**
 * 站点既有能力的类型化封装
 *
 * 网络层、鉴权、缓存、提示这些都在 public/js/*.js 里已经实现好了
 * （api.js / utils.js / auth.js），WinUI 页面直接复用，不重复实现。
 * 这里只做一层薄封装，把 window 上的全局函数变成带类型的模块接口。
 */

interface LegacyWindow {
  apiGet?: (url: string) => Promise<unknown>
  apiPost?: (url: string, body?: unknown) => Promise<unknown>
  apiPut?: (url: string, body?: unknown) => Promise<unknown>
  apiDel?: (url: string) => Promise<unknown>
  toast?: (msg: string, type?: string) => void
  getUser?: () => { name?: string; role?: string } | null
  isAdmin?: (user: unknown) => boolean
  cacheGet?: (key: string) => { data?: unknown } | null
  fetchWithCache?: (
    key: string,
    fetcher: () => Promise<unknown>,
    onData: (data: unknown) => void,
    version?: number
  ) => Promise<unknown>
  formatTime?: (value: unknown) => string
  escapeHtml?: (value: unknown) => string
  attrEscape?: (value: unknown) => string
  dataUrlToBlobUrl?: (value: string) => string
  openModal?: (config: Record<string, unknown>) => void
  closeModal?: (el: Element | null) => void
  openLightbox?: (src: string) => void
  confirmAction?: (message: string, cb: (ok: boolean) => void) => void
  logout?: () => void
  checkCountAchievements?: () => void
  checkNovice?: () => void
  CaptchaWidget?: new (containerId: string) => {
    getData: () => Record<string, string>
    refresh: () => void
  }
}

const w = window as unknown as LegacyWindow

function need<T>(fn: T | undefined, name: string): T {
  if (!fn) throw new Error(`[winui] 站点脚本未加载：${name}`)
  return fn
}

export const apiGet = <T = unknown>(url: string): Promise<T> =>
  need(w.apiGet, 'apiGet')(url) as Promise<T>

export const apiPost = <T = unknown>(url: string, body?: unknown): Promise<T> =>
  need(w.apiPost, 'apiPost')(url, body) as Promise<T>

export const apiPut = <T = unknown>(url: string, body?: unknown): Promise<T> =>
  need(w.apiPut, 'apiPut')(url, body) as Promise<T>

export const apiDel = <T = unknown>(url: string): Promise<T> =>
  need(w.apiDel, 'apiDel')(url) as Promise<T>

/** 统一提示（沿用站点既有的 toast，属「缺失控件」，按约定保留原实现） */
export const toast = (msg: string, type: 'success' | 'error' = 'success'): void => {
  w.toast?.(msg, type)
}

export const getUser = () => w.getUser?.() ?? null
export const isAdmin = () => !!w.isAdmin?.(getUser())

export const formatTime = (v: unknown): string => w.formatTime?.(v) ?? ''
export const openLightbox = (src: string): void => w.openLightbox?.(src)
export const confirmAction = (msg: string, cb: (ok: boolean) => void): void =>
  w.confirmAction?.(msg, cb)

/** 图片：站点把 base64 存 D1，这里转成 blob URL 供灯箱使用 */
export const toBlobUrl = (dataUrl: string): string =>
  w.dataUrlToBlobUrl?.(dataUrl) ?? dataUrl

export type CaptchaInstance = {
  getData: () => Record<string, string>
  refresh: () => void
}

/**
 * 挂载站点自研验证码组件（`public/js/captcha.js` 的 `CaptchaWidget`）。
 *
 * ⚠️ 为什么必须走这个函数而不是直接 `new Ctor(id)`：
 * `CaptchaWidget` 的构造函数在**拿不到容器时静默 return**（不 render、不 load），
 * 于是 `getData()` 永远返回空 token，提交必然被后端判「人机验证失败」——
 * 而且不报任何错。实测踩过两次：注册表单用 `v-if` 隐藏（容器不在 DOM 里），
 * 以及投票页在 `loading` 分支还开着的时候就去实例化。
 *
 * 这里把「容器不存在 / 没渲染出来」变成显式 `console.warn`，
 * 回归脚本会把生产构建里出现的任何 warn 判为失败 —— 让它不可能再静默。
 */
export function mountCaptcha(containerId: string): CaptchaInstance | null {
  const Ctor = w.CaptchaWidget
  if (!Ctor) {
    // 页面没加载 /js/captcha.js —— 同样要可见，别静默
    console.warn(`[winui] CAPTCHA_WIDGET_NOT_MOUNTED：页面未加载 captcha.js（#${containerId}）`)
    return null
  }

  const container = document.getElementById(containerId)
  if (!container) {
    console.warn(
      `[winui] CAPTCHA_WIDGET_NOT_MOUNTED：容器 #${containerId} 不在 DOM 里 ` +
        `（多半被 v-if 挡在条件分支后，或实例化早于渲染完成）`
    )
    return null
  }

  const instance = new Ctor(containerId) as CaptchaInstance
  if (!container.querySelector('.captcha-wrap')) {
    console.warn(
      `[winui] CAPTCHA_WIDGET_NOT_MOUNTED：容器 #${containerId} 存在但未被渲染`
    )
    return null
  }
  return instance
}

export const legacy = {
  get openModal() {
    return w.openModal
  },
  get closeModal() {
    return w.closeModal
  },
  /** utils.js 里的全局关闭函数，模态框自定义 footer 按钮会用到 */
  get closeActiveModal() {
    return (w as unknown as { closeActiveModal?: () => void }).closeActiveModal
  },
  get CaptchaWidget() {
    return w.CaptchaWidget
  },
  get checkCountAchievements() {
    return w.checkCountAchievements
  },
  get checkNovice() {
    return w.checkNovice
  },
  get fetchWithCache() {
    return w.fetchWithCache
  },
  get cacheGet() {
    return w.cacheGet
  }
}
