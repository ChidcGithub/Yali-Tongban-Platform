<template>
  <YaliShell current="moment" title="动态">
    <div class="yali-page">
      <div v-if="loading && !items.length" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!items.length" class="yali-loading">
        <FontIcon :Glyph="GLYPH.moment" :FontSize="28" class="yali-muted-icon" />
        <TextBlock Text="暂无动态" class="yali-muted" />
      </div>

      <div v-else class="feed-list">
        <article v-for="m in items" :key="m.id" class="feed-item"
                 :class="{ 'is-linkable': feedLink(m) }" @click="openLink(m)">
          <div class="feed-icon">
            <FontIcon :Glyph="feedGlyph(m)" :FontSize="16" />
          </div>
          <div class="feed-body">
            <p class="feed-content">{{ m.content }}</p>
            <div class="feed-meta">
              <span>{{ formatTime(m.created_at) }}</span>
              <span v-if="sysData(m)?.status" class="yali-chip">{{ sysData(m).status }}</span>
            </div>

            <div class="feed-actions">
              <Button @Click.stop="toggleComments(m)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.feedback" :FontSize="14" />
                  <span>评论{{ commentCount(m.id) ? ' (' + commentCount(m.id) + ')' : '' }}</span>
                </span>
              </Button>
              <Button v-if="admin" @Click.stop="removeItem(m)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                </span>
              </Button>
            </div>

            <div v-if="openComments[m.id]" class="feed-comments">
              <div v-if="commentsLoading[m.id]" class="yali-muted">加载中…</div>
              <template v-else>
                <p v-if="!(comments[m.id] || []).length" class="yali-muted">暂无评论</p>
                <div v-for="c in comments[m.id] || []" :key="c.id" class="yali-comment">
                  <div class="yali-comment-head">
                    <span class="yali-comment-author">{{ c.created_by }}</span>
                    <span>{{ formatTime(c.created_at) }}</span>
                  </div>
                  <p class="yali-comment-text">{{ c.content }}</p>
                </div>
              </template>

              <div v-if="user" class="feed-comment-form">
                <TextBox v-model:Text="draft[m.id]" PlaceholderText="写下你的评论…" :MaxLength="500" />
                <Button :IsEnabled="!!(draft[m.id] || '').trim()" @Click.stop="submitComment(m)">
                  <span class="yali-btn-inner"><span>发送</span></span>
                </Button>
              </div>
              <p v-else class="yali-muted">请登录后评论</p>
            </div>
          </div>
        </article>

        <!-- 无限滚动哨兵 -->
        <div ref="sentinel" class="feed-sentinel"></div>
        <div v-if="hasMore" class="yali-loading feed-loading">
          <ProgressRing v-if="loading" :IsActive="true" :Width="24" :Height="24" />
          <TextBlock v-else Text="继续向下滚动加载更多" class="yali-muted" />
        </div>
        <p v-else class="yali-muted feed-end">没有更多了</p>
      </div>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, formatTime, getUser, isAdmin, toast } from '../../shared/api'

interface FeedItem {
  id: number
  type?: string
  content: string
  created_at: string
  system_data?: string
  ref_type?: string
  ref_id?: number
}
interface FeedComment {
  id: number
  created_by: string
  content: string
  created_at: string
}

const user = ref(getUser())
const admin = isAdmin()

const items = ref<FeedItem[]>([])
const loading = ref(false)
const hasMore = ref(true)
const nextCursor = ref<string | number | null>(null)

/** ref_type → 图标字形 */
const FEED_GLYPHS: Record<string, string> = {
  finance: GLYPH.finance,
  activity: GLYPH.activities,
  issue: GLYPH.services,
  announcement: GLYPH.announcements,
  poll: GLYPH.polls,
  user: GLYPH.person
}

function feedGlyph(m: FeedItem) {
  return FEED_GLYPHS[m.ref_type ?? ''] ?? GLYPH.moment
}

/** ref_type → 跳转目标 */
function feedLink(m: FeedItem): string | null {
  // 与原页面一致：通知类条目不作为跳转入口
  if (m.type === 'notification') return null
  switch (m.ref_type) {
    case 'finance':
      return 'finance.html'
    case 'activity':
      return 'activities.html'
    case 'issue':
      return 'services.html'
    case 'announcement':
      return `announcement.html?id=${m.ref_id}`
    case 'poll':
      return `poll.html?id=${m.ref_id}`
    case 'user':
      return 'admin.html'
    default:
      return null
  }
}

function sysData(m: FeedItem): Record<string, string> {
  if (!m.system_data) return {}
  try {
    return JSON.parse(m.system_data)
  } catch {
    return {}
  }
}

/* ── 拉取（游标分页） ── */
async function loadFeed(initial = false) {
  if (loading.value || (!initial && !hasMore.value)) return
  loading.value = true
  try {
    const url = initial
      ? '/api/chat/messages?limit=20'
      : `/api/chat/messages?before=${nextCursor.value}&limit=20`
    const data = await apiGet<{
      messages?: FeedItem[]
      nextCursor?: string | number | null
      hasMore?: boolean
    }>(url)

    const list = data.messages ?? []
    items.value = initial ? list : [...items.value, ...list]
    nextCursor.value = data.nextCursor ?? null
    hasMore.value = data.hasMore ?? false
    if (items.value.length && items.value[0].id) newestId.value = items.value[0].id
  } catch (err) {
    toast((err as Error).message, 'error')
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

/* ── 每 30 秒拉取新动态（沿用原页面做法；切到后台时暂停） ── */
const newestId = ref<number | null>(null)
let pollTimer: number | undefined

function schedulePoll() {
  window.clearTimeout(pollTimer)
  pollTimer = window.setTimeout(async () => {
    try {
      if (newestId.value) {
        const data = await apiGet<{ messages?: FeedItem[] }>(
          `/api/chat/messages?after=${newestId.value}&limit=20`
        )
        const fresh = data.messages ?? []
        if (fresh.length) {
          items.value = [...fresh, ...items.value]
          // 后端的 after 分支是「先升序取再 reverse」，因此 messages[0] 才是最新一条
          newestId.value = fresh[0].id ?? newestId.value
        }
      }
    } catch {
      /* 静默：轮询失败不打扰用户 */
    }
    schedulePoll()
  }, 30000)
}

function stopPoll() {
  window.clearTimeout(pollTimer)
  pollTimer = undefined
}

function onVisibilityChange() {
  if (document.hidden) stopPoll()
  else if (!pollTimer) schedulePoll()
}

/* ── 无限滚动 ── */
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  loadFeed(true)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore.value && !loading.value) {
        loadFeed(false)
      }
    },
    { rootMargin: '200px' }
  )
  if (sentinel.value) observer.observe(sentinel.value)

  schedulePoll()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopPoll()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

/* ── 评论 ── */
const openComments = reactive<Record<number, boolean>>({})
const comments = reactive<Record<number, FeedComment[]>>({})
const commentsLoading = reactive<Record<number, boolean>>({})
const draft = reactive<Record<number, string>>({})

function commentCount(id: number) {
  return (comments[id] || []).length
}

async function toggleComments(m: FeedItem) {
  const open = !openComments[m.id]
  openComments[m.id] = open
  if (open && !comments[m.id]) await loadComments(m.id)
}

async function loadComments(id: number) {
  commentsLoading[id] = true
  try {
    comments[id] = await apiGet<FeedComment[]>(`/api/feed/${id}/comments`)
  } catch {
    comments[id] = []
    toast('评论加载失败', 'error')
  } finally {
    commentsLoading[id] = false
  }
}

async function submitComment(m: FeedItem) {
  const content = (draft[m.id] || '').trim()
  if (!content) return
  if (content.length > 200) return toast('评论最多 200 字', 'error')
  try {
    const created = await apiPost<FeedComment>(`/api/feed/${m.id}/comment`, { content })
    if (!comments[m.id]) comments[m.id] = []
    comments[m.id].push(created)
    draft[m.id] = ''
    toast('评论已发表', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeItem(m: FeedItem) {
  if (!window.confirm('确定删除这条动态吗？')) return
  try {
    await apiDel(`/api/chat/messages/${m.id}`)
    items.value = items.value.filter((x) => x.id !== m.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function openLink(m: FeedItem) {
  const href = feedLink(m)
  if (href) window.location.href = href
}
</script>

<style>
.feed-list {
  display: flex;
  flex-direction: column;
}
.feed-item {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--stroke-divider);
}
.feed-item.is-linkable {
  cursor: pointer;
}
.feed-item.is-linkable:hover .feed-content {
  color: var(--accent-base);
}
.feed-icon {
  flex: none;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--subtle-secondary);
  color: var(--accent-base);
}
.feed-body {
  min-width: 0;
  flex: 1;
}
.feed-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.feed-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.feed-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.feed-comments {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--subtle-secondary);
}
.feed-comment-form {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.feed-comment-form > :first-child {
  flex: 1;
  min-width: 0;
}
.feed-sentinel {
  height: 1px;
}
.feed-loading {
  padding: 20px 0;
}
.feed-end {
  text-align: center;
  padding: 20px 0;
}
</style>
