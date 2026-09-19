/**
 * 站点导航模型
 *
 * 与 public/js/nav.js 的 renderCapsuleBar() 保持一致：
 * 同样的条目、同样的角色可见性规则，只是渲染交给 WinUI 的 NavigationView。
 * 原 nav.js 里的「按使用频率排序」在侧栏模式下不再需要 —— NavigationView
 * 是固定顺序的侧栏，不像底部胶囊栏要按频率重排。
 */
import { GLYPH } from './icons'

export interface NavItem {
  id: string
  label: string
  icon: string
  href: string
  /** 最低角色要求 */
  roleMin?: 'public' | 'member'
  adminOnly?: boolean
}

export interface NavEntry extends NavItem {
  Content: string
  Icon: string
  Tag: string
}

/** 全部导航条目（顺序即侧栏顺序） */
export const NAV_ITEMS: NavItem[] = [
  { id: 'services', label: '服务', icon: GLYPH.services, href: 'services.html' },
  { id: 'moment', label: '动态', icon: GLYPH.moment, href: 'moment.html' },
  { id: 'announcements', label: '公告', icon: GLYPH.announcements, href: 'announcements.html' },
  { id: 'polls', label: '投票', icon: GLYPH.polls, href: 'polls.html' },
  { id: 'finance', label: '财务', icon: GLYPH.finance, href: 'finance.html', roleMin: 'member' },
  { id: 'activities', label: '活动', icon: GLYPH.activities, href: 'activities.html' },
  { id: 'duty', label: '值日', icon: GLYPH.duty, href: 'duty.html', roleMin: 'public' },
  { id: 'admin', label: '管理', icon: GLYPH.admin, href: 'admin.html', adminOnly: true },
  { id: 'feedback', label: '反馈', icon: GLYPH.feedback, href: 'feedback.html' },
  { id: 'ai', label: 'AI 助手', icon: GLYPH.ai, href: 'ai.html', roleMin: 'member' },
]

const ROLE_WEIGHT: Record<string, number> = {
  public: 1,
  member: 2,
  teacher: 3,
  admin: 3,
  owner: 4
}

/** 账户信息（沿用站点既有逻辑，读取全局 window.getUser） */
export function currentUser(): { name?: string; role?: string } | null {
  try {
    const fn = (window as unknown as { getUser?: () => unknown }).getUser
    return fn ? (fn() as { name?: string; role?: string } | null) : null
  } catch {
    return null
  }
}

export function isAdminUser(): boolean {
  try {
    const user = currentUser()
    const fn = (window as unknown as { isAdmin?: (u: unknown) => boolean }).isAdmin
    return fn ? fn(user) : false
  } catch {
    return false
  }
}

/** 按角色过滤可见条目 —— 与 nav.js 的规则逐条对齐 */
export function visibleNavItems(): NavItem[] {
  const user = currentUser()
  const admin = isAdminUser()
  const role = user?.role
  const isMember = role === 'member' || role === 'public' || admin

  return NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !admin) return false
    if (item.roleMin) {
      if (item.roleMin === 'public' && !role) return false
      if (
        item.roleMin !== 'public' &&
        (!isMember || (ROLE_WEIGHT[role ?? ''] ?? 0) < (ROLE_WEIGHT[item.roleMin] ?? 99))
      ) {
        return false
      }
    }
    return true
  })
}

/** 转换为 NavigationView 的 MenuItems 结构 */
export function toMenuItems(items: NavItem[]): NavEntry[] {
  return items.map((item) => ({
    ...item,
    Content: item.label,
    Icon: item.icon,
    Tag: item.id
  }))
}

/** 跳到站点的另一个页面（本项目是多页应用，不是前端路由） */
export function navigateTo(href: string): void {
  window.location.href = href
}
