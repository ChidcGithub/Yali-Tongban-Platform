/* AI 回复的轻量 Markdown 渲染（AiApp 整页与 AiChatWidget 浮窗共用）
   先整体 HTML 转义再渲染，无 XSS 面；只做站点用得到的子集。 */
export function renderAiMarkdown(src: string): string {
  let s = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/```([\s\S]*?)```/g, (_m, c: string) => `<pre class="ai-code">${c.replace(/^\n+|\n+$/g, '')}</pre>`)
  s = s.replace(/`([^`\n]+)`/g, '<code class="ai-inline">$1</code>')
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/^\s{0,3}[-*]\s+(.+)$/gm, '<li>$1</li>')
  s = s.replace(/^\s{0,3}\d+\.\s+(.+)$/gm, '<li>$1</li>')
  s = s.replace(/\n/g, '<br>')
  return s
}
