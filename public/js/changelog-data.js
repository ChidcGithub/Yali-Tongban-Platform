var CHANGELOG_ENTRIES = [
  {
    date: '2026-08-26',
    version: 'v2.6.3.1',
    items: [
      { type: 'change', text: '移除 Newspaper 报纸主题：下线主题切换入口与 feature 开关，全站仅保留 Material 3 设计系统（原主题代码已备份至 _backups/2026-08-27-newspaper-theme）' },
      { type: 'change', text: 'Newspaper 主题重构：清理与实际页面结构脱节的样式，主题体积精简约三成' },
      { type: 'fix', text: 'Folio 条改由导航脚本注入真实元素，两端对齐不再依赖空格字符拼凑，窄屏不再错位' },
      { type: 'fix', text: '修复报修列表、动态流、投票列表、活动列表、更新日志等页面的专属版式从未生效的问题（选择器与渲染结构不匹配）' },
      { type: 'fix', text: '修复报厅时间线/日历/审核面板在报纸风下无样式的问题，状态标签改为消色差矩形' },
      { type: 'fix', text: '修复 404/410 页报纸风"勘误"版式从未生效的问题（原选择器指向不存在的元素）' },
      { type: 'ui', text: '公告详情文章内页仅依赖显式类名渲染，不再按子元素顺序猜测结构' },
      { type: 'ui', text: '页签、评论区、折叠分组等全站共用组件的重复定义合并为单一来源' },
      { type: 'ui', text: '关于页版本徽章与作者署名改用真实类名挂钩，替代内联样式探测' },
    ]
  },
  {
    date: '2026-07-16',
    version: 'v2.6.3.0',
    items: [
      { type: 'change', text: 'Newspaper 主题排版大改：从杂志风转为真正现代报纸版式，强化头版网格与文章内页的印刷 DNA' },
      { type: 'feature', text: 'Folio 条系统：每页顶部自动生成"版面栏目名 + 页码"（SECTION A·服务 P.A1 等 20 个页面）' },
      { type: 'feature', text: '头版网格三级结构：头条跨满全宽 + 次条双栏 + 简讯密集列表，简讯自动编号 04/05/06...' },
      { type: 'feature', text: '文章内页报纸化：860px 阅读版心 + 修复首字下沉 + 双栏栏间竖线 + byline 跨栏 + ■ END 转版标记' },
      { type: 'feature', text: 'Masthead nameplate：反向双线报头（上 1px 细 + 下 3px 粗）' },
      { type: 'feature', text: '导航底部 folio 微条：VOL. CCCXLII · NO. 2026 · 通办日报 · EST. 2026 · BEIJING' },
      { type: 'feature', text: '卡片系统分层：np-card-lead（头条大留白）/ np-card-brief（简讯紧凑）/ np-card-classified（分类广告 dense）' },
      { type: 'feature', text: '14 个页面专属版式：服务分类广告 / 财务账本 / 值日 scoreboard / 投票矩形条 / 登录订阅登记 / 更正启事 / 404 勘误 等' },
      { type: 'feature', text: '报纸工具类：np-briefs 三栏简讯 / np-classifieds 分类广告 / np-scoreboard mono 表 / np-corrections 更正栏' },
      { type: 'feature', text: '订阅登记式横排表单 np-form-inline + folio 条专用按钮 btn-folio' },
      { type: 'fix', text: '修复公告详情首字下沉失效：原选择器 .article-body > p:first-of-type 从未匹配实际渲染结构' },
      { type: 'fix', text: '修复双栏分栏时 byline 和图片被切割到第二栏：column-span: all 跨栏不分割' },
      { type: 'fix', text: '修复栏目标签从未显示：原用 attr(data-kicker) 但 HTML 未设置属性，改为基于 data-page 生成' },
      { type: 'fix', text: '修复投票成功覆盖层在深色模式下显示白色背景' },
      { type: 'ui', text: '深色模式适配：反转油墨令牌体系，所有版式元素自动适配深色模式' },
      { type: 'ui', text: '响应式回归：768px/480px 双断点，头版网格移动端单列、双栏移动端取消、drop cap 缩小' },
    ]
  },
  {
    date: '2026-07-16',
    version: 'v2.6.2.0',
    items: [
      { type: 'security', text: '修复人机验证可被客户端参数绕过的安全漏洞' },
      { type: 'security', text: '值日签到/签退接口添加身份校验，防止替他人操作' },
      { type: 'security', text: '成就系统限制可手动解锁的范围，计数型成就必须真实达成' },
      { type: 'security', text: '服务器错误信息不再返回技术细节，避免泄露内部实现' },
      { type: 'fix', text: '修复登录后本地用户数据未正确刷新的问题' },
      { type: 'fix', text: '修复消息页在站点关闭时未显示遮罩的问题' },
      { type: 'fix', text: '修复相册灯箱图片索引匹配失败的问题' },
      { type: 'fix', text: '修复值日签到时间格式解析的时区兼容性问题' },
      { type: 'fix', text: '修复多处空状态和元数据渲染的 XSS 漏洞' },
      { type: 'feature', text: '人机验证从 Cloudflare Turnstile 替换为自研图形验证码' },
      { type: 'feature', text: '自研验证码采用 SVG 生成 + HMAC 签名，无外部依赖，国内访问零延迟' },
      { type: 'feature', text: '验证码组件适配双主题：Material 圆角填充式 + Newspaper 直角底边框式' },
      { type: 'change', text: '值日签到改为无需登录，但未到签到时间无法签到' },
      { type: 'ui', text: '验证码图片初始显示加载占位，避免裂开图标闪烁' },
    ]
  },
  {
    date: '2026-07-15',
    version: 'v2.6.1.12',
    items: [
      { type: 'change', text: 'Newspaper 主题硬朗风格重写：从暖纸杂志风转为工程化印刷品风格，融合 IBM Carbon 与 Resend 设计语言' },
      { type: 'change', text: '纯消色差调色板：去除所有强调色，仅保留黑白灰阶，更接近真实报纸印刷质感' },
      { type: 'change', text: 'IBM Plex 字族三件套：serif 标题 + sans 正文 + mono 标签严格分工' },
      { type: 'change', text: '全矩形设计：按钮、卡片、输入框、图片全部采用直角，强化工程感' },
      { type: 'change', text: '报纸版式 DNA：双线分隔、栏间竖线、首字下沉、栏目标签等印刷元素' },
      { type: 'change', text: '底边框输入框：IBM Carbon 签名样式，激活时下边框变全墨' },
      { type: 'ui', text: '栏目标签紧凑化：航空标牌感，更硬朗的版式节奏' },
      { type: 'ui', text: '财务页数字等宽对齐：表格数据列对齐更整齐' },
      { type: 'ui', text: '标题数字旧体形态：serif 标题中的数字采用旧体字形，更具杂志感' },
    ]
  },
  {
    date: '2026-07-14',
    version: 'v2.6.0.0-beta',
    items: [
      { type: 'change', text: 'Newspaper 主题纳入功能开关系统：作为早期测试功能，需邀请后才能在个性化中切换' },
      { type: 'new', text: '个性化页面 Newspaper 按钮锁定态：未启用时按钮半透明不可点击' },
      { type: 'fix', text: '修复邀请文案硬编码功能名称的问题' },
    ]
  },
  {
    date: '2026-07-14',
    version: 'v2.5.26',
    items: [
      { type: 'new', text: 'Newspaper 报纸主题：哥特体 + 衬线字体，纯黑白灰配色，非对称大标题布局，可在个性化设置中切换' },
      { type: 'new', text: '主题 CSS 分层架构：支持多主题叠加切换' },
      { type: 'new', text: '值日管理手动扣分：可直接新增扣分记录并自动通知值日生' },
      { type: 'new', text: '值日管理批量销分：扣分记录支持复选框与批量操作' },
      { type: 'new', text: '扣分记录增强：部门/状态/姓名筛选、有效条数与扣分合计统计' },
      { type: 'fix', text: '修复排班管理日历样式缺失' },
      { type: 'change', text: '扣分记录 14 天自动清理' },
      { type: 'change', text: '按钮样式统一：多项冲突修复，Tab 按钮与主题按钮规范化' },
    ]
  },
  {
    date: '2026-07-14',
    version: 'v2.5.25',
    items: [
      { type: 'new', text: '功能开关系统：测试性功能可邀请用户参与体验（接受/稍后/永不提醒）' },
      { type: 'new', text: '消息提醒功能：导航栏显示铃铛图标，未读消息红点提醒' },
      { type: 'new', text: '独立消息页面：支持 8 类消息筛选（系统/公告/审核/报修/财务/评论/活动/值日）' },
      { type: 'new', text: '消息支持标记已读、全部已读、长按删除、清空已读、分页加载' },
      { type: 'new', text: '8 类消息自动生成：注册通过/角色变更、新公告、审核结果、报修状态、财务完成/报销、评论回复、新活动、值日分数修改' },
      { type: 'change', text: '新增铃铛/收件箱/用户核对三个图标' },
    ]
  },
  {
    date: '2026-07-14',
    version: 'v2.5.24.2',
    items: [
      { type: 'fix', text: '修复表单点击输入框触发提前提交：影响问题反馈/公告发布/活动上传/财务记账/投票创建 5 个表单' },
      { type: 'fix', text: '修复投票表单无法选择选项' },
      { type: 'fix', text: '修复评论发表按钮失效' },
      { type: 'fix', text: '修复编辑公告崩溃' },
      { type: 'fix', text: '修复评论操作重复触发' },
      { type: 'fix', text: '修复 cookie 同意横幅不显示' },
      { type: 'fix', text: '修复灯箱图片冲突' },
      { type: 'fix', text: '修复静态资源缓存导致部署后浏览器仍用旧版本' },
      { type: 'change', text: '统一模态框系统：确认弹窗支持倒计时按钮' },
    ]
  },
  {
    date: '2026-06-27',
    version: 'v2.5.19.7',
    items: [
      { type: 'fix', text: '修复模态框内按钮无法触发的点击问题' },
    ]
  },
  {
    date: '2026-06-27',
    version: 'v2.5.19.6',
    items: [
      { type: 'fix', text: '修复复选框无法切换的问题' },
      { type: 'fix', text: '修复文件上传按钮跨场景失效' },
    ]
  },
  {
    date: '2026-06-27',
    version: 'v2.5.19.5',
    items: [
      { type: 'change', text: '事件委托优化：表单提交统一处理，提升交互稳定性' },
      { type: 'change', text: '灯箱组件兼容统一调用方式' },
    ]
  },
  {
    date: '2026-06-26',
    version: 'v2.5.19.4',
    items: [
      { type: 'change', text: '组件化重构：空状态、徽章、卡片、按钮、评论项等 7 类组件统一封装' },
      { type: 'change', text: '事件委托：移除全部内联点击事件，统一委托处理' },
      { type: 'change', text: '评论渲染合并：四套并行评论渲染逻辑统一为一套' },
      { type: 'change', text: '新增组件配套样式' },
    ]
  },
  {
    date: '2026-06-26',
    version: 'v2.5.19.3',
    items: [
      { type: 'change', text: '新建统一模态框系统：共享容器 + 统一 API，移除 11 个静态模态框' },
      { type: 'change', text: '关闭逻辑统一：内置回调清理与焦点陷阱管理' },
    ]
  },
  {
    date: '2026-06-26',
    version: 'v2.5.19.2',
    items: [
      { type: 'change', text: '统一全部模态框桌面端点击背景不关闭，移动端保持背景关闭行为' },
    ]
  },
  {
    date: '2026-06-25',
    version: 'v2.5.1.16',
    items: [
      { type: 'security', text: '问题反馈公开接口隐藏手机号，仅返回有限字段给未登录用户' },
      { type: 'security', text: '登录验证加固：绕过参数不再透传用户输入' },
      { type: 'security', text: 'XSS 修复：值日、批量导入、公告图片等多处字段转义' },
      { type: 'security', text: '投票新增人机验证，前后端双向防护' },
      { type: 'fix', text: '修复财务金额计算崩溃' },
      { type: 'fix', text: '修复图形效果内存泄漏' },
      { type: 'fix', text: '修复多处空值导致的崩溃' },
      { type: 'fix', text: '修复值日与场地预约的数据一致性问题' },
      { type: 'fix', text: '修复值日管理异步操作期间按钮可重复点击' },
      { type: 'fix', text: '修复深色模式兼容性：颜色函数补全回退值' },
      { type: 'fix', text: '修复数值解析缺省进制参数' },
      { type: 'change', text: '教师角色开放财务和值日导航入口' },
    ]
  },
  {
    date: '2026-06-24',
    version: 'v2.5.1.15',
    items: [
      { type: 'fix', text: '修复上传导入时空对象/无效行导致崩溃' },
      { type: 'fix', text: '修复签退时间异常导致报错' },
      { type: 'fix', text: '修复分数修改时排班记录不存在导致崩溃' },
      { type: 'fix', text: '修复手动排班允许同一人同时担任 A/B 岗' },
      { type: 'fix', text: '修复自动排班奇数人数时 A/B 可能为同一人' },
      { type: 'fix', text: '修复删除不存在干事仍返回成功' },
      { type: 'fix', text: '修复时段配置类型未校验导致脏数据' },
      { type: 'fix', text: '修复签到未验证干事是否属于今日排班' },
      { type: 'fix', text: '修复 CSV 导出含空值时格式断裂' },
    ]
  },
  {
    date: '2026-06-23',
    version: 'v2.5.0.0',
    items: [
      { type: 'add', text: '新增值日签到系统：学生会办公室值日签到与扣分管理' },
      { type: 'add', text: '导航栏新增"值日"标签页，仅登录用户可见' },
      { type: 'add', text: '签到按钮状态机：未签到 → 签到中 → 已完成/在岗不足/缺岗' },
      { type: 'add', text: '干事管理：Excel 批量导入 + 逐条添加' },
      { type: 'add', text: '排班管理：自动生成（2人/天，跳过周末）+ CSV 导出' },
      { type: 'add', text: '时段配置：6 个时段可配置，支持三种扣分规则' },
      { type: 'add', text: '扣分规则引擎：小课间/大课间/在岗不足差异化扣分' },
      { type: 'add', text: '销分申请：验证身份后记录销分理由' },
      { type: 'add', text: '计分修改：记录修改人和修改原因' },
      { type: 'add', text: '报表导出：本周扣分明细 + 总记分表（支持按个人/班级/部门统计）' },
      { type: 'add', text: '签到/签退按钮点击触发粒子效果' },
    ]
  },
  {
    date: '2026-06-22',
    version: 'v2.4.27.0',
    items: [
      { type: 'add', text: '新增鸣谢页面，列出所有开源库与专有服务及对应许可证' },
      { type: 'add', text: '关于页新增"鸣谢"入口卡片' },
      { type: 'add', text: '特别鸣谢卡片：感谢李昂同学提出建站构想' },
      { type: 'fix', text: '修复鸣谢页面图标缺失' },
      { type: 'fix', text: '修复关于页和鸣谢页模板字面量原文显示问题' },
      { type: 'change', text: '修正字体归类：Google Sans Flex 可变字体移至开源外部资源' },
    ]
  },
  {
    date: '2026-06-21',
    version: 'v2.4.23.5',
    items: [
      { type: 'fix', text: '修复注册时用户选择的部门被静默丢弃' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.4.18.2',
    items: [
      { type: 'change', text: '后端重构提升稳定性与可维护性' },
      { type: 'fix', text: '移除已删除功能（文创/任务）的下拉选项残留' },
      { type: 'fix', text: '移除关于页已删除功能条目' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.4.0.0',
    items: [
      { type: 'add', text: '新增 410 错误页面：已删除页面自动跳转至 410 页面并提示页面来源' },
      { type: 'change', text: '410 页面新增反馈入口"如果有疑问，请点击此处反馈"' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.3.14.4',
    items: [
      { type: 'add', text: '新增 410 错误页面：已删除的页面返回 HTTP 410 Gone 状态码' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.3.14.3',
    items: [
      { type: 'fix', text: '修复服务页问题反馈筛选切换时空状态残留' },
      { type: 'change', text: '优化图形效果：按钮碎裂物理引擎、覆盖统一、仅图形效果生效' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.3.10.1',
    items: [
      { type: 'change', text: '代码审计与安全加固：修复多个关键/高危问题' },
      { type: 'change', text: '数据库性能优化：新增索引，列表查询统一限流' },
      { type: 'change', text: '图形效果切换增加癫痫风险警告弹窗' },
      { type: 'add', text: '反馈提交成就：首次反馈、累计10次反馈' },
      { type: 'change', text: '移除任务系统与文化展示全部功能' },
      { type: 'change', text: '审核功能合并至管理面板' },
      { type: 'fix', text: '修复公告审核弹窗报错' },
      { type: 'fix', text: '修复图片数据解析崩溃' },
      { type: 'fix', text: '成就批量通知按用户分组去重' },
    ]
  },
  {
    date: '2026-06-20',
    version: 'v2.3.10.2',
    items: [
      { type: 'fix', text: '修复财务上传报错：数据库列迁移被阻断' },
      { type: 'fix', text: '修复财务上传人机验证未配置时失败' },
      { type: 'change', text: '财务上传异常友好提示' },
    ]
  },
  {
    date: '2026-06-19',
    version: 'v2.3.3.0',
    items: [
      { type: 'add', text: '用户反馈页面：支持人机验证' },
      { type: 'add', text: '反馈功能：用户提交、管理端查看与删除' },
      { type: 'add', text: '导航栏胶囊新增"反馈"标签页' },
      { type: 'add', text: '个人中心底部"反馈意见"入口' },
    ]
  },
  {
    date: '2026-06-19',
    version: 'v2.3.2.0',
    items: [
      { type: 'add', text: '被拒绝的文化展示 14 天后自动清理' },
      { type: 'add', text: 'Toast 退出滑出动画' },
      { type: 'change', text: '管理员/老师/站长可在成员管理中点击成员名查看其个人中心（隐藏账户设置）' },
      { type: 'change', text: '查看他人成就时，未解锁的成就描述显示乱码' },
      { type: 'fix', text: '修复老师无法访问财务页面' },
    ]
  },
  {
    date: '2026-06-19',
    version: 'v2.3.1.7',
    items: [
      { type: 'add', text: 'Cookie 告知横幅（首次访问时底部弹出，接受后获得成就"浏览器吃下了所有饼干"）' },
      { type: 'change', text: '动态页面无需登录即可查看' },
      { type: 'change', text: '成员管理分页加载（每页 200 人，支持"加载更多"）' },
      { type: 'change', text: '数据库性能优化：新增索引' },
      { type: 'fix', text: '列表接口加限流，防止数据增长后崩溃' },
      { type: 'fix', text: '场地冲突检查性能优化' },
      { type: 'fix', text: '鼠标移动事件节流' },
      { type: 'fix', text: '动态轮询定时器添加页面生命周期管理' },
      { type: 'fix', text: '修复任务列表筛选后空状态不显示' },
      { type: 'fix', text: '修复任务列表过滤分支死代码' },
      { type: 'security', text: '多个未鉴权接口加固' },
      { type: 'security', text: '同步接口敏感子路由添加登录检查' },
    ]
  },
  {
    date: '2026-06-19',
    version: 'v2.3.1.2-stable',
    items: [
      { type: 'fix', text: '修复关闭网站后开关弹回（确认回调被取消回调误重置）' },
      { type: 'change', text: '全站页面添加 favicon 引用' },
      { type: 'change', text: '导航栏图标改用会徽' },
    ]
  },
  {
    date: '2026-06-19',
    version: 'v2.3.1.1',
    items: [
      { type: 'change', text: '存储统计双进度条：图片与文本独立展示' },
      { type: 'change', text: '后端新增文本数据量估算' },
      { type: 'change', text: '自动清理覆盖孤立评论/投票/动态等' },
    ]
  },
  {
    date: '2026-06-18',
    version: 'v2.3.1.0-stable',
    items: [
      { type: 'add', text: '服务页公告横幅新增千人报告厅预约情况展示' },
      { type: 'fix', text: '修复任务列表筛选崩溃' },
      { type: 'fix', text: '修复管理员删除问题反馈 404' },
      { type: 'fix', text: '修复成就计数查询匹配错误，评论者/提案者无法解锁' },
      { type: 'fix', text: '修复审核功能缺少权限检查' },
      { type: 'fix', text: '修复焦点陷阱事件监听器重复绑定导致的内存泄漏' },
      { type: 'fix', text: '修复卡片倾斜事件监听器叠加' },
      { type: 'fix', text: '修复灯箱二次导航图片失效' },
      { type: 'fix', text: '修复班级为空可绕过密码验证' },
      { type: 'fix', text: '修复分页边界值误报' },
      { type: 'fix', text: '修复场地审批竞态条件' },
      { type: 'fix', text: '修复删除用户/议题/公告后遗留孤立记录' },
      { type: 'fix', text: '修复清空操作遗漏部分表' },
      { type: 'fix', text: '修复批量导入密码盐值过低' },
      { type: 'fix', text: '修复深色模式菜单项悬停样式不生效' },
      { type: 'fix', text: '修复投票问题卡片无样式' },
      { type: 'fix', text: '修复多个 CSS 变量未定义' },
      { type: 'change', text: '批量导入失败后展示具体失败详情' },
      { type: 'change', text: '404 页面来源为空时显示默认文案' },
    ]
  },
  {
    date: '2026-06-18',
    version: 'v2.3.0.3',
    items: [
      { type: 'change', text: '动态页面改为分页加载+无限滚动，大幅提升首次加载速度' },
      { type: 'change', text: '动态排序改为倒序（最新在最上面）' },
      { type: 'change', text: '非阻塞字体加载，消除渲染阻塞' },
      { type: 'change', text: '任务列表过滤优化：仅更新单张卡片' },
      { type: 'change', text: '投票列表删除/创建改为精准操作，避免全量重渲染' },
      { type: 'ui', text: '3D 卡片倾斜增强：倾斜角度与透视优化，增加闲置浮动动画' },
      { type: 'ui', text: '加载中提示统一为 flex 布局' },
    ]
  },
  {
    date: '2026-06-18',
    version: 'v2.3.0.1',
    items: [
      { type: 'fix', text: '修复报修记录字段迁移导致线上报错' },
    ]
  },
  {
    date: '2026-06-18',
    version: 'v2.3.0.0-alpha',
    items: [
      { type: 'add', text: '千人报告厅预约系统（时间线拖选、重叠卡片布局、甘特冲突图）' },
      { type: 'add', text: '预约时间冲突检测与警告提示' },
      { type: 'add', text: '预约详情弹窗（提交人、审核者、提交/审核时间）' },
      { type: 'add', text: '审核通过时冲突预约自动取消，动态推送通知' },
      { type: 'add', text: '财务删除功能' },
      { type: 'add', text: '财务上传人机验证' },
      { type: 'add', text: '公告列表评论系统' },
      { type: 'add', text: '动态链接导航、通知类型消息' },
      { type: 'change', text: '所有千报/财务/审核操作推送至动态' },
      { type: 'change', text: '任命动态改为紧凑小卡片' },
      { type: 'change', text: '预约已作废记录灰色保留显示' },
      { type: 'change', text: '卡片颜色/阴影跟随主题色' },
      { type: 'fix', text: '修复财务删除接口 404' },
      { type: 'fix', text: '修复公告页面评论函数未定义' },
      { type: 'fix', text: '修复缩放功能滚动跳位（已移除缩放）' },
      { type: 'fix', text: '修复预约选择器悬浮层未重置' },
    ]
  },
  {
    date: '2026-06-14',
    version: 'v2.2-fix',
    items: [
      { type: 'add', text: '活动公示与志愿者报名（含人机验证）' },
      { type: 'add', text: '财务三分类：流动资金库/基金账单/报销账单' },
      { type: 'add', text: '财务团委内活动标记' },
      { type: 'add', text: '文创全员上传（活动名称+部门）' },
      { type: 'add', text: '批量导入成员去重' },
      { type: 'fix', text: '修复财务分类与月份过滤逻辑' },
      { type: 'fix', text: '修复旧账单缺失分类字段' },
      { type: 'fix', text: '修复批量导入超时' },
      { type: 'fix', text: '修复站点关闭开关状态重置' },
      { type: 'fix', text: '修复服务页缺少人机验证跳过' },
      { type: 'change', text: '管理员卡片重新设计' },
      { type: 'change', text: '论坛界面美化（气泡、间距、排版）' },
      { type: 'change', text: '部门「团委办」更名为「团总支」' },
      { type: 'security', text: 'API 请求超时与自动重试' },
      { type: 'ui', text: '财务汇总卡片图标去除色块' },
    ]
  },
  {
    date: '2026-06-07',
    version: 'v2.1-stable',
    items: [
      { type: 'add', text: '注册姓名实时查重' },
      { type: 'add', text: '闲置 20 分钟自动退出' },
      { type: 'add', text: '管理面板卡片重设计' },
      { type: 'fix', text: '登录页错字修正' },
      { type: 'security', text: '权限判断加固' },
    ]
  },
  {
    date: '2026-06-07',
    version: 'v2.0',
    items: [
      { type: 'add', text: '模态框焦点锁定' },
      { type: 'add', text: '模态框退出动画' },
      { type: 'change', text: 'CSS 变量统一 z-index 与颜色' },
      { type: 'change', text: '移除未使用 CSS 规则' },
      { type: 'change', text: '过渡动画改为指定属性' },
      { type: 'change', text: '数据库查询优化' },
      { type: 'change', text: '注册不再允许自选部门' },
      { type: 'fix', text: '修复已拒绝公告仍在列表显示' },
      { type: 'fix', text: '修复关于页图片缺少 alt' },
      { type: 'fix', text: '修复索引缺失' },
      { type: 'security', text: '30+ 接口限速' },
      { type: 'ui', text: 'Toast 无障碍优化' },
      { type: 'ui', text: '管理面板搜索防抖' },
    ]
  },
  {
    date: '2026-06-06',
    version: 'v2.0-preview4',
    items: [
      { type: 'add', text: '3D 图片选择器' },
      { type: 'add', text: 'Lightbox 切换动画' },
      { type: 'change', text: '图片堆叠增强' },
      { type: 'change', text: '移动端禁用堆叠' },
      { type: 'change', text: '3D 选择器惯性滚动' },
      { type: 'change', text: '关于页图标同步' },
      { type: 'ui', text: 'Lightbox 滑入滑出' },
      { type: 'ui', text: '3D 选择器入场动画' },
      { type: 'fix', text: '拖拽误触图片预览' },
      { type: 'fix', text: '成就数据从 DB 读取' },
    ]
  },
  {
    date: '2026-06-06',
    version: 'v2.0-preview3',
    items: [
      { type: 'add', text: '消息入场动画' },
      { type: 'add', text: '财务卡片入场动画' },
      { type: 'add', text: '登录表单切换动画' },
      { type: 'add', text: '轮播文字动画' },
      { type: 'add', text: '更新日志自动折叠' },
      { type: 'fix', text: 'XSS 修复（多文件）' },
      { type: 'fix', text: '清除控制台输出残留' },
      { type: 'fix', text: '修复灯箱内存泄漏' },
      { type: 'fix', text: '修复 CSV 导出转义' },
      { type: 'fix', text: '修复站点关闭重复监听器' },
      { type: 'fix', text: '修复观察器未断开' },
      { type: 'fix', text: '修复投票重复查询' },
      { type: 'fix', text: '修复月份选择器重复关闭' },
      { type: 'fix', text: '修复索引缺失' },
      { type: 'ui', text: '折叠交互 M3 风格' },
    ]
  },
  {
    date: '2026-06-05',
    version: 'v2.0-preview',
    items: [
      { type: 'add', text: '论坛' },
      { type: 'add', text: '财务跨部门通知' },
      { type: 'add', text: '消息撤回' },
      { type: 'add', text: '禁言/清空' },
      { type: 'add', text: '系统消息徽章' },
      { type: 'add', text: '部门系统' },
      { type: 'add', text: '教师角色' },
      { type: 'add', text: '密码重置' },
      { type: 'add', text: '胶囊导航自动隐藏' },
      { type: 'change', text: '论坛界面重写' },
      { type: 'change', text: '登录发言/游客浏览' },
      { type: 'change', text: '统一 8 个部门' },
      { type: 'change', text: '财务卡片图标' },
      { type: 'fix', text: '修复标题线偏移' },
      { type: 'fix', text: '修复输入框背景' },
      { type: 'ui', text: '消息气泡 M3 风格' },
      { type: 'ui', text: '状态徽章 CSS 变量' },
    ]
  },
  {
    date: '2026-06-05',
    version: 'v1.3',
    items: [
      { type: 'add', text: '个性化设置页面' },
      { type: 'add', text: '齿轮图标入口' },
      { type: 'add', text: '深色模式' },
      { type: 'add', text: '管理面板同步' },
      { type: 'change', text: '设置同步所有页面' },
      { type: 'change', text: 'M3 风格滑动条' },
      { type: 'change', text: 'M3 风格开关' },
      { type: 'change', text: '行模式/堆叠模式切换' },
      { type: 'change', text: '图片容器滚轮滑动' },
      { type: 'change', text: '管理面板卡片着色' },
      { type: 'change', text: '卡片悬停阴影' },
      { type: 'fix', text: '移除重复函数' },
      { type: 'fix', text: '横幅截断' },
      { type: 'ui', text: '默认浅色' },
      { type: 'ui', text: '选项字体调大' },
    ]
  },
  {
    date: '2026-06-05',
    version: 'v1.2',
    items: [
      { type: 'add', text: '多图公告' },
      { type: 'add', text: '图片堆叠效果' },
      { type: 'add', text: '3D 图片选择器' },
      { type: 'add', text: '入场/出场动画' },
      { type: 'change', text: '图片上限提升至 25MB' },
      { type: 'change', text: '公告改为先创建再传图' },
      { type: 'fix', text: 'data URL 元素丢弃' },
      { type: 'fix', text: '选择器悬停抖动' },
      { type: 'fix', text: '横幅未省略' },
      { type: 'ui', text: '公告跳转详情' },
      { type: 'ui', text: '横幅多图随机' },
      { type: 'ui', text: '3D 卡片视角' },
    ]
  },
  {
    date: '2026-06-04',
    version: 'v1.1',
    items: [
      { type: 'add', text: '更新日志页面' },
      { type: 'add', text: '整体改进' },
      { type: 'change', text: '统一确认弹窗' },
      { type: 'change', text: '移除控制台输出' },
      { type: 'fix', text: '修复缩进错误' },
      { type: 'fix', text: '修复登录按钮重置' },
      { type: 'fix', text: '统一接口调用' },
      { type: 'ui', text: '投票弹窗手动关闭' },
      { type: 'ui', text: '胶囊栏滚动隐藏' },
      { type: 'ui', text: '展开态圆角' },
    ]
  },
  {
    date: '2026-05-31',
    version: 'v1.0',
    items: [
      { type: 'add', text: '财务月度汇总/报销' },
      { type: 'add', text: '投票 CSV 导出' },
      { type: 'add', text: '文创作品管理' },
      { type: 'change', text: '权限与班级验证' },
      { type: 'change', text: '反馈自动关闭' },
      { type: 'ui', text: '胶囊式底栏' },
      { type: 'ui', text: 'M3 主题色' },
      { type: 'ui', text: '页面水印发徽' },
      { type: 'fix', text: '图片懒加载与票数更新' },
      { type: 'security', text: 'XSS 与 CSRF 防护' },
    ]
  },
  {
    date: '2026-05-15',
    version: 'v0.9',
    items: [
      { type: 'add', text: '投票系统' },
      { type: 'add', text: '评论系统' },
      { type: 'add', text: '滚动横幅' },
      { type: 'add', text: '任务管理' },
      { type: 'add', text: '图库灯箱' },
      { type: 'change', text: '移动端适配与触摸手势' },
      { type: 'ui', text: '公告 NEW 标记与评论计数' },
      { type: 'ui', text: '图片懒加载' },
    ]
  },
  {
    date: '2026-04-28',
    version: 'v0.8',
    items: [
      { type: 'add', text: '财务管理' },
      { type: 'add', text: '审核系统' },
      { type: 'add', text: '文创展示页面' },
      { type: 'add', text: '公告审核' },
      { type: 'add', text: '成员管理' },
      { type: 'add', text: '存储统计仪表盘' },
      { type: 'change', text: 'hash 缓存替代全量同步' },
      { type: 'security', text: 'Turnstile 人机验证' },
    ]
  },
  {
    date: '2026-04-10',
    version: 'v0.7',
    items: [
      { type: 'add', text: '管理面板' },
      { type: 'add', text: '站点关闭功能' },
      { type: 'add', text: '倒计时确认弹窗' },
      { type: 'change', text: '登录态加入班级信息' },
      { type: 'fix', text: 'XSS 与权限漏洞修复' },
      { type: 'ui', text: '优化 404 页面' },
    ]
  },
  {
    date: '2026-03-20',
    version: 'v0.6',
    items: [
      { type: 'add', text: '公告模块' },
      { type: 'add', text: '班级系统' },
      { type: 'add', text: '投票班级限定范围' },
      { type: 'add', text: '问题反馈图片上传' },
      { type: 'change', text: '重构认证流程' },
      { type: 'ui', text: '底部 Tab 导航栏' },
    ]
  },
  {
    date: '2026-03-05',
    version: 'v0.5',
    items: [
      { type: 'add', text: '用户注册/登录/审批' },
      { type: 'add', text: '问题反馈增删改查' },
      { type: 'add', text: '任务增删改查' },
      { type: 'add', text: '数据库搭建' },
      { type: 'add', text: '登录态管理' },
      { type: 'add', text: '角色权限系统' },
      { type: 'add', text: '密码加密与长度校验' },
      { type: 'fix', text: '修复登录页面多语言显示' },
      { type: 'ui', text: '引入 Material 3 Design' },
    ]
  },
];
