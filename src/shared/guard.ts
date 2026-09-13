/**
 * 页面级权限守卫 —— 对齐旧版 `public/js/auth.js`
 *
 * ⚠️ 这里的「无权就跳 404」不是随手写的错误处理，而是站点**有意为之**的行为：
 * 404 页会播「伪装入侵」彩蛋，对无权访问者不暴露「这里其实有东西」。
 * 迁移到 Vue 时这一层整个丢了 —— 页面改成「非管理员就跳回服务页」，
 * 于是未登录用户能直接看到管理页的骨架（标题、标签、甚至部分空数据），
 * 这是权限边界上的实质退化，不只是少了个彩蛋。
 *
 * 旧版对照表：
 *   checkAuth()     → 拉 /api/auth/me，失败清掉本地用户（不跳转）
 *   requireAuth()   → 未登录          → 404
 *   requireMember() → 非 member 类角色 → 404
 *   requireAdmin()  → 非 admin/owner/teacher → 404
 * 页面归属：
 *   admin / duty-admin → requireAdmin
 *   finance            → requireMember
 *   settings           → requireAuth
 */
import { apiGet } from './api'
import { ensureClassFilled } from './classprompt'

export interface SessionUser {
  id?: number
  name: string
  role: string
  class_name?: string
  department?: string
}

/** 与旧版 `_pageName()` 一致：404 页的 `?from=` 用它展示「你访问的 X 已被删除」 */
const PAGE_TITLES: Record<string, string> = {
  '/admin': '管理面板',
  '/settings': '个人设置',
  '/finance': '财务管理',
  '/announcements': '公告管理',
  '/announcement': '公告详情'
}

export function pageTitle(): string {
  const p = window.location.pathname.replace(/\.html$/, '')
  return PAGE_TITLES[p] ?? ''
}

/**
 * 送去 404（带 `?from=`，404 页会据此改写文案并播入侵彩蛋）。
 * 用 replace 而不是 href：不留历史记录，用户按返回不会又回到这里。
 */
export function go404(): void {
  const name = pageTitle()
  window.location.replace('/404.html' + (name ? '?from=' + encodeURIComponent(name) : ''))
}

/**
 * 校验会话（与旧版 `checkAuth()` 等价）：
 * 以 cookie 为准重新拉一次当前用户，成功则刷新 localStorage，
 * 失败则清掉本地残留 —— 否则 cookie 过期后本地 user 还在，
 * 页面会按过期的角色渲染出管理入口。
 */
export async function checkAuth(): Promise<SessionUser | null> {
  try {
    const user = await apiGet<SessionUser>('/api/auth/me')
    localStorage.setItem('user', JSON.stringify(user))
    /* 旧版同一位置还有 `if (!user.class_name) requireClass(user)` ——
       未填班级的登录用户会被强制补填（关不掉的表单）。班级是部门/值日/财务的
       分组依据，缺了它这些列表会把用户算进「未分组」，而用户自己并不知道要补。 */
    if (!user.class_name) await ensureClassFilled()
    return user
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

/** 未登录 → 404。返回 null 时调用方必须立即停止后续加载 */
export async function requireAuth(): Promise<SessionUser | null> {
  const user = await checkAuth()
  if (!user) {
    go404()
    return null
  }
  return user
}

/** 非管理员（admin / owner / teacher）→ 404 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await requireAuth()
  if (!user) return null
  if (!['admin', 'owner', 'teacher'].includes(user.role)) {
    go404()
    return null
  }
  return user
}

/** 非成员（member / admin / owner / teacher）→ 404 */
export async function requireMember(): Promise<SessionUser | null> {
  const user = await requireAuth()
  if (!user) return null
  if (!['member', 'admin', 'owner', 'teacher'].includes(user.role)) {
    go404()
    return null
  }
  return user
}
