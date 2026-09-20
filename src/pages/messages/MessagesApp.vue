<template>
  <YaliShell current="messages" title="消息">
    <div class="yali-page">
      <div class="yali-section-head msg-head">
        <div class="msg-head-left">
          <SelectorBar :Items="tabs" :SelectedItem="selectedTab" @SelectionChanged="onTabChanged" />
        </div>
        <div class="yali-head-tools">
          <Button :IsEnabled="unread > 0" @Click="markAllRead">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.check" :FontSize="14" /><span>全部已读</span>
            </span>
          </Button>
          <Button @Click="clearRead">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>清空已读</span>
            </span>
          </Button>
        </div>
      </div>

      <div v-if="loading && !items.length" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!items.length" class="yali-loading">
        <FontIcon :Glyph="GLYPH.bell" :FontSize="28" class="yali-muted-icon" />
        <TextBlock Text="暂无消息" class="yali-muted" />
      </div>

      <ListView v-else :ItemsSource="items" SelectionMode="None" class="yali-list">
        <template #item="{ item }">
          <div class="msg-item" :class="{ 'is-unread': !item.is_read }" @click="openMessage(item)">
            <div class="msg-icon" :style="{ color: metaOf(item).color }">
              <FontIcon :Glyph="metaOf(item).glyph" :FontSize="16" />
            </div>
            <div class="msg-body">
              <div class="msg-title-row">
                <span class="msg-title">{{ item.title }}</span>
                <span v-if="!item.is_read" class="msg-dot" aria-label="未读"></span>
              </div>
              <p v-if="item.body" class="msg-text">{{ item.body }}</p>
              <div class="msg-meta">
                <span class="msg-type" :style="{ color: metaOf(item).color }">{{ metaOf(item).label }}</span>
                <span>{{ relativeTime(item.created_at) }}</span>
              </div>
            </div>
            <button class="msg-del" type="button" title="删除" @click.stop="removeOne(item)">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="13" />
            </button>
          </div>
        </template>
      </ListView>

      <div v-if="items.length < total" class="msg-more">
        <Button :IsEnabled="!loading" @Click="loadMore">
          <span class="yali-btn-inner"><span>{{ loading ? '加载中…' : '加载更多' }}</span></span>
        </Button>
      </div>

      <p v-if="items.length" class="yali-muted msg-foot">
        共 {{ total }} 条，当前显示 {{ items.length }} 条
      </p>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, formatTime, toast, confirmDialog} from '../../shared/api'

interface Message {
  id: number
  type: string
  icon?: string
  title: string
  body?: string
  link?: string
  is_read?: boolean
  created_at: string
}

/** 类型元数据：标签、颜色、字形（沿用原 messages.js 的分类） */
const TYPE_META: Record<string, { label: string; color: string; glyph: string }> = {
  system: { label: '系统', color: 'var(--accent-base)', glyph: GLYPH.admin },
  announcement: { label: '公告', color: 'var(--accent-base)', glyph: GLYPH.announcements },
  review_result: { label: '审核', color: '#0f7b0f', glyph: GLYPH.check },
  issue_status: { label: '报修', color: '#9d5d00', glyph: GLYPH.services },
  finance_update: { label: '财务', color: 'var(--accent-base)', glyph: GLYPH.finance },
  comment_reply: { label: '评论', color: 'var(--accent-base)', glyph: GLYPH.feedback },
  activity_invite: { label: '活动', color: 'var(--accent-base)', glyph: GLYPH.activities },
  duty: { label: '值日', color: 'var(--accent-base)', glyph: GLYPH.duty }
}

const FALLBACK = { label: '通知', color: 'var(--text-secondary)', glyph: GLYPH.bell }
function metaOf(m: Message) {
  return TYPE_META[m.type] ?? FALLBACK
}

/* ── 筛选标签 ── */
const TABS = [
  { Text: '全部', Tag: 'all' },
  ...Object.entries(TYPE_META).map(([Tag, v]) => ({ Text: v.label, Tag }))
]
const tabs = TABS
const type = ref('all')
const selectedTab = computed(() => TABS.find((t) => t.Tag === type.value) ?? TABS[0])

function onTabChanged(args: { SelectedItem?: { Tag?: string } }) {
  const tag = args?.SelectedItem?.Tag
  if (!tag || tag === type.value) return
  type.value = tag
  reset()
}

/* ── 列表与分页 ── */
const LIMIT = 20
const items = ref<Message[]>([])
const total = ref(0)
const unread = ref(0)
const loading = ref(false)
const offset = ref(0)

async function fetchPage(append: boolean) {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (type.value !== 'all') params.set('type', type.value)
    params.set('offset', String(offset.value))
    params.set('limit', String(LIMIT))
    const data = await apiGet<{
      messages?: Message[]
      items?: Message[]
      total?: number
      unread?: number
    }>(`/api/messages?${params.toString()}`)

    const list = data.messages ?? data.items ?? []
    items.value = append ? [...items.value, ...list] : list
    total.value = data.total ?? items.value.length
    if (typeof data.unread === 'number') unread.value = data.unread
    offset.value = items.value.length
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function reset() {
  offset.value = 0
  items.value = []
  return fetchPage(false)
}

async function loadMore() {
  if (loading.value) return
  await fetchPage(true)
}

/* ── 操作 ── */
async function openMessage(m: Message) {
  if (!m.is_read) {
    try {
      await apiPost(`/api/messages/${m.id}/read`)
      m.is_read = true
      unread.value = Math.max(0, unread.value - 1)
    } catch {
      /* 标记失败不阻塞跳转 */
    }
  }
  if (m.link) window.location.href = m.link
}

async function markAllRead() {
  try {
    await apiPost('/api/messages/read-all', type.value !== 'all' ? { type: type.value } : {})
    // 后端是按 user_id (+type) 在**全库**更新的，本地只翻已加载的那几条会算不准未读数
    // —— 直接重新拉一次，用服务端返回的 total / unread 覆盖（旧版 messages.js 就是这么做的）
    offset.value = 0
    await fetchPage(false)
    toast('已全部标为已读', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function clearRead() {
  if (!(await confirmDialog({ title: '确认清空', message: '确定清空已读消息吗？此操作不可撤销。', danger: true, countdown: 5 }))) return
  try {
    await apiDel('/api/messages')
    offset.value = 0
    await fetchPage(false)
    toast('已清空已读消息', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeOne(m: Message) {
  try {
    await apiDel(`/api/messages/${m.id}`)
    items.value = items.value.filter((x) => x.id !== m.id)
    total.value = Math.max(0, total.value - 1)
    if (!m.is_read) unread.value = Math.max(0, unread.value - 1)
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* 相对时间（沿用原 messages.js 的口径） */
function relativeTime(t: string) {
  if (!t) return ''
  const d = new Date(t.replace(' ', 'T') + (t.endsWith('Z') ? '' : '+08:00'))
  if (isNaN(d.getTime())) return t
  const diff = Date.now() - d.getTime()
  if (diff < 0) return '刚刚'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return formatTime(t).slice(5, 16)
}

onMounted(() => reset())
</script>

<style>
.msg-head {
  margin-top: 0;
}
.msg-item {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
  padding: 12px 0;
  cursor: pointer;
}
.msg-item:hover {
  background: var(--subtle-secondary);
}
.msg-icon {
  flex: none;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--subtle-secondary);
}
.msg-body {
  min-width: 0;
  flex: 1;
}
.msg-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.msg-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.msg-item.is-unread .msg-title {
  font-weight: 600;
}
.msg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-base);
  flex: none;
}
.msg-text {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.msg-meta {
  display: flex;
  gap: 10px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.msg-type {
  font-weight: 500;
}
.msg-del {
  flex: none;
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 4px;
}
.msg-del:hover {
  background: var(--subtle-tertiary);
  color: var(--text-primary);
}
.msg-more {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
.msg-foot {
  margin-top: 12px;
  text-align: center;
}
</style>
