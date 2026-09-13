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

              <img v-if="hasImage(item)" :src="item.image_url" alt="问题图片"
                   class="yali-item-img" @click="openLightbox(toBlobUrl(item.image_url))" />

              <div class="yali-item-meta">
                <span>提交人：{{ item.submitted_by }}</span>
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
                      <p class="yali-comment-text">{{ c.content }}</p>
                      <div v-if="canEditComment(c)" class="yali-comment-actions">
                        <Button @Click="removeComment(item, c)">删除</Button>
                      </div>
                    </div>
                  </template>

                  <div v-if="user" class="yali-comment-form">
                    <TextBox v-model:Text="commentDraft[item.id]" PlaceholderText="写下评论…"
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
            <TextBox v-model:Text="form.location" PlaceholderText="如：教学楼3楼301" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">联系方式</span>
            <TextBox v-model:Text="form.contact" PlaceholderText="选填，方便反馈" />
          </label>
        </div>

        <label class="yali-field">
          <span class="yali-field-label">报修问题 <em>*</em></span>
          <TextBox v-model:Text="form.description" PlaceholderText="请详细描述问题"
                   AcceptsReturn class="yali-textarea" />
        </label>

        <label class="yali-field">
          <span class="yali-field-label">备注（选填）</span>
          <TextBox v-model:Text="form.notes" PlaceholderText="补充说明…" AcceptsReturn />
        </label>

        <label class="yali-field">
          <span class="yali-field-label">你的姓名</span>
          <TextBox v-model:Text="form.submitted_by" PlaceholderText="选填，填写以便后续沟通" />
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
  image_url?: string
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

function hasImage(issue: Issue) {
  return !!issue.image_url && issue.image_url.startsWith('data:')
}

async function loadIssues() {
  loading.value = true
  loadError.value = ''
  try {
    issues.value = await apiGet<Issue[]>('/api/issues')
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
    legacy.openModal?.({
      title: '确认修改状态',
      body: `<p>当前状态为「${issue.status}」，确定要改为「${status}」吗？</p>`,
      actions: [
        { text: '取消', type: 'outline', action: 'closeActiveModal' },
        { text: '确定', type: 'primary', onClick: apply }
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

function canEditComment(c: Comment) {
  const u = getUser()
  return !!u && (u.name === c.created_by || u.role === 'admin' || u.role === 'owner')
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
    }>('/api/banner')
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
  const Ctor = legacy.CaptchaWidget
  if (Ctor && !captcha) captcha = new Ctor('yaliIssueCaptcha')
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
.yali-page {
  padding: 24px 36px 96px;
  max-width: 1000px;
}
.yali-page-head {
  margin-bottom: 20px;
}
.yali-page-title {
  display: block;
  color: var(--text-primary);
}
.yali-page-desc {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
}
.yali-section {
  margin-top: 20px;
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

/* 横幅 */
.yali-banner-row {
  display: flex;
  gap: 12px;
}
.yali-banner-card {
  flex: none;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--card-stroke);
  border-radius: 8px;
  background: var(--card-bg-secondary);
  color: var(--text-primary);
  font: inherit;
}
.yali-banner-card:hover {
  background: var(--subtle-secondary);
}
.yali-banner-caption {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-base);
}
.yali-banner-title {
  font-size: 14px;
  font-weight: 500;
}
.yali-banner-body {
  font-size: 13px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.yali-banner-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 加载与空状态 */
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

/* 列表与卡片 */
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
}
.yali-item-note {
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--subtle-secondary);
}
.yali-item-img {
  max-height: 200px;
  width: auto;
  max-width: 100%;
  border-radius: 4px;
  cursor: pointer;
}
.yali-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.yali-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
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

/* 浮动按钮 */
.yali-fab {
  position: absolute;
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
.yali-form-row {
  display: flex;
  gap: 12px;
}
.yali-form-row > .yali-field {
  flex: 1;
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
.yali-textarea :deep(textarea),
.yali-textarea {
  min-height: 84px;
}
.yali-form-preview {
  margin-top: 6px;
  max-height: 140px;
  width: auto;
  border-radius: 4px;
}
.yali-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* 移动端：NavigationView 自适应模式下内容区变窄，收紧留白 */
@media (max-width: 640px) {
  .yali-page {
    padding: 16px 16px 96px;
  }
  .yali-form,
  .yali-form-row {
    min-width: 0;
    flex-direction: column;
  }
  .yali-fab {
    right: 16px;
    bottom: 16px;
  }
}
</style>
