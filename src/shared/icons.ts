/**
 * 图标字形映射
 *
 * 全部取自随包字体 SEGOEICONS.TTF。该字体已按「实际用到的码位」做过子集化
 * （见 scripts/subset-icons.mjs），因此**新增字形必须重新生成子集**：
 *   node scripts/subset-icons.mjs
 * 构建前会自动跑 scripts/check-glyphs.mjs 拦住漏收的字形，不会静默出现豆腐块。
 *
 * 语义参考了原站点 nav.js 的图标名（clipboard / zap / megaphone / wallet /
 * shield / message-square …）—— 但随包字体并不包含全部对应字形，
 * 缺字形的按下表注释里的说明取了最接近的替代。
 * 表里只保留真正被引用的条目；看效果后可直接改常量，不影响其他代码。
 */

export const GLYPH = {
  /* 主导航（对应原 nav.js 的 tabPages） */
  services: '\uE77F', // 剪贴板 —— 服务（原为 clipboard）
  moment: '\uE8F2', // 对话气泡 —— 动态（原为 zap，字体无闪电字形）
  announcements: '\uE767', // 喇叭 —— 公告（原为 megaphone）
  polls: '\uE8FB', // 对勾 —— 投票（原为 check-circle，字体无圆环对勾）
  finance: '\uE825', // 银行柱式建筑 —— 财务（原为 wallet，无钱包字形）
  activities: '\uE787', // 日历 —— 活动（原为 calendar）
  duty: '\uE916', // 秒表 —— 值日（原为 clock）
  admin: '\uE72E', // 锁 —— 管理（原为 shield，字体无盾牌字形）
  feedback: '\uE8BD', // 对话气泡 —— 反馈（原为 message-square）

  /* 侧栏底部与账户 */
  messages: '\uEA8F', // 铃铛 —— 消息
  settings: '\uE713', // 齿轮 —— 个性化
  user: '\uE77B', // 人像 —— 账户
  logout: '\uE711', // 叉 —— 登出
  about: '\uE946', // 信息圈 —— 关于

  /* 通用动作 */
  add: '\uE710',
  delete: '\uE74D',
  refresh: '\uE72C',
  back: '\uE72B', // 左箭头 —— 返回
  forward: '\uE72A', // 右箭头 —— 前进
  close: '\uE711',
  check: '\uE8FB',
  download: '\uE896',

  /* 对象与分类 */
  calendar: '\uE787',
  clock: '\uE916',
  star: '\uE734',
  starFilled: '\uE735',
  package: '\uE7B8', // 盒子 —— 依赖包（关于页 / 致谢页）
  photo: '\uE91B', // 相框 —— 配图（投票题目图片上传）
  person: '\uE77B',
  people: '\uE716',
  lock: '\uE72E',
  bell: '\uEA8F'
} as const

export type GlyphName = keyof typeof GLYPH
