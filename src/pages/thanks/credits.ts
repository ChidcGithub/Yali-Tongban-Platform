/* 由原 thanks.html 抽取生成；致谢内容变动时重新生成即可 */
export interface CreditItem {
  name: string
  license?: string
  /** 项目主页 / 源码地址：有值则名称与地址都渲染成外链 */
  url?: string
  /** 作者：开源库尤其该署名 */
  author?: string
  desc?: string
}
export interface CreditSection { title: string; sub?: string; items: CreditItem[] }

export const CREDITS: CreditSection[] = [
  {
    "title": "特别鸣谢",
    "sub": "感谢 李昂 同学提出搭建本平台的构想",
    "items": []
  },
  {
    "title": "开源运行时库",
    "sub": "",
    "items": [
      {
        "name": "WinUIonWeb",
        "license": "GPL-3.0",
        "author": "Furry-Xiyi",
        "url": "https://github.com/Furry-Xiyi/WinUIonWeb",
        "desc": "WinUI / Fluent 设计语言的 Vue 3 组件库 —— 全站界面的组件与样式基础（已 vendor 进源码）"
      },
      {
        "name": "bcryptjs",
        "license": "MIT",
        "desc": "密码哈希加密"
      },
      {
        "name": "jose",
        "license": "MIT",
        "desc": "JWT 令牌签发与验证"
      }
    ]
  },
  {
    "title": "开源外部资源",
    "sub": "",
    "items": [
      {
        "name": "Google Fonts / Noto Sans SC",
        "license": "OFL",
        "desc": "无衬线中文字体"
      },
      {
        "name": "Google Fonts / Noto Serif SC",
        "license": "OFL",
        "desc": "衬线中文字体"
      },
      {
        "name": "Three.js",
        "license": "MIT",
        "desc": "3D 图片选择器渲染"
      },
      {
        "name": "Google Fonts / Google Sans Flex",
        "license": "OFL",
        "desc": "可变字体（GSF.ttf，weight 100-900）"
      }
    ]
  },
  {
    "title": "闭源 / 专有服务",
    "sub": "",
    "items": [
      {
        "name": "Cloudflare Pages",
        "license": "",
        "desc": "静态托管与函数部署"
      },
      {
        "name": "Cloudflare Workers",
        "license": "",
        "desc": "无服务器后端运行环境"
      },
      {
        "name": "Cloudflare D1",
        "license": "",
        "desc": "SQLite 关系数据库"
      },
      {
        "name": "Cloudflare R2",
        "license": "",
        "desc": "对象存储（上传图片）"
      }
    ]
  },
  {
    "title": "开发工具",
    "sub": "",
    "items": [
      {
        "name": "wrangler",
        "license": "MIT / Apache-2.0",
        "desc": "Cloudflare Pages CLI 部署工具"
      },
      {
        "name": "esbuild",
        "license": "MIT",
        "desc": "JavaScript 打包器"
      }
    ]
  }
]
