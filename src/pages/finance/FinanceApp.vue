<template>
  <YaliShell current="finance" title="财务">
    <div class="yali-page">
      <!-- ── 汇总 ── -->
      <section class="yali-section fin-summary">
        <div class="fin-stat">
          <span class="fin-stat-label">收入</span>
          <span class="fin-stat-value fin-in">{{ money(summary.income) }}</span>
        </div>
        <div class="fin-stat">
          <span class="fin-stat-label">支出</span>
          <span class="fin-stat-value fin-out">{{ money(summary.expense) }}</span>
        </div>
        <div class="fin-stat">
          <span class="fin-stat-label">结余</span>
          <span class="fin-stat-value" :class="summary.income - summary.expense >= 0 ? 'fin-in' : 'fin-out'">
            {{ money(summary.income - summary.expense) }}
          </span>
        </div>
      </section>

      <!-- ── 筛选 ── -->
      <section class="yali-section">
        <div class="yali-section-head">
          <div class="fin-filters">
            <SelectorBar :Items="TYPE_TABS" :SelectedItem="typeTab" @SelectionChanged="onTypeChange" />
            <ToggleSwitch v-model:IsOn="onlyPending" OnContent="只看待完成" OffContent="全部状态"
                          @Toggled="onPendingToggle" />
          </div>
          <div class="yali-head-tools">
            <ComboBox :ItemsSource="MONTHS" v-model:SelectedIndex="monthIndex"
                      @SelectionChanged="onMonthChange" class="fin-month" />
            <Button @Click="reload">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.refresh" :FontSize="14" /><span>刷新</span>
              </span>
            </Button>
          </div>
        </div>

        <div v-if="loading" class="yali-loading">
          <ProgressRing :IsActive="true" :Width="32" :Height="32" />
          <TextBlock Text="加载中…" class="yali-muted" />
        </div>

        <div v-else-if="!visible.length" class="yali-loading">
          <FontIcon :Glyph="GLYPH.finance" :FontSize="28" class="yali-muted-icon" />
          <TextBlock :Text="'本月暂无' + monthLabel + '记录'" class="yali-muted" />
        </div>

        <ListView v-else :ItemsSource="visible" SelectionMode="None" class="yali-list">
          <template #item="{ item }">
            <div class="yali-item fin-item">
              <div class="yali-item-head">
                <div class="fin-amount-row">
                  <span class="fin-amount" :class="item.type === '收入' ? 'fin-in' : 'fin-out'">
                    {{ item.type === '收入' ? '+' : '-' }}{{ money(item.amount) }}
                  </span>
                  <span class="yali-chip" :class="item.status === '已完成' ? 'yali-chip-done' : 'yali-chip-warn'">
                    {{ item.status }}
                  </span>
                  <span v-if="item.department" class="yali-chip">{{ item.department }}</span>
                  <span v-if="item.internal_activity" class="yali-chip">内部活动</span>
                </div>
              </div>

              <div v-if="tagsOf(item).length" class="fin-tags">
                <span v-for="t in tagsOf(item)" :key="t" class="yali-chip">{{ t }}</span>
              </div>

              <TextBlock v-if="item.notes" :Text="item.notes" TextWrapping="Wrap" class="yali-item-body" />

              <!-- 两段式图片 -->
              <div v-if="imageMap[item.id]" class="yali-img-row">
                <img :src="toBlobUrl(imageMap[item.id])" alt="财务凭证"
                     @click="openLightbox(toBlobUrl(imageMap[item.id]))" />
              </div>
              <div v-else-if="item.has_image" class="yali-img-skeleton" aria-hidden="true">
                <div class="yali-shimmer"></div>
              </div>

              <div class="yali-item-meta">
                <span>{{ item.created_by }}</span>
                <span>{{ formatTime(item.created_at) }}</span>
              </div>

              <div v-if="admin" class="yali-item-actions">
                <Button v-if="item.status !== '已完成'" @Click="complete(item)">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.check" :FontSize="14" /><span>标记完成</span>
                  </span>
                </Button>
                <Button v-if="item.status === '已完成' && !item.reimbursed" @Click="reimburse(item, true)">
                  <span class="yali-btn-inner"><span>标记已报销</span></span>
                </Button>
                <Button v-if="item.reimbursed" @Click="reimburse(item, false)">
                  <span class="yali-btn-inner"><span>取消报销</span></span>
                </Button>
                <Button @Click="remove(item)">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                  </span>
                </Button>
              </div>
            </div>
          </template>
        </ListView>
      </section>
    </div>

    <button v-if="admin" class="yali-fab" type="button" aria-label="新增记录" @click="dialogOpen = true">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- 新增记录 -->
    <ContentDialog :IsOpen="dialogOpen" Title="新增财务记录" CloseButtonText="取消"
                   @update:IsOpen="dialogOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">凭证图片 <em>*</em></span>
          <input type="file" accept="image/*" @change="onPickImage" />
          <img v-if="draft.preview" :src="draft.preview" alt="" class="yali-form-preview" />
        </label>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">类型</span>
            <ComboBox :ItemsSource="['支出', '收入']" v-model:SelectedIndex="draft.typeIndex" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">金额 <em>*</em></span>
            <NumberBox v-model:Value="draft.amount" PlaceholderText="0.00" />
          </label>
        </div>
        <label class="yali-field">
          <span class="yali-field-label">标签</span>
          <TextBox v-model:Text="draft.tags" PlaceholderText="逗号分隔，如：办公用品, 打印" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">备注</span>
          <TextBox v-model:Text="draft.notes" PlaceholderText="选填" AcceptsReturn />
        </label>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">归属部门</span>
            <ComboBox :ItemsSource="DEPARTMENTS" v-model:SelectedIndex="draft.deptIndex"
                      PlaceholderText="默认本部门" />
          </label>
          <div class="yali-field">
            <span class="yali-field-label">内部活动</span>
            <ToggleSwitch v-model:IsOn="draft.internal" OnContent="是" OffContent="否" />
          </div>
        </div>
        <div class="yali-field">
          <span class="yali-field-label">人机验证</span>
          <div id="yaliFinanceCaptcha"></div>
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="dialogOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="create">
            <span class="yali-btn-inner"><span>{{ saving ? '上传中…' : '提交' }}</span></span>
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

interface FinanceRecord {
  id: number
  type: string
  amount: number
  status: string
  tags?: string
  notes?: string
  created_by: string
  created_at: string
  department?: string
  internal_activity?: number | boolean
  reimbursed?: boolean
  has_image?: boolean | number
}

const admin = isAdmin()
const user = ref(getUser())

const all = ref<FinanceRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const onlyPending = ref(false)

/* ── 月份 ── */
const now = new Date()
const MONTHS: string[] = []
const MONTH_KEYS: string[] = []
for (let i = 0; i < 12; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  MONTHS.push(`${y} 年 ${m} 月`)
  MONTH_KEYS.push(`${y}-${String(m).padStart(2, '0')}`)
}
const monthIndex = ref(0)
const currentMonth = computed(() => MONTH_KEYS[monthIndex.value])
const monthLabel = computed(() => MONTHS[monthIndex.value])

function onMonthChange(args: { SelectedIndex?: number }) {
  const i = args?.SelectedIndex ?? 0
  if (i >= 0) monthIndex.value = i
}

/* ── 类型筛选 ── */
const TYPE_TABS = [
  { Text: '全部', Tag: 'all' },
  { Text: '收入', Tag: '收入' },
  { Text: '支出', Tag: '支出' }
]
const typeFilter = ref('all')
const typeTab = computed(() => TYPE_TABS.find((t) => t.Tag === typeFilter.value) ?? TYPE_TABS[0])

function onTypeChange(args: { SelectedItem?: { Tag?: string } }) {
  const tag = args?.SelectedItem?.Tag
  if (tag) typeFilter.value = tag
}

function onPendingToggle() {
  /* onlyPending 由 v-model 更新，这里只需触发重算（computed 自动响应） */
}

/* 按月份 + 类型 + 状态过滤 */
const monthScoped = computed(() =>
  all.value.filter((f) => (f.created_at || '').slice(0, 7) === currentMonth.value)
)

const visible = computed(() =>
  monthScoped.value.filter((f) => {
    if (typeFilter.value !== 'all' && f.type !== typeFilter.value) return false
    if (onlyPending.value && f.status === '已完成') return false
    return true
  })
)

const summary = computed(() => {
  let income = 0
  let expense = 0
  for (const f of visible.value) {
    const amt = Number(f.amount || 0)
    if (f.type === '收入') income += amt
    else expense += amt
  }
  return { income, expense }
})

function money(v: number | string) {
  return '¥' + Number(v || 0).toFixed(2)
}

function tagsOf(f: FinanceRecord): string[] {
  if (!f.tags) return []
  try {
    const v = JSON.parse(f.tags)
    return Array.isArray(v) ? v : []
  } catch {
    return String(f.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  }
}

/* ── 数据 ── */
async function reload() {
  loading.value = true
  try {
    const dept = admin && user.value?.department ? `?department=${encodeURIComponent(user.value.department)}` : ''
    all.value = await apiGet<FinanceRecord[]>(`/api/finance${dept}`)
    loadImagesLazy()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

/* 两段式图片：列表只给 has_image，每批 8 条取回（沿用站点既有策略） */
const imageMap = reactive<Record<number, string>>({})
async function loadImagesLazy() {
  const pending = all.value.filter((f) => f.has_image && !(f.id in imageMap)).map((f) => f.id)
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8)
    try {
      const map = await apiGet<Record<string, string>>(`/api/finance/images?ids=${batch.join(',')}`)
      for (const id of batch) imageMap[id] = map?.[id] ?? ''
    } catch {
      for (const id of batch) imageMap[id] = ''
    }
  }
}

/* ── 操作 ── */
async function complete(f: FinanceRecord) {
  try {
    await apiPut(`/api/finance/${f.id}/complete`)
    f.status = '已完成'
    toast('已标记完成', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function reimburse(f: FinanceRecord, on: boolean) {
  try {
    await apiPut(`/api/finance/${f.id}/${on ? 'reimburse' : 'unreimburse'}`)
    f.reimbursed = on
    toast(on ? '已标记报销' : '已取消报销标记', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function remove(f: FinanceRecord) {
  if (!window.confirm(`确定删除这笔 ${money(f.amount)} 的记录吗？`)) return
  try {
    await apiDel(`/api/finance/${f.id}`)
    all.value = all.value.filter((x) => x.id !== f.id)
    delete imageMap[f.id]
    toast('记录已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 新增 ── */
const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']
const dialogOpen = ref(false)
const draft = reactive({
  typeIndex: 0,
  amount: 0,
  tags: '',
  notes: '',
  deptIndex: -1,
  internal: false,
  file: null as File | null,
  preview: ''
})

type Captcha = { getData: () => Record<string, string>; refresh: () => void }
let captcha: Captcha | null = null

watch(dialogOpen, async (open) => {
  if (!open) return
  await nextTick()
  const Ctor = legacy.CaptchaWidget
  if (Ctor && !captcha) captcha = new Ctor('yaliFinanceCaptcha')
})

function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  draft.file = file
  if (!file) {
    draft.preview = ''
    return
  }
  const r = new FileReader()
  r.onload = () => (draft.preview = String(r.result))
  r.readAsDataURL(file)
}

async function create() {
  if (!draft.file) return toast('请选择凭证图片', 'error')
  if (!draft.amount || Number(draft.amount) <= 0) return toast('请填写有效金额', 'error')

  saving.value = true
  try {
    const raw = await readAsDataUrl(draft.file)
    const compress = (window as unknown as { compressImage?: (d: string) => Promise<string> }).compressImage
    const image_url = compress ? await compress(raw) : raw

    const created = await apiPost<FinanceRecord>('/api/finance', {
      image_url,
      tags: draft.tags ? draft.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
      notes: draft.notes,
      type: draft.typeIndex === 1 ? '收入' : '支出',
      amount: Number(draft.amount),
      department: draft.deptIndex >= 0 ? DEPARTMENTS[draft.deptIndex] : '',
      internal_activity: draft.internal,
      ...(captcha ? captcha.getData() : {})
    })

    all.value.unshift(created)
    if (created?.id && image_url.startsWith('data:')) imageMap[created.id] = image_url
    toast('上传成功', 'success')
    dialogOpen.value = false
    draft.amount = 0
    draft.tags = ''
    draft.notes = ''
    draft.file = null
    draft.preview = ''
    draft.deptIndex = -1
    draft.internal = false
    captcha?.refresh()
  } catch (err) {
    toast((err as Error).message, 'error')
    captcha?.refresh()
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

onMounted(reload)
</script>

<style>
.fin-summary {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}
.fin-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fin-stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
}
.fin-stat-value {
  font-size: 20px;
  font-weight: 600;
}
.fin-in {
  color: #0f7b0f;
}
.fin-out {
  color: #c42b1c;
}
html.theme-dark .fin-in {
  color: #6ccb5f;
}
html.theme-dark .fin-out {
  color: #ff99a4;
}
.fin-filters {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.fin-month {
  width: 150px;
}
.fin-amount-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fin-amount {
  font-size: 16px;
  font-weight: 600;
}
.fin-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.fin-item {
  gap: 8px;
}
</style>
