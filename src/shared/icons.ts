/**
 * 图标字形映射
 *
 * 全部取自随包分发的 SEGOEICONS.TTF，并已用 cmap 校验过码位真实存在
 * （该字体是子集，仅 1993 个码位，上游自身用到的 70 个字形里有 20 个不在其中）。
 * 因此这里只使用「已确认覆盖」的码位，保证 Android / iOS 上也不会出现豆腐块。
 *
 * ⚠️ 语义是首版判断，看效果后可直接改这里的常量，不影响其他代码。
 */

export const GLYPH = {
  /* 主导航 */
  services: '\uE90F', // 扳手 —— 报修服务
  moment: '\uE8F2', // 对话框 —— 动态
  announcements: '\uE8A5', // 文档 —— 公告
  polls: '\uE8FB', // 对勾 —— 投票
  finance: '\uE825', // 钱袋 —— 财务
  activities: '\uE8BF', // 日历 —— 活动
  duty: '\uE916', // 计时 —— 值日
  admin: '\uE72E', // 锁 —— 管理
  feedback: '\uE8BD', // 留言 —— 反馈

  /* 顶栏与账户 */
  messages: '\uEA8F', // 铃铛 —— 消息
  settings: '\uE713', // 齿轮 —— 个性化
  user: '\uE77B', // 人像 —— 账户
  logout: '\uE711', // 叉 —— 登出
  about: '\uE946', // 信息 —— 关于

  /* 通用动作 */
  search: '\uE721',
  add: '\uE710',
  refresh: '\uE72C',
  delete: '\uE74D',
  back: '\uE76C',
  menu: '\uE700', // 汉堡 —— 折叠侧栏
  home: '\uE80F'
} as const

export type GlyphName = keyof typeof GLYPH
