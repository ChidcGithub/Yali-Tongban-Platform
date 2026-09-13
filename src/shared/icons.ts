/**
 * 图标字形映射
 *
 * 全部取自随包分发的 SEGOEICONS.TTF，并已用 cmap 校验过码位真实存在
 * （该字体是子集，仅 1993 个码位，上游自身用到的 70 个字形里有 20 个不在其中）。
 * 因此这里只使用「已确认覆盖」的码位，保证 Android / iOS 上也不会出现豆腐块。
 *
 * 新增字形前，先用 .check-winui/cmapcheck.js 校验覆盖：
 *   node .check-winui/cmapcheck.js E7B8,E8B7
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
  edit: '\uE70F',
  save: '\uE74E',
  delete: '\uE74D',
  refresh: '\uE72C',
  back: '\uE76C',
  forward: '\uE71C',
  menu: '\uE700',
  more: '\uE712',
  copy: '\uE8C8',
  download: '\uE896',
  upload: '\uE898',
  filter: '\uE71C',
  sort: '\uE8EF',
  close: '\uE711',
  check: '\uE8FB',

  /* 对象与分类 */
  package: '\uE7B8', // 包 —— 依赖 / 库
  folder: '\uE8B7',
  library: '\uE8F1',
  document: '\uE8A5',
  image: '\uE8B9',
  calendar: '\uE8BF',
  clock: '\uE916',
  star: '\uE734',
  starFilled: '\uE735',
  flag: '\uE7C1',
  chart: '\uE8EC', // 注意：字体子集里没有真正的图表字形（E9D2/E9D9 均缺），暂用此码位
  table: '\uE80A',
  list: '\uE8FD',
  person: '\uE77B',
  people: '\uE716',
  lock: '\uE72E',
  bell: '\uEA8F'
} as const

export type GlyphName = keyof typeof GLYPH
