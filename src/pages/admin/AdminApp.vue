<template>
  <YaliShell current="admin" title="管理">
    <div class="yali-page">
      <SelectorBar :Items="tabItems" :SelectedItem="tabItems[tabIndex]" class="ad-tabs"
                   @SelectionChanged="(a) => (tabIndex = a?.SelectedIndex ?? 0)" />

      <!-- ── 注册审批 ── -->
      <template v-if="tabIndex === 0">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'待审批注册（' + registrations.length + '）'" :FontSize="15" :FontWeight="500" />
            <Button :IsEnabled="!!registrations.length" @Click="batchApprove">
              <span class="yali-btn-inner"><span>全部批准</span></span>
            </Button>
          </div>
          <p v-if="!registrations.length" class="yali-muted ad-gap">没有待审批的注册申请</p>
          <div v-for="u in registrations" :key="u.id" class="ad-row">
            <span class="ad-name">{{ u.name }}</span>
            <span class="yali-muted">{{ u.class_name || '—' }}</span>
            <span class="yali-chip">{{ u.department || '未选部门' }}</span>
            <div class="ad-actions">
              <Button @Click="approve(u)">
                <span class="yali-btn-inner"><span>批准</span></span>
              </Button>
              <Button @Click="reject(u)">
                <span class="yali-btn-inner"><span>拒绝</span></span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 成员管理 ── -->
      <template v-else-if="tabIndex === 1">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'成员（' + users.length + '）'" :FontSize="15" :FontWeight="500" />
            <div class="yali-head-tools">
              <TextBox v-model:Text="keyword" PlaceholderText="搜索姓名" class="ad-search" />
              <Button @Click="loadMoreUsers" :IsEnabled="hasMoreUsers && !usersLoading">
                <span class="yali-btn-inner"><span>{{ usersLoading ? '加载中…' : '加载更多' }}</span></span>
              </Button>
            </div>
          </div>
          <div v-for="u in filteredUsers" :key="u.id" class="ad-row">
            <span class="ad-name">{{ u.name }}</span>
            <span class="yali-muted">{{ u.class_name || '—' }}</span>
            <span class="yali-chip">{{ u.department || '未分配' }}</span>
            <ComboBox :ItemsSource="ROLE_LABELS" v-model:SelectedIndex="roleIndex[u.id]"
                      class="ad-role" @SelectionChanged="(a) => changeRole(u, a)" />
            <div class="ad-actions">
              <Button @Click="resetPassword(u)">
                <span class="yali-btn-inner"><span>重置密码</span></span>
              </Button>
              <Button @Click="removeUser(u)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>删除</span>
                </span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 反馈 ── -->
      <template v-else-if="tabIndex === 2">
        <section class="yali-section">
          <TextBlock :Text="'用户反馈（' + feedback.length + '）'" :FontSize="15" :FontWeight="500" />
          <p v-if="!feedback.length" class="yali-muted ad-gap">暂无反馈</p>
          <div v-for="f in feedback" :key="f.id" class="ad-feedback">
            <div class="ad-feedback-head">
              <span class="yali-muted">{{ formatTime(f.created_at) }}</span>
              <span v-if="f.section" class="yali-chip">{{ f.section }}</span>
              <span v-if="f.version" class="yali-chip">v{{ f.version }}</span>
              <button class="ad-del" type="button" title="删除" @click="removeFeedback(f)">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="13" />
              </button>
            </div>
            <p class="ad-feedback-text">{{ f.content }}</p>
            <p v-if="f.contact || f.page" class="yali-muted ad-feedback-meta">
              <span v-if="f.contact">联系方式：{{ f.contact }}</span>
              <span v-if="f.page">来源：{{ f.page }}</span>
            </p>
          </div>
        </section>
      </template>

      <!-- ── 站点设置 ── -->
      <template v-else>
        <section class="yali-section">
          <TextBlock Text="站点开关" :FontSize="15" :FontWeight="500" />
          <div class="yali-setting-row">
            <div class="yali-setting-label">
              <span class="yali-setting-title">关闭站点（维护模式）</span>
              <span class="yali-setting-desc">
                开启后普通用户只能看到维护提示；管理员仍可登录解除
              </span>
            </div>
            <ToggleSwitch v-model:IsOn="settings.site_closed" @Toggled="onClosedToggle" />
          </div>
          <label v-if="settings.site_closed" class="yali-field ad-gap">
            <span class="yali-field-label">维护提示文案</span>
            <TextBox v-model:Text="settings.site_closed_message"
                     PlaceholderText="雅礼团委-通办暂时关闭" />
          </label>
          <div class="yali-form-actions">
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="saveSettings">
              <span class="yali-btn-inner"><span>{{ saving ? '保存中…' : '保存设置' }}</span></span>
            </Button>
          </div>
          <p v-if="settings.site_closed_by" class="yali-muted ad-gap">
            上次由 {{ settings.site_closed_by }} 操作
          </p>
        </section>

        <section v-if="storage" class="yali-section">
          <TextBlock Text="存储统计" :FontSize="15" :FontWeight="500" />
          <div class="ad-kv">
            <span>公告</span><span>{{ storage.announcements ?? '—' }}</span>
            <span>报修</span><span>{{ storage.issues ?? '—' }}</span>
            <span>财务</span><span>{{ storage.finance ?? '—' }}</span>
            <span>用户</span><span>{{ storage.users ?? '—' }}</span>
          </div>
        </section>

        <section class="yali-section">
          <TextBlock Text="危险操作" :FontSize="15" :FontWeight="500" />
          <div class="yali-setting-row">
            <div class="yali-setting-label">
              <span class="yali-setting-title">清空全部数据</span>
              <span class="yali-setting-desc">删除所有业务数据，仅保留账号与站点设置。不可撤销</span>
            </div>
            <Button @Click="clearAll">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>清空</span>
              </span>
            </Button>
          </div>
        </section>
      </template>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, apiPut, formatTime, toast } from '../../shared/api'

const TABS = ['注册审批', '成员管理', '反馈', '站点设置']
const tabItems = TABS.map((Text) => ({ Text }))
const tabIndex = ref(0)
const saving = ref(false)

interface User {
  id: number
  name: string
  role: string
  class_name?: string
  department?: string
  created_at?: string
}
interface Feedback {
  id: number
  content: string
  contact?: string
  page?: string
  section?: string
  version?: string
  created_at: string
}

const ROLE_LABELS = ['待审批', '公共用户', '成员', '教师', '管理员', '站长']
const ROLE_VALUES = ['pending', 'public', 'member', 'teacher', 'admin', 'owner']

/* ── 注册审批 ── */
const registrations = ref<User[]>([])

async function loadRegistrations() {
  try {
    registrations.value = (await apiGet<User[]>('/api/admin/registrations')) ?? []
  } catch (err) {
    toast((err as Error).message, 'error')
    registrations.value = []
  }
}

async function approve(u: User) {
  try {
    await apiPost(`/api/admin/registrations/${u.id}/approve`)
    registrations.value = registrations.value.filter((x) => x.id !== u.id)
    toast(`已批准 ${u.name}`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function reject(u: User) {
  if (!window.confirm(`确定拒绝 ${u.name} 的注册申请吗？`)) return
  try {
    await apiPost(`/api/admin/registrations/${u.id}/reject`)
    registrations.value = registrations.value.filter((x) => x.id !== u.id)
    toast('已拒绝', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function batchApprove() {
  if (!window.confirm(`确定批准全部 ${registrations.value.length} 条注册申请吗？`)) return
  try {
    await apiPost('/api/admin/users/batch-approve', {
      ids: registrations.value.map((u) => u.id)
    })
    registrations.value = []
    toast('已全部批准', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 成员管理 ── */
const users = ref<User[]>([])
const usersLoading = ref(false)
const hasMoreUsers = ref(true)
const keyword = ref('')
const roleIndex = reactive<Record<number, number>>({})
let userOffset = 0
const PAGE = 50

async function loadUsers(reset = false) {
  if (usersLoading.value) return
  usersLoading.value = true
  if (reset) {
    userOffset = 0
    users.value = []
  }
  try {
    const list = await apiGet<User[]>(`/api/admin/users?offset=${userOffset}&limit=${PAGE}`)
    const arr = Array.isArray(list) ? list : []
    users.value = [...users.value, ...arr]
    userOffset += arr.length
    hasMoreUsers.value = arr.length >= PAGE
    for (const u of arr) {
      const i = ROLE_VALUES.indexOf(u.role)
      roleIndex[u.id] = i >= 0 ? i : 2
    }
  } catch (err) {
    toast((err as Error).message, 'error')
    hasMoreUsers.value = false
  } finally {
    usersLoading.value = false
  }
}

function loadMoreUsers() {
  loadUsers(false)
}

const filteredUsers = computed(() => {
  const kw = keyword.value.trim()
  return kw ? users.value.filter((u) => u.name.includes(kw)) : users.value
})

async function changeRole(u: User, args: { SelectedIndex?: number }) {
  const i = args?.SelectedIndex
  if (i == null || i < 0) return
  const role = ROLE_VALUES[i]
  if (role === u.role) return
  try {
    await apiPut(`/api/admin/users/${u.id}/role`, { role })
    u.role = role
    toast(`${u.name} 的角色已改为${ROLE_LABELS[i]}`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
    const old = ROLE_VALUES.indexOf(u.role)
    roleIndex[u.id] = old >= 0 ? old : 2
  }
}

async function resetPassword(u: User) {
  if (!window.confirm(`确定重置 ${u.name} 的密码吗？`)) return
  try {
    await apiPut(`/api/admin/users/${u.id}/reset-password`)
    toast('密码已重置为初始密码', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeUser(u: User) {
  if (!window.confirm(`确定删除用户 ${u.name} 吗？此操作不可撤销。`)) return
  try {
    await apiDel(`/api/admin/users/${u.id}`)
    users.value = users.value.filter((x) => x.id !== u.id)
    toast('用户已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 反馈 ── */
const feedback = ref<Feedback[]>([])

async function loadFeedback() {
  try {
    feedback.value = (await apiGet<Feedback[]>('/api/admin/feedback')) ?? []
  } catch {
    feedback.value = []
  }
}

async function removeFeedback(f: Feedback) {
  if (!window.confirm('确定删除这条反馈吗？')) return
  try {
    await apiDel(`/api/admin/feedback/${f.id}`)
    feedback.value = feedback.value.filter((x) => x.id !== f.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 设置 ── */
const settings = reactive({
  site_closed: false,
  site_closed_message: '',
  site_closed_by: ''
})
const storage = ref<Record<string, number> | null>(null)

async function loadSettings() {
  try {
    const d = await apiGet<Record<string, unknown>>('/api/admin/settings')
    Object.assign(settings, {
      site_closed: !!d?.site_closed,
      site_closed_message: (d?.site_closed_message as string) ?? '',
      site_closed_by: (d?.site_closed_by as string) ?? ''
    })
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function loadStorage() {
  try {
    storage.value = await apiGet<Record<string, number>>('/api/admin/storage')
  } catch {
    storage.value = null
  }
}

function onClosedToggle() {
  /* 由 v-model 更新，保存时一并提交 */
}

async function saveSettings() {
  saving.value = true
  try {
    await apiPut('/api/admin/settings', {
      site_closed: settings.site_closed,
      site_closed_message: settings.site_closed_message
    })
    toast('设置已保存', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function clearAll() {
  if (!window.confirm('确定清空全部业务数据吗？此操作不可撤销。')) return
  if (!window.confirm('再次确认：清空后无法恢复，是否继续？')) return
  try {
    await apiPost('/api/admin/clear-all')
    toast('已清空全部数据', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

watch(tabIndex, (i) => {
  if (i === 0) loadRegistrations()
  else if (i === 1) loadUsers(true)
  else if (i === 2) loadFeedback()
  else {
    loadSettings()
    loadStorage()
  }
})

onMounted(loadRegistrations)
</script>

<style>
.ad-tabs {
  margin-bottom: 16px;
}
.ad-gap {
  margin-top: 12px;
}
.ad-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
  font-size: 13px;
  flex-wrap: wrap;
}
.ad-name {
  font-weight: 500;
  color: var(--text-primary);
  min-width: 80px;
}
.ad-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.ad-role {
  width: 130px;
}
.ad-search {
  width: 180px;
}
.ad-del {
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 4px;
}
.ad-del:hover {
  background: var(--subtle-tertiary);
  color: var(--text-primary);
}
.ad-feedback {
  padding: 10px 0;
  border-bottom: 1px solid var(--stroke-divider);
}
.ad-feedback-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.ad-feedback-head .ad-del {
  margin-left: auto;
}
.ad-feedback-text {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.ad-feedback-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 4px 0 0;
}
.ad-kv {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 6px 12px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-primary);
}

@media (max-width: 640px) {
  .ad-search,
  .ad-role {
    width: 100%;
  }
  .ad-actions {
    margin-left: 0;
  }
}
</style>
