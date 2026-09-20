/* AI 流式对话共享模块（AiApp 整页与 AiChatWidget 浮窗共用）
   统一 SSE 解析、空闲超时、错误语义 —— 一处修，两处受益。 */

export interface ChatMsg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
  reasoning?: string
}

export const TOOL_LABELS: Record<string, string> = {
  query_database: '查询站点数据库',
  web_search: '联网搜索',
  save_memory: '保存记忆',
  forget_memory: '删除记忆',
  get_my_notifications: '查看站内通知'
}

export interface StreamHandlers {
  onDelta(text: string): void
  onReasoning?(text: string): void
  onTool?(name: string): void
  onReset?(): void
}

/** 空闲超时：这么久没有任何事件（含心跳级增量）视为连接挂死 */
const IDLE_TIMEOUT_MS = 45000

/**
 * 发起一轮流式对话并消费 SSE。
 * - 网络/HTTP 错误、上游错误事件、空闲超时都会 throw（调用方 catch 决定展示方式）
 * - 正常结束（done 事件）静默返回
 */
export async function streamChat(
  body: { message: string; thinking?: boolean; webSearch?: boolean; context?: string },
  handlers: StreamHandlers,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error || `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let sawDone = false
  let timedOut = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      timedOut = true
      reader.cancel().catch(() => {})
    }, IDLE_TIMEOUT_MS)
  }
  armIdle()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      armIdle()
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i).trim()
        buf = buf.slice(i + 2)
        if (!raw.startsWith('data:')) continue
        let payload: {
          delta?: string
          reasoning?: string
          reset?: boolean
          tool?: { name: string }
          error?: string
          done?: boolean
        }
        try {
          payload = JSON.parse(raw.slice(5).trim())
        } catch {
          continue // 残缺块直接丢，不让单帧坏数据打死整轮
        }
        if (payload.reset) handlers.onReset?.()
        else if (payload.reasoning) handlers.onReasoning?.(payload.reasoning)
        else if (payload.delta) handlers.onDelta(payload.delta)
        else if (payload.tool) handlers.onTool?.(payload.tool.name)
        else if (payload.error) throw new Error(payload.error)
        else if (payload.done) {
          sawDone = true
        }
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
  }

  if (timedOut) throw new Error('AI 长时间没有响应，请重试')
  if (!sawDone) throw new Error('连接中断，AI 没有完整回答，请重试')
}
