<template>
  <!-- ⚠️ 必须 Teleport 到 body：YaliShell/NavigationView 的导航过渡会给祖先
       挂 perspective/transform —— 祖先带 transform 时 position:fixed 退化为
       相对该祖先定位，页面内容矮（如「今日无排班」）时悬浮球就悬在半空。 -->
  <Teleport to="body">
  <!-- 悬浮球：登录 + AI 已配置才出现（widget 自己查 status，页面无需守卫） -->
  <button v-if="fabVisible" class="aiw-fab" type="button" :title="open ? '收起 AI 助手' : 'AI 助手'" @click="toggle">
    <FontIcon :Glyph="GLYPH.close" v-if="open" :FontSize="20" />
    <FontIcon v-else :Glyph="GLYPH.ai" :FontSize="24" />
  </button>

  <!-- 聊天浮窗 -->
  <div v-if="open" class="aiw-panel" role="dialog" aria-label="AI 助手浮窗">
    <div class="aiw-head">
      <FontIcon :Glyph="GLYPH.ai" :FontSize="15" />
      <span class="aiw-head-title">AI 助手<template v-if="context"> · {{ context }}</template></span>
      <span v-if="status?.model" class="aiw-head-model">{{ status.model }}</span>
      <button class="aiw-close" type="button" title="关闭" @click="open = false">
        <FontIcon :Glyph="GLYPH.close" :FontSize="13" />
      </button>
    </div>

    <div ref="listRef" class="aiw-list">
      <div v-if="!messages.length && !busy" class="aiw-empty">
        <FontIcon :Glyph="GLYPH.ai" :FontSize="30" />
        <p>有什么可以帮你？</p>
      </div>

      <div v-for="(m, i) in messages" :key="i" class="aiw-msg" :class="m.role">
        <div class="aiw-msg-col">
          <div v-if="m.tools && m.tools.length" class="aiw-tools">
            <span v-for="(t, j) in m.tools" :key="j" class="aiw-chip">{{ t }}</span>
          </div>
          <div v-if="m.reasoning" class="aiw-think">
            <details><summary>思考过程</summary><div class="aiw-think-body">{{ m.reasoning }}</div></details>
          </div>
          <div class="aiw-bubble" v-html="render(m.content)"></div>
        </div>
      </div>

      <div v-if="busy" class="aiw-msg assistant">
        <div class="aiw-msg-col">
          <div v-if="toolChips.length" class="aiw-tools">
            <span v-for="(t, i) in toolChips" :key="i" class="aiw-chip">
              <FontIcon :Glyph="GLYPH.refresh" :FontSize="11" />
              {{ t }}
            </span>
          </div>
          <details v-if="thinkText" class="aiw-think" open>
            <summary>思考过程</summary>
            <div class="aiw-think-body">{{ thinkText }}</div>
          </details>
          <div v-if="streamText" class="aiw-bubble" v-html="render(streamText)"></div>
          <div v-else class="aiw-bubble aiw-bubble-typing">
            <span class="aiw-typing"><span></span><span></span><span></span></span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="quick.length" class="aiw-quick">
      <button v-for="q in quick" :key="q" type="button" :disabled="busy" @click="send(q)">{{ q }}</button>
    </div>

    <div class="aiw-input-row">
      <input
        ref="inputRef"
        v-model="draft"
        class="aiw-input"
        type="text"
        :maxlength="2000"
        :disabled="busy"
        placeholder="问点什么…（Enter 发送）"
        @keydown.enter="onEnter"
      />
      <button v-if="!busy" class="aiw-send" type="button" :disabled="!!draft.trim() === false" @click="send()">
        <FontIcon :Glyph="GLYPH.forward" :FontSize="14" />
      </button>
      <button v-else class="aiw-send" type="button" title="停止" @click="stop">
        <FontIcon :Glyph="GLYPH.close" :FontSize="14" />
      </button>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
/* 页内 AI 浮窗（可复用）：与 AI 助手页共享后端、历史与思考/联网偏好。
   挂载即查 /api/ai/status —— 未登录（401）或未配置时悬浮球不出现。 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { GLYPH } from '../shared/icons'
import { apiGet } from '../shared/api'
import { renderAiMarkdown as render } from '../shared/ai-markdown'

const props = defineProps<{
  /** 场景说明（透传给后端 system prompt，如「值日」） */
  context?: string
  /** 场景快捷提问（不传用通用 4 条） */
  quick?: string[]
}>()

interface ChatMsg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
  reasoning?: string
}
interface AIStatus {
  configured: boolean
  provider?: string
  model?: string
}

const TOOL_LABELS: Record<string, string> = {
  query_database: '查询站点数据库',
  web_search: '联网搜索',
  save_memory: '保存记忆'
}

const DEFAULT_QUICK = ['本周有什么活动？', '查一下最近的公告', '我这周的值日安排', '帮我记住：我偏好简洁的回答']
const quick = props.quick?.length ? props.quick : DEFAULT_QUICK

const fabVisible = ref(false)
const open = ref(false)
const status = ref<AIStatus | null>(null)
const loaded = ref(false)
const messages = ref<ChatMsg[]>([])
const busy = ref(false)
const streamText = ref('')
const toolChips = ref<string[]>([])
const thinkText = ref('')
const draft = ref('')
const listRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

let stopCtl: AbortController | null = null

/* 思考/联网偏好与 AI 助手页共享（localStorage），浮窗只读跟随 */
function prefs() {
  const model = status.value?.model || ''
  return {
    thinking: localStorage.getItem('ai_think') === '1' && model.startsWith('deepseek'),
    webSearch: localStorage.getItem('ai_web') === '1' && !!status.value?.webSearch
  }
}

async function loadAll() {
  try {
    status.value = await apiGet<AIStatus>('/api/ai/status')
  } catch {
    fabVisible.value = false
    return
  }
  fabVisible.value = !!status.value?.configured
  if (!fabVisible.value) return
  try {
    const r = await apiGet<{ messages: ChatMsg[] }>('/api/ai/messages')
    messages.value = r.messages || []
  } catch {
    /* ⚠️ /api/ai/status 是公开接口（未登录也 200），登录态只能在这里探：
       messages 401 = 未登录 → 连悬浮球一起藏掉，否则游客点开全是失败请求 */
    fabVisible.value = false
    messages.value = []
    return
  }
  loaded.value = true
  scrollBottom()
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    if (!loaded.value) loadAll()
    nextTick(() => inputRef.value?.focus())
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false
    e.stopPropagation()
  }
}

function scrollBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function onEnter(e: KeyboardEvent) {
  e.preventDefault()
  send()
}

/* ── 发送（SSE 流式，逻辑与 AI 助手页一致） ── */
async function send(text?: string) {
  const msg = (text ?? draft.value).trim()
  if (!msg || busy.value || !status.value?.configured) return
  draft.value = ''
  messages.value.push({ role: 'user', content: msg })
  busy.value = true
  streamText.value = ''
  toolChips.value = []
  thinkText.value = ''
  scrollBottom()

  stopCtl = new AbortController()
  let gotError = ''
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: msg, ...prefs(), context: props.context || '' }),
      signal: stopCtl.signal
    })
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(j?.error || `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let streaming = true
    while (streaming) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i).trim()
        buf = buf.slice(i + 2)
        if (!raw.startsWith('data:')) continue
        const payload = JSON.parse(raw.slice(5).trim()) as {
          delta?: string
          reasoning?: string
          reset?: boolean
          tool?: { name: string }
          error?: string
          done?: boolean
        }
        if (payload.reset) streamText.value = ''
        else if (payload.reasoning) {
          thinkText.value += payload.reasoning
          scrollBottom()
        } else if (payload.delta) {
          streamText.value += payload.delta
          scrollBottom()
        } else if (payload.tool) {
          toolChips.value.push(TOOL_LABELS[payload.tool.name] || payload.tool.name)
        } else if (payload.error) {
          gotError = payload.error
        } else if (payload.done) {
          streaming = false
        }
      }
    }
    if (gotError) throw new Error(gotError)
    if (streamText.value) {
      messages.value.push({ role: 'assistant', content: streamText.value, tools: toolChips.value.slice(), reasoning: thinkText.value || undefined })
    } else if (!toolChips.value.length) {
      throw new Error('AI 没有返回内容，请重试')
    }
  } catch (e) {
    const err = e as Error
    if (err.name !== 'AbortError') console.warn('[ai-widget]', err.message)
  } finally {
    busy.value = false
    streamText.value = ''
    toolChips.value = []
    thinkText.value = ''
    stopCtl = null
    scrollBottom()
  }
}

function stop() {
  stopCtl?.abort()
}

onMounted(() => {
  loadAll()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopCtl?.abort()
})
</script>

<style>
/* ══════════ 页内 AI 浮窗（全部自带样式，.aiw-* 前缀不与页面冲突） ══════════ */
.aiw-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 9600;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--md-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(13, 33, 55, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.aiw-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(13, 33, 55, 0.45);
}

.aiw-panel {
  position: fixed;
  right: 16px;
  bottom: 84px;
  z-index: 9601;
  width: min(400px, calc(100vw - 32px));
  height: min(620px, calc(100dvh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--card-stroke);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.aiw-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--card-stroke);
  color: var(--text-primary);
  flex: none;
}
.aiw-head-title {
  font-size: 13.5px;
  font-weight: 600;
}
.aiw-head-model {
  font-size: 11px;
  color: var(--text-tertiary);
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
  border-radius: 99px;
  padding: 2px 8px;
}
.aiw-close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.aiw-close:hover {
  background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
}

.aiw-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.aiw-empty {
  margin: auto;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
.aiw-empty p {
  margin: 8px 0 0;
}

.aiw-msg {
  display: flex;
}
.aiw-msg.user {
  justify-content: flex-end;
}
.aiw-msg-col {
  max-width: 86%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.aiw-msg.user .aiw-msg-col {
  align-items: flex-end;
}
.aiw-bubble {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.65;
  background: var(--card-bg);
  border: 1px solid var(--card-stroke);
  color: var(--text-primary);
  word-break: break-word;
}
.aiw-msg.assistant .aiw-bubble {
  background: color-mix(in srgb, var(--md-primary) 5%, var(--card-bg));
}
.aiw-msg.user .aiw-bubble {
  background: var(--md-primary);
  border-color: var(--md-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.aiw-msg.assistant .aiw-bubble {
  border-bottom-left-radius: 4px;
}
.aiw-bubble pre.ai-code {
  background: color-mix(in srgb, var(--text-primary) 8%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  overflow-x: auto;
  font-size: 12px;
  margin: 6px 0;
}
.aiw-bubble code.ai-inline {
  background: color-mix(in srgb, var(--text-primary) 8%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
.aiw-msg.user .aiw-bubble code.ai-inline {
  background: rgba(255, 255, 255, 0.18);
}
.aiw-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.aiw-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--md-primary);
  background: color-mix(in srgb, var(--md-primary) 10%, transparent);
  border-radius: 99px;
  padding: 2px 9px;
}
.aiw-think {
  font-size: 11.5px;
  color: var(--text-tertiary);
  max-width: 100%;
}
.aiw-think summary {
  cursor: pointer;
  user-select: none;
}
.aiw-think-body {
  white-space: pre-wrap;
  margin-top: 5px;
  padding: 6px 9px;
  border-left: 2px solid var(--card-stroke);
  max-height: 160px;
  overflow-y: auto;
  line-height: 1.6;
}
.aiw-bubble-typing {
  display: inline-flex;
  padding: 10px 14px;
}
.aiw-typing {
  display: inline-flex;
  gap: 4px;
}
.aiw-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: aiw-blink 1.2s infinite;
}
.aiw-typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.aiw-typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes aiw-blink {
  0%,
  60%,
  100% {
    opacity: 0.3;
  }
  30% {
    opacity: 1;
  }
}

.aiw-quick {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 0;
}
.aiw-quick button {
  border: 1px solid var(--card-stroke);
  background: var(--card-bg);
  color: var(--text-secondary);
  border-radius: 99px;
  font-size: 11.5px;
  padding: 4px 11px;
  cursor: pointer;
}
.aiw-quick button:hover:not(:disabled) {
  border-color: var(--md-primary);
  color: var(--md-primary);
}
.aiw-quick button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aiw-input-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
}
.aiw-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--card-stroke);
  background: color-mix(in srgb, var(--text-primary) 4%, var(--card-bg));
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}
.aiw-input:focus {
  border-color: var(--md-primary);
}
.aiw-input:disabled {
  opacity: 0.5;
}
.aiw-send {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--md-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.aiw-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .aiw-panel {
    right: 12px;
    left: 12px;
    width: auto;
    bottom: 84px;
    height: min(560px, calc(100dvh - 110px));
  }
}
</style>
