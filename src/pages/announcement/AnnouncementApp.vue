<template>
  <YaliShell current="announcement" title="公告详情">
    <div class="yali-page yali-detail-page">
      <div v-if="loading" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!item" class="yali-loading">
        <TextBlock Text="公告不存在或已被删除" class="yali-muted" />
        <Button @Click="go('announcements.html')">
          <span class="yali-btn-inner">
            <FontIcon :Glyph="GLYPH.back" :FontSize="14" /><span>返回公告列表</span>
          </span>
        </Button>
      </div>

      <article v-else class="yali-section">
        <header class="ad-head">
          <TextBlock :Text="item.title" :FontSize="22" :FontWeight="600" TextWrapping="Wrap" />
          <span v-if="item.status && item.status !== '已通过'" class="yali-chip yali-chip-warn">
            {{ item.status }}
          </span>
          <!-- 作者 / 管理员：编辑（回列表页带 ?edit=id 打开编辑器）与删除 -->
          <div v-if="canManageItem" class="ad-head-actions">
            <Button @Click="editItem">
              <span class="yali-btn-inner"><span>编辑</span></span>
            </Button>
            <Button @Click="removeItem">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
              </span>
            </Button>
          </div>
        </header>

        <div class="yali-item-meta ad-meta">
          <span>{{ item.created_by }}</span>
          <span>{{ formatTime(item.created_at) }}</span>
        </div>

        <p v-if="item.reject_reason" class="yali-item-note">审核意见：{{ item.reject_reason }}</p>

        <div class="ad-content">{{ item.content }}</div>

        <!-- 两段式图片：详情接口只给 has_image -->
        <div v-if="images.length" class="yali-img-row">
          <img v-for="(u, i) in images" :key="i" :src="toBlobUrl(u)" alt="公告图片"
               @click="openLightbox(toBlobUrl(u))" />
        </div>
        <div v-else-if="item.has_image && !imagesLoaded" class="yali-img-skeleton" aria-hidden="true">
          <div class="yali-shimmer"></div>
        </div>

        <!-- 评论 -->
        <section class="ad-comments">
          <TextBlock :Text="'评论 (' + comments.length + ')'" :FontSize="15" :FontWeight="600" />

          <p v-if="!comments.length" class="yali-muted ad-comment-empty">暂无评论</p>
          <div v-for="c in comments" :key="c.id" class="yali-comment">
            <div class="yali-comment-head">
              <span class="yali-comment-author">{{ c.created_by }}</span>
              <span>{{ formatTime(c.created_at) }}</span>
            </div>

            <template v-if="editingId === c.id">
              <TextBox v-model:Text="editDraft" AcceptsReturn :MaxLength="500" class="ad-edit" />
              <div class="yali-comment-actions">
                <Button @Click="saveEdit(c)">
                  <span class="yali-btn-inner"><span>保存</span></span>
                </Button>
                <Button @Click="cancelEdit">
                  <span class="yali-btn-inner"><span>取消</span></span>
                </Button>
              </div>
            </template>
            <template v-else>
              <p class="yali-comment-text">{{ c.content }}</p>
              <div v-if="canEditComment(c) || canDeleteComment(c)" class="yali-comment-actions">
                <!-- 编辑只允许作者本人（后端 comments.js 口径），管理员点了必然 403 -->
                <Button v-if="canEditComment(c)" @Click="startEdit(c)">
                  <span class="yali-btn-inner"><span>编辑</span></span>
                </Button>
                <Button v-if="canDeleteComment(c)" @Click="remove(c)">
                  <span class="yali-btn-inner"><span>删除</span></span>
                </Button>
              </div>
            </template>
          </div>

          <div v-if="user" class="ad-comment-form">
            <TextBox v-model:Text="draft" PlaceholderText="写下评论…" :MaxLength="500" AcceptsReturn />
            <Button :Style="'{StaticResource AccentButtonStyle}'"
                    :IsEnabled="!!draft.trim()" @Click="post">
              <span class="yali-btn-inner"><span>发表</span></span>
            </Button>
          </div>
          <p v-else class="yali-muted">
            请<Button class="yali-inline-btn" @Click="go('login.html')">
              <span class="yali-btn-inner"><span>登录</span></span>
            </Button>后评论
          </p>
        </section>
      </article>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import {
  apiDel,
  apiGet,
  apiPost,
  apiPut,
  formatTime,
  getUser,
  isAdmin,
  legacy,
  openLightbox,
  toBlobUrl,
  toast,
  confirmDialog
} from '../../shared/api'
import { checkAuth } from '../../shared/guard'

interface Announcement {
  id: number
  title: string
  content: string
  status?: string
  created_by: string
  created_at: string
  reject_reason?: string
  has_image?: 0 | 1
}
interface Comment {
  id: number
  created_by: string
  content: string
  created_at: string
}

const user = ref(getUser())
const admin = isAdmin()

const item = ref<Announcement | null>(null)
const loading = ref(true)
const images = ref<string[]>([])
const imagesLoaded = ref(false)

const comments = ref<Comment[]>([])
const draft = ref('')
const editingId = ref<number | null>(null)
const editDraft = ref('')

const id = new URLSearchParams(window.location.search).get('id')

async function load() {
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    item.value = await apiGet<Announcement>(`/api/announcements/${id}`)
    /* 成就：阅览室常客 / 时间旅行者 / 考古学家 */
    checkViewAchievements(item.value)
    loadComments()
    loadImages()
  } catch (err) {
    toast((err as Error).message, 'error')
    item.value = null
  } finally {
    loading.value = false
  }
}

/* 详情接口是 v2 瘦身结构（只有 has_image），图片按需再取 */
async function loadImages() {
  if (!item.value?.has_image) {
    imagesLoaded.value = true
    return
  }
  try {
    const map = await apiGet<Record<string, string[]>>(
      `/api/announcements/images?ids=${item.value.id}`
    )
    images.value = map?.[item.value.id] ?? []
  } catch {
    images.value = []
  } finally {
    imagesLoaded.value = true
  }
}

function checkViewAchievements(a: Announcement) {
  const unlock = (key: string) => {
    const fn = (window as unknown as {
      unlockAchievement?: (i: string) => Promise<unknown>
    }).unlockAchievement
    const toastFn = (window as unknown as {
      showAchievementToast?: (i: string) => void
    }).showAchievementToast
    fn?.(key).then((ok) => {
      if (ok) toastFn?.(key)
    })
  }

  /* 阅览室常客：累计查看 50 条公告 */
  const viewed = Number(localStorage.getItem('_annViewed') || 0) + 1
  localStorage.setItem('_annViewed', String(viewed))
  if (viewed >= 50) {
    localStorage.removeItem('_annViewed')
    unlock('reader')
  }

  /* 时间旅行者 90 天 / 考古学家 180 天 */
  const t = new Date(a.created_at.replace(' ', 'T') + (a.created_at.endsWith('Z') ? '' : '+08:00'))
  if (isNaN(t.getTime())) return
  const days = (Date.now() - t.getTime()) / 86400000
  if (days >= 180) unlock('archaeologist')
  else if (days >= 90) unlock('time_traveler')
}

async function loadComments() {
  if (!id) return
  try {
    comments.value = await apiGet<Comment[]>(`/api/comments/announcement/${id}`)
  } catch {
    comments.value = []
  }
}

/** 改评论：仅作者本人（后端 comments.js 只放行作者，admin 也会 403） */
function canEditComment(c: Comment) {
  const u = user.value
  return !!u && u.name === c.created_by
}

/** 删评论：作者本人，或管理员 / 站长 */
function canDeleteComment(c: Comment) {
  const u = user.value
  return !!u && (u.name === c.created_by || u.role === 'admin' || u.role === 'owner')
}

/** 改 / 删这条公告：作者本人，或管理员 / 站长（与后端 announcements.js 一致） */
const canManageItem = computed(() => {
  const u = user.value
  const a = item.value
  if (!u || !a) return false
  return u.name === a.created_by || u.role === 'admin' || u.role === 'owner'
})

function startEdit(c: Comment) {
  editingId.value = c.id
  editDraft.value = c.content
}

function cancelEdit() {
  editingId.value = null
  editDraft.value = ''
}

async function saveEdit(c: Comment) {
  const content = editDraft.value.trim()
  if (!content || content.length > 500) return toast('评论内容为1-500字', 'error')
  try {
    const updated = await apiPut<Comment>(`/api/comments/${c.id}`, { content })
    const i = comments.value.findIndex((x) => x.id === c.id)
    if (i >= 0) comments.value[i] = updated
    cancelEdit()
    toast('评论已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function remove(c: Comment) {
  if (!(await confirmDialog({ title: '确认删除', message: '确定删除此评论吗？', danger: true }))) return
  try {
    await apiDel(`/api/comments/${c.id}`)
    comments.value = comments.value.filter((x) => x.id !== c.id)
    toast('评论已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function post() {
  const content = draft.value.trim()
  if (!content) return
  if (content.length > 500) return toast('评论内容为1-500字', 'error')
  try {
    const created = await apiPost<Comment>('/api/comments', {
      target_type: 'announcement',
      target_id: Number(id),
      content
    })
    comments.value.push(created)
    draft.value = ''
    toast('评论已发表', 'success')
    // 旧版在发表后跑一次成就检查（公告评论数成就）
    legacy.checkCountAchievements?.()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/** 编辑：回列表页并用 ?edit=<id> 打开编辑器（旧版就是跳 announcements.html?edit=id） */
function editItem() {
  if (!item.value) return
  window.location.href = `announcements.html?edit=${item.value.id}`
}

async function removeItem() {
  if (!item.value) return
  if (!(await confirmDialog({ title: '确认删除', message: '确定删除此公告吗？此操作不可撤销。', danger: true }))) return
  try {
    await apiDel(`/api/announcements/${item.value.id}`)
    toast('公告已删除', 'success')
    window.location.href = 'announcements.html'
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function go(href: string) {
  window.location.href = href
}

onMounted(async () => {
  // 与旧版 announcement.js 一致：先 checkAuth（会刷新用户并触发班级补填）
  await checkAuth()
  await load()
})
</script>

<style>
.yali-detail-page {
  max-width: 860px;
}
.ad-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}
.ad-head-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex: none;
}
.ad-meta {
  margin-top: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--stroke-divider);
}
.ad-content {
  margin-top: 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.ad-comments {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--stroke-divider);
}
.ad-comment-empty {
  margin-top: 12px;
}
.ad-edit {
  margin-top: 6px;
  min-height: 60px;
}
.ad-comment-form {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-top: 16px;
}
.ad-comment-form > :first-child {
  flex: 1;
  min-width: 0;
  min-height: 64px;
}
</style>
