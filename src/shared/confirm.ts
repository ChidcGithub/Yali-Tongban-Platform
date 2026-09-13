/**
 * 站点统一对话框（命令式）：确认框 / 输入框 / 提示框
 *
 * 为什么要有它：迁移前全站的弹窗是两套东西 ——
 *   ① `window.confirm()` / `window.prompt()` / `window.alert()`
 *      （浏览器原生弹窗，样式完全不受站点控制，在 WinUI 界面里非常突兀）
 *   ② 遗留 `openModal()` 拼的旧设计系统弹窗（.modal + .btn）
 * 现在统一换成站点自己的对话框，外观就是 ContentDialog
 * —— 与「提交问题」「发起投票」等表单对话框同一套样式。
 *
 * 用法：
 *   if (!(await confirmDialog({ message: '确定删除吗？', danger: true }))) return
 *   const name = await promptDialog({ message: '新姓名', defaultValue: u.name,
 *                                     validate: (v) => (v.trim().length < 2 ? '至少 2 字' : null) })
 *   if (name === null) return
 *   await alertDialog({ message: '密码已重置为初始密码' })
 *
 * 宿主组件是 `src/components/ConfirmDialog.vue`，由 bootstrap 挂到 body，
 * 全局只需一份，任何页面（含 404/410 这种没有 YaliShell 的）都能用。
 */
import { reactive } from 'vue'

export interface ConfirmOptions {
  /** 对话框标题，默认「确认操作」 */
  title?: string
  /** 正文（纯文本，`\n` 会保留换行） */
  message: string
  /** 主按钮文案，默认「确定」（提示框为「知道了」） */
  confirmText?: string
  /** 次按钮文案，默认「取消」 */
  cancelText?: string
  /**
   * 危险操作（删除 / 清空）：主按钮显示为警示色，
   * 且默认焦点落在「取消」上，避免顺手回车把东西删了。
   */
  danger?: boolean
  /**
   * 主按钮先倒计时 N 秒才可点。
   * 对应旧版 admin.js 的 `showConfirmWithCountdown`（删除用户、清空数据用它）。
   */
  countdown?: number
  /**
   * 只提示、不给取消（替代 window.alert）：只渲染一个主按钮，
   * 点击后 resolve(true)。
   */
  alertOnly?: boolean
}

export interface PromptOptions {
  title?: string
  /** 输入框上方的说明文字 */
  message: string
  defaultValue?: string
  placeholder?: string
  maxLength?: number
  confirmText?: string
  /**
   * 实时校验：返回错误文案则主按钮**保持禁用**并显示该文案。
   * 放在这里而不是调用方，是为了让「不合法就别想点确定」这件事
   * 由对话框自己保证（原先 window.prompt 只能等用户点了确定再 toast 报错）。
   */
  validate?: (value: string) => string | null
}

interface DialogState extends ConfirmOptions, PromptOptions {
  open: boolean
  /** 'confirm' 确认框 / 'prompt' 输入框 */
  mode: 'confirm' | 'prompt'
  /** prompt 模式下输入框的当前值 */
  input: string
  resolve: ((value: unknown) => void) | null
}

export const dialogState = reactive<DialogState>({
  open: false,
  mode: 'confirm',
  message: '',
  input: '',
  resolve: null
})

/** 上一个还没答复就又被调用时，先把它结掉（否则那个 Promise 永远挂着） */
function begin<T>(mode: 'confirm' | 'prompt', options: object, extra: object, fallback: T): Promise<T> {
  dialogState.resolve?.(fallback)
  return new Promise<T>((resolve) => {
    Object.assign(dialogState, options, extra, {
      mode,
      open: true,
      resolve: resolve as (value: unknown) => void
    })
  })
}

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  return begin<boolean>('confirm', { title: '', confirmText: '', cancelText: '', danger: false, countdown: 0, alertOnly: false }, opts, false)
}

/** 输入框。取消返回 null，确定返回输入值（已 trim） */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  const extra = { input: options.defaultValue ?? '' }
  return begin<string | null>('prompt', { title: '', confirmText: '', cancelText: '', danger: false, countdown: 0, alertOnly: false, placeholder: '', maxLength: 200, validate: undefined }, { ...options, ...extra }, null)
}

/** 只有「知道了」的提示框（替代 window.alert） */
export function alertDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  return begin<boolean>('confirm', { title: '', confirmText: '', cancelText: '', danger: false, countdown: 0 }, { ...opts, alertOnly: true }, false)
}

/** 由宿主组件调用，结束当前对话框 */
export function settleDialog(result: boolean | string | null) {
  const resolve = dialogState.resolve
  dialogState.open = false
  dialogState.resolve = null
  resolve?.(result)
}
