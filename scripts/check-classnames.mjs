#!/usr/bin/env node
/**
 * 守卫：页面里不要出现 `ad-` 前缀的类名。
 *
 * 为什么值得单开一道检查 —— 它已经造成过两次用户可见的故障：
 * 管理页的标签栏（`.ad-tabs`）与成员管理里的一批元素，在用户的 Edge 上**整块消失**，
 * 而内置浏览器里正常。原因是他那份浏览器配置里有一条针对 `ad-` 类名的隐藏规则
 * （`display: none`），注入式样式在渲染之后才生效 ——
 * 所以表现是「刷新时闪一下就没了」。
 * 这类问题从代码到测试全绿，排查方向也会被带偏（第一反应是去查 CSS / 组件）。
 *
 * `ad-*` 这种名字本来就容易被广告过滤器或「屏蔽此元素」误伤，
 * 换个前缀（`admin-` / `announce-`）成本几乎为零，所以直接禁掉。
 *
 * 用法：
 *   node scripts/check-classnames.mjs            # 扫 src/ 下所有 .vue
 *   node scripts/check-classnames.mjs <路径>      # 只扫指定文件/目录（调试用）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* 只在「类名边界」上匹配：前面必须是引号 / 空格 / 点 / 大括号之类，
   否则会把 `head-tools`、`load-x` 里的 "ad-" 也当成类名（这两种写法站内真的存在） */
const BAD = /(?<![A-Za-z0-9_$-])ad-(?=[a-z])/

/** 注释里的提及不算：说明文字里会写到旧类名 */
const stripComments = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (extname(p) === '.vue') out.push(p)
  }
  return out
}

const arg = process.argv[2]
const files = arg ? (statSync(arg).isDirectory() ? walk(arg) : [arg]) : walk(join(root, 'src'))

const hits = []
for (const file of files) {
  const rel = file.replace(root, '').replace(/^[\\/]/, '')
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      BAD.lastIndex = 0
      if (BAD.test(line)) hits.push(`  ${rel}:${i + 1}   ${line.trim().slice(0, 70)}`)
    })
}

if (hits.length) {
  console.error(`✗ 发现 ${hits.length} 处 ad- 前缀的类名 —— 容易被广告过滤器或「屏蔽此元素」误伤：\n`)
  console.error(hits.join('\n'))
  console.error('\n  换个不易被误伤的前缀（admin- / announce- / 业务名-）再提交。')
  process.exit(1)
}

console.log(`✅ 类名检查通过（${files.length} 个 .vue，无 ad- 前缀）`)
