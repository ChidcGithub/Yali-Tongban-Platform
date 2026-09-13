<template>
  <YaliShell current="duty-admin" title="值日管理">
    <div class="yali-page">
      <SelectorBar :Items="tabItems" :SelectedItem="tabItems[tabIndex]" class="da-pivot"
                   @SelectionChanged="(a) => (tabIndex = a?.SelectedIndex ?? 0)" />

      <!-- ── 排班 ── -->
      <template v-if="tabIndex === 0">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="scheduleRangeText" :FontSize="15" :FontWeight="500" />
            <div class="yali-head-tools">
              <Button @Click="shiftWeeks(-2)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.back" :FontSize="13" /><span>上周</span>
                </span>
              </Button>
              <Button @Click="shiftWeeks(2)">
                <span class="yali-btn-inner">
                  <span>下周</span><FontIcon :Glyph="GLYPH.forward" :FontSize="13" />
                </span>
              </Button>
              <Button @Click="generate">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.calendar" :FontSize="13" /><span>自动生成 60 天</span>
                </span>
              </Button>
              <Button @Click="clearAll">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>清空排班</span>
                </span>
              </Button>
            </div>
          </div>

          <div v-if="scheduleLoading" class="yali-muted da-gap">加载中…</div>
          <div v-else class="da-cal">
            <div v-for="w in WEEKDAYS" :key="w" class="da-cal-head">{{ w }}</div>
            <div v-for="(cell, i) in calendar" :key="i" class="da-cal-cell"
                 :class="{ 'is-empty': !cell, 'is-today': cell?.isToday }">
              <template v-if="cell">
                <span class="da-cal-date">{{ cell.day }}</span>
                <span v-if="cell.a" class="da-cal-name">{{ cell.a }}</span>
                <span v-else class="da-cal-name yali-muted">未排班</span>
                <span v-if="cell.b" class="da-cal-name yali-muted">{{ cell.b }}</span>
              </template>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 干事 ── -->
      <template v-else-if="tabIndex === 1">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'干事名单（' + staff.length + ' 人）'" :FontSize="15" :FontWeight="500" />
            <Button @Click="staffDialog = true">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.add" :FontSize="13" /><span>添加干事</span>
              </span>
            </Button>
          </div>
          <p v-if="!staff.length" class="yali-muted da-gap">暂无干事</p>
          <div v-for="s in staff" :key="s.id" class="da-row">
            <span class="da-name">{{ s.name }}</span>
            <span class="yali-muted">{{ s.class || '—' }}</span>
            <span class="yali-chip">{{ s.department || '未分配' }}</span>
            <button class="da-del" type="button" title="删除" @click="removeStaff(s)">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="13" />
            </button>
          </div>
        </section>
      </template>

      <!-- ── 评分 ── -->
      <template v-else-if="tabIndex === 2">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'评分记录（' + scores.length + ' 条）'" :FontSize="15" :FontWeight="500" />
            <Button @Click="openScoreDialog">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.add" :FontSize="13" /><span>手动加减分</span>
              </span>
            </Button>
          </div>
          <p v-if="!scores.length" class="yali-muted da-gap">暂无评分记录</p>
          <div v-for="r in scores" :key="r.id" class="da-row" :class="{ 'is-cancelled': r.is_cancelled }">
            <span class="da-name">{{ r.name }}</span>
            <span class="yali-muted">{{ r.date }} {{ r.period || '' }}</span>
            <span class="da-score" :class="Number(r.score) >= 0 ? 'da-plus' : 'da-minus'">
              {{ Number(r.score) > 0 ? '+' + r.score : r.score }}
            </span>
            <span class="yali-muted da-reason">{{ r.reason || '' }}</span>
            <button v-if="!r.is_cancelled" class="da-del" type="button" title="取消该记录"
                    @click="cancelScore(r)">
              <FontIcon :Glyph="GLYPH.close" :FontSize="13" />
            </button>
            <span v-else class="yali-chip">已取消</span>
          </div>
        </section>
      </template>

      <!-- ── 时段 ── -->
      <template v-else>
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock Text="时段配置" :FontSize="15" :FontWeight="500" />
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!savingPeriods" @Click="savePeriods">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.check" :FontSize="13" />
                <span>{{ savingPeriods ? '保存中…' : '保存时段' }}</span>
              </span>
            </Button>
          </div>
          <p v-if="!periods.length" class="yali-muted da-gap">暂无配置</p>
          <div v-for="(p, i) in periods" :key="p.id ?? p.label" class="da-period">
            <span class="da-name">{{ p.label }}</span>
            <ComboBox :ItemsSource="SLOT_TYPES" :SelectedIndex="slotIndex(p)"
                      @SelectionChanged="(a) => (p.slot_type = SLOT_VALUES[a?.SelectedIndex ?? 0])"
                      class="da-period-slot" />
            <TextBox v-model:Text="p.start_time" PlaceholderText="09:00" :MaxLength="5" class="da-period-time" />
            <NumberBox v-model:Value="p.auto_absent_min" :Minimum="0" :Maximum="120"
                       class="da-period-min" />
            <span class="yali-muted da-period-hint">缺岗判定（分钟）</span>
            <button class="da-del" type="button" title="删除该时段" @click="removePeriod(i)">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="14" />
            </button>
          </div>
          <div class="yali-form-actions da-gap">
            <Button @Click="addPeriod">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.add" :FontSize="13" /><span>新增时段</span>
              </span>
            </Button>
          </div>
          <p class="yali-muted da-gap">
            时段名称是签到记录的键，改动只影响展示与判定时间；标记为「不考勤」的时段不会出现在评分选择里。
          </p>
        </section>
      </template>
    </div>

    <!-- 添加干事 -->
    <ContentDialog :IsOpen="staffDialog" Title="添加干事" CloseButtonText="取消"
                   @update:IsOpen="staffDialog = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">姓名 <em>*</em></span>
          <TextBox v-model:Text="staffDraft.name" PlaceholderText="干事姓名" :MaxLength="50" />
        </label>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">班级</span>
            <TextBox v-model:Text="staffDraft.class" PlaceholderText="如 2501" :MaxLength="4" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">部门</span>
            <ComboBox :ItemsSource="DEPARTMENTS" v-model:SelectedIndex="staffDeptIndex" />
          </label>
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!busy" @Click="staffDialog = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="addStaff">
            <span class="yali-btn-inner"><span>添加</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 销分（后端要 score_record_id + reason + admin_id + password 四项，
         其中 reason 是必填、admin_id 必须是一个真实管理员账号用于验密） -->
    <ContentDialog :IsOpen="cancelDialog" Title="取消评分记录" CloseButtonText="取消"
                   @update:IsOpen="cancelDialog = $event">
      <div class="yali-form">
        <p class="yali-muted">
          将取消 {{ cancelTarget?.name }} 在 {{ cancelTarget?.date }} {{ cancelTarget?.period }} 的记录
          （{{ Number(cancelTarget?.score ?? 0) > 0 ? '+' : '' }}{{ cancelTarget?.score }} 分）
        </p>
        <label class="yali-field">
          <span class="yali-field-label">销分人 <em>*</em></span>
          <ComboBox :ItemsSource="adminNames" :SelectedIndex="cancelAdminIndex"
                    @SelectionChanged="(a) => (cancelAdminIndex = a?.SelectedIndex ?? -1)"
                    PlaceholderText="选择管理员" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">取消原因 <em>*</em></span>
          <TextBox v-model:Text="cancelReason" PlaceholderText="如：录入有误" :MaxLength="200" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">密码 <em>*</em></span>
          <PasswordBox v-model:Password="cancelPassword" PlaceholderText="销分人账号密码" />
        </label>
        <div class="yali-form-actions">
          <Button :IsEnabled="!busy" @Click="cancelDialog = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="confirmCancelScore">
            <span class="yali-btn-inner"><span>{{ busy ? '处理中…' : '确认取消' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 手动加减分 -->
    <ContentDialog :IsOpen="scoreDialog" Title="手动加减分" CloseButtonText="取消"
                   @update:IsOpen="scoreDialog = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">干事 <em>*</em></span>
          <ComboBox :ItemsSource="staffNames" :SelectedIndex="scoreStaffIndex"
                    @SelectionChanged="(a) => (scoreStaffIndex = a?.SelectedIndex ?? -1)"
                    PlaceholderText="选择干事" />
        </label>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">时段 <em>*</em></span>
            <ComboBox :ItemsSource="scorePeriodNames" :SelectedIndex="scorePeriodIndex"
                      @SelectionChanged="(a) => (scorePeriodIndex = a?.SelectedIndex ?? -1)"
                      PlaceholderText="选择时段" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">分值（正数加分 / 负数扣分）</span>
            <NumberBox v-model:Value="scoreDraft.score" PlaceholderText="如 2 或 -1" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">日期</span>
            <TextBox v-model:Text="scoreDraft.date" PlaceholderText="YYYY-MM-DD" />
          </label>
        </div>
        <label class="yali-field">
          <span class="yali-field-label">原因</span>
          <TextBox v-model:Text="scoreDraft.reason" PlaceholderText="选填" :MaxLength="200" />
        </label>
        <div class="yali-form-actions">
          <Button :IsEnabled="!busy" @Click="scoreDialog = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="addScore">
            <span class="yali-btn-inner"><span>提交</span></span>
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
import { apiDel, apiGet, apiPost, toast } from '../../shared/api'

const TABS = ['排班', '干事', '评分', '时段']
const tabItems = TABS.map((Text) => ({ Text }))

/** 标签页可由 ?tab=<序号或名称> 指定，便于分享链接与刷新后保持 */
const initialTab = (() => {
  const raw = new URLSearchParams(window.location.search).get('tab')
  if (!raw) return 0
  const byName = TABS.indexOf(raw)
  if (byName >= 0) return byName
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n < TABS.length ? n : 0
})()
const tabIndex = ref(initialTab)

watch(tabIndex, (i) => {
  const url = new URL(window.location.href)
  if (i === 0) url.searchParams.delete('tab')
  else url.searchParams.set('tab', String(i))
  window.history.replaceState(null, '', url)
})
const busy = ref(false)

const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/* ── 排班 ── */
interface ScheduleRow {
  date: string
  a_name?: string
  b_name?: string
  cancelled?: boolean
}
const schedule = ref<ScheduleRow[]>([])
const scheduleLoading = ref(false)
const weekStart = ref(startOfWeek(new Date()))

function startOfWeek(d: Date) {
  const x = new Date(d)
  x.setDate(x.getDate() - x.getDay())
  x.setHours(0, 0, 0, 0)
  return x
}

const scheduleRangeText = computed(() => {
  const s = weekStart.value
  const e = new Date(s)
  e.setDate(e.getDate() + 13)
  return `${fmt(s)} 起两周排班`
})

function fmt(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function shiftWeeks(delta: number) {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + delta)
  weekStart.value = d
  loadSchedule()
}

/** 两周日历（周日为一周之首） */
const calendar = computed(() => {
  const map: Record<string, ScheduleRow> = {}
  for (const r of schedule.value) map[(r.date || '').slice(0, 10)] = r

  const today = fmt(new Date())
  const cells: Array<null | { day: number; a?: string; b?: string; isToday: boolean }> = []
  const start = new Date(weekStart.value)
  for (let i = 0; i < 14; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = fmt(d)
    const row = map[key]
    cells.push({
      day: d.getDate(),
      a: row?.a_name,
      b: row?.b_name,
      isToday: key === today
    })
  }
  return cells
})

async function loadSchedule() {
  scheduleLoading.value = true
  try {
    const s = weekStart.value
    const e = new Date(s)
    e.setDate(e.getDate() + 13)
    schedule.value = (await apiGet<ScheduleRow[]>(
      `/api/duty/schedule?start=${fmt(s)}&end=${fmt(e)}`
    )) ?? []
  } catch (err) {
    toast((err as Error).message, 'error')
    schedule.value = []
  } finally {
    scheduleLoading.value = false
  }
}

async function generate() {
  if (!window.confirm('将自动生成未来 60 个工作日的排班（跳过周末），继续？')) return
  try {
    await apiPost('/api/duty/schedule/generate')
    toast('排班已生成', 'success')
    loadSchedule()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function clearAll() {
  if (!window.confirm('确定清空所有排班、考勤与评分记录吗？此操作不可撤销。')) return
  if (!window.confirm('再次确认：清空后无法恢复，是否继续？')) return
  try {
    await apiPost('/api/duty/schedule/clear-all')
    toast('已清空', 'success')
    loadSchedule()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 干事 ── */
interface Staff {
  id: number
  name: string
  class?: string
  department?: string
}
const staff = ref<Staff[]>([])
const staffNames = computed(() => staff.value.map((s) => s.name))

const staffDialog = ref(false)
const staffDeptIndex = ref(-1)
const staffDraft = reactive({ name: '', class: '' })

async function loadStaff() {
  try {
    staff.value = (await apiGet<Staff[]>('/api/duty/staff')) ?? []
  } catch {
    staff.value = []
  }
}

async function addStaff() {
  if (!staffDraft.name.trim()) return toast('请填写姓名', 'error')
  busy.value = true
  try {
    await apiPost('/api/duty/staff', {
      name: staffDraft.name.trim(),
      class: staffDraft.class.trim(),
      department: staffDeptIndex.value >= 0 ? DEPARTMENTS[staffDeptIndex.value] : ''
    })
    toast('已添加', 'success')
    staffDialog.value = false
    staffDraft.name = ''
    staffDraft.class = ''
    staffDeptIndex.value = -1
    loadStaff()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

async function removeStaff(s: Staff) {
  if (!window.confirm(`确定删除干事「${s.name}」吗？`)) return
  try {
    await apiDel(`/api/duty/staff/${s.id}`)
    staff.value = staff.value.filter((x) => x.id !== s.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 评分 ── */
interface ScoreRow {
  id: number
  date: string
  name: string
  period?: string
  score: number
  reason?: string
  is_cancelled?: boolean
}
const scores = ref<ScoreRow[]>([])
const scoreDialog = ref(false)
const scoreStaffIndex = ref(-1)
const scorePeriodIndex = ref(-1)
const scoreDraft = reactive({ score: 0, date: fmt(new Date()), reason: '' })

/** 评分可选时段：排除标记为「不考勤」的时段（与原页面一致） */
const scorePeriods = computed(() => periods.value.filter((p) => p.slot_type !== 'no_duty'))
const scorePeriodNames = computed(() => scorePeriods.value.map((p) => p.label))

/** 打开评分对话框前确保时段已加载（时段只在切到第 4 个标签时才拉取） */
async function openScoreDialog() {
  if (!periods.value.length) await loadPeriods()
  scorePeriodIndex.value = scorePeriods.value.length ? 0 : -1
  scoreDialog.value = true
}

async function loadScores() {
  try {
    const from = fmt(new Date(Date.now() - 30 * 86400000))
    scores.value = (await apiGet<ScoreRow[]>(`/api/duty/scores?date_from=${from}`)) ?? []
  } catch {
    scores.value = []
  }
}

async function addScore() {
  if (scoreStaffIndex.value < 0) return toast('请选择干事', 'error')
  if (scorePeriodIndex.value < 0) return toast('请选择时段', 'error')
  if (!scoreDraft.score) return toast('请填写分值', 'error')
  busy.value = true
  try {
    // 后端要的是 staff_id + period，不是姓名；此前传 name 会以「缺少必填字段」失败
    const target = staff.value[scoreStaffIndex.value]
    await apiPost('/api/duty/scores/add', {
      staff_id: target?.id,
      period: scorePeriods.value[scorePeriodIndex.value]?.label,
      score: Number(scoreDraft.score),
      date: scoreDraft.date,
      reason: scoreDraft.reason
    })
    toast('已记录', 'success')
    scoreDialog.value = false
    scoreDraft.score = 0
    scoreDraft.reason = ''
    loadScores()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

/* ── 销分 ── */
interface AdminUser { id: number; name: string; role: string }

const cancelDialog = ref(false)
const cancelTarget = ref<ScoreRow | null>(null)
const cancelReason = ref('')
const cancelPassword = ref('')
const cancelAdminIndex = ref(-1)
const admins = ref<AdminUser[]>([])
const adminNames = computed(() => admins.value.map((a) => `${a.name}（${a.role}）`))

async function loadAdmins() {
  try {
    admins.value = (await apiGet<AdminUser[]>('/api/duty/admins')) ?? []
  } catch {
    admins.value = []
  }
}

async function cancelScore(r: ScoreRow) {
  cancelTarget.value = r
  cancelReason.value = ''
  cancelPassword.value = ''
  cancelAdminIndex.value = -1
  if (!admins.value.length) await loadAdmins()
  cancelDialog.value = true
}

async function confirmCancelScore() {
  const r = cancelTarget.value
  if (!r) return
  if (cancelAdminIndex.value < 0) return toast('请选择销分人', 'error')
  if (!cancelReason.value.trim()) return toast('请填写取消原因', 'error')
  if (!cancelPassword.value) return toast('请输入密码', 'error')
  busy.value = true
  try {
    // 后端字段：score_record_id / reason / admin_id / password（不是 record_id）
    await apiPost('/api/duty/scores/cancel', {
      score_record_id: r.id,
      reason: cancelReason.value.trim(),
      admin_id: admins.value[cancelAdminIndex.value]?.id,
      password: cancelPassword.value
    })
    r.is_cancelled = true
    cancelDialog.value = false
    toast('已取消该评分记录', 'success')
    loadScores()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

/* ── 时段（后端 /api/duty/periods 支持 PUT，字段：label / slot_type / sort_order / start_time / auto_absent_min） ── */
interface PeriodConfig {
  label: string
  id?: number
  slot_type?: string
  sort_order?: number
  start_time?: string
  auto_absent_min?: number
}

const SLOT_VALUES = ['small_break', 'big_break', 'no_duty']
const SLOT_TYPES = ['小课间', '大课间', '不考勤']

const periods = ref<PeriodConfig[]>([])
const savingPeriods = ref(false)

function slotIndex(p: PeriodConfig) {
  const i = SLOT_VALUES.indexOf(p.slot_type ?? '')
  return i >= 0 ? i : 0
}

function addPeriod() {
  periods.value.push({
    label: '',
    slot_type: 'small_break',
    sort_order: periods.value.length + 1,
    start_time: '08:00',
    auto_absent_min: 10
  })
}

function removePeriod(i: number) {
  if (!window.confirm(`确定删除时段「${periods.value[i]?.label || '（未命名）'}」吗？`)) return
  periods.value.splice(i, 1)
}

async function savePeriods() {
  const payload = periods.value.map((p, i) => ({
    id: p.id,
    label: (p.label || '').trim(),
    slot_type: p.slot_type || 'small_break',
    sort_order: p.sort_order ?? i + 1,
    start_time: p.start_time || '08:00',
    auto_absent_min: Number(p.auto_absent_min ?? 10)
  }))
  if (payload.some((p) => !p.label)) {
    toast('时段名称不能为空', 'error')
    return
  }
  if (payload.some((p) => !/^\d{1,2}:\d{2}$/.test(p.start_time))) {
    toast('开始时间格式应为 HH:MM', 'error')
    return
  }
  savingPeriods.value = true
  try {
    await apiPut('/api/duty/periods', { periods: payload })
    toast('时段配置已保存', 'success')
    await loadPeriods()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    savingPeriods.value = false
  }
}

async function loadPeriods() {
  try {
    periods.value = (await apiGet<PeriodConfig[]>('/api/duty/periods')) ?? []
  } catch {
    periods.value = []
  }
}

function loadForTab(i: number) {
  if (i === 0) loadSchedule()
  else if (i === 1) loadStaff()
  else if (i === 2) {
    loadScores()
    loadStaff()
  } else loadPeriods()
}

watch(tabIndex, loadForTab)

onMounted(() => {
  loadSchedule()
  loadStaff()
  // 若通过 ?tab= 直接落在别的标签，补上该标签的数据
  if (tabIndex.value !== 0) loadForTab(tabIndex.value)
})
</script>

<style>
.da-pivot {
  margin-bottom: 16px;
}
.da-gap {
  margin-top: 12px;
}
.da-cal {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-top: 14px;
}
.da-cal-head {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding-bottom: 4px;
}
.da-cal-cell {
  min-height: 72px;
  padding: 6px 8px;
  border: 1px solid var(--stroke-divider);
  border-radius: 6px;
  background: var(--card-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.da-cal-cell.is-today {
  border-color: var(--accent-base);
}
.da-cal-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.da-cal-name {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.da-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
  font-size: 13px;
}
.da-row.is-cancelled {
  opacity: 0.55;
}
.da-name {
  font-weight: 500;
  color: var(--text-primary);
  min-width: 72px;
}
.da-score {
  font-weight: 600;
  min-width: 36px;
}
.da-plus {
  color: #0f7b0f;
}
.da-minus {
  color: #c42b1c;
}
html.theme-dark .da-plus {
  color: #6ccb5f;
}
html.theme-dark .da-minus {
  color: #ff99a4;
}
.da-reason {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.da-del {
  margin-left: auto;
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 4px;
}
.da-del:hover {
  background: var(--subtle-tertiary);
  color: var(--text-primary);
}

/* 时段配置编辑行 */
.da-period {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
  font-size: 13px;
}
.da-period-slot {
  width: 132px;
}
.da-period-time {
  width: 90px;
}
.da-period-min {
  width: 92px;
}
.da-period-hint {
  font-size: 12px;
}
.da-period .da-del {
  margin-left: auto;
}

@media (max-width: 640px) {
  .da-period {
    flex-wrap: wrap;
  }
  .da-period-slot,
  .da-period-time,
  .da-period-min {
    flex: 1 1 120px;
    width: auto;
  }
}

@media (max-width: 640px) {
  .da-cal-cell {
    min-height: 56px;
    padding: 4px;
  }
  .da-row {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
