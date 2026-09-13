<template>
  <YaliShell current="services" title="服务">
    <div class="yali-page">
      <!-- 标题由 NavigationView 的 Header 承担，这里只放副标题，避免重复 -->
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="提交报修问题或反馈，无需登录即可提交" />
      </header>

      <!-- ── 最新公告横幅 ── -->
      <section v-if="bannerItems.length" class="yali-section">
        <ScrollViewer HorizontalScrollMode="Auto" HorizontalScrollBarVisibility="Auto"
                      VerticalScrollMode="Disabled" VerticalScrollBarVisibility="Hidden">
          <div class="yali-banner-row">
            <button v-for="item in bannerItems" :key="item.key" class="yali-banner-card"
                    type="button" @click="openBanner(item)">
              <span class="yali-banner-caption">
                <FontIcon :Glyph="GLYPH.announcements" :FontSize="13" />
                <span>{{ item.label }}</span>
              </span>
              <span class="yali-banner-title">{{ item.title }}</span>
              <span class="yali-banner-body">{{ item.body }}</span>
              <span class="yali-banner-meta">{{ item.meta }}</span>
            </button>
          </div>
        </ScrollViewer>
      </section>

      <!-- ── 问题反馈 ── -->
      <section class="yali-section">
        <div class="yali-section-head">
          <TextBlock Text="问题反馈" :FontSize="18" :FontWeight="600" />
          <SelectorBar :Items="filterItems" :SelectedItem="selectedFilterItem"
                       @SelectionChanged="onFilterChanged" />
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="yali-loading">
          <ProgressRing :IsActive="true" :Width="32" :Height="32" />
          <TextBlock Text="加载中…" class="yali-muted" />
        </div>

        <!-- 加载失败 -->
        <div v-else-if="loadError" class="yali-loading">
          <TextBlock :Text="loadError" class="yali-muted" />
          <Button @Click="loadIssues">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.refresh" :FontSize="14" />
              <span>重试</span>
            </span>
          </Button>
        </div>

        <!-- 空状态 -->
        <div v-else-if="filteredIssues.length === 0" class="yali-loading">
          <FontIcon :Glyph="GLYPH.services" :FontSize="28" class="yali-muted-icon" />
          <TextBlock Text="暂无问题反馈" class="yali-muted" />
        </div>

        <!-- 工单列表 -->
        <ListView v-else :ItemsSource="filteredIssues" SelectionMode="None" class="yali-list">
          <template #item="{ item }">
            <div class="yali-item">
              <!-- 状态由下方状态按钮体现（InfoBadge 只接受数字，不适合放状态文字） -->
              <div class="yali-item-head">
                <TextBlock :Text="item.location" class="yali-item-title" TextWrapping="Wrap" />
              </div>

              <TextBlock :Text="item.description" TextWrapping="Wrap" class="yali-item-body" />

              <div v-if="item.notes" class="yali-item-note">
                <TextBlock :Text="'备注：' + item.notes" TextWrapping="Wrap" />
              </div>

              <!-- 两段式图片：列表接口只给 has_image，图片按批异步取回；
                   未到达时先显示扫光占位（与公告页同一策略） -->
              <div v-if="issueImageMap[item.id] && issueImageMap[item.id].length" class="yali-item-media">
                <img :src="toBlobUrl(issueImageMap[item.id][0])" alt="问题图片"
                     class="yali-item-img" @click="openLightbox(toBlobUrl(issueImageMap[item.id][0]))" />
              </div>
              <div v-else-if="item.has_image" class="yali-img-skeleton" aria-hidden="true">
                <div class="yali-shimmer"></div>
              </div>

              <div class="yali-item-meta">
                <!-- submitted_by 只对已登录用户返回（未登录时后端不暴露） -->
                <span v-if="item.submitted_by">提交人：{{ item.submitted_by }}</span>
                <span v-else>匿名提交</span>
                <span>{{ formatTime(item.created_at) }}</span>
                <span v-if="item.updated_by">最后处理：{{ item.updated_by }}</span>
              </div>

              <!-- 管理员操作 -->
              <div v-if="canManage" class="yali-item-actions">
                <Button v-for="s in STATUSES" :key="s" @Click="changeStatus(item, s)"
                        :Style="item.status === s ? '{StaticResource AccentButtonStyle}' : ''">
                  <span class="yali-btn-inner"><span>{{ s }}</span></span>
                </Button>
                <Button v-if="admin" @Click="removeIssue(item)">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.delete" :FontSize="14" />
                    <span>删除</span>
                  </span>
                </Button>
              </div>

              <!-- 评论 -->
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
                      <template v-if="editingCommentId === c.id">
                        <TextBox v-model:Text="editCommentDraft" :MaxLength="500" AcceptsReturn
                                 class="yali-comment-input" />
                        <div class="yali-comment-actions">
                          <Button @Click="saveCommentEdit(item, c)">
                            <span class="yali-btn-inner"><span>保存</span></span>
                          </Button>
                          <Button @Click="cancelCommentEdit">
                            <span class="yali-btn-inner"><span>取消</span></span>
                          </Button>
                        </div>
                      </template>
                      <template v-else>
                        <p class="yali-comment-text">{{ c.content }}</p>
                        <div v-if="canEditComment(c) || canDeleteComment(c)" class="yali-comment-actions">
                          <Button v-if="canEditComment(c)" @Click="startCommentEdit(c)">
                            <span class="yali-btn-inner"><span>编辑</span></span>
                          </Button>
                          <Button v-if="canDeleteComment(c)" @Click="removeComment(item, c)">
                            <span class="yali-btn-inner"><span>删除</span></span>
                          </Button>
                        </div>
                      </template>
                    </div>
                  </template>

                  <div v-if="user" class="yali-comment-form">
                    <TextBox v-model:Text="commentDraft[item.id]" PlaceholderText="写下评论…" :MaxLength="500"
                             AcceptsReturn class="yali-comment-input" />
                    <Button class="yali-comment-submit" @Click="postComment(item)"
                            :IsEnabled="!!(commentDraft[item.id] || '').trim()">
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

    <!-- ── 浮动提交按钮 ── -->
    <button class="yali-fab" type="button" aria-label="提交问题" @click="dialogOpen = true">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- ── 提交问题对话框 ──
         验证码与图片上传是 WinUIonWeb 没有的控件，按约定沿用站点现有实现 -->
    <ContentDialog
      :IsOpen="dialogOpen"
      Title="提交问题"
      CloseButtonText="取消"
      @update:IsOpen="dialogOpen = $event">
      <div class="yali-form">
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">地点 <em>*</em></span>
            <TextBox v-model:Text="form.location" PlaceholderText="如：教学楼3楼301" :MaxLength="200" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">联系方式</span>
            <TextBox v-model:Text="form.contact" PlaceholderText="选填，方便反馈" :MaxLength="100" />
          </label>
        </div>

        <label class="yali-field">
          <span class="yali-field-label">报修问题 <em>*</em></span>
          <TextBox v-model:Text="form.description" PlaceholderText="请详细描述问题" :MaxLength="2000"
                   AcceptsReturn class="yali-textarea" />
        </label>

        <label class="yali-field">
          <span class="yali-field-label">备注（选填）</span>
          <TextBox v-model:Text="form.notes" PlaceholderText="补充说明…" :MaxLength="50" AcceptsReturn />
        </label>

        <label class="yali-field">
          <span class="yali-field-label">你的姓名</span>
          <TextBox v-model:Text="form.submitted_by" PlaceholderText="选填，填写以便后续沟通" :MaxLength="50" />
        </label>

        <label class="yali-field">
          <span class="yali-field-label">图片（选填）</span>
          <input type="file" accept="image/*" @change="onPickImage" />
          <img v-if="form.preview" :src="form.preview" alt="" class="yali-form-preview" />
        </label>

        <div class="yali-field">
          <span class="yali-field-label">人机验证</span>
          <div id="yaliIssueCaptcha"></div>
        </div>

        <div class="yali-form-actions">
          <Button @Click="dialogOpen = false" :IsEnabled="!submitting">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!submitting"
                  @Click="submitIssue">
            <span class="yali-btn-inner"><span>{{ submitting ? '提交中…' : '提交问题' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
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
  mountCaptcha,
  openLightbox,
  toBlobUrl,
  toast
} from '../../shared/api'

interface Issue {
  id: number
  location: string
  description: string
  notes?: string
  status: string
  submitted_by: string
  created_at: string
  updated_by?: string
  comment_count?: number
  /** 列表接口只给标记，图片走 /api/issues/images?ids= 按需取 */
  has_image?: number | boolean
}

interface Comment {
  id: number
  created_by: string
  content: string
  created_at: string
}

interface BannerEntry {
  key: string
  label: string
  title: string
  body: string
  meta: string
  href: string
}

const STATUSES = ['待处理', '处理中', '已完成'] as const

const user = ref(getUser())
const admin = isAdmin()
const canManage = computed(() => !!user.value && user.value.role !== 'pending')

/* ── 筛选 ── */
const FILTERS = [
  { Text: '全部', Tag: 'all' },
  { Text: '待处理', Tag: '待处理' },
  { Text: '处理中', Tag: '处理中' },
  { Text: '已完成', Tag: '已完成' }
]
const filterItems = FILTERS
const activeFilter = ref('all')
const selectedFilterItem = computed(() => FILTERS.find((f) => f.Tag === activeFilter.value))

function onFilterChanged(args: { SelectedItem?: { Tag?: string } }) {
  const tag = args?.SelectedItem?.Tag
  if (tag) activeFilter.value = tag
}

/* ── 数据 ── */
const issues = ref<Issue[]>([])
const loading = ref(true)
const loadError = ref('')

const filteredIssues = computed(() =>
  activeFilter.value === 'all'
    ? issues.value
    : issues.value.filter((i) => i.status === activeFilter.value)
)

/* ── 两段式报修图片加载（沿用站点既有策略：每批 4 条） ── */
const issueImageMap = reactive<Record<number, string[]>>({})

async function loadIssueImagesLazy() {
  const pending = issues.value
    .filter((i) => i.has_image && !(i.id in issueImageMap))
    .map((i) => i.id)

  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4)
    let map: Record<string, string> = {}
    try {
      map = await apiGet<Record<string, string>>(`/api/issues/images?ids=${batch.join(',')}`)
    } catch {
      map = {}
    }
    for (const id of batch) {
      const url = map?.[id]
      issueImageMap[id] = url ? [url] : []
    }
  }
}

async function loadIssues() {
  loading.value = true
  loadError.value = ''
  try {
    issues.value = await apiGet<Issue[]>('/api/issues')
    void loadIssueImagesLazy()
  } catch (err) {
    loadError.value = '加载失败：' + (err as Error).message
  } finally {
    loading.value = false
  }
}

/* ── 状态流转 ── */
async function changeStatus(issue: Issue, status: string) {
  const apply = async () => {
    try {
      await apiPut(`/api/issues/${issue.id}/status`, { status })
      issue.status = status
      issue.updated_by = getUser()?.name || '未知'
      toast(`状态已更新为「${status}」`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }
  if (issue.status !== '待处理') {
    // modal.js 的配置键是 footer（不是 actions），按钮形状 { text, variant, onClick }
    legacy.openModal?.({
      title: '确认修改状态',
      body: `<p>当前状态为「${issue.status}」，确定要改为「${status}」吗？</p>`,
      footer: [
        { text: '取消', variant: 'outline', onClick: () => legacy.closeActiveModal?.() },
        { text: '确定', variant: 'primary', onClick: apply }
      ]
    })
    return
  }
  await apply()
}

async function removeIssue(issue: Issue) {
  if (!window.confirm('确定删除此问题反馈吗？')) return
  try {
    await apiDel(`/api/issues/${issue.id}`)
    issues.value = issues.value.filter((i) => i.id !== issue.id)
    toast('问题已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 评论 ── */
const comments = reactive<Record<number, Comment[]>>({})
const commentsLoading = reactive<Record<number, boolean>>({})
const commentDraft = reactive<Record<number, string>>({})

async function loadComments(issue: Issue) {
  if (comments[issue.id]) return
  commentsLoading[issue.id] = true
  try {
    comments[issue.id] = await apiGet<Comment[]>(`/api/comments/issue/${issue.id}`)
  } catch {
    comments[issue.id] = []
    toast('评论加载失败', 'error')
  } finally {
    commentsLoading[issue.id] = false
  }
}

/** 改评论：仅作者本人（后端 comments.js 只放行作者，admin 也会 403） */
function canEditComment(c: Comment) {
  const u = getUser()
  return !!u && u.name === c.created_by
}

/** 删评论：作者本人，或管理员 / 站长 */
function canDeleteComment(c: Comment) {
  const u = getUser()
  return !!u && (u.name === c.created_by || u.role === 'admin' || u.role === 'owner')
}

/* ── 就地编辑评论（旧版 editIssueComment / saveEditIssueComment） ── */
const editingCommentId = ref<number | null>(null)
const editCommentDraft = ref('')

function startCommentEdit(c: Comment) {
  editingCommentId.value = c.id
  editCommentDraft.value = c.content
}

function cancelCommentEdit() {
  editingCommentId.value = null
  editCommentDraft.value = ''
}

async function saveCommentEdit(issue: Issue, c: Comment) {
  const content = editCommentDraft.value.trim()
  if (!content) return toast('评论内容不能为空', 'error')
  if (content.length > 500) return toast('评论内容为1-500字', 'error')
  try {
    await apiPut(`/api/comments/${c.id}`, { content })
    c.content = content
    cancelCommentEdit()
    toast('评论已修改', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function postComment(issue: Issue) {
  const content = (commentDraft[issue.id] || '').trim()
  if (!content) return
  if (content.length > 500) return toast('评论内容为1-500字', 'error')
  try {
    const created = await apiPost<Comment>('/api/comments', {
      target_type: 'issue',
      target_id: issue.id,
      content
    })
    if (!comments[issue.id]) comments[issue.id] = []
    comments[issue.id].push(created)
    commentDraft[issue.id] = ''
    issue.comment_count = (issue.comment_count || 0) + 1
    toast('评论已发表', 'success')
    legacy.checkCountAchievements?.()
    legacy.checkNovice?.()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeComment(issue: Issue, c: Comment) {
  if (!window.confirm('确定删除此评论吗？')) return
  try {
    await apiDel(`/api/comments/${c.id}`)
    comments[issue.id] = (comments[issue.id] || []).filter((x) => x.id !== c.id)
    issue.comment_count = Math.max(0, (issue.comment_count || 1) - 1)
    toast('评论已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 横幅 ── */
const bannerItems = ref<BannerEntry[]>([])

async function loadBanner() {
  try {
    const data = await apiGet<{
      announcements?: Array<{ id: number; title: string; content: string; created_at: string; created_by: string }>
      hallBookings?: Array<{ date: string; start_time: string; end_time: string; purpose: string; applicant: string }>
    // slim=1：只要文字，不要内联的 base64 图片（完整版可达数百 KB，本页横幅不展示图片）
    }>('/api/banner?slim=1')
    const items: BannerEntry[] = []
    for (const a of data?.announcements ?? []) {
      items.push({
        key: `a-${a.id}`,
        label: '公告',
        title: a.title,
        body: a.content,
        meta: `${formatTime(a.created_at)} · ${a.created_by}`,
        href: `/announcement.html?id=${a.id}`
      })
    }
    for (const h of data?.hallBookings ?? []) {
      items.push({
        key: `h-${h.date}-${h.start_time}`,
        label: '千人报告厅 · 预约情况',
        title: `${h.date} ${h.start_time}-${h.end_time}`,
        body: `用途：${h.purpose}`,
        meta: `已审批 · 申请人：${h.applicant}`,
        href: 'activities.html'
      })
    }
    bannerItems.value = items.slice(0, 6)
  } catch {
    bannerItems.value = []
  }
}

function openBanner(item: BannerEntry) {
  window.location.href = item.href
}

/* ── 提交表单 ── */
const dialogOpen = ref(false)
const submitting = ref(false)
const form = reactive({
  location: '',
  contact: '',
  description: '',
  notes: '',
  submitted_by: getUser()?.name || '',
  file: null as File | null,
  preview: ''
})
let captcha: { getData: () => Record<string, string>; refresh: () => void } | null = null

watch(dialogOpen, async (open) => {
  if (!open) return
  await nextTick()
  // 容器在 ContentDialog 里（v-if 开启后才 teleport 进 body），必须等下一帧再挂；
  // mountCaptcha 在容器缺失时会显式告警，而不是静默失败
  if (!captcha) captcha = mountCaptcha('yaliIssueCaptcha')
})

function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  form.file = file
  if (!file) {
    form.preview = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.preview = String(reader.result)
  }
  reader.readAsDataURL(file)
}

async function submitIssue() {
  if (!form.location.trim() || !form.description.trim()) {
    return toast('地点与报修问题为必填', 'error')
  }
  submitting.value = true
  try {
    let image_url = ''
    if (form.file) {
      const raw = await readAsDataUrl(form.file)
      const compress = (window as unknown as { compressImage?: (d: string) => Promise<string> }).compressImage
      image_url = compress ? await compress(raw) : raw
    }
    const created = await apiPost<Issue>('/api/issues', {
      location: form.location,
      description: form.description,
      contact: form.contact,
      notes: form.notes,
      submitted_by: user.value ? user.value.name : form.submitted_by || '匿名访客',
      ...(captcha ? captcha.getData() : {}),
      image_url
    })
    issues.value.unshift(created)
    // 创建接口返回的是完整行（含 image_url），转成列表形状：只留 has_image，
    // 图片直接塞进 issueImageMap，无需再回一次接口
    const createdImg = (created as unknown as { image_url?: string }).image_url
    if (createdImg) {
      issueImageMap[created.id] = [createdImg]
      created.has_image = 1
    }
    delete (created as unknown as { image_url?: string }).image_url
    toast('问题提交成功！', 'success')
    legacy.checkCountAchievements?.()
    legacy.checkNovice?.()
    dialogOpen.value = false
    resetForm()
  } catch (err) {
    toast((err as Error).message, 'error')
    captcha?.refresh()
  } finally {
    submitting.value = false
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

function resetForm() {
  form.location = ''
  form.contact = ''
  form.description = ''
  form.notes = ''
  form.file = null
  form.preview = ''
}

function go(href: string) {
  window.location.href = href
}

onMounted(() => {
  loadIssues()
  loadBanner()
})
</script>

<style>
/* 横幅卡片（本页特有） */
.yali-banner-row { display: flex; gap: 12px; }
.yali-banner-card { flex: none; width: 280px; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; text-align: left; cursor: pointer; border: 1px solid var(--card-stroke); border-radius: 8px; background: var(--card-bg-secondary); color: var(--text-primary); font: inherit; }
.yali-banner-card:hover { background: var(--subtle-secondary); }
.yali-banner-caption { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--accent-base); }
.yali-banner-title { font-size: 14px; font-weight: 500; }
.yali-banner-body { font-size: 13px; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.yali-banner-meta { font-size: 12px; color: var(--text-tertiary); }

/* 工单图片（本页特有） */
.yali-item-img { max-height: 200px; width: auto; max-width: 100%; border-radius: 4px; cursor: pointer; }
</style>
