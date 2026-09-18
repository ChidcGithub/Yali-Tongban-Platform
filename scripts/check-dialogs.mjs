/**
 * 构建期守卫：ContentDialog 不得同时有 `CloseButtonText` 和正文「取消/关闭/返回」按钮
 * ══════════════════════════════════════════════════════════
 * 为什么：同一个「取消」出现两次（正文一个、底部一个），
 * 用户会犹豫该点哪个。项目约定：**动作按钮放正文里**，
 * 只有正文没有关闭途径的对话框才用 `CloseButtonText`
 * （志愿者名单 / 预约详情 / 邀请详情 / 批量导入成员 / 手动排班 —— 共 5 处）。
 *
 * 2026-09-18 清理过一轮（11 处），这道守卫防止它再长回来。
 * 判据与当时清理用的完全一致。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CLOSE_IN_BODY = />取消<|>关闭<|>返回</
const CLOSE_ATTR = /CloseButtonText="[^"]*"/

const root = process.argv[2] || 'src/pages'
const files = []
;(function collect(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p)
    else if (name.endsWith('.vue')) files.push(p)
  }
})(root)

let bad = 0
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/<ContentDialog\b/.test(lines[i])) continue

    // 开标签结束行
    let openEnd = i
    while (openEnd < lines.length && !/>\s*$/.test(lines[openEnd])) openEnd += 1
    const header = lines.slice(i, openEnd + 1).join('\n')
    if (!CLOSE_ATTR.test(header)) continue

    // 配对的 </ContentDialog>（项目里没有嵌套同名组件）
    let end = -1
    for (let j = i; j < lines.length; j++) {
      if (j !== i && /<ContentDialog\b/.test(lines[j])) break
      if (/<\/ContentDialog>/.test(lines[j])) {
        end = j
        break
      }
    }
    if (end < 0) continue

    const body = lines.slice(i, end + 1).join('\n')
    if (CLOSE_IN_BODY.test(body)) {
      bad += 1
      const title = /Title="([^"]*)"/.exec(header)?.[1] || '(动态标题)'
      console.log(`✗ ${file}:${i + 1}  「${title}」正文已有取消按钮，却又设了 ${CLOSE_ATTR.exec(header)[0]}`)
    }
    i = end // 跳到对话框结束后继续扫
  }
}

if (bad) {
  console.log(`\n✗ ${bad} 个对话框同时有 CloseButtonText 与正文取消按钮 —— 请删掉 CloseButtonText（底部按钮是重复的）`)
  console.log('  例外：正文确实没有关闭途径的对话框才允许用 CloseButtonText。')
  process.exit(1)
}
console.log('✅ 对话框检查通过（无重复的底部取消按钮）')
