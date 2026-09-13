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
                 :class="{ 'is-linkable': feedLink(m), 'feed-item-notification': isNotice(m) }"
                 @click="openLink(m)">
          <div v-if="!isNotice(m)" class="feed-icon">
            <FontIcon :Glyph="feedGlyph(m)" :FontSize="16" />
          </div>
          <div class="feed-body">
            <p class="feed-content">{{ m.content }}</p>
            <div class="feed-meta">
              <span>{{ formatTime(m.created_at) }}</span>
              <span v-if="sysData(m)?.status" class="yali-chip">{{ sysData(m).status }}</span>
            </div>

            <!-- 通知类条目（type=notification / 「任命」系统消息）没有评论区：
                 后端 handleAddFeedComment 只接受 type='system' 的目标，硬发必 404 -->
            <div v-if="!isNotice(m)" class="feed-actions">
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

            <!-- 阻止冒泡：点评论输入框不该触发卡片跳转（旧版显式排除了这些区域） -->
            <div v-if="!isNotice(m) && openComments[m.id]" class="feed-comments" @click.stop>
              <div v-if="commentsLoading[m.id]" class="yali-muted">加载中…</div>
              <template v-else>
                <p v-if="!(comments[m.id] || []).length" class="yali-muted">暂无评论</p>
                <div v-for="c in comments[m.id] || []" :key="c.id" class="yali-comment">
                  <div class="yali-comment-head">
                    <span class="yali-comment-author">{{ c.user_name }}</span>
                    <span>{{ formatTime(c.created_at) }}</span>
                  </div>
                  <p class="yali-comment-text">{{ c.content }}</p>
                </div>
              </template>

              <div v-if="user" class="feed-comment-form">
                <TextBox v-model:Text="draft[m.id]" PlaceholderText="写下你的评论…" :MaxLength="200" />
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
import { apiDel, apiGet, apiPost, formatTime, getUser, isAdmin, toast, confirmDialog} from '../../shared/api'

interface FeedItem {
  id: number
  type?: string
  content: string
  created_at: string
  /** 序列化的 JSON：{ action, from_dept, to_dept, title, status, ref_type, ref_id }
      —— chat_messages 表本身**没有** ref_type / ref_id 列（见 schema.sql） */
  system_data?: string
}
interface FeedComment {
  id: number
  /** feed_comments 表的作者列名是 user_name，不是 created_by */
  user_name: string
  content: string
  created_at: string
}

const user = ref(getUser())
const admin = isAdmin()

const items = ref<FeedItem[]>([])
const loading = ref(false)
const hasMore = ref(true)
const nextCursor = ref<string | number | null>(null)

/** ref_type → 图标字形（对齐旧版 moment.js 的 FEED_ICONS） */
const FEED_GLYPHS: Record<string, string> = {
  finance: GLYPH.finance,
  activity: GLYPH.activities,
  issue: GLYPH.services,
  announcement: GLYPH.announcements,
  poll: GLYPH.polls,
  achievement: GLYPH.star,
  user: GLYPH.person
}

/** 通知类条目：type=notification，或「任命」系统消息 —— 旧版对它们用另一种排版且无评论区 */
function isNotice(m: FeedItem) {
  if (m.type === 'notification') return true
  return m.type === 'system' && sysData(m).action === '任命'
}

function feedGlyph(m: FeedItem) {
  return FEED_GLYPHS[sysData(m).ref_type ?? ''] ?? GLYPH.moment
}

/** ref_type → 跳转目标（ref_type / ref_id 都住在 system_data 里） */
function feedLink(m: FeedItem): string | null {
  if (isNotice(m)) return null
  const d = sysData(m)
  switch (d.ref_type) {
    case 'finance':
      return 'finance.html'
    case 'activity':
      return 'activities.html'
    case 'issue':
      return 'services.html'
    case 'announcement':
      return `announcement.html?id=${d.ref_id}`
    case 'poll':
      return `poll.html?id=${d.ref_id}`
    case 'user':
      return 'admin.html'
    default:
      return null
  }
}

function sysData(m: FeedItem): Record<string, string> {
  if (!m.system_data) return {}
  try {
    const d = JSON.parse(m.system_data)
    return d && typeof d === 'object' ? d : {}
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

onMounted(async () => {
  restoreOpenComments()
  await loadFeed(true)
  // 恢复出来的展开项要补拉评论（旧版也是在渲染后按 _openComments 补齐）
  for (const id of Object.keys(openComments).map(Number)) {
    if (openComments[id] && !comments[id]) await loadComments(id)
  }
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
/** 展开状态持久化到 sessionStorage（旧版 moment.js 的 feed_openComments），
    刷新页面后仍保持展开 —— 否则每刷新一次就要重新点开 */
const OPEN_KEY = 'feed_openComments'
const openComments = reactive<Record<number, boolean>>({})
const comments = reactive<Record<number, FeedComment[]>>({})
const commentsLoading = reactive<Record<number, boolean>>({})
const draft = reactive<Record<number, string>>({})

function restoreOpenComments() {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Record<string, boolean>
    for (const [id, open] of Object.entries(saved || {})) {
      if (open) openComments[Number(id)] = true
    }
  } catch {
    /* 存储不可用就当作没有 */
  }
}

function saveOpenComments() {
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify({ ...openComments }))
  } catch {
    /* 忽略 */
  }
}

function commentCount(id: number) {
  return (comments[id] || []).length
}

async function toggleComments(m: FeedItem) {
  const open = !openComments[m.id]
  openComments[m.id] = open
  saveOpenComments()
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
    // 后端只返回 { message: '评论成功' }，**不含**新评论对象 ——
    // 直接 push 那个响应会往列表里塞一条「空作者 + 空内容」的鬼影评论。
    await apiPost(`/api/feed/${m.id}/comment`, { content })
    draft[m.id] = ''
    await loadComments(m.id)
    toast('评论已发表', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeItem(m: FeedItem) {
  if (!(await confirmDialog({ title: '确认删除', message: '确定删除这条动态吗？', danger: true }))) return
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
/* 通知类条目没有图标列，靠左侧竖线区分 */
.feed-item-notification {
  padding-left: 10px;
  border-left: 3px solid var(--accent-base);
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
