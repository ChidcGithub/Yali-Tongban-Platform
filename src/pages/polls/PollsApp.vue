<template>
  <YaliShell current="polls" title="投票">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="发起和参与团委投票" />
      </header>

      <div v-if="loading" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!visible.length" class="yali-loading">
        <FontIcon :Glyph="GLYPH.polls" :FontSize="28" class="yali-muted-icon" />
        <TextBlock :Text="polls.length ? '暂无你可参与的投票' : '暂无投票'" class="yali-muted" />
        <TextBlock v-if="!polls.length" Text="还没有投票活动，敬请期待" class="yali-muted" />
      </div>

      <ListView v-else :ItemsSource="visible" SelectionMode="None" class="yali-list">
        <template #item="{ item }">
          <div class="yali-item poll-card" @click="open(item)">
            <div class="yali-item-head">
              <div class="poll-title-row">
                <TextBlock :Text="item.title" class="yali-item-title" TextWrapping="Wrap" />
                <span class="yali-chip" :class="item.status === 'open' ? 'yali-chip-accent' : 'yali-chip-done'">
                  {{ item.status === 'open' ? '进行中' : '已结束' }}
                </span>
              </div>
            </div>

            <TextBlock v-if="item.description" :Text="item.description" TextWrapping="Wrap"
                       class="yali-item-body" />

            <div class="yali-item-meta">
              <span>{{ item.created_by }}</span>
              <span>{{ roleText(item.min_role) }}</span>
              <span v-if="classText(item)">{{ classText(item) }}</span>
              <span>{{ item.total_votes }} 人参与</span>
              <span v-if="item.require_name">需留名</span>
            </div>

            <div v-if="canManage(item)" class="yali-item-actions">
              <Button @Click.stop="open(item)">
                <span class="yali-btn-inner"><span>查看结果</span></span>
              </Button>
              <Button @Click.stop="exportCsv(item)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.download" :FontSize="14" /><span>导出 CSV</span>
                </span>
              </Button>
              <Button @Click.stop="remove(item)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                </span>
              </Button>
            </div>
          </div>
        </template>
      </ListView>
    </div>

    <button v-if="admin" class="yali-fab" type="button" aria-label="发起投票" @click="dialogOpen = true">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- 发起投票 -->
    <ContentDialog :IsOpen="dialogOpen" Title="发起投票" CloseButtonText="取消"
                   @update:IsOpen="dialogOpen = $event">
      <div class="yali-form poll-form">
        <label class="yali-field">
          <span class="yali-field-label">标题 <em>*</em></span>
          <TextBox v-model:Text="draft.title" PlaceholderText="投票标题" :MaxLength="200" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">说明</span>
          <TextBox v-model:Text="draft.description" PlaceholderText="选填" :MaxLength="500" AcceptsReturn />
        </label>

        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">参与范围</span>
            <ComboBox :ItemsSource="ROLES" v-model:SelectedIndex="roleIndex" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">显示选项</span>
            <ToggleSwitch v-model:IsOn="draft.require_name" OnContent="需留名" OffContent="匿名" />
          </label>
        </div>

        <label class="yali-field">
          <span class="yali-field-label">限定班级（选填）</span>
          <TextBox v-model:Text="draft.allowed_classes"
                   PlaceholderText="4 位班级编号，多个用逗号或空格隔开，如 2517 2518" />
          <span class="yali-setting-desc">留空表示不限班级</span>
        </label>

        <div class="poll-questions">
          <div class="poll-questions-head">
            <TextBlock Text="题目" :FontSize="14" :FontWeight="500" />
            <Button @Click="addQuestion">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.add" :FontSize="13" /><span>添加题目</span>
              </span>
            </Button>
          </div>

          <div v-for="(q, qi) in draft.questions" :key="qi" class="poll-question">
            <div class="poll-question-top">
              <TextBox v-model:Text="q.title" :PlaceholderText="'第 ' + (qi + 1) + ' 题标题'" :MaxLength="500" />
              <ComboBox :ItemsSource="TYPES" v-model:SelectedIndex="q._typeIndex" class="poll-type" />
              <button class="poll-del" type="button" title="删除此题" @click="removeQuestion(qi)">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="13" />
              </button>
            </div>

            <div v-if="qType(q) !== 'text'" class="poll-options">
              <div v-for="(_, oi) in q.options" :key="oi" class="poll-option">
                <TextBox v-model:Text="q.options[oi]" :PlaceholderText="'选项 ' + (oi + 1)" :MaxLength="200" />
                <button class="poll-del" type="button" title="删除选项" @click="q.options.splice(oi, 1)">
                  <FontIcon :Glyph="GLYPH.close" :FontSize="12" />
                </button>
              </div>
              <Button @Click="q.options.push('')">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.add" :FontSize="12" /><span>添加选项</span>
                </span>
              </Button>
            </div>

            <!-- 主观题字数上限（旧版 pq-maxlen，默认 1000） -->
            <label v-else class="yali-field poll-maxlen">
              <span class="yali-field-label">字数限制</span>
              <NumberBox v-model:Value="q.max_length" :Minimum="1" :Maximum="10000" :SmallChange="100" />
            </label>

            <!-- 题目配图（选填）：旧版为 upload-zone，选取后先压缩再随创建请求提交 -->
            <div class="poll-image">
              <label class="poll-image-pick">
                <input type="file" accept="image/*" @change="pickImage(q, $event)" />
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.photo" :FontSize="13" />
                  <span>{{ q.image_url ? '更换配图' : '添加配图（选填）' }}</span>
                </span>
              </label>
              <span v-if="q.image_url" class="poll-image-note">已添加，随投票一起提交</span>
              <button v-if="q.image_url" class="poll-del" type="button" title="移除配图"
                      @click="q.image_url = ''">
                <FontIcon :Glyph="GLYPH.close" :FontSize="12" />
              </button>
              <img v-if="q.image_url" :src="q.image_url" class="poll-image-preview" alt="配图预览" />
            </div>
          </div>
        </div>

        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="dialogOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="create">
            <span class="yali-btn-inner"><span>{{ saving ? '提交中…' : '发起投票' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, getUser, isAdmin, toast } from '../../shared/api'

interface Poll {
  id: number
  title: string
  description?: string
  status?: string
  min_role?: string | null
  created_by: string
  total_votes?: number
  require_name?: 0 | 1
  /** 列表接口是 SELECT *，这里是**未解析的 JSON 字符串**；详情接口才解析成数组 */
  allowed_classes?: string | string[]
}

const user = ref(getUser())
const admin = isAdmin()
const polls = ref<Poll[]>([])
const loading = ref(true)

/** 班级白名单：列表接口给的是 JSON 字符串，需自行解析 */
function classList(p: Poll): string[] {
  const raw = p.allowed_classes
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function classText(p: Poll) {
  const list = classList(p)
  if (!list.length) return ''
  return `限 ${list.join('、')}`
}

/* 可见性：与旧版 polls.js 一致 —— 按 min_role 权重与班级白名单过滤，
   不可参与的投票不出现在列表里（管理员同样遵守，只有自己的投票始终可见） */
const ROLE_WEIGHT: Record<string, number> = { member: 2, admin: 3, owner: 4 }

const visible = computed(() => {
  const u = user.value
  const weight = u ? ROLE_WEIGHT[u.role] || 0 : 0
  return polls.value.filter((p) => {
    if (p.created_by === u?.name) return true
    if (p.min_role === 'admin' && weight < 3) return false
    if (p.min_role === 'member' && !u) return false
    const classes = classList(p)
    if (classes.length > 0 && (!u || !u.class_name || !classes.includes(u.class_name))) return false
    return true
  })
})

function roleText(role?: string) {
  if (!role) return '所有人'
  if (role === 'member') return '仅登录用户'
  if (role === 'admin') return '仅管理员'
  return role
}

function canManage(p: Poll) {
  const u = user.value
  return !!u && (u.name === p.created_by || u.role === 'owner' || u.role === 'admin')
}

async function load() {
  loading.value = true
  try {
    polls.value = await apiGet<Poll[]>('/api/polls')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function open(p: Poll) {
  window.location.href = `poll.html?id=${p.id}`
}

async function exportCsv(p: Poll) {
  try {
    // 与旧版一致：同源 cookie 鉴权，无需额外请求头
    const res = await fetch(`/api/polls/${p.id}/export`)
    if (!res.ok) {
      let msg = '导出失败'
      try {
        const d = await res.json()
        if (d?.error) msg = d.error
      } catch { /* 非 JSON 响应 */ }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poll-${p.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function remove(p: Poll) {
  if (!window.confirm(`确定删除投票「${p.title}」吗？`)) return
  try {
    await apiDel(`/api/polls/${p.id}`)
    polls.value = polls.value.filter((x) => x.id !== p.id)
    toast('投票已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 发起投票 ── */
const ROLES = ['所有人', '仅登录用户', '仅管理员']
const ROLE_VALUES = ['', 'member', 'admin']
const TYPES = ['单选', '多选', '主观题']
const TYPE_VALUES = ['single', 'multiple', 'text']

interface DraftQuestion {
  title: string
  options: string[]
  type: string
  _typeIndex: number
  /** 已压缩的 base64 data URL；既作预览也作提交载荷（空串表示无配图） */
  image_url: string
  /** 主观题字数上限 */
  max_length: number
}

/** 新题目的默认值（必须含 image_url / max_length，否则响应式上会是 undefined） */
function blankQuestion(): DraftQuestion {
  return { title: '', options: ['', ''], type: 'single', _typeIndex: 0, image_url: '', max_length: 1000 }
}

/* 题型**只有一个真实来源**：下拉绑的 `_typeIndex`。
   早先模板与校验读的是 `q.type`，而 `q.type` 建题后再也不更新 ——
   结果「字数限制」控件永远不渲染、「主观题」提交时还按选择题校验被拒。
   统一用 qType() 取。 */
function qType(q: DraftQuestion): string {
  return TYPE_VALUES[q._typeIndex] ?? q.type ?? 'single'
}

const dialogOpen = ref(false)
const saving = ref(false)
const roleIndex = ref(0)
const draft = reactive({
  title: '',
  description: '',
  require_name: false,
  /** 限定班级：输入框里是逗号/空格分隔的 4 位班级编号，提交前解析成数组 */
  allowed_classes: '',
  questions: [blankQuestion()] as DraftQuestion[]
})

function addQuestion() {
  draft.questions.push(blankQuestion())
}

function removeQuestion(i: number) {
  draft.questions.splice(i, 1)
}

/* ── 题目配图 ──
   旧版走「先预览原图 → 提交时再 compressImage」，这里改为**选取时就压缩**，
   既避免重复编码，也让预览图与最终提交的图完全一致（原图 25MB 会被后端拒绝）。 */
async function pickImage(q: DraftQuestion, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 一定要清空，否则连续选同一个文件不会再触发 change
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return toast('请选择图片文件', 'error')
  if (file.size > 25 * 1024 * 1024) return toast('图片不能超过 25MB', 'error')
  try {
    const raw = await readAsDataUrl(file)
    const fn = (window as unknown as { compressImage?: (d: string) => Promise<string> }).compressImage
    q.image_url = fn ? await fn(raw) : raw
  } catch {
    toast('图片读取失败', 'error')
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

async function create() {
  if (!draft.title.trim()) return toast('请填写投票标题', 'error')
  // 限定班级：逗号/空格分隔，只保留 4 位编号（与原页面同一口径）
  const allowedClasses = draft.allowed_classes
    .split(/[,，\s]+/)
    .filter(Boolean)
    .filter((c) => /^\d{4}$/.test(c))
  const questions = draft.questions
    .filter((q) => q.title.trim())
    .map((q) => {
      const type = qType(q)
      const base = {
        type,
        title: q.title.trim(),
        image_url: q.image_url,
        options: type === 'text' ? [] : q.options.map((o) => o.trim()).filter(Boolean)
      }
      // 主观题才需要字数上限；后端对非主观题会忽略该字段
      return type === 'text' ? { ...base, max_length: q.max_length || 1000 } : base
    })

  if (!questions.length) return toast('至少需要一个题目', 'error')
  const invalid = questions.find(
    (q) => q.type !== 'text' && (q.options as string[]).length < 2
  )
  if (invalid) return toast('选择题至少需要两个选项', 'error')

  saving.value = true
  try {
    const data = await apiPost<{ id: number }>('/api/polls', {
      title: draft.title,
      description: draft.description,
      require_name: draft.require_name,
      min_role: ROLE_VALUES[roleIndex.value],
      allowed_classes: allowedClasses,
      questions
    })
    polls.value.unshift({
      id: data.id,
      title: draft.title,
      description: draft.description,
      status: 'open',
      min_role: ROLE_VALUES[roleIndex.value],
      created_by: getUser()?.name ?? '',
      total_votes: 0,
      require_name: draft.require_name ? 1 : 0,
      allowed_classes: allowedClasses
    })
    toast('投票已创建', 'success')
    dialogOpen.value = false
    draft.title = ''
    draft.description = ''
    draft.require_name = false
    draft.allowed_classes = ''
    draft.questions = [blankQuestion()]
    roleIndex.value = 0
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style>
.poll-card {
  cursor: pointer;
}
.poll-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.poll-form {
  min-width: 520px;
}
.poll-questions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.poll-questions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.poll-question {
  padding: 10px;
  border: 1px solid var(--stroke-divider);
  border-radius: 6px;
  background: var(--card-bg-secondary);
}
.poll-question-top {
  display: flex;
  gap: 8px;
  align-items: center;
}
.poll-question-top > :first-child {
  flex: 1;
  min-width: 0;
}
.poll-type {
  width: 120px;
  flex: none;
}
.poll-maxlen {
  margin-top: 8px;
  padding-left: 12px;
  max-width: 220px;
}
/* 题目配图：用一个 <label> 包住隐藏的 file input 当按钮用（原生控件，
   不引入新的设计系统；样式沿用站点既有的 --card-bg / --stroke-divider） */
.poll-image {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-left: 12px;
}
.poll-image-pick input {
  display: none;
}
.poll-image-pick {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid var(--stroke-divider);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
  background: var(--card-bg);
}
.poll-image-pick:hover {
  background: var(--subtle-tertiary);
}
.poll-image-note {
  font-size: 12px;
  color: var(--text-secondary);
}
.poll-image-preview {
  max-height: 96px;
  max-width: 100%;
  border: 1px solid var(--stroke-divider);
  border-radius: 4px;
  display: block;
}
.poll-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-left: 12px;
}
.poll-option {
  display: flex;
  gap: 6px;
  align-items: center;
}
.poll-option > :first-child {
  flex: 1;
  min-width: 0;
}
.poll-del {
  flex: none;
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 4px;
}
.poll-del:hover {
  background: var(--subtle-tertiary);
  color: var(--text-primary);
}

@media (max-width: 640px) {
  .poll-form {
    min-width: 0;
  }
  .poll-question-top {
    flex-wrap: wrap;
  }
  .poll-type {
    width: 100%;
  }
}
</style>
