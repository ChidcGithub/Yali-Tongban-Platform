<template>
  <YaliShell current="ai" title="AI 助手">
    <div class="yali-page ai-page">
      <header class="yali-page-head ai-head">
        <div>
          <TextBlock class="ai-title" Text="AI 助手" />
          <TextBlock class="yali-page-desc" Text="能查站点数据、联网搜索、记住你的偏好 —— 仅你自己可见" />
        </div>
        <div class="yali-head-tools">
          <button v-if="status?.configured" class="ai-chip-btn" type="button" @click="openMemories">
            <FontIcon :Glyph="GLYPH.about" :FontSize="13" />
            <span>记忆 {{ memories.length }}</span>
          </button>
          <Button :IsEnabled="messages.length > 0" @Click="clearConversation">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="14" />
              <span>清空对话</span>
            </span>
          </Button>
        </div>
      </header>

      <!-- 未配置：给管理员的开通指引 -->
      <div v-if="status && !status.configured" class="ai-setup yali-section">
        <p class="ai-setup-title">
          <FontIcon :Glyph="GLYPH.about" :FontSize="15" />
          AI 服务尚未配置
        </p>
        <p>
          在 Cloudflare Pages 项目的环境变量里设置 <code>AI_API_KEY</code>（OpenAI 兼容接口，
          如智谱开放平台的 Key，默认走 <code>open.bigmodel.cn</code>、模型 <code>glm-4-flash</code>；
          可用 <code>AI_BASE_URL</code> / <code>AI_MODEL</code> 覆盖），或在项目设置里绑定
          Workers AI（<code>env.AI</code>，零密钥）。保存后重新部署即可生效。
        </p>
        <Button @Click="loadStatus">
          <span class="yali-btn-inner"><FontIcon :Glyph="GLYPH.refresh" :FontSize="13" /><span>重新检测</span></span>
        </Button>
      </div>

      <!-- 聊天卡片 -->
      <section v-show="status === null || status.configured" class="ai-chat yali-section">
        <div ref="listRef" class="ai-messages">
          <!-- 空状态 -->
          <div v-if="!messages.length && !busy" class="ai-empty">
            <FontIcon :Glyph="GLYPH.ai" :FontSize="42" />
            <p class="ai-empty-title">有什么可以帮你？</p>
            <p class="ai-empty-desc">可以问站点的活动、公告、值日、财务，也可以让我帮你查资料、记事情。</p>
          </div>

          <!-- 历史 -->
          <div v-for="(m, i) in messages" :key="i" class="ai-msg" :class="m.role">
            <div class="ai-msg-col">
              <div v-if="m.tools && m.tools.length" class="ai-tools">
                <span v-for="(t, j) in m.tools" :key="j" class="ai-tool-chip">{{ t }}</span>
              </div>
              <div class="ai-bubble" v-html="render(m.content)"></div>
            </div>
          </div>

          <!-- 本轮流式回复 -->
          <div v-if="busy" class="ai-msg assistant">
            <div>
              <div v-if="toolChips.length" class="ai-tools">
                <span v-for="(t, i) in toolChips" :key="i" class="ai-tool-chip">
                  <FontIcon :Glyph="GLYPH.refresh" :FontSize="11" />
                  {{ t }}
                </span>
              </div>
              <div v-if="streamText" class="ai-bubble" v-html="render(streamText)"></div>
              <div v-else class="ai-bubble ai-bubble-typing">
                <span class="ai-typing"><span></span><span></span><span></span></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 快捷提问 -->
        <div class="ai-quick">
          <button v-for="q in QUICK" :key="q" type="button" :disabled="busy" @click="send(q)">{{ q }}</button>
        </div>

        <!-- 输入区 -->
        <div class="ai-composer">
          <TextBox
            ref="composerRef"
            v-model:Text="draft"
            class="ai-input"
            :PlaceholderText="configured ? '问点什么…（Enter 发送）' : ''"
            :MaxLength="2000"
            :IsEnabled="configured && !busy"
          />
          <Button v-if="!busy" class="ai-send" :Style="'{StaticResource AccentButtonStyle}'"
                  :IsEnabled="configured && !!draft.trim()" @Click="send()">
            <span class="yali-btn-inner"><FontIcon :Glyph="GLYPH.forward" :FontSize="14" /><span>发送</span></span>
          </Button>
          <Button v-else class="ai-send" :IsEnabled="true" @Click="stop">
            <span class="yali-btn-inner"><FontIcon :Glyph="GLYPH.close" :FontSize="14" /><span>停止</span></span>
          </Button>
        </div>
      </section>

      <p class="ai-foot-hint">AI 生成内容仅供参考，请以站点实际数据与官方通知为准。</p>
    </div>

    <!-- 记忆管理 -->
    <ContentDialog :IsOpen="memOpen" Title="AI 关于你的记忆" @update:IsOpen="memOpen = $event">
      <p class="ai-mem-hint">
        这些记忆只属于你（存在站点数据库里，别的用户看不到）。AI 每次对话都会参考它们；清空后 AI 将不再记得。
      </p>
      <div v-if="memories.length" class="ai-mem-list">
        <div v-for="m in memories" :key="m.id" class="ai-mem-item">
          <p class="ai-mem-text">{{ m.content }}</p>
          <span class="ai-mem-time">{{ m.created_at }}</span>
        </div>
      </div>
      <p v-else class="ai-mem-empty">还没有记忆。对话里说「帮我记住…」或表达长期偏好时，AI 会自动记下。</p>
      <div v-if="memories.length" class="yali-form-actions">
        <Button :IsEnabled="!clearingMem" @Click="clearMemories">
          <span class="yali-btn-inner"><span>{{ clearingMem ? '清空中…' : '清空全部记忆' }}</span></span>
        </Button>
        <Button :Style="'{StaticResource AccentButtonStyle}'" @Click="memOpen = false">
          <span class="yali-btn-inner"><span>关闭</span></span>
        </Button>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, toast } from '../../shared/api'
import { confirmDialog } from '../../shared/confirm'
import { requireAuth } from '../../shared/guard'

interface ChatMsg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
}
interface AIMemory {
  id: number
  content: string
  created_at: string
}
interface AIStatus {
  configured: boolean
  provider?: string
  model?: string
  tools?: boolean
  webSearch?: boolean
}

const QUICK = ['本周有什么活动？', '查一下最近的公告', '我这周的值日安排', '帮我记住：我偏好简洁的回答']

const TOOL_LABELS: Record<string, string> = {
  query_database: '查询站点数据库',
  web_search: '联网搜索',
  save_memory: '保存记忆'
}

const user = ref<{ id?: number } | null>(null)
const status = ref<AIStatus | null>(null)
const messages = ref<ChatMsg[]>([])
const memories = ref<AIMemory[]>([])
const draft = ref('')
const busy = ref(false)
const streamText = ref('')
const toolChips = ref<string[]>([])
const memOpen = ref(false)
const clearingMem = ref(false)
const listRef = ref<HTMLElement | null>(null)
const composerRef = ref<{ $el?: HTMLElement } | null>(null)

const configured = computed(() => !!status.value?.configured)

async function loadStatus() {
  try {
    status.value = await apiGet<AIStatus>('/api/ai/status')
  } catch {
    status.value = { configured: false }
  }
}

async function loadMessages() {
  try {
    const r = await apiGet<{ messages: ChatMsg[] }>('/api/ai/messages')
    messages.value = r.messages || []
  } catch {
    messages.value = []
  }
}

async function loadMemories() {
  try {
    const r = await apiGet<{ memories: AIMemory[] }>('/api/ai/memories')
    memories.value = r.memories || []
  } catch {
    memories.value = []
  }
}

function scrollBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/* ── 发送（SSE 流式） ── */
let stopCtl: AbortController | null = null

async function send(text?: string) {
  const msg = (text ?? draft.value).trim()
  if (!msg || busy.value || !configured.value) return
  draft.value = ''
  messages.value.push({ role: 'user', content: msg })
  busy.value = true
  streamText.value = ''
  toolChips.value = []
  scrollBottom()

  stopCtl = new AbortController()
  let gotError = ''
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: msg }),
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
          reset?: boolean
          tool?: { name: string }
          error?: string
          done?: boolean
        }
        if (payload.reset) streamText.value = ''
        else if (payload.delta) {
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
      // 工具调用记录随消息保留（原先流结束即清空，用户看不到 AI 用了什么工具）
      messages.value.push({ role: 'assistant', content: streamText.value, tools: toolChips.value.slice() })
    } else if (!toolChips.value.length) {
      throw new Error('AI 没有返回内容，请重试')
    }
  } catch (e) {
    const err = e as Error
    if (err.name !== 'AbortError') toast(err.message || '发送失败', 'error')
    else if (streamText.value) toast('已停止生成', 'info')
    // 流式途中出错的半截内容不保留（服务端只在完整回答后落库）
  } finally {
    busy.value = false
    streamText.value = ''
    toolChips.value = []
    stopCtl = null
    scrollBottom()
  }
}

function stop() {
  stopCtl?.abort()
}

/* ── 清空对话 ── */
async function clearConversation() {
  if (!(await confirmDialog({ title: '清空对话', message: '确定清空与 AI 助手的全部对话吗？清空后无法恢复。', danger: true }))) return
  try {
    await apiDel('/api/ai/messages')
    messages.value = []
    toast('对话已清空', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 记忆 ── */
function openMemories() {
  memOpen.value = true
}

async function clearMemories() {
  if (!(await confirmDialog({ title: '清空记忆', message: `确定清空全部 ${memories.value.length} 条记忆吗？AI 将不再记得这些内容。`, danger: true }))) return
  clearingMem.value = true
  try {
    await apiDel('/api/ai/memories')
    memories.value = []
    toast('记忆已清空', 'success')
    memOpen.value = false
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    clearingMem.value = false
  }
}

/* ── 轻量 Markdown（先整体转义再渲染，无 XSS 面；只做站点用得到的子集） ── */
function render(src: string): string {
  let s = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/```([\s\S]*?)```/g, (_m, c: string) => `<pre class="ai-code">${c.replace(/^\n+|\n+$/g, '')}</pre>`)
  s = s.replace(/`([^`\n]+)`/g, '<code class="ai-inline">$1</code>')
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/^\s{0,3}[-*]\s+(.+)$/gm, '<li>$1</li>')
  s = s.replace(/^\s{0,3}\d+\.\s+(.+)$/gm, '<li>$1</li>')
  s = s.replace(/\n/g, '<br>')
  return s
}

function onComposerKey(e: Event) {
  const ke = e as KeyboardEvent
  if (ke.key === 'Enter' && !ke.shiftKey) {
    ke.preventDefault()
    send()
  }
}

onMounted(async () => {
  const me = await requireAuth()
  if (!me) return
  user.value = me

  // Enter 发送。⚠️ TextBox 组件不发 KeyDown 事件（内部 onKeydown 会 preventDefault
  // 掉 Enter 的默认行为），必须监听底层原生 input —— $el 是 .win-textbox 根 div。
  await nextTick()
  const root = composerRef.value?.$el as HTMLElement | undefined
  const input = (root?.tagName === 'INPUT' ? root : root?.querySelector('input')) as HTMLInputElement | null
  input?.addEventListener('keydown', onComposerKey)

  await Promise.all([loadStatus(), loadMessages(), loadMemories()])
  scrollBottom()
})
</script>

<style>
/* 页面收窄成阅读列：1400px 全宽下聊天气泡会被拉得太散 */
.ai-page {
  max-width: 860px;
  margin-inline: auto;
}
.ai-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ai-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 聊天卡片：撑满剩余高度 */
.ai-chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 250px);
  min-height: 420px;
  padding: 0;
}
.ai-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.ai-msg {
  display: flex;
  margin-bottom: 12px;
}
.ai-msg.user {
  justify-content: flex-end;
}
.ai-msg-col {
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.ai-msg.user .ai-msg-col {
  align-items: flex-end;
}
.ai-bubble {
  max-width: 82%;
  padding: 10px 13px;
  border-radius: 10px;
  font-size: 13.5px;
  line-height: 1.65;
  word-break: break-word;
  color: var(--text-primary);
}
.ai-msg.assistant .ai-bubble {
  background: var(--card-bg);
  border: 1px solid var(--card-stroke);
}
.ai-msg.user .ai-bubble {
  background: var(--md-primary);
  color: #fff;
}
.ai-bubble pre.ai-code {
  margin: 6px 0;
  padding: 9px 11px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
  overflow-x: auto;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.5;
}
.ai-bubble code.ai-inline {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}
.ai-msg.user .ai-bubble code.ai-inline {
  background: rgba(255, 255, 255, 0.16);
}

/* 工具调用提示 */
.ai-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.ai-tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  padding: 3px 10px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
  color: var(--md-primary);
}

/* 打字动画 */
.ai-typing {
  display: inline-flex;
  gap: 4px;
  padding: 4px 2px;
}
.ai-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: ai-blink 1.2s infinite;
}
.ai-typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.ai-typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes ai-blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}

/* 空状态 */
.ai-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 20px;
}
.ai-empty .win-font-icon {
  color: var(--md-primary);
  opacity: 0.7;
}
.ai-empty-title {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}
.ai-empty-desc {
  margin: 0;
  font-size: 13px;
  max-width: 420px;
}

/* 快捷提问 */
.ai-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--card-stroke);
}
.ai-quick button {
  border: 1px solid var(--card-stroke);
  background: var(--card-bg);
  border-radius: 99px;
  padding: 6px 13px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.ai-quick button:hover:not(:disabled) {
  border-color: var(--md-primary);
  color: var(--md-primary);
}
.ai-quick button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 输入区 */
.ai-composer {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--card-stroke);
  align-items: center;
}
.ai-composer .ai-input {
  flex: 1 1 auto;
  min-width: 0;
}
.ai-send {
  flex: 0 0 auto;
}
.ai-foot-hint {
  margin: 10px 2px 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 未配置指引 */
.ai-setup {
  border-color: color-mix(in srgb, var(--md-error) 30%, transparent);
}
.ai-setup-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-weight: 600;
  color: var(--md-error);
}
.ai-setup p {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.ai-setup code {
  font-family: Consolas, monospace;
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}

/* 记忆对话框 */
.ai-mem-hint {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.ai-mem-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.ai-mem-item {
  padding: 9px 12px;
  border-radius: 6px;
  background: var(--subtle-secondary, rgba(0, 0, 0, 0.03));
}
.ai-mem-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
}
.ai-mem-time {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.ai-mem-empty {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* 头部记忆入口 */
.ai-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 99px;
  border: 1px solid var(--card-stroke);
  background: var(--card-bg);
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
}
.ai-chip-btn:hover {
  border-color: var(--md-primary);
  color: var(--md-primary);
}

@media (max-width: 640px) {
  .ai-chat {
    height: calc(100vh - 230px);
  }
  .ai-bubble {
    max-width: 92%;
  }
}
</style>
