<template>
  <YaliShell current="activities" title="活动">
    <div class="yali-page">
      <!-- 「全部活动 / 千报预约」两种视图，与原页面一致 -->
      <!-- SelectorBar 的 SelectionChanged 首参是 sender，只暴露 Items / SelectedItem，
           没有 SelectedIndex —— 必须自己 indexOf，否则 tabIndex 恒被写回 0 -->
      <SelectorBar :Items="tabItems" :SelectedItem="tabItems[tabIndex]" class="act-tabs"
                   @SelectionChanged="(a) => (tabIndex = a?.Items?.indexOf(a.SelectedItem) ?? 0)" />

      <template v-if="tabIndex === 0">
        <div v-if="loading" class="yali-loading">
          <ProgressRing :IsActive="true" :Width="32" :Height="32" />
          <TextBlock Text="加载中…" class="yali-muted" />
        </div>

        <div v-else-if="!items.length" class="yali-loading">
          <FontIcon :Glyph="GLYPH.activities" :FontSize="28" class="yali-muted-icon" />
          <TextBlock Text="暂无活动" class="yali-muted" />
        </div>

        <ListView v-else :ItemsSource="items" SelectionMode="None" class="yali-list">
        <template #item="{ item }">
          <div class="yali-item">
            <div class="yali-item-head">
              <TextBlock :Text="item.name" class="yali-item-title" TextWrapping="Wrap" />
              <span v-if="item.need_volunteers" class="yali-chip yali-chip-warn">需志愿者</span>
            </div>

            <div class="yali-item-meta">
              <span v-if="item.location">地点：{{ item.location }}</span>
              <span>{{ formatTime(item.time) }}</span>
              <span v-if="item.departments">部门：{{ item.departments }}</span>
            </div>

            <div class="act-footer">
              <span class="yali-muted">发布人：{{ item.created_by }}</span>
              <div class="yali-item-actions">
                <template v-if="item.need_volunteers">
                  <Button :IsEnabled="!item._signedUp" @Click="signup(item)"
                          :Style="item._signedUp ? '' : '{StaticResource AccentButtonStyle}'">
                    <span class="yali-btn-inner">
                      <FontIcon :Glyph="GLYPH.check" :FontSize="14" />
                      <span>{{ item._signedUp ? '已报名' : '报名志愿者' }}</span>
                    </span>
                  </Button>
                  <Button @Click="viewVolunteers(item)">
                    <span class="yali-btn-inner">
                      <FontIcon :Glyph="GLYPH.people" :FontSize="14" />
                      <span>{{ item.volunteer_count || 0 }} 人</span>
                    </span>
                  </Button>
                </template>
                <Button v-if="admin" @Click="remove(item)">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </template>
      </ListView>
      </template>

      <!-- 千报预约 -->
      <HallSection v-else ref="hallRef" />
    </div>

    <!-- 任意已登录用户都能发布活动（旧版 activities.js 只判断 user，后端也只要求登录） -->
    <button v-if="user && tabIndex === 0" class="yali-fab" type="button" aria-label="发布活动" @click="dialogOpen = true">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- 发布活动 -->
    <ContentDialog :IsOpen="dialogOpen" Title="发布活动"
                   @update:IsOpen="dialogOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">活动名称 <em>*</em></span>
          <TextBox v-model:Text="draft.name" PlaceholderText="如：秋季志愿服务" :MaxLength="100" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">时间 <em>*</em></span>
          <TextBox v-model:Text="draft.time" PlaceholderText="如：2026-10-01 09:00" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">地点</span>
          <TextBox v-model:Text="draft.location" PlaceholderText="选填" :MaxLength="200" />
        </label>
        <div class="yali-field">
          <!-- 部门必须从固定枚举里勾选：后端只保留 DEPARTMENTS 白名单内的值，
               自由文本里写顿号/空格会导致 departments 被清空 → 通知发给「全体」 -->
          <span class="yali-field-label">涉及部门</span>
          <div class="act-dept-grid">
            <CheckBox v-for="d in DEPARTMENTS" :key="d" :Content="d"
                      v-model:IsChecked="deptChecked[d]" />
          </div>
        </div>
        <div class="yali-field">
          <ToggleSwitch v-model:IsOn="draft.need_volunteers" OnContent="需要志愿者" OffContent="不需要志愿者" />
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="dialogOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="create">
            <span class="yali-btn-inner"><span>{{ saving ? '发布中…' : '发布' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 志愿者名单 -->
    <ContentDialog :IsOpen="listOpen" :Title="volTitle" CloseButtonText="关闭"
                   @update:IsOpen="listOpen = $event">
      <div class="vol-list">
        <p v-if="volLoading" class="yali-muted">加载中…</p>
        <p v-else-if="volCount !== null" class="yali-muted">
          已有 {{ volCount }} 人报名。登录后可查看名单。
        </p>
        <p v-else-if="!volunteers.length" class="yali-muted">还没有人报名</p>
        <div v-for="(v, i) in volunteers" :key="v.id ?? i" class="vol-item">
          <span class="vol-idx">{{ i + 1 }}</span>
          <FontIcon :Glyph="GLYPH.person" :FontSize="14" />
          <span>{{ v.member_name }}</span>
          <span v-if="v.department" class="yali-muted">{{ v.department }}</span>
          <span v-if="v.created_at" class="yali-muted vol-time">{{ formatTime(v.created_at) }}</span>
        </div>
        <!-- ContentDialog 只有默认插槽，导出按钮就放在正文里 -->
        <div v-if="volunteers.length" class="yali-form-actions">
          <Button @Click="exportVolunteers">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.download" :FontSize="14" /><span>导出表格</span>
            </span>
          </Button>
        </div>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import HallSection from './HallSection.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, formatTime, getUser, isAdmin, legacy, toast, confirmDialog} from '../../shared/api'
import { checkAuth } from '../../shared/guard'

interface Activity {
  id: number
  name: string
  location?: string
  time: string
  departments?: string
  need_volunteers?: boolean | number
  created_by: string
  volunteer_count?: number
  /** 后端返回：当前登录用户是否已报名（未登录时不返回） */
  signed_up?: number
  _signedUp?: boolean
}

const user = ref(getUser())
const admin = isAdmin()
const items = ref<Activity[]>([])
const loading = ref(true)
const saving = ref(false)

/* 视图切换：全部活动 / 千报预约（与原页面的两个标签一致）
   支持 ?tab=<序号|名称>，便于分享链接与刷新后保持 */
const TABS = ['全部活动', '千报预约']
const tabItems = TABS.map((Text) => ({ Text }))
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

async function load() {
  loading.value = true
  try {
    const data = await apiGet<Activity[]>('/api/activities')
    // 后端在登录态下会返回 signed_up（已报名次数），映射成本地状态，
    // 否则已报名用户仍会看到可点击的「报名志愿者」按钮
    items.value = (data ?? []).map((a) => ({ ...a, _signedUp: !!a.signed_up }))
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

/* ── 报名（仅登录用户；志愿者名单也对未登录只显示人数） ── */
function signup(a: Activity) {
  if (!user.value) {
    toast('请先登录后报名', 'error')
    return
  }
  doSignup(a.id, a)
}

async function doSignup(id: number, a: Activity) {
  try {
    await apiPost(`/api/activities/${id}/volunteer`, {})
    a._signedUp = true
    a.volunteer_count = (a.volunteer_count || 0) + 1
    toast('报名成功', 'success')
    legacy.checkNovice?.()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 志愿者名单 ── */
const listOpen = ref(false)
const volLoading = ref(false)
const volTitle = ref('志愿者名单')
interface Volunteer {
  id?: number
  /** 后端 activity_volunteers 表的姓名列是 member_name（不是 name） */
  member_name: string
  department?: string
  created_at?: string
}
const volunteers = ref<Volunteer[]>([])
const volCount = ref<number | null>(null) // 未登录时后端只回人数

async function viewVolunteers(a: Activity) {
  listOpen.value = true
  volLoading.value = true
  volunteers.value = []
  volCount.value = null
  volTitle.value = a.name + ' - 志愿者名单'
  try {
    // 接口返回的是 { activity_name, volunteers }（登录）或 { activity_name, count }（未登录）
    const data = await apiGet<{ activity_name?: string; volunteers?: Volunteer[]; count?: number }>(
      `/api/activities/${a.id}/volunteers`
    )
    volunteers.value = data?.volunteers ?? []
    if (data?.count !== undefined) volCount.value = data.count
    if (data?.activity_name) volTitle.value = data.activity_name + ' - 志愿者名单'
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    volLoading.value = false
  }
}

/** 导出志愿者名单为 CSV（旧版 exportVolunteers，含 BOM 以便 Excel 识别中文） */
function exportVolunteers() {
  if (!volunteers.value.length) return
  const header = ['序号', '姓名', '部门', '报名时间']
  const rows = volunteers.value.map((v, i) => [
    String(i + 1),
    v.member_name,
    v.department || '',
    formatTime(v.created_at)
  ])
  const csv =
    '\uFEFF' +
    [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'volunteers.csv'
  link.click()
  URL.revokeObjectURL(url)
}

async function remove(a: Activity) {
  if (!(await confirmDialog({ title: '确认删除', message: `确定删除活动「${a.name}」吗？`, danger: true }))) return
  try {
    await apiDel(`/api/activities/${a.id}`)
    items.value = items.value.filter((x) => x.id !== a.id)
    toast('活动已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 发布活动 ── */
const dialogOpen = ref(false)
/** 与后端 DEPARTMENTS 白名单一致（functions/api/activities.js 只保留这里的值） */
const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']
const deptChecked = reactive<Record<string, boolean>>(
  Object.fromEntries(DEPARTMENTS.map((d) => [d, false]))
)

const draft = reactive({
  name: '',
  time: '',
  location: '',
  need_volunteers: false
})

/** 勾选的部门 → 逗号连接（后端按 ',' 切分） */
function pickedDepartments() {
  return DEPARTMENTS.filter((d) => deptChecked[d]).join(',')
}

async function create() {
  if (!draft.name.trim() || !draft.time.trim()) return toast('活动名称与时间为必填', 'error')
  // 旧版用 <input type="datetime-local"> 保证格式；这里换成文本框后必须自己校验，
  // 后端不做校验，写错了会原样进库（列表里显示成乱码时间）
  if (!/^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2})?$/.test(draft.time.trim())) {
    return toast('时间格式应为 2026-10-01 09:00', 'error')
  }
  saving.value = true
  try {
    const data = await apiPost<Activity>('/api/activities', {
      name: draft.name,
      location: draft.location,
      // 统一成后端与其它页面都用空格分隔的形式
      time: draft.time.trim().replace('T', ' '),
      departments: pickedDepartments(),
      need_volunteers: draft.need_volunteers
    })
    items.value.unshift(data)
    toast('发布成功', 'success')
    dialogOpen.value = false
    draft.name = ''
    draft.time = ''
    draft.location = ''
    draft.need_volunteers = false
    for (const d of DEPARTMENTS) deptChecked[d] = false
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

/* 关闭发布对话框时清空草稿：只在创建成功后重置的话，
   「取消」再打开会带着上次勾的部门/名称/时间，很容易误发 */
watch(dialogOpen, (open) => {
  if (open) return
  draft.name = ''
  draft.time = ''
  draft.location = ''
  draft.need_volunteers = false
  for (const d of DEPARTMENTS) deptChecked[d] = false
})

onMounted(async () => {
  /* 旧版 activities.js 开头是 checkAuth()：这不跳转（匿名也能看活动），
     但未登录时清掉本地残留用户、登录用户未填班级时触发补填表单。
     少了它，「未填班级」的用户在这类页面就永远不会被提醒。 */
  await checkAuth()
  await load()
})
</script>

<style>
.act-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.vol-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 320px;
}
.vol-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}
.vol-idx {
  flex: none;
  width: 20px;
  text-align: right;
  color: var(--text-tertiary);
}
.vol-item .vol-time {
  margin-left: auto;
}
/* 发布活动的部门勾选区（替代旧版的 8 个复选框） */
.act-dept-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 6px;
}
</style>
