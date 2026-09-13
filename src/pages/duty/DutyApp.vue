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

      <div v-else-if="!data" class="yali-loading">
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
            <PersonPicture class="duty-avatar" :Initials="initial(data.staff_a)" />
            <div>
              <TextBlock :Text="data.staff_a" :FontSize="15" :FontWeight="600" />
              <TextBlock Text="值日生 A" class="yali-muted" />
            </div>
          </div>
          <div class="duty-staff">
            <PersonPicture class="duty-avatar" :Initials="initial(data.staff_b)" />
            <div>
              <TextBlock :Text="data.staff_b" :FontSize="15" :FontWeight="600" />
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
              <span>{{ data.staff_a }}</span>
              <span>{{ data.staff_b }}</span>
            </div>
            <div v-for="(p, i) in data.periods" :key="i" class="duty-row">
              <span class="duty-label">{{ p.label }}</span>
              <span class="yali-muted">{{ p.start_time }}</span>
              <div class="duty-cell">
                <Button v-if="p.a.status === 'pending'" :Style="'{StaticResource AccentButtonStyle}'"
                        @Click="signIn(p, 'a')">
                  <span class="yali-btn-inner"><span>签到</span></span>
                </Button>
                <Button v-else-if="p.a.status === 'signed_in'" @Click="signOut(p.a)">
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
                <Button v-else-if="p.b.status === 'signed_in'" @Click="signOut(p.b)">
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
            </div>
          </div>
          <p class="yali-muted duty-tip">
            时段结束后 {{ data.periods[0]?.auto_absent_min ?? 0 }} 分钟内未签到将自动标记缺岗
          </p>
        </section>

        <!-- 部门统计 -->
        <section v-if="stats.length" class="yali-section">
          <TextBlock Text="各部门值日统计（近两周）" :FontSize="16" :FontWeight="600" />
          <div class="duty-stats">
            <div v-for="s in stats" :key="s.department ?? s.name" class="duty-stat-row">
              <span>{{ s.department ?? s.name }}</span>
              <span class="yali-muted">{{ s.count ?? s.total ?? 0 }} 次 · {{ s.score ?? 0 }} 分</span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiGet, apiPost, isAdmin, toast } from '../../shared/api'

interface Attendance {
  status: 'pending' | 'signed_in' | 'completed' | 'absent'
  attendance_id?: number
  sign_in_time?: string
  total?: number
}
interface Period {
  label: string
  start_time: string
  auto_absent_min?: number
  a: Attendance
  b: Attendance
}
interface DutyData {
  date: string
  schedule_id: number
  staff_a: string
  staff_b: string
  periods: Period[]
  staff_a_id?: number
  staff_b_id?: number
}
interface DeptStat {
  department?: string
  name?: string
  count?: number
  total?: number
  score?: number
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
  const start = new Date(st.sign_in_time.replace(' ', 'T') + (st.sign_in_time.endsWith('Z') ? '' : '+08:00'))
  if (isNaN(start.getTime())) return ''
  void tick.value
  const min = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000))
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60}m` : `${min}m`
}

function signed(v: number) {
  return v > 0 ? `+${v}` : String(v)
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

async function signIn(p: Period, side: 'a' | 'b') {
  if (!data.value) return
  const staffId = side === 'a' ? data.value.staff_a_id : data.value.staff_b_id
  try {
    const res = await apiPost<{ attendance_id: number; sign_in_time: string; score?: number }>(
      '/api/duty/attendance/sign-in',
      { schedule_id: data.value.schedule_id, staff_id: staffId, period: p.label }
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

async function signOut(st: Attendance) {
  if (!st.attendance_id) return
  try {
    const res = await apiPost<{ score?: number; total?: number }>(
      '/api/duty/attendance/sign-out',
      { attendance_id: st.attendance_id }
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
  grid-template-columns: 88px 76px 1fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
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
    grid-template-columns: 70px 1fr 1fr;
  }
  .duty-row > :nth-child(2) {
    display: none;
  }
  .duty-date {
    margin-left: 0;
  }
}
</style>
