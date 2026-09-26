<template>
  <YaliShell current="duty" title="值日">
    <div class="yali-page">
      <div v-if="loading" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="error" class="yali-loading">
        <TextBlock :Text="error" class="yali-muted" />
        <Button @Click="load">
          <span class="yali-btn-inner">
            <FontIcon :Glyph="GLYPH.refresh" :FontSize="14" /><span>重试</span>
          </span>
        </Button>
      </div>

      <div v-else-if="!data" class="yali-loading duty-empty">
        <FontIcon :Glyph="GLYPH.duty" :FontSize="28" class="yali-muted-icon" />
        <TextBlock Text="今日无排班" class="yali-muted" />
        <Button v-if="admin" @Click="go('duty-admin.html')">
          <span class="yali-btn-inner"><span>前往值日管理</span></span>
        </Button>
      </div>

      <template v-else>
        <!-- 干事信息 -->
        <section class="yali-section duty-head">
          <div class="duty-staff">
            <PersonPicture class="duty-avatar" :Initials="initial(data.staff_a?.name)" />
            <div>
              <TextBlock :Text="data.staff_a?.name || '未指定'" :FontSize="15" :FontWeight="600" />
              <TextBlock Text="值日生 A" class="yali-muted" />
            </div>
          </div>
          <div class="duty-staff">
            <PersonPicture class="duty-avatar" :Initials="initial(data.staff_b?.name)" />
            <div>
              <TextBlock :Text="data.staff_b?.name || '未指定'" :FontSize="15" :FontWeight="600" />
              <TextBlock Text="值日生 B" class="yali-muted" />
            </div>
          </div>
          <div class="duty-date">
            <TextBlock :Text="data.date" class="yali-muted" />
            <Button v-if="admin" @Click="go('duty-admin.html')">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.settings" :FontSize="14" /><span>值日管理</span>
              </span>
            </Button>
          </div>
        </section>

        <!-- 时段签退表 -->
        <section class="yali-section">
          <TextBlock Text="时段签到 / 签退" :FontSize="16" :FontWeight="600" />
          <div class="duty-table">
            <div class="duty-row duty-row-head">
              <span>时段</span>
              <span>开始</span>
              <span>{{ data.staff_a?.name || 'A' }}</span>
              <span>{{ data.staff_b?.name || 'B' }}</span>
              <span>计分</span>
            </div>
            <div v-for="(p, i) in data.periods" :key="i" class="duty-row">
              <span class="duty-label">{{ p.label }}</span>
              <span class="yali-muted">{{ p.start_time }}</span>
              <div class="duty-cell">
                <Button v-if="p.a.status === 'pending'" :Style="'{StaticResource AccentButtonStyle}'"
                        @Click="signIn(p, 'a')">
                  <span class="yali-btn-inner"><span>签到</span></span>
                </Button>
                <Button v-else-if="p.a.status === 'signed_in'" @Click="signOut(p.a, 'a')">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.duty" :FontSize="13" />
                    <span>{{ elapsed(p.a) }} 签退</span>
                  </span>
                </Button>
                <span v-else-if="p.a.status === 'completed'" class="yali-chip yali-chip-done">
                  已签退{{ p.a.total ? ' ' + signed(p.a.total) : '' }}
                </span>
                <span v-else class="yali-chip yali-chip-danger">缺岗</span>
              </div>
              <div class="duty-cell">
                <Button v-if="p.b.status === 'pending'" :Style="'{StaticResource AccentButtonStyle}'"
                        @Click="signIn(p, 'b')">
                  <span class="yali-btn-inner"><span>签到</span></span>
                </Button>
                <Button v-else-if="p.b.status === 'signed_in'" @Click="signOut(p.b, 'b')">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.duty" :FontSize="13" />
                    <span>{{ elapsed(p.b) }} 签退</span>
                  </span>
                </Button>
                <span v-else-if="p.b.status === 'completed'" class="yali-chip yali-chip-done">
                  已签退{{ p.b.total ? ' ' + signed(p.b.total) : '' }}
                </span>
                <span v-else class="yali-chip yali-chip-danger">缺岗</span>
              </div>
              <!-- 计分对照列：与旧版 renderDutyScore 同格式（姓名+分，0 分不显示） -->
              <span class="duty-score-cell" :class="{ 'is-zero': dutyScore(p) === '0' }">
                {{ dutyScore(p) }}
              </span>
            </div>
          </div>
          <p class="yali-muted duty-tip">
            各时段在结束后按各自的宽限分钟数自动标记缺岗；具体分钟数见表内提示。签到/签退需输入该值日生的考勤密码。
          </p>
        </section>

        <!-- 部门统计（后端只统计扣分记录，按合计扣分升序，最需要改进的排前面） -->
        <section v-if="stats.length" class="yali-section">
          <TextBlock Text="各部门值日扣分（近两周）" :FontSize="16" :FontWeight="600" />
          <div class="duty-stats">
            <div v-for="s in stats" :key="s.department" class="duty-stat-row">
              <span>{{ s.department }}</span>
              <span class="yali-muted">{{ s.record_count ?? 0 }} 次 · 合计 {{ s.total_score ?? 0 }} 分</span>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- 页内 AI 浮窗：共享 AI 助手后端与对话历史，场景=值日 -->
    <AiChatWidget context="值日" :quick="AI_QUICK" />
  </YaliShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AiChatWidget from '../../components/AiChatWidget.vue'

/* 浮窗快捷提问（场景=值日） */
const AI_QUICK = [
  '这周我哪天值日？',
  '本周值日出勤情况怎么样？',
  '最近值日评分最高的是谁？',
  '帮我记住：值日我要提前 10 分钟到'
]
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiGet, apiPost, isAdmin, toast } from '../../shared/api'
import { promptDialog } from '../../shared/confirm'

interface Attendance {
  status: 'pending' | 'signed_in' | 'completed' | 'absent'
  attendance_id?: number
  sign_in_time?: string
  total?: number
}
/** 后端返回的干事对象（不是字符串） */
interface StaffInfo {
  id: number
  department?: string
  class?: string
  name: string
  user_id?: number | null
}
interface Period {
  label: string
  start_time: string
  slot_type?: string
  auto_absent_min?: number
  a: Attendance
  b: Attendance
}
interface DutyData {
  date: string
  schedule_id: number
  /** 无排班时后端返回 null */
  staff_a: StaffInfo | null
  staff_b: StaffInfo | null
  periods: Period[]
}
interface DeptStat {
  department: string
  total_score?: number
  record_count?: number
}

const admin = isAdmin()
const data = ref<DutyData | null>(null)
const loading = ref(true)
const error = ref('')
const stats = ref<DeptStat[]>([])

/* 让「已签到时长」每秒刷新 */
const tick = ref(0)
let timer: number | undefined

function initial(name?: string) {
  return (name ?? '?').slice(0, 1).toUpperCase()
}

function elapsed(st: Attendance) {
  if (!st.sign_in_time) return ''
  // 后端写的是 datetime('now')，也就是 **UTC**（DB 里形如 `2026-09-13 04:00:00`）。
  // 补 '+08:00' 会把它当北京时间，在岗时长直接多出 8 小时；必须补 'Z'。
  // 旧版 duty.js 的 startDutyTimer 同样补 'Z'。
  const raw = st.sign_in_time
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const start = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  if (isNaN(start.getTime())) return ''
  void tick.value
  /* 精确到秒：tick 本来就是每秒递增的，之前只在格式化时砍到了分钟，
     于是「刚签到」和「签到 59 秒」看起来一模一样，用户会以为没记上。
     格式与原来的 h/m 风格保持一致（1h23m45s / 45m30s），不另行发明新写法。 */
  const total = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h${m}m${s}s` : `${m}m${s}s`
}

function signed(v: number) {
  return v > 0 ? `+${v}` : String(v)
}

/** 本时段两人得分对照（旧版 renderDutyScore）：
    两人都还没签到 → '-'；都 0 分 → '0'；否则只列出非 0 的「姓名+分」 */
function dutyScore(p: { a: Attendance; b: Attendance }) {
  if (p.a.status === 'pending' && p.b.status === 'pending') return '-'
  const at = p.a.total || 0
  const bt = p.b.total || 0
  if (at === 0 && bt === 0) return '0'
  const nameA = data.value?.staff_a?.name || 'A'
  const nameB = data.value?.staff_b?.name || 'B'
  const parts: string[] = []
  if (at !== 0) parts.push(`${nameA}${at > 0 ? '+' : ''}${at}`)
  if (bt !== 0) parts.push(`${nameB}${bt > 0 ? '+' : ''}${bt}`)
  return parts.join(' ') || '0'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const d = await apiGet<DutyData>('/api/duty/attendance/today')
    data.value = d && d.staff_a ? d : null
  } catch (err) {
    error.value = '加载失败：' + (err as Error).message
    data.value = null
  } finally {
    loading.value = false
  }
  loadStats()
}

async function loadStats() {
  try {
    const d = await apiGet<DeptStat[]>('/api/duty/department-stats?weeks=2')
    stats.value = Array.isArray(d) ? d : []
  } catch {
    stats.value = []
  }
}

/** 弹一次密码输入框；取消返回 null。提示语里写明「这是考勤密码，不是登录密码」。 */
async function askDutyPassword(staffName: string, action: string) {
  return promptDialog({
    title: `${action}验证`,
    message: `${action}前请输入 ${staffName} 的考勤密码（不是登录密码）。`,
    placeholder: '8 位考勤密码',
    maxLength: 32,
    confirmText: action,
    validate: (v) => (v.trim() ? null : '请输入考勤密码')
  })
}

async function signIn(p: Period, side: 'a' | 'b') {
  if (!data.value) return
  // staff_a/staff_b 是对象（{id, name, ...}），之前误取不存在的 staff_a_id，
  // 导致 staff_id 恒为 undefined、后端直接以「缺少必填字段」拒绝
  const staff = side === 'a' ? data.value.staff_a : data.value.staff_b
  const staffId = staff?.id
  if (!staffId) {
    toast('未取到该值日生信息，请刷新后重试', 'error')
    return
  }
  const password = await askDutyPassword(staff.name, '签到')
  if (password === null) return
  try {
    const res = await apiPost<{ attendance_id: number; sign_in_time: string; score?: number }>(
      '/api/duty/attendance/sign-in',
      { schedule_id: data.value.schedule_id, staff_id: staffId, period: p.label, password }
    )
    const st = side === 'a' ? p.a : p.b
    st.status = 'signed_in'
    st.attendance_id = res.attendance_id
    st.sign_in_time = res.sign_in_time
    toast('签到成功', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function signOut(st: Attendance, side: 'a' | 'b') {
  if (!st.attendance_id || !data.value) return
  const staff = side === 'a' ? data.value.staff_a : data.value.staff_b
  const password = await askDutyPassword(staff?.name || '该值日生', '签退')
  if (password === null) return
  try {
    const res = await apiPost<{ score?: number; total?: number }>(
      '/api/duty/attendance/sign-out',
      { attendance_id: st.attendance_id, password }
    )
    st.status = 'completed'
    st.total = res?.total ?? res?.score ?? 0
    toast('签退成功', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function go(href: string) {
  window.location.href = href
}

onMounted(() => {
  load()
  timer = window.setInterval(() => (tick.value += 1), 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style>
/* 无排班空状态：内容矮时垂直居中于剩余视口，别孤零零贴在页首 */
.yali-loading.duty-empty {
  padding: 0;
  min-height: max(300px, calc(100dvh - 340px));
  justify-content: center;
}

.duty-head {
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}
.duty-staff {
  display: flex;
  align-items: center;
  gap: 10px;
}
.duty-avatar {
  width: 40px;
  height: 40px;
}
.duty-date {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.duty-table {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
}
.duty-row {
  display: grid;
  grid-template-columns: 88px 76px 1fr 1fr 150px;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
}
.duty-score-cell {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}
.duty-score-cell.is-zero {
  color: var(--text-tertiary);
}
.duty-row-head {
  font-size: 12px;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--card-stroke);
}
.duty-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.duty-cell {
  min-width: 0;
}
.duty-tip {
  margin-top: 12px;
}
.duty-stats {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.duty-stat-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}

@media (max-width: 640px) {
  .duty-row {
    grid-template-columns: 62px 1fr 1fr;
    gap: 6px;
  }
  /* 窄屏隐藏「开始」列，计分列换到第二行整行显示 */
  .duty-score-cell {
    grid-column: 1 / -1;
    font-size: 11px;
  }
  .duty-row > :nth-child(2) {
    display: none;
  }
  .duty-date {
    margin-left: 0;
  }
}
</style>
