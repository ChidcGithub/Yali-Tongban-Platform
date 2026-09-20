/**
 * 生成图标对照表（仅供人工核对语义用，不参与构建）
 *
 * 用途：随包字体剥离了字形名，无法从字体元数据判断某个码位画的是什么。
 * 把 icons.ts 里每个字形渲染成一格，肉眼确认语义是否对得上，
 * 尤其在我们按「码位是否可用」调整过图标之后。
 *
 * 用法：node scripts/icon-sheet.mjs && 用浏览器打开 dist/__icons/index.html
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const src = readFileSync(join(root, 'src/shared/icons.ts'), 'utf8')
const items = [...src.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'\\u([0-9A-Fa-f]{4})'/gm)].map((m) => ({
  name: m[1],
  code: m[2].toUpperCase()
}))

const distAssets = join(root, 'dist/assets')
const font = readdirSync(distAssets).find((f) => /\.TTF$/i.test(f))
if (!font) {
  console.error('✗ dist/assets 里没有字体，先 npm run build')
  process.exit(1)
}

const cells = items
  .map(
    (i) =>
      `<div class="cell"><span class="g">&#x${i.code};</span>` +
      `<span class="n">${i.name}</span><span class="c">${i.code}</span></div>`
  )
  .join('\n')

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>图标对照表</title>
<style>
@font-face { font-family: IconFont; src: url("/assets/${font}") format("truetype"); font-display: block; }
body { background: #fff; color: #111; font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
h1 { font-size: 14px; margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 2px;
        padding: 8px 4px; border: 1px solid #ddd; border-radius: 8px; }
.g { font-family: IconFont; font-size: 30px; line-height: 1; }
.n { font-size: 10px; text-align: center; word-break: break-all; }
.c { font-size: 9px; color: #999; }
</style></head><body>
<h1>icons.ts 字形对照表（共 ${items.length} 个）</h1>
<div class="grid">
${cells}
</div>
</body></html>`

mkdirSync(join(root, 'dist/__icons'), { recursive: true })
writeFileSync(join(root, 'dist/__icons/index.html'), html)
console.log(`已生成 dist/__icons/index.html（${items.length} 个图标，字体 ${font}）`)
