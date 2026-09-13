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

export const legacy = {
  get openModal() {
    return w.openModal
  },
  get closeModal() {
    return w.closeModal
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
