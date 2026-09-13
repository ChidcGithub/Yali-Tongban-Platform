<template>
  <div class="hall-section">
    <!-- ── 审核面板（仅审核人：管理员或社团部） ── -->
    <section v-if="isReviewer && pending.length" class="hall-review-panel">
      <div class="hall-review-header" @click="reviewOpen = !reviewOpen">
        <span>待审核</span>
        <span class="hall-review-badge">{{ pending.length }}</span>
        <span class="hall-review-toggle">{{ reviewOpen ? '收起' : '展开' }}</span>
      </div>
      <div v-show="reviewOpen" class="hall-review-body">
        <div v-for="p in pending" :key="p.booking.id" class="hall-review-item">
          <div class="hall-review-item-header">
            <strong>{{ p.booking.date }} {{ p.booking.start_time }}–{{ p.booking.end_time }}</strong>
            <span class="yali-chip">{{ p.booking.applicant }}</span>
          </div>
          <div class="hall-review-meta">用途：{{ p.booking.purpose }}</div>
          <div v-if="p.conflicts.length" class="hall-review-meta hall-review-conflict">
            时间冲突 {{ p.conflicts.length }} 项：
            <span v-for="(c, i) in p.conflicts" :key="c.id">
              {{ i ? '、' : '' }}{{ c.start_time }}–{{ c.end_time }}
              {{ c.applicant }}（{{ statusText(c.status) }}）
            </span>
          </div>
          <div class="hall-review-actions">
            <button class="btn btn-sm btn-primary" type="button" @click="review(p.booking, 'approve')">
              批准
            </button>
            <button class="btn btn-sm btn-danger" type="button" @click="review(p.booking, 'reject')">
              拒绝
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 日期选择 ── -->
    <section class="yali-section">
      <div class="hall-cal-wrap">
        <div class="hall-cal">
          <div v-for="d in days" :key="d.str" class="hall-cal-day"
               :class="{ 'hall-cal-active': d.str === selectedDate, 'hall-cal-today': d.str === todayStr }"
               @click="selectDate(d.str)">
            <div class="hall-cal-weekday">{{ d.weekday }}</div>
            <div class="hall-cal-date">{{ d.day }}</div>
            <div class="hall-cal-month">{{ d.month }}月</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 时段表 ── -->
    <section class="yali-section">
      <div class="hall-timeline-wrap">
        <div class="hall-timeline-title">{{ dateTitle }}</div>
        <div class="hall-timeline" :style="{ height: totalPx + 'px' }">
          <div class="hall-timeline-ruler">
            <div v-for="h in hourMarks" :key="'r' + h" class="hall-timeline-ruler-hour"
                 :style="{ top: ((h - HALL_START) * PX_PER_HOUR + PAD_TOP) + 'px' }">
              {{ String(h).padStart(2, '0') }}:00
            </div>
          </div>
          <div class="hall-timeline-grid"
               @mousedown="onGridDown"
               @touchstart.passive="onTouchStart"
               @click="onGridClick">
            <template v-for="h in hourLines" :key="'l' + h">
              <div class="hall-timeline-line" :style="{ top: ((h - HALL_START) * PX_PER_HOUR + PAD_TOP) + 'px' }" />
              <div v-if="h < HALL_END" class="hall-timeline-line-half"
                   :style="{ top: ((h - HALL_START) * PX_PER_HOUR + PAD_TOP + PX_PER_HOUR / 2) + 'px' }" />
            </template>

            <div v-for="c in dayCards" :key="c.b.id" :class="c.cls"
                 :style="c.style" @click.stop="showDetail(c.b)">
              <div class="hall-timeline-card-body">
                <div class="hall-timeline-title">
                  {{ c.b.applicant }}
                  <span :class="c.tagCls">{{ statusText(c.b.status) }}</span>
                </div>
                <div class="hall-timeline-time">{{ c.b.start_time }}─{{ c.b.end_time }}</div>
                <div class="hall-timeline-purpose">{{ c.b.purpose }}</div>
                <div v-if="c.mine && c.b.status === 'pending'" class="hall-timeline-btn-row">
                  <button type="button" @click.stop="withdraw(c.b)">撤回</button>
                </div>
              </div>
              <div v-if="canDelete(c.b)" class="hall-timeline-card-actions">
                <button class="hall-timeline-card-del" type="button" title="删除"
                        @click.stop="removeBooking(c.b)">✕</button>
              </div>
            </div>

            <!-- 拖选高亮 -->
            <div v-if="dragging" class="hall-timeline-selection"
                 :style="{ top: selTop + 'px', height: selHeight + 'px', opacity: 1 }">
              <div class="hall-timeline-selection-label">{{ selLabel }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 自定义时间 ──
           ComboBox 的 SelectionChanged 只带 {AddedItems,RemovedItems}，没有 SelectedIndex；
           四个下拉都必须用 v-model:SelectedIndex，否则每次选择都被重置回 0，
           起止时间恒为 07:00–07:00 → 提交永远弹「结束时间必须晚于开始时间」。 -->
      <div class="hall-custom-row">
        <span class="hall-custom-label">自定义</span>
        <ComboBox :ItemsSource="HOURS" v-model:SelectedIndex="startHIndex" class="hall-custom-h" />
        <span class="hall-custom-sep">:</span>
        <ComboBox :ItemsSource="MINUTES" v-model:SelectedIndex="startMIndex" class="hall-custom-m" />
        <span class="hall-custom-sep">至</span>
        <ComboBox :ItemsSource="HOURS" v-model:SelectedIndex="endHIndex" class="hall-custom-h" />
        <span class="hall-custom-sep">:</span>
        <ComboBox :ItemsSource="MINUTES" v-model:SelectedIndex="endMIndex" class="hall-custom-m" />
        <button class="btn btn-sm btn-primary" type="button" @click="openBookingFromCustom">预约</button>
      </div>
      <p class="yali-muted hall-hint">在上方时段表按住拖动也可以直接选时间段</p>

      <!-- ── 我的预约（待审核 / 被拒绝的只有自己看得到） ── -->
      <template v-if="myPendingOrRejected.length">
        <div class="hall-timeline-title">我的预约</div>
        <div v-for="b in myPendingOrRejected" :key="b.id" class="yali-item">
          <div class="yali-item-head">
            <TextBlock :Text="`${b.date} ${b.start_time}–${b.end_time}`" class="yali-item-title" />
            <span class="yali-chip" :class="b.status === 'rejected' ? 'yali-chip-danger' : 'yali-chip-warn'">
              {{ statusText(b.status) }}
            </span>
          </div>
          <TextBlock :Text="b.purpose" TextWrapping="Wrap" class="yali-item-body" />
          <div class="yali-item-actions">
            <button v-if="b.status === 'pending'" class="btn btn-sm btn-outline" type="button"
                    @click="withdraw(b)">撤回</button>
            <button class="btn btn-sm btn-danger-outline" type="button" @click="removeBooking(b)">删除</button>
          </div>
        </div>
      </template>
    </section>

    <!-- ── 提交预约 ── -->
    <ContentDialog :IsOpen="bookingOpen" Title="预约千人报告厅" CloseButtonText="取消"
                   @update:IsOpen="bookingOpen = $event">
      <div class="yali-form">
        <p class="yali-muted">{{ formatDate(bookingDraft.date) }}</p>
        <div class="yali-form-row">
          <label class="yali-field">
            <span class="yali-field-label">开始 <em>*</em></span>
            <TextBox v-model:Text="bookingDraft.start" PlaceholderText="09:00" :MaxLength="5" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">结束 <em>*</em></span>
            <TextBox v-model:Text="bookingDraft.end" PlaceholderText="11:00" :MaxLength="5" />
          </label>
        </div>
        <label class="yali-field">
          <span class="yali-field-label">用途 <em>*</em></span>
          <TextBox v-model:Text="bookingDraft.purpose" PlaceholderText="如：年级大会、讲座…" :MaxLength="200" />
        </label>
        <div class="yali-form-actions">
          <Button :IsEnabled="!busy" @Click="bookingOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="submitBooking">
            <span class="yali-btn-inner"><span>{{ busy ? '提交中…' : '提交预约' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- ── 预约详情 ── -->
    <ContentDialog :IsOpen="detailOpen" Title="预约详情" CloseButtonText="关闭"
                   @update:IsOpen="detailOpen = $event">
      <div v-if="detail" class="yali-form">
        <div class="hall-detail-row"><span class="hall-detail-label">提交人</span><span>{{ detail.applicant }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">状态</span><span>{{ statusText(detail.status) }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">日期</span><span>{{ detail.date }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">时间</span><span>{{ detail.start_time }} ─ {{ detail.end_time }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">用途</span><span>{{ detail.purpose }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">提交时间</span><span>{{ (detail.created_at || '').slice(0, 16) || '—' }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">审核者</span><span>{{ detail.reviewed_by || '—' }}</span></div>
        <div class="hall-detail-row"><span class="hall-detail-label">审核时间</span><span>{{ (detail.reviewed_at || '').slice(0, 16) || '—' }}</span></div>
      </div>
    </ContentDialog>
  </div>
</template>

<script setup lang="ts">
/* 千人报告厅预约
   后端契约（functions/api/halls.js）：
     GET    /api/hall/bookings           需登录；返回已通过/已作废 + 自己的待审核/已拒绝
     POST   /api/hall/bookings           { date, start_time, end_time, purpose≤200 }
     POST   /api/hall/bookings/:id/withdraw  仅本人的待审核
     DELETE /api/hall/bookings/:id      本人或管理员
     POST   /api/hall/bookings/:id/review    { action: 'approve' | 'reject' }，审核人 = 管理员或社团部
     GET    /api/hall/bookings/pending   审核人；返回 [{ booking, conflicts[] }]
   样式直接复用站点既有的 /css/material/pages/hall.css（只依赖 --md-* token）。 */
import { computed, onMounted, reactive, ref } from 'vue'
import { apiDel, apiGet, apiPost, getUser, isAdmin, toast } from '../../shared/api'

const HALL_START = 6
const HALL_END = 24
const PX_PER_HOUR = 48
const PAD_TOP = 14
const PAD_BOTTOM = 14
const SNAP = 10

const HOURS = Array.from({ length: 15 }, (_, i) => String(i + 7).padStart(2, '0'))
const MINUTES = ['00', '30']

interface HallBooking {
  id: number
  date: string
  start_time: string
  end_time: string
  purpose: string
  applicant: string
  user_id: number
  status: string
  reviewed_by?: string
  reviewed_at?: string
  created_at?: string
}
interface PendingItem { booking: HallBooking; conflicts: HallBooking[] }

const user = getUser()
const isReviewer = !!user && (isAdmin() || user.department === '社团部')

const bookings = ref<HallBooking[]>([])
const pending = ref<PendingItem[]>([])
const reviewOpen = ref(false)
const selectedDate = ref('')
const busy = ref(false)
const dragging = ref(false)

/* ── 日期范围：昨天起 14 天（与原页面一致） ── */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const todayStr = toStr(new Date())
const days = computed(() => {
  const now = new Date()
  const out = []
  for (let i = -1; i < 13; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    out.push({
      str: toStr(d),
      weekday: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      month: d.getMonth() + 1
    })
  }
  return out
})

const dateTitle = computed(() => {
  if (!selectedDate.value) return ''
  const d = new Date(selectedDate.value + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`
})

function formatDate(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`
}

const STATUS_TEXT: Record<string, string> = {
  approved: '已通过', pending: '待审核', cancelled: '已作废', rejected: '已拒绝'
}
const statusText = (s: string) => STATUS_TEXT[s] ?? s

const hourMarks = Array.from({ length: HALL_END - HALL_START + 1 }, (_, i) => i + HALL_START)
const hourLines = hourMarks
const totalPx = (HALL_END - HALL_START) * PX_PER_HOUR + PAD_TOP + PAD_BOTTOM

/* ── 时间与坐标换算 ── */
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fromMin = (min: number) => {
  const v = Math.max(HALL_START * 60, Math.min(min, HALL_END * 60))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
function timeFromY(y: number, isEnd = false) {
  const totalMin = ((y - PAD_TOP) / PX_PER_HOUR) * 60
  const snapped = Math.round(totalMin / SNAP) * SNAP
  let h = HALL_START + Math.floor(snapped / 60)
  let m = snapped % 60
  if (h >= HALL_END) {
    if (isEnd) return '24:00'
    h = HALL_END - 1
    m = 0
  }
  if (h < HALL_START) {
    h = HALL_START
    m = 0
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ── 同一天里重叠的预约分列显示 ── */
function assignColumns(list: HallBooking[]) {
  const meta = new Map<number, { col: number; numCols: number }>()
  if (list.length < 2) {
    for (const b of list) meta.set(b.id, { col: 0, numCols: 1 })
    return meta
  }
  const sorted = [...list].sort(
    (a, b) => a.start_time.localeCompare(b.start_time) || b.end_time.localeCompare(a.end_time)
  )
  // 先切成互不重叠的簇，簇内再分列
  const clusters: HallBooking[][] = []
  let cur: HallBooking[] = []
  let curEnd = '00:00'
  for (const b of sorted) {
    if (cur.length === 0 || b.start_time < curEnd) {
      cur.push(b)
      if (b.end_time > curEnd) curEnd = b.end_time
    } else {
      clusters.push(cur)
      cur = [b]
      curEnd = b.end_time
    }
  }
  if (cur.length) clusters.push(cur)

  for (const cluster of clusters) {
    const cols: string[] = []
    for (const b of cluster) {
      let placed = false
      for (let i = 0; i < cols.length; i++) {
        if (cols[i] <= b.start_time) {
          cols[i] = b.end_time
          meta.set(b.id, { col: i, numCols: 1 })
          placed = true
          break
        }
      }
      if (!placed) {
        cols.push(b.end_time)
        meta.set(b.id, { col: cols.length - 1, numCols: 1 })
      }
    }
    for (const b of cluster) {
      const m = meta.get(b.id)
      if (m) m.numCols = cols.length
    }
  }
  return meta
}

/* ── 当天卡片 ── */
const dayCards = computed(() => {
  const list = bookings.value.filter((b) => b.date === selectedDate.value && b.status !== 'rejected')
  const meta = assignColumns(list)
  return list.map((b) => {
    const sh = toMin(b.start_time)
    const eh = toMin(b.end_time)
    const top = ((sh - HALL_START * 60) / 60) * PX_PER_HOUR + PAD_TOP
    const height = Math.max(((eh - sh) / 60) * PX_PER_HOUR, 24)
    const { col, numCols } = meta.get(b.id) ?? { col: 0, numCols: 1 }
    const mine = isMine(b)
    let cls = 'hall-timeline-card'
    if (numCols > 1) {
      if (col > 0) cls += ' hall-timeline-card-touch-left'
      if (col < numCols - 1) cls += ' hall-timeline-card-touch-right'
    }
    let tagCls = 'hall-timeline-tag'
    if (b.status === 'approved') {
      cls += mine ? ' hall-timeline-card-self' : ' hall-timeline-card-others'
      tagCls += ' hall-timeline-tag-approved'
    } else if (b.status === 'pending') {
      cls += ' hall-timeline-card-pending'
      tagCls += ' hall-timeline-tag-pending'
    } else if (b.status === 'cancelled') {
      cls += ' hall-timeline-card-cancelled'
      tagCls += ' hall-timeline-tag-cancelled'
    }
    const left = numCols > 1 ? `calc(8px + (100% - 16px) * ${col} / ${numCols})` : '8px'
    const width = numCols > 1 ? `calc((100% - 16px) / ${numCols})` : 'calc(100% - 16px)'
    return {
      b,
      cls,
      tagCls,
      mine,
      style: { top: `${top}px`, height: `${height}px`, left, width, zIndex: 2 + col }
    }
  })
})

/**
 * 这条预约是不是自己的。
 *
 * ⚠️ localStorage 里的 user 字段名是 **`id`**（后端 respondWithToken 组的是
 * `{ id, name, role, class_name, department }`），**没有** `userId`。
 * 早先三处都读 `user?.userId` → 恒为 undefined → 「我的预约」永远为空、
 * 用户也撤不回/删不掉自己的预约（只有管理员能动）。
 */
function isMine(b: HallBooking) {
  if (!user) return false
  const uid = (user as { id?: number }).id
  if (uid != null && b.user_id != null) return Number(b.user_id) === Number(uid)
  return !!b.applicant && b.applicant === user.name
}

const myPendingOrRejected = computed(() =>
  bookings.value.filter(
    (b) => isMine(b) && (b.status === 'pending' || b.status === 'rejected')
  )
)

const canDelete = (b: HallBooking) => b.status !== 'cancelled' && (isMine(b) || isAdmin())

/* ── 数据 ── */
async function reload() {
  try {
    bookings.value = (await apiGet<HallBooking[]>('/api/hall/bookings')) ?? []
  } catch {
    bookings.value = []
  }
  if (isReviewer) {
    try {
      pending.value = (await apiGet<PendingItem[]>('/api/hall/bookings/pending')) ?? []
    } catch {
      pending.value = []
    }
  }
}

function selectDate(str: string) {
  selectedDate.value = str
}

/* ── 拖选 ── */
const selTop = ref(0)
const selHeight = ref(0)
const selLabel = ref('')
let dragStartY = 0
let dragLastY = 0

function gridY(clientY: number) {
  const grid = document.querySelector('.hall-timeline-grid') as HTMLElement | null
  if (!grid) return 0
  const rect = grid.getBoundingClientRect()
  const maxY = (HALL_END - HALL_START) * PX_PER_HOUR + PAD_TOP + PAD_BOTTOM
  return Math.max(0, Math.min(clientY - rect.top, maxY))
}

function updateSelection() {
  const top = Math.min(dragStartY, dragLastY)
  selTop.value = top
  selHeight.value = Math.max(Math.abs(dragLastY - dragStartY), 8)
  const t1 = timeFromY(dragStartY)
  const t2 = timeFromY(dragLastY)
  const lt = t1 < t2 ? t1 : t2
  const rt = t1 < t2 ? t2 : t1
  selLabel.value = lt === rt ? `${lt}（1 小时）` : `${lt} – ${rt}`
}

function onGridDown(e: MouseEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('.hall-timeline-card')) return
  dragStartY = gridY(e.clientY)
  dragLastY = dragStartY
  const move = (ev: MouseEvent) => {
    dragLastY = gridY(ev.clientY)
    if (Math.abs(dragLastY - dragStartY) > 4) dragging.value = true
    updateSelection()
  }
  const up = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    if (!dragging.value) {
      dragging.value = false
      return
    }
    const t1 = timeFromY(dragStartY)
    const t2 = timeFromY(dragLastY)
    dragging.value = false
    const start = t1 < t2 ? t1 : t2
    const end = t1 < t2 ? t2 : t1
    void openBooking(selectedDate.value, start, end === start ? fromMin(toMin(start) + 60) : end)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

function onTouchStart(e: TouchEvent) {
  if ((e.target as HTMLElement).closest('.hall-timeline-card')) return
  dragStartY = gridY(e.touches[0].clientY)
  dragLastY = dragStartY
  const move = (ev: TouchEvent) => {
    dragLastY = gridY(ev.touches[0].clientY)
    if (Math.abs(dragLastY - dragStartY) > 4) dragging.value = true
    updateSelection()
  }
  const end = () => {
    document.removeEventListener('touchmove', move)
    document.removeEventListener('touchend', end)
    if (!dragging.value) return
    const t1 = timeFromY(dragStartY)
    const t2 = timeFromY(dragLastY)
    dragging.value = false
    const start = t1 < t2 ? t1 : t2
    const endT = t1 < t2 ? t2 : t1
    void openBooking(selectedDate.value, start, endT === start ? fromMin(toMin(start) + 60) : endT)
  }
  document.addEventListener('touchmove', move, { passive: true })
  document.addEventListener('touchend', end)
}

function onGridClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.hall-timeline-card')) return
  // 单击空白处：以点击位置为起点默认预约 1 小时
  const y = gridY(e.clientY)
  const start = timeFromY(y)
  void openBooking(selectedDate.value, start, fromMin(toMin(start) + 60))
}

/* ── 创建预约 ── */
const bookingOpen = ref(false)
const bookingDraft = reactive({ date: '', start: '', end: '', purpose: '' })

const startHIndex = ref(0)
const startMIndex = ref(0)
const endHIndex = ref(2)
const endMIndex = ref(0)

async function openBooking(date: string, start: string, end: string) {
  if (!user) return toast('请先登录', 'error')
  const s = start || `${HOURS[startHIndex.value]}:${MINUTES[startMIndex.value]}`
  const e = end || `${HOURS[endHIndex.value]}:${MINUTES[endMIndex.value]}`
  Object.assign(bookingDraft, { date: date || todayStr, start: s, end: e, purpose: '' })
  bookingOpen.value = true
}

function openBookingFromCustom() {
  const s = `${HOURS[startHIndex.value]}:${MINUTES[startMIndex.value]}`
  const e = `${HOURS[endHIndex.value]}:${MINUTES[endMIndex.value]}`
  if (s >= e) return toast('结束时间必须晚于开始时间', 'error')
  void openBooking(selectedDate.value || todayStr, s, e)
}

async function submitBooking() {
  const d = bookingDraft
  if (!/^\d{1,2}:\d{2}$/.test(d.start) || !/^\d{1,2}:\d{2}$/.test(d.end)) {
    return toast('时间格式应为 HH:MM', 'error')
  }
  if (d.start >= d.end) return toast('结束时间必须晚于开始时间', 'error')
  if (!d.purpose.trim()) return toast('请填写用途', 'error')

  /* 冲突预检：旧版会把当天与他人预约的重叠分钟数累计，超过 10 分钟就提示确认。
     不拦的话很容易提交一段必然被驳回的时间。 */
  const sMin = timeToMin(d.start)
  const eMin = timeToMin(d.end)
  const conflicts: Array<{ applicant: string; start_time: string; end_time: string; overlap: number }> = []
  let totalOverlap = 0
  for (const b of bookings.value) {
    // 自己的预约不算冲突（旧版同样跳过）
    if (isMine(b)) continue
    if (b.status === 'cancelled' || b.status === 'rejected') continue
    if (b.date !== d.date) continue
    // 时间格式非法的条目直接跳过：timeToMin 对坏值返回 0，会被当成 00:00 参与比较，
    // 产生莫名其妙的「重叠」提示
    if (!/^\d{1,2}:\d{2}$/.test(b.start_time) || !/^\d{1,2}:\d{2}$/.test(b.end_time)) continue
    const overlap = Math.min(eMin, timeToMin(b.end_time)) - Math.max(sMin, timeToMin(b.start_time))
    if (overlap > 0) {
      conflicts.push({ applicant: b.applicant, start_time: b.start_time, end_time: b.end_time, overlap })
      totalOverlap += overlap
    }
  }
  if (totalOverlap > 10) {
    let msg = `所选时间段（${d.start}─${d.end}）与他人预约重叠总计 ${totalOverlap} 分钟：\n`
    for (const c of conflicts) {
      msg += `  · ${c.applicant} ${c.start_time}─${c.end_time}（重叠 ${c.overlap} 分钟）\n`
    }
    msg += '\n建议重新选择。仍要提交吗？'
    if (!window.confirm(msg)) return
  }

  busy.value = true
  try {
    await apiPost('/api/hall/bookings', {
      date: d.date,
      start_time: d.start,
      end_time: d.end,
      purpose: d.purpose.trim()
    })
    toast('预约已提交，等待审核', 'success')
    bookingOpen.value = false
    if (d.date) selectedDate.value = d.date
    await reload()
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

/** 'HH:MM' → 分钟数（旧版 timeToMin） */
function timeToMin(t: string) {
  const [h, m] = String(t || '').split(':')
  const hh = Number(h)
  const mm = Number(m)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0
  return hh * 60 + mm
}

/* ── 撤回 / 删除 / 审核 ── */
async function withdraw(b: HallBooking) {
  if (!window.confirm('确定撤回这条预约吗？')) return
  try {
    await apiPost(`/api/hall/bookings/${b.id}/withdraw`)
    toast('已撤回', 'success')
    await reload()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeBooking(b: HallBooking) {
  if (!window.confirm('确定删除这条预约吗？')) return
  try {
    await apiDel(`/api/hall/bookings/${b.id}`)
    toast('已删除', 'success')
    await reload()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function review(b: HallBooking, action: 'approve' | 'reject') {
  try {
    await apiPost(`/api/hall/bookings/${b.id}/review`, { action })
    toast(action === 'approve' ? '已批准' : '已拒绝', 'success')
    await reload()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 详情 ── */
const detailOpen = ref(false)
const detail = ref<HallBooking | null>(null)
function showDetail(b: HallBooking) {
  detail.value = b
  detailOpen.value = true
}

onMounted(async () => {
  selectedDate.value = todayStr
  await reload()
})

defineExpose({ reload })
</script>

<style>
.hall-review-toggle {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.6;
}
.hall-review-conflict {
  color: var(--md-error);
}
.hall-custom-label {
  font-size: 13px;
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
.hall-custom-sep {
  color: var(--md-on-surface-variant);
}
.hall-custom-h {
  width: 78px;
}
.hall-custom-m {
  width: 68px;
}
.hall-hint {
  margin-top: 8px;
  font-size: 12px;
}
/* 拖动时避免选中文字 */
.hall-timeline-grid {
  user-select: none;
  cursor: crosshair;
}
.hall-timeline-card {
  cursor: pointer;
}
</style>
