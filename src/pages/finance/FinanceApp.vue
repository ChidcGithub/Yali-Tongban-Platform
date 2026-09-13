<template>
  <YaliShell current="finance" title="财务">
    <div class="yali-page">
      <!-- ── 汇总（本月全部记录，不随下方筛选变动） ── -->
      <section class="yali-section fin-summary">
        <div class="fin-stat">
          <span class="fin-stat-label">本月收入</span>
          <span class="fin-stat-value fin-in">{{ money(summary.income) }}</span>
        </div>
        <div class="fin-stat">
          <span class="fin-stat-label">本月支出</span>
          <span class="fin-stat-value fin-out">{{ money(summary.expense) }}</span>
        </div>
        <div class="fin-stat">
          <span class="fin-stat-label">结余</span>
          <span class="fin-stat-value" :class="summary.income - summary.expense >= 0 ? 'fin-in' : 'fin-out'">
            {{ money(summary.income - summary.expense) }}
          </span>
        </div>
      </section>

      <!-- ── 近 30 天报销比例（管理员） ── -->
      <section v-if="admin" class="yali-section">
        <div class="fin-ratio-head">
          <TextBlock Text="近 30 天支出报销比例" :FontSize="14" :FontWeight="500" />
          <span class="yali-muted">
            {{ reimburseRatio.done }} / {{ reimburseRatio.total }}
            （{{ reimburseRatio.pct.toFixed(0) }}%）
          </span>
        </div>
        <div class="fin-ratio-bar">
          <div class="fin-ratio-fill" :style="{ width: Math.min(reimburseRatio.pct, 100) + '%' }" />
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
            <!-- 部门筛选：仅管理员，默认「全部」（不带 department 参数，后端不按部门过滤） -->
            <ComboBox v-if="admin" :ItemsSource="deptFilterItems" v-model:SelectedIndex="deptFilterIndex"
                      class="fin-dept" />
            <!-- 月份只靠 v-model:SelectedIndex 驱动。
                 早先还挂了 @SelectionChanged="onMonthChange"，而 ComboBox 的
                 SelectionChanged 只带 {AddedItems,RemovedItems}，取不到 SelectedIndex
                 → 每次选择都被 onMonthChange 重置回 0（本月）。 -->
            <ComboBox :ItemsSource="MONTHS" v-model:SelectedIndex="monthIndex" class="fin-month" />
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
                  <span class="yali-chip" :class="statusChipClass(item.status)">
                    {{ item.status }}
                  </span>
                  <span v-if="item.department" class="yali-chip">{{ item.department }}</span>
                  <span v-if="item.fund_type" class="yali-chip">{{ item.fund_type }}</span>
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
              <div v-else-if="item.has_image && !(item.id in imageMap)" class="yali-img-skeleton" aria-hidden="true">
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
                <!-- 报销状态由 status 承担（后端：报销→'已报销'，取消→'待完成'），
                     不存在独立的 reimbursed 字段 -->
                <Button v-if="item.status !== '已报销'" @Click="reimburse(item, true)">
                  <span class="yali-btn-inner"><span>标记已报销</span></span>
                </Button>
                <Button v-else @Click="reimburse(item, false)">
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
          <TextBox v-model:Text="draft.tags" PlaceholderText="逗号分隔，如：办公用品, 打印" :MaxLength="200" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">备注</span>
          <TextBox v-model:Text="draft.notes" PlaceholderText="选填" :MaxLength="500" AcceptsReturn />
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
  isAdmin,
  mountCaptcha,
  openLightbox,
  toBlobUrl,
  toast,
  confirmDialog
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
  fund_type?: string
  internal_activity?: number | boolean
  has_image?: boolean | number
}

const admin = isAdmin()
const all = ref<FinanceRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const onlyPending = ref(false)

/* ── 月份 ──
   覆盖近 4 年（48 个月）：旧版 finance.js 就是按「当前年份往前 3 年」生成的，
   只给 12 / 36 个月会让更早的记录查不到 */
const now = new Date()
const MONTHS: string[] = []
const MONTH_KEYS: string[] = []
for (let i = 0; i < 48; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  MONTHS.push(`${y} 年 ${m} 月`)
  MONTH_KEYS.push(`${y}-${String(m).padStart(2, '0')}`)
}
const monthIndex = ref(0)
const currentMonth = computed(() => MONTH_KEYS[monthIndex.value])
const monthLabel = computed(() => MONTHS[monthIndex.value])

/* ── 部门筛选（仅管理员可见，与旧版 buildDeptTabs 一致） ──
   旧版默认 `_filterDept = ''`，即**不带 department 参数**（后端不按部门过滤），
   由管理员用标签主动切换。早先默认就带上自己的部门，管理员反而看不到别的部门。 */
const deptFilter = ref('')
const deptFilterItems = computed(() => ['全部', ...DEPARTMENTS])
const deptFilterIndex = computed({
  get: () => (deptFilter.value ? deptFilterItems.value.indexOf(deptFilter.value) : 0),
  set: (i: number) => {
    deptFilter.value = i > 0 ? deptFilterItems.value[i] ?? '' : ''
    reload()
  }
})

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
    // 旧版口径：支出且未报销（已完成的支出也属于待办），不是仅 status==='待完成'
    if (onlyPending.value && !(f.type === '支出' && f.status !== '已报销')) return false
    return true
  })
)

/** 汇总口径：本月全部记录，不随类型/状态筛选变动（与原页面一致） */
const summary = computed(() => {
  let income = 0
  let expense = 0
  for (const f of monthScoped.value) {
    const amt = Number(f.amount || 0)
    if (f.type === '收入') income += amt
    else expense += amt
  }
  return { income, expense }
})

/** 近 30 天支出报销比例（管理员可见，原页面有此卡片） */
const reimburseRatio = computed(() => {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000
  const recentExpenses = all.value.filter(
    (f) => f.type === '支出' && new Date((f.created_at || '').replace(/-/g, '/')).getTime() >= cutoff
  )
  const done = recentExpenses.filter((f) => f.status === '已报销').length
  const total = recentExpenses.length
  return { done, total, pct: total ? (done / total) * 100 : 0 }
})

function statusChipClass(status?: string) {
  if (status === '已报销') return 'yali-chip-done'
  if (status === '已完成') return 'yali-chip-done'
  return 'yali-chip-warn'
}

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
    const dept = deptFilter.value ? `?department=${encodeURIComponent(deptFilter.value)}` : ''
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
    let map: Record<string, string> = {}
    try {
      map = await apiGet<Record<string, string>>(`/api/finance/images?ids=${batch.join(',')}`)
    } catch {
      map = {}
    }
    // 取不到也要登记（空串）：骨架的条件是「has_image 且还没登记」，
    // 不登记的话每次重渲染都会重新请求，骨架也一直转
    for (const id of batch) imageMap[id] = map?.[id] ?? ''
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
    // 后端改的是 status（报销→已报销，取消→待完成），本地同步同一字段
    f.status = on ? '已报销' : '待完成'
    toast(on ? '已标记报销' : '已取消报销标记', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function remove(f: FinanceRecord) {
  if (!(await confirmDialog({ title: '确认删除', message: `确定删除这笔 ${money(f.amount)} 的记录吗？`, danger: true }))) return
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
  if (!open) {
    // 关闭时内容被移除，旧实例指向已脱离文档的节点 → 必须置空，否则第二次打开是空白
    captcha = null
    return
  }
  await nextTick()
  // 容器在 ContentDialog 里（v-if 开启后才 teleport 进 body）
  captcha = mountCaptcha('yaliFinanceCaptcha')
})

function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // 旧版在上传前就拦掉超大文件（后端只在 base64 超 200 万字符时才报错，
  // 用户得等压缩+发送走完才看到失败）
  if (file && file.size > 25 * 1024 * 1024) {
    toast('图片不能超过 25MB', 'error')
    input.value = ''
    draft.file = null
    draft.preview = ''
    return
  }
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
    // 关框时验证码容器会被销毁，这里不再 refresh（watch 里已置空，下次打开会重挂）
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
/* 近 30 天报销比例 */
.fin-ratio-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.fin-ratio-bar {
  margin-top: 8px;
  height: 6px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--control-stroke-default, rgba(128, 128, 128, 0.24));
}
.fin-ratio-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--accent-base);
  transition: width 0.6s ease;
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
.fin-dept {
  width: 110px;
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
