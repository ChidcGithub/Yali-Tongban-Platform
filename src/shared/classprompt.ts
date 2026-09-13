/**
 * 未填班级的登录用户 → 强制补填（对齐旧版 `auth.js` 的 `requireClass`）
 *
 * 旧版 `checkAuth()` 里有这么一句：
 *   if (!user.class_name) requireClass(user);
 * 于是 activities / announcements / announcement / finance / settings / admin /
 * duty-admin 这 7 个页面在进入时，只要用户还没填班级，就会弹出一个**关不掉**的
 * 表单要求补填（班级 + 密码确认）。迁移时整块丢了。
 *
 * 为什么它重要：班级是部门/值日/财务这些功能的分组依据，缺班级的用户
 * 在很多列表里会落到「未分组」状态，而用户自己完全不知道要补。
 *
 * 行为对照：
 *   - 无「取消」按钮（旧版 overlay 也是关不掉的）
 *   - 校验规则与后端 `_utils.js` 的 `isValidClass` 完全一致
 *   - 提交走 `POST /api/auth/change-class`，成功后刷新本地用户
 *   - 额外给了「退出登录」出口：旧版只能靠清浏览器数据脱身，
 *     而 modal 会盖住侧栏的登出入口（这点是刻意改进，不是偏离）
 */
import { reactive } from 'vue'

interface ClassPromptState {
  open: boolean
  resolve: ((filled: boolean) => void) | null
}

export const classPromptState = reactive<ClassPromptState>({
  open: false,
  resolve: null
})

/**
 * 班级编号规则（与后端 `functions/api/_utils.js` 的 isValidClass 逐字对齐）：
 * 4 位数字，且落在 2501-2527 / 2401-2429 / 2301-2329 三段里。
 */
export function isValidClass(cls: string): boolean {
  const s = String(cls ?? '').trim()
  if (!/^\d{4}$/.test(s)) return false
  const n = Number(s)
  return (n >= 2501 && n <= 2527) || (n >= 2401 && n <= 2429) || (n >= 2301 && n <= 2329)
}

/** 班级不合法的原因（给用户看的文案，与后端提示保持一致） */
export function classError(cls: string): string | null {
  return isValidClass(cls) ? null : '班级格式无效，请输入4位班级编号（如2501）'
}

/**
 * 若当前用户没填班级，弹窗等待补填。
 * 已经填过 / 未登录 → 直接 resolve(true)，不打扰。
 */
export function ensureClassFilled(): Promise<boolean> {
  const raw = localStorage.getItem('user')
  if (!raw) return Promise.resolve(true)

  let user: { class_name?: string } | null = null
  try {
    user = JSON.parse(raw)
  } catch {
    return Promise.resolve(true)
  }
  if (!user || user.class_name) return Promise.resolve(true)

  /* 已经在弹了（同一页面里多个入口同时走到这里）：复用同一个等待 */
  if (classPromptState.open && classPromptState.resolve) {
    return new Promise<boolean>((resolve) => {
      const prev = classPromptState.resolve!
      classPromptState.resolve = (filled) => {
        prev(filled)
        resolve(filled)
      }
    })
  }

  return new Promise<boolean>((resolve) => {
    classPromptState.open = true
    classPromptState.resolve = resolve
  })
}

/** 由宿主组件调用 */
export function settleClassPrompt(filled: boolean) {
  const resolve = classPromptState.resolve
  classPromptState.open = false
  classPromptState.resolve = null
  resolve?.(filled)
}
