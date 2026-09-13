<template>
  <YaliShell current="announcements" title="公告">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="查看团委最新公告" />
      </header>

      <section class="yali-section">
        <div class="yali-section-head">
          <TextBlock Text="公告列表" :FontSize="18" :FontWeight="600" />
          <div class="yali-head-tools">
            <AutoSuggestBox v-model:Text="keyword" PlaceholderText="搜索标题或内容"
                            QueryIcon="Find" class="yali-search" @TextChanged="onSearchChanged" />
            <SelectorBar v-if="admin" :Items="filterItems" :SelectedItem="selectedFilterItem"
                         @SelectionChanged="onFilterChanged" />
          </div>
        </div>

        <div v-if="loading" class="yali-loading">
          <ProgressRing :IsActive="true" :Width="32" :Height="32" />
          <TextBlock Text="加载中…" class="yali-muted" />
        </div>

        <div v-else-if="loadError" class="yali-loading">
          <TextBlock :Text="loadError" class="yali-muted" />
          <Button @Click="loadList">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.refresh" :FontSize="14" /><span>重试</span>
            </span>
          </Button>
        </div>

        <div v-else-if="visibleList.length === 0" class="yali-loading">
          <FontIcon :Glyph="GLYPH.announcements" :FontSize="28" class="yali-muted-icon" />
          <TextBlock Text="暂无公告" class="yali-muted" />
        </div>

        <ListView v-else :ItemsSource="visibleList" SelectionMode="None" class="yali-list">
          <template #item="{ item }">
            <div class="yali-item">
              <div class="yali-item-head">
                <TextBlock :Text="item.title" class="yali-item-title" TextWrapping="Wrap" />
                <div class="yali-item-actions">
                  <span v-if="isNew(item)" class="yali-chip yali-chip-new">NEW</span>
                  <span v-if="item.status && item.status !== '已通过'" class="yali-chip">{{ item.status }}</span>
                  <Button v-if="canEdit(item)" @Click="openEditor(item)">
                    <span class="yali-btn-inner"><span>编辑</span></span>
                  </Button>
                  <Button v-if="canEdit(item)" @Click="remove(item)">
                    <span class="yali-btn-inner">
                      <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                    </span>
                  </Button>
                </div>
              </div>

              <TextBlock :Text="item.content" TextWrapping="Wrap" class="yali-item-body" />

              <!-- 两段式图片：列表接口只给 has_image，图片按批异步取回；
                   未到达时先显示扫光占位，全部解码就绪后一次性替换 -->
              <div v-if="imageMap[item.id] && imageMap[item.id].length" class="yali-img-row">
                <img v-for="(url, i) in imageMap[item.id]" :key="i" :src="toBlobUrl(url)"
                     alt="公告图片" @click="openLightbox(toBlobUrl(url))" />
              </div>
              <div v-else-if="item.has_image" class="yali-img-skeleton" aria-hidden="true">
                <div class="yali-shimmer"></div>
              </div>

              <div class="yali-item-meta">
                <span>{{ item.created_by }}</span>
                <span>{{ formatTime(item.created_at) }}</span>
              </div>

              <Expander class="yali-comments"
                        :Header="'评论 (' + (item.comment_count || 0) + ')'"
                        :HeaderIcon="GLYPH.feedback"
                        @Expanding="loadComments(item)">
                <div class="yali-comment-body">
                  <div v-if="commentsLoading[item.id]" class="yali-muted">加载中…</div>
                  <template v-else>
                    <p v-if="!(comments[item.id] || []).length" class="yali-muted">暂无评论</p>
                    <div v-for="c in comments[item.id] || []" :key="c.id" class="yali-comment">
                      <div class="yali-comment-head">
                        <span class="yali-comment-author">{{ c.created_by }}</span>
                        <span class="yali-comment-time">{{ formatTime(c.created_at) }}</span>
                      </div>
                      <p class="yali-comment-text">{{ c.content }}</p>
                      <div v-if="canEditComment(c)" class="yali-comment-actions">
                        <Button @Click="removeComment(item, c)">
                          <span class="yali-btn-inner"><span>删除</span></span>
                        </Button>
                      </div>
                    </div>
                  </template>

                  <div v-if="user" class="yali-comment-form">
                    <TextBox v-model:Text="commentDraft[item.id]" PlaceholderText="写下评论…"
                             AcceptsReturn class="yali-comment-input" />
                    <Button :IsEnabled="!!(commentDraft[item.id] || '').trim()"
                            class="yali-comment-submit" @Click="postComment(item)">
                      <span class="yali-btn-inner"><span>发表</span></span>
                    </Button>
                  </div>
                  <p v-else class="yali-muted">
                    请<Button @Click="go('login.html')" class="yali-inline-btn"><span class="yali-btn-inner"><span>登录</span></span></Button>后评论
                  </p>
                </div>
              </Expander>
            </div>
          </template>
        </ListView>
      </section>
    </div>

    <button v-if="user" class="yali-fab" type="button" aria-label="发布公告" @click="openEditor()">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- 发布 / 编辑（图片选择为 WinUIonWeb 缺失控件，沿用原生 input） -->
    <ContentDialog
      :IsOpen="editorOpen"
      :Title="editing ? '编辑公告' : '发布公告'"
      CloseButtonText="取消"
      @update:IsOpen="editorOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">标题 <em>*</em></span>
          <TextBox v-model:Text="draft.title" PlaceholderText="公告标题" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">正文 <em>*</em></span>
          <TextBox v-model:Text="draft.content" PlaceholderText="公告内容" AcceptsReturn
                   TextWrapping="Wrap" class="yali-textarea" />
        </label>
        <div class="yali-field">
          <span class="yali-field-label">图片（选填，可多选）</span>
          <input type="file" accept="image/*" multiple @change="onPickFiles" />
          <div v-if="draft.previews.length" class="yali-form-previews">
            <img v-for="(p, i) in draft.previews" :key="i" :src="p" alt="" @click="dropFile(i)" />
          </div>
          <span v-if="draft.previews.length" class="yali-muted">点击图片可移除</span>
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="editorOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="save">
            <span class="yali-btn-inner"><span>{{ saving ? '提交中…' : '保存' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
  toast
} from '../../shared/api'

interface Announcement {
  id: number
  title: string
  content: string
  status?: string
  created_by: string
  created_at: string
  comment_count?: number
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

/* ── 列表 ── */
const list = ref<Announcement[]>([])
const loading = ref(true)
const loadError = ref('')
const keyword = ref('')

const FILTERS = [
  { Text: '已通过', Tag: 'approved' },
  { Text: '待审核', Tag: 'pending' },
  { Text: '全部', Tag: 'all' }
]
const filterItems = FILTERS
const activeFilter = ref('approved')
const selectedFilterItem = computed(() => FILTERS.find((f) => f.Tag === activeFilter.value))

function onFilterChanged(args: { SelectedItem?: { Tag?: string } }) {
  const tag = args?.SelectedItem?.Tag
  if (tag) activeFilter.value = tag
}

function onSearchChanged() {
  /* keyword 直接参与下面的 computed 过滤 */
}

const visibleList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return list.value.filter((a) => {
    const approved = !a.status || a.status === '已通过'
    if (activeFilter.value === 'approved' && !approved) return false
    if (activeFilter.value === 'pending' && approved) return false
    if (!kw) return true
    return (
      a.title.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw)
    )
  })
})

function isNew(a: Announcement) {
  return Date.now() - new Date(a.created_at).getTime() < 86400000
}

function canEdit(a: Announcement) {
  const u = user.value
  return !!u && (u.name === a.created_by || u.role === 'admin' || u.role === 'owner')
}

async function loadList() {
  loading.value = true
  loadError.value = ''
  try {
    // 版本 2：列表结构为 has_image 标记（无 image_url 全文），结构变更需递增
    const fetcher = legacy.fetchWithCache
    if (fetcher) {
      await fetcher(
        '/api/announcements',
        () => apiGet<Announcement[]>('/api/announcements'),
        (data) => {
          list.value = data as Announcement[]
        },
        2
      )
    } else {
      list.value = await apiGet<Announcement[]>('/api/announcements')
    }
    loadImagesLazy()
  } catch (err) {
    loadError.value = '加载失败：' + (err as Error).message
  } finally {
    loading.value = false
  }
}

/* ── 两段式图片加载（沿用站点既有策略：每批 4 条） ── */
const imageMap = reactive<Record<number, string[]>>({})

async function loadImagesLazy() {
  const pending = list.value
    .filter((a) => a.has_image && !(a.id in imageMap))
    .map((a) => a.id)

  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4)
    let map: Record<string, string[]> = {}
    try {
      map = await apiGet<Record<string, string[]>>(
        `/api/announcements/images?ids=${batch.join(',')}`
      )
    } catch {
      map = {}
    }
    for (const id of batch) {
      const urls = map?.[id]
      imageMap[id] = Array.isArray(urls) ? urls : []
    }
  }
}

/* ── 评论 ── */
const comments = reactive<Record<number, Comment[]>>({})
const commentsLoading = reactive<Record<number, boolean>>({})
const commentDraft = reactive<Record<number, string>>({})

async function loadComments(a: Announcement) {
  if (comments[a.id]) return
  commentsLoading[a.id] = true
  try {
    comments[a.id] = await apiGet<Comment[]>(`/api/comments/announcement/${a.id}`)
  } catch {
    comments[a.id] = []
    toast('评论加载失败', 'error')
  } finally {
    commentsLoading[a.id] = false
  }
}

function canEditComment(c: Comment) {
  const u = user.value
  return !!u && (u.name === c.created_by || u.role === 'admin' || u.role === 'owner')
}

async function postComment(a: Announcement) {
  const content = (commentDraft[a.id] || '').trim()
  if (!content) return
  if (content.length > 500) return toast('评论内容为1-500字', 'error')
  try {
    const created = await apiPost<Comment>('/api/comments', {
      target_type: 'announcement',
      target_id: a.id,
      content
    })
    if (!comments[a.id]) comments[a.id] = []
    comments[a.id].push(created)
    commentDraft[a.id] = ''
    a.comment_count = (a.comment_count || 0) + 1
    toast('评论已发表', 'success')
    legacy.checkCountAchievements?.()
    legacy.checkNovice?.()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeComment(a: Announcement, c: Comment) {
  if (!window.confirm('确定删除此评论吗？')) return
  try {
    await apiDel(`/api/comments/${c.id}`)
    comments[a.id] = (comments[a.id] || []).filter((x) => x.id !== c.id)
    a.comment_count = Math.max(0, (a.comment_count || 1) - 1)
    toast('评论已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 发布 / 编辑 ── */
const editorOpen = ref(false)
const saving = ref(false)
const editing = ref<Announcement | null>(null)
const draft = reactive({
  title: '',
  content: '',
  files: [] as File[],
  previews: [] as string[]
})

function openEditor(item?: Announcement) {
  editing.value = item ?? null
  draft.title = item?.title ?? ''
  draft.content = item?.content ?? ''
  draft.files = []
  draft.previews = []
  editorOpen.value = true
}

function onPickFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  for (const f of picked) {
    draft.files.push(f)
    const reader = new FileReader()
    reader.onload = () => draft.previews.push(String(reader.result))
    reader.readAsDataURL(f)
  }
  input.value = ''
}

function dropFile(index: number) {
  draft.files.splice(index, 1)
  draft.previews.splice(index, 1)
}

async function compress(file: File): Promise<string> {
  const raw = await readAsDataUrl(file)
  const fn = (window as unknown as { compressImage?: (d: string) => Promise<string> }).compressImage
  return fn ? fn(raw) : raw
}

async function save() {
  if (!draft.title.trim() || !draft.content.trim()) {
    return toast('标题与正文为必填', 'error')
  }
  saving.value = true
  try {
    const uploaded: string[] = []
    for (const f of draft.files) uploaded.push(await compress(f))

    if (editing.value) {
      const keep = imageMap[editing.value.id] ?? []
      const data = await apiPut<{ image_url?: string }>(
        `/api/announcements/${editing.value.id}`,
        { title: draft.title, content: draft.content, image_urls: [...keep, ...uploaded] }
      )
      imageMap[editing.value.id] = uploaded.length ? [...keep, ...uploaded] : keep
      editing.value.title = draft.title
      editing.value.content = draft.content
      editing.value.has_image = imageMap[editing.value.id].length ? 1 : 0
      void data
      toast('公告已更新', 'success')
    } else {
      const created = await apiPost<{ id: number }>('/api/announcements', {
        title: draft.title,
        content: draft.content,
        image_urls: []
      })
      for (const url of uploaded) {
        await apiPost(`/api/announcements/${created.id}/images`, { image_url: url })
      }
      // 直接登记已上传的图片，省去回读详情（详情接口已是 v2 瘦身结构）
      imageMap[created.id] = uploaded
      list.value.unshift({
        id: created.id,
        title: draft.title,
        content: draft.content,
        status: '待审核',
        created_by: getUser()?.name ?? '',
        created_at: new Date().toISOString(),
        comment_count: 0,
        has_image: uploaded.length ? 1 : 0
      })
      toast('公告已提交，等待审核', 'success')
    }
    editorOpen.value = false
    legacy.checkNovice?.()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

function readAsDataUrl(file: File): Promise<string> {
  const fn = (window as unknown as { fileToDataUrl?: (f: File) => Promise<string> }).fileToDataUrl
  if (fn) return fn(file)
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

async function remove(a: Announcement) {
  if (!window.confirm('确定删除此公告吗？')) return
  try {
    await apiDel(`/api/announcements/${a.id}`)
    list.value = list.value.filter((x) => x.id !== a.id)
    delete imageMap[a.id]
    toast('公告已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function go(href: string) {
  window.location.href = href
}

watch(editorOpen, (open) => {
  if (open) return
  editing.value = null
})

onMounted(loadList)
</script>

<style>
.yali-page {
  padding: 24px 36px 96px;
  max-width: 1000px;
}
.yali-page-head {
  margin-bottom: 8px;
}
.yali-page-desc {
  display: block;
  color: var(--text-secondary);
}
.yali-section {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--card-stroke);
  border-radius: 8px;
  background: var(--card-bg);
}
.yali-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.yali-head-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.yali-search {
  width: 240px;
}
.yali-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 0;
}
.yali-muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.yali-muted-icon {
  color: var(--text-tertiary);
}
.yali-list {
  width: 100%;
}
.yali-item {
  width: 100%;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.yali-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.yali-item-title {
  font-size: 15px;
  font-weight: 500;
}
.yali-item-body {
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.yali-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.yali-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--subtle-secondary);
  color: var(--text-secondary);
}
.yali-chip-new {
  background: var(--accent-base);
  color: var(--accent-text);
}
.yali-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 图片区 */
.yali-img-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.yali-img-row img {
  max-height: 180px;
  max-width: 100%;
  border-radius: 4px;
  cursor: pointer;
}
.yali-img-skeleton {
  margin-top: 4px;
  height: 180px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--subtle-tertiary);
}
/* 扫光占位：与站点既有的 .g-skeleton 视觉一致，这里自带一份，
   使 WinUI 页面不依赖旧设计系统的样式表 */
.yali-shimmer {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--subtle-secondary) 50%,
    transparent 100%
  );
  animation: yali-shimmer-slide 1.4s linear infinite;
}
@keyframes yali-shimmer-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 评论 */
.yali-comments {
  margin-top: 6px;
}
.yali-comment-body {
  padding: 8px 0 4px;
}
.yali-comment {
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
}
.yali-comment-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.yali-comment-author {
  color: var(--text-primary);
  font-weight: 500;
}
.yali-comment-text {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.yali-comment-actions {
  margin-top: 6px;
}
.yali-comment-form {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.yali-comment-input {
  flex: 1;
  min-width: 0;
}

.yali-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent-border);
  border-radius: 50%;
  background: var(--accent-base);
  color: var(--accent-text);
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
.yali-fab:hover {
  background: var(--accent-hover);
}

/* 表单 */
.yali-btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.yali-inline-btn {
  vertical-align: middle;
}
.yali-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 420px;
  max-width: 560px;
}
.yali-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.yali-field-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.yali-field-label em {
  color: var(--accent-base);
  font-style: normal;
}
.yali-textarea {
  min-height: 120px;
}
.yali-form-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.yali-form-previews img {
  max-height: 110px;
  border-radius: 4px;
  cursor: pointer;
}
.yali-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

@media (max-width: 640px) {
  .yali-page {
    padding: 16px 16px 96px;
  }
  .yali-search {
    width: 100%;
  }
  .yali-form {
    min-width: 0;
  }
  .yali-fab {
    right: 16px;
    bottom: 16px;
  }
}
</style>
