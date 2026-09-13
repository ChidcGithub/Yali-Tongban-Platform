<template>
  <YaliShell current="duty-admin" title="值日管理">
    <div class="yali-page">
      <!-- SelectorBar 的 SelectionChanged 首参是 sender，只暴露 Items / SelectedItem，
           没有 SelectedIndex —— 必须自己 indexOf，否则 tabIndex 恒被写回 0 -->
      <SelectorBar :Items="tabItems" :SelectedItem="tabItems[tabIndex]" class="da-pivot"
                   @SelectionChanged="(a) => (tabIndex = a?.Items?.indexOf(a.SelectedItem) ?? 0)" />

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
              <Button @Click="exportSchedule">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.download" :FontSize="13" /><span>导出排班</span>
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
            <!-- 点日期单元格手动排 / 删当天的班（旧版 openScheduleModal → /schedule/manual） -->
            <button v-for="(cell, i) in calendar" :key="i" type="button" class="da-cal-cell"
                    :class="{ 'is-empty': !cell, 'is-today': cell?.isToday, 'is-set': !!cell?.a_id }"
                    @click="cell && openManual(cell)">
              <template v-if="cell">
                <span class="da-cal-date">{{ cell.day }}</span>
                <span v-if="cell.a" class="da-cal-name">{{ cell.a }}</span>
                <span v-else class="da-cal-name yali-muted">未排班</span>
                <span v-if="cell.b" class="da-cal-name yali-muted">{{ cell.b }}</span>
              </template>
            </button>
          </div>
          <p class="yali-muted da-gap">点日期可手动指定当天的两名干事</p>
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
            <span v-if="!s.user_id" class="yali-chip yali-chip-warn" title="还未绑定平台账号">未映射</span>
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
            <TextBlock :Text="'评分记录（' + filteredScores.length + ' 条）'" :FontSize="15" :FontWeight="500" />
            <div class="da-head-btns">
              <Button :IsEnabled="selectedScoreIds.length > 0" @Click="openBatchCancel">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.close" :FontSize="13" />
                  <span>批量销分{{ selectedScoreIds.length ? ' (' + selectedScoreIds.length + ')' : '' }}</span>
                </span>
              </Button>
              <Button @Click="openScoreDialog">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.add" :FontSize="13" /><span>手动加减分</span>
                </span>
              </Button>
            </div>
          </div>

          <!-- 筛选（旧版 admin.js 的部门 / 状态 / 姓名三重筛选） -->
          <div class="da-filters">
            <ComboBox :ItemsSource="scoreDeptItems" v-model:SelectedIndex="scoreDeptIndex" class="da-filter-dept" />
            <ToggleSwitch v-model:IsOn="scoreOnlyActive" OnContent="仅未销分" OffContent="全部" />
            <TextBox v-model:Text="scoreKeyword" PlaceholderText="按姓名搜索" :MaxLength="20" class="da-filter-kw" />
            <Button v-if="scores.length" @Click="toggleSelectAll">
              <span class="yali-btn-inner"><span>{{ allSelected ? '取消全选' : '全选' }}</span></span>
            </Button>
          </div>

          <p v-if="!filteredScores.length" class="yali-muted da-gap">暂无评分记录</p>
          <div v-for="r in filteredScores" :key="r.id" class="da-row" :class="{ 'is-cancelled': r.is_cancelled }">
            <CheckBox v-if="!r.is_cancelled" :IsChecked="selectedScoreIds.includes(r.id)"
                      @update:IsChecked="(v) => toggleScoreSelection(r.id, v)" />
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
            <!-- ComboBox 的 SelectionChanged 只带 {AddedItems,RemovedItems}，没有 SelectedIndex；
                 索引只从 update:SelectedIndex 出来 -->
            <ComboBox :ItemsSource="SLOT_TYPES" :SelectedIndex="slotIndex(p)"
                      @update:SelectedIndex="(i) => (p.slot_type = SLOT_VALUES[i] ?? SLOT_VALUES[0])"
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
                    @update:SelectedIndex="(i) => (cancelAdminIndex = i ?? -1)"
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
                    @update:SelectedIndex="(i) => (scoreStaffIndex = i ?? -1)"
                    PlaceholderText="选择干事" />
        </label>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">时段 <em>*</em></span>
            <ComboBox :ItemsSource="scorePeriodNames" :SelectedIndex="scorePeriodIndex"
                      @update:SelectedIndex="(i) => (scorePeriodIndex = i ?? -1)"
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

    <!-- 批量销分（旧版 duty-admin.js 的复选框 + 全选 + 批量销分） -->
    <ContentDialog :IsOpen="batchDialog" :Title="'批量销分 · ' + selectedScoreIds.length + ' 条'"
                   CloseButtonText="取消" @update:IsOpen="batchDialog = $event">
      <div class="yali-form">
        <p class="yali-muted">将对所选的 {{ selectedScoreIds.length }} 条记录执行销分并回滚对应考勤得分。</p>
        <label class="yali-field">
          <span class="yali-field-label">销分人 <em>*</em></span>
          <ComboBox :ItemsSource="adminNames" v-model:SelectedIndex="batchAdminIndex"
                    PlaceholderText="选择管理员" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">销分理由 <em>*</em></span>
          <TextBox v-model:Text="batchReason" PlaceholderText="如：排班调整，原扣分作废" :MaxLength="200" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">销分人密码 <em>*</em></span>
          <PasswordBox v-model:Password="batchPassword" PlaceholderText="输入销分人密码以确认" />
        </label>
        <div class="yali-form-actions">
          <Button :IsEnabled="!busy" @Click="batchDialog = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="confirmBatchCancel">
            <span class="yali-btn-inner"><span>确认销分</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 手动排班（点日历某一天打开；旧版 openScheduleModal） -->
    <ContentDialog :IsOpen="manualOpen" :Title="'手动排班 · ' + manualDate" CloseButtonText="取消"
                   @update:IsOpen="manualOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">干事 A <em>*</em></span>
          <ComboBox :ItemsSource="staffOptions" v-model:SelectedIndex="manualAIndex"
                    PlaceholderText="选择干事" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">干事 B <em>*</em></span>
          <ComboBox :ItemsSource="staffOptions" v-model:SelectedIndex="manualBIndex"
                    PlaceholderText="选择干事" />
        </label>
        <p class="yali-muted">当前：{{ manualHasRecord ? manualA + ' / ' + manualB : '未排班' }}</p>
        <div class="yali-form-actions">
          <Button v-if="manualHasRecord" :IsEnabled="!busy" @Click="deleteManual">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>删除当天排班</span>
            </span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="saveManual">
            <span class="yali-btn-inner"><span>保存</span></span>
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
import { apiDel, apiGet, apiPost, apiPut, isAdmin, toast } from '../../shared/api'

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
  staff_a_id?: number
  staff_b_id?: number
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
  const cells: Array<null | {
    day: number
    date: string
    a?: string
    b?: string
    a_id?: number
    b_id?: number
    isToday: boolean
  }> = []
  const start = new Date(weekStart.value)
  for (let i = 0; i < 14; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = fmt(d)
    const row = map[key]
    cells.push({
      day: d.getDate(),
      date: key,
      a: row?.a_name,
      b: row?.b_name,
      a_id: row?.staff_a_id,
      b_id: row?.staff_b_id,
      isToday: key === today
    })
  }
  return cells
})

/* ── 手动排班（旧版 openScheduleModal / saveManualSchedule / deleteManualSchedule） ── */
const manualOpen = ref(false)
const manualDate = ref('')
const manualHasRecord = ref(false)
const manualA = ref('')
const manualB = ref('')
const manualAIndex = ref(-1)
const manualBIndex = ref(-1)
/** 下拉里带部门+班级，避免同名干事选错 */
const staffOptions = computed(() =>
  staff.value.map((s) => `${s.department || ''}${s.class || ''} ${s.name}`.trim())
)

async function openManual(cell: { date: string; a_id?: number; b_id?: number }) {
  manualDate.value = cell.date
  manualHasRecord.value = !!cell.a_id
  // 干事列表可能还没加载过（用户没进过「干事」标签）
  if (!staff.value.length) await loadStaff()
  const ai = staff.value.findIndex((s) => s.id === cell.a_id)
  const bi = staff.value.findIndex((s) => s.id === cell.b_id)
  manualAIndex.value = ai
  manualBIndex.value = bi
  manualA.value = ai >= 0 ? staff.value[ai].name : ''
  manualB.value = bi >= 0 ? staff.value[bi].name : ''
  manualOpen.value = true
}

async function saveManual() {
  const a = manualAIndex.value >= 0 ? staff.value[manualAIndex.value] : null
  const b = manualBIndex.value >= 0 ? staff.value[manualBIndex.value] : null
  if (!a || !b) return toast('请选择两名干事', 'error')
  if (a.id === b.id) return toast('两名干事不能相同', 'error')
  busy.value = true
  try {
    await apiPost('/api/duty/schedule/manual', {
      date: manualDate.value,
      staff_a_id: a.id,
      staff_b_id: b.id
    })
    toast('排班已保存', 'success')
    manualOpen.value = false
    await loadSchedule()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

async function deleteManual() {
  if (!window.confirm(`确定删除 ${manualDate.value} 的排班吗？`)) return
  busy.value = true
  try {
    await apiDel(`/api/duty/schedule/manual?date=${encodeURIComponent(manualDate.value)}`)
    toast('排班已删除', 'success')
    manualOpen.value = false
    await loadSchedule()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

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

/** 导出当前可见的两周排班（后端 /api/duty/schedule/export 直接回 CSV） */
async function exportSchedule() {
  const s = weekStart.value
  const e = new Date(s)
  e.setDate(e.getDate() + 13)
  try {
    const res = await fetch(`/api/duty/schedule/export?start=${fmt(s)}&end=${fmt(e)}`)
    if (!res.ok) {
      let msg = '导出失败'
      try {
        const d = await res.json()
        if (d?.error) msg = d.error
      } catch { /* 非 JSON */ }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `duty-schedule-${fmt(s)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
  /** 0 表示还没绑定平台账号（旧版会打「未映射」徽标） */
  user_id?: number
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
  department?: string
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
    selectedScoreIds.value = []
  } catch {
    scores.value = []
  }
}

/* ── 评分筛选：部门 / 是否已销分 / 姓名（旧版三重筛选） ── */
const scoreDeptIndex = ref(0)
const scoreOnlyActive = ref(false)
const scoreKeyword = ref('')
const scoreDeptItems = computed(() => {
  const depts: string[] = []
  for (const r of scores.value) {
    if (r.department && !depts.includes(r.department)) depts.push(r.department)
  }
  return ['全部部门', ...depts]
})
const filteredScores = computed(() => {
  const dept = scoreDeptIndex.value > 0 ? scoreDeptItems.value[scoreDeptIndex.value] : ''
  const kw = scoreKeyword.value.trim()
  return scores.value.filter((r) => {
    if (dept && r.department !== dept) return false
    if (scoreOnlyActive.value && r.is_cancelled) return false
    if (kw && !r.name.includes(kw)) return false
    return true
  })
})

/* ── 批量销分 ── */
const selectedScoreIds = ref<number[]>([])
const batchDialog = ref(false)
const batchAdminIndex = ref(-1)
const batchReason = ref('')
const batchPassword = ref('')

const allSelected = computed(
  () =>
    filteredScores.value.length > 0 &&
    filteredScores.value.every((r) => r.is_cancelled || selectedScoreIds.value.includes(r.id))
)

function toggleScoreSelection(id: number, checked: boolean) {
  const set = new Set(selectedScoreIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  selectedScoreIds.value = [...set]
}

function toggleSelectAll() {
  if (allSelected.value) selectedScoreIds.value = []
  else selectedScoreIds.value = filteredScores.value.filter((r) => !r.is_cancelled).map((r) => r.id)
}

async function openBatchCancel() {
  if (!selectedScoreIds.value.length) return toast('请先选择记录', 'error')
  batchReason.value = ''
  batchPassword.value = ''
  batchAdminIndex.value = -1
  if (!admins.value.length) await loadAdmins()
  batchDialog.value = true
}

async function confirmBatchCancel() {
  if (batchAdminIndex.value < 0) return toast('请选择销分人', 'error')
  if (!batchReason.value.trim()) return toast('请填写销分理由', 'error')
  if (!batchPassword.value) return toast('请输入密码', 'error')
  busy.value = true
  try {
    const res = await apiPost<{ cancelled?: number }>('/api/duty/scores/batch-cancel', {
      score_record_ids: selectedScoreIds.value,
      reason: batchReason.value.trim(),
      admin_id: admins.value[batchAdminIndex.value]?.id,
      password: batchPassword.value
    })
    toast(`已销分 ${res?.cancelled ?? selectedScoreIds.value.length} 条`, 'success')
    batchDialog.value = false
    await loadScores()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
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
  /* 非管理员进来只会看到满屏 403 —— 请回值日页（旧版 duty-admin.js 开头就是 requireAdmin()） */
  if (!isAdmin()) {
    window.location.replace('duty.html')
    return
  }
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
  /* 格子现在是 <button>，需要清掉浏览器默认按钮样式 */
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.da-cal-cell:hover {
  border-color: var(--accent-base);
}
.da-cal-cell.is-set {
  border-left: 3px solid var(--accent-base);
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
