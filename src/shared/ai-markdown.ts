/* AI 回复的 Markdown 渲染（AiApp 整页与 AiChatWidget 浮窗共用）
   ═══════════════════════════════════════════════════════════════
   安全模型：**先整体 HTML 转义，再在「已转义文本」上解析结构** ——
   所有正则都作用于没有任何原始 < > " ' 的字符串，输出不可能注入新标签。
   链接 href 走协议白名单（http/https/相对路径/锚点/mailto）。
   支持子集：代码块、行内码、表格、标题、引用、有序/无序列表、
   水平线、粗体、斜体、删除线、链接。刻意不支持图片（防外链滥用）。
   ═══════════════════════════════════════════════════════════════ */
const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escAll(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c])
}

/** 行内语法（输入必须是已转义文本） */
function inline(s: string): string {
  // 行内代码最先处理：内部不再跑其它语法（防 * _ [ 被误解析）
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => `<code class="ai-inline">${c}</code>`)
  // 链接 [text](url)。esc 已把引号变实体，href 无注入面；只做协议白名单
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const raw = url.replace(/&amp;/g, '&')
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(raw)) return m
    return `<a class="ai-md-a" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
  })
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  // 斜体：单星/单下划线，带边界负顾（防 3*4*5、snake_case_name 误伤）
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
  return s
}

/** 表格行？「| a | b |」形态 */
function isTableRow(l: string): boolean {
  return /^\s*\|.+\|\s*$/.test(l)
}
/** 表头分隔行？只由 | : - 和空白组成且含 - */
function isSepRow(l: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-') && !/[a-zA-Z\u4e00-\u9fff]/.test(l)
}
function parseRow(l: string): string[] {
  return l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('\\|') // 单元格内的转义竖线 → 占位
    .join('\u0000')
    .split('|')
    .map((c) => inline(c.trim().split('\u0000').join('|')))
}

export function renderAiMarkdown(src: string): string {
  const lines = escAll(String(src).replace(/\r\n?/g, '\n')).split('\n')
  const out: string[] = []
  let i = 0
  // 段落收集的块级打断条件（引用取转义后的 `&gt;`，理由同下方「引用」分支）
  const BLOCK = /^(?:```|&gt;|#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\||\s*(?:-{3,}|\*{3,})\s*$)/

  while (i < lines.length) {
    const line = lines[i]

    /* 围栏代码块 */
    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过闭合围栏（缺失则吃到 EOF）
      out.push(`<pre class="ai-code">${buf.join('\n')}</pre>`)
      continue
    }

    /* 表格：表头 + 分隔行 + 若干数据行 */
    if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const head = parseRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseRow(lines[i]))
        i++
      }
      out.push(
        '<div class="ai-md-tablewrap"><table class="ai-md-table"><thead><tr>' +
          head.map((h) => `<th>${h}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>'
      )
      continue
    }

    /* 引用。
       ⚠️ 匹配的是**转义后**的形态：本函数开头就 escAll() 过，
       `>` 此时已经是 `&gt;` —— 按裸 `>` 匹配的话这一支永远不成立
       （实测：引用整体渲染不出来，冒烟红在「引用 + 链接渲染」）。 */
    if (/^\s*&gt;/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*&gt;/.test(lines[i])) {
        buf.push(inline(lines[i].replace(/^\s*&gt;\s?/, '')))
        i++
      }
      out.push(`<blockquote class="ai-md-quote">${buf.join('<br>')}</blockquote>`)
      continue
    }

    /* 标题（气泡内统一为加大加粗行，不吃满 h1-h6 的巨大字号） */
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      out.push(`<p class="ai-md-h"><strong>${inline(h[2])}</strong></p>`)
      i++
      continue
    }

    /* 水平线 */
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr class="ai-md-hr">')
      i++
      continue
    }

    /* 无序列表 */
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ul>${buf.join('')}</ul>`)
      continue
    }

    /* 有序列表 */
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ol>${buf.join('')}</ol>`)
      continue
    }

    /* 空行 */
    if (line.trim() === '') {
      i++
      continue
    }

    /* 普通段落：收集到空行或下一个块级标记 */
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !BLOCK.test(lines[i])) {
      buf.push(inline(lines[i]))
      i++
    }
    out.push(`<p>${buf.join('<br>')}</p>`)
  }
  return out.join('')
}
