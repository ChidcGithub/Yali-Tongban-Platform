<template>
  <YaliShell current="settings" title="设置">
    <div class="yali-page">
      <!-- ── 资料卡 ── -->
      <section class="yali-section set-profile">
        <PersonPicture class="set-avatar" :Initials="initial" />
        <div class="set-profile-body">
          <div class="set-name-row">
            <TextBlock :Text="user?.name ?? '未登录'" :FontSize="18" :FontWeight="600" />
            <span class="yali-chip">{{ roleText }}</span>
          </div>
          <div class="yali-item-meta">
            <span v-if="user?.class_name">班级 {{ user.class_name }}</span>
            <span v-if="user?.department">{{ user.department }}</span>
          </div>
          <div class="set-trophy">
            <FontIcon :Glyph="GLYPH.starFilled" :FontSize="14" />
            <span>已解锁 {{ unlocked.length }} / {{ totalAchievements }} 个成就</span>
          </div>
        </div>
      </section>

      <!-- ── 账号信息 ── -->
      <section class="yali-section">
        <TextBlock Text="账号信息" :FontSize="16" :FontWeight="600" />

        <!-- 站长不可改名：后端 handleChangeName 对 owner 直接 403，露出来只会让人白点 -->
        <div v-if="user?.role !== 'owner'" class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">显示名</span>
            <span class="yali-setting-desc">当前：{{ user?.name ?? '—' }}</span>
          </div>
          <Button @Click="toggle('name')">
            <span class="yali-btn-inner"><span>{{ open === 'name' ? '收起' : '修改' }}</span></span>
          </Button>
        </div>
        <div v-if="open === 'name' && user?.role !== 'owner'" class="set-form">
          <TextBox v-model:Text="form.name" PlaceholderText="新的显示名" :MaxLength="20" />
          <PasswordBox v-model:Password="form.confirm_password" PlaceholderText="输入密码以确认" />
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="saveName">
            <span class="yali-btn-inner"><span>保存</span></span>
          </Button>
        </div>

        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">班级</span>
            <span class="yali-setting-desc">当前：{{ user?.class_name || '—' }}</span>
          </div>
          <Button @Click="toggle('class')">
            <span class="yali-btn-inner"><span>{{ open === 'class' ? '收起' : '修改' }}</span></span>
          </Button>
        </div>
        <div v-if="open === 'class'" class="set-form">
          <TextBox v-model:Text="form.class_name" PlaceholderText="4 位班级编号，如 2501" :MaxLength="4" />
          <PasswordBox v-model:Password="form.confirm_password" PlaceholderText="输入密码以确认" />
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="saveClass">
            <span class="yali-btn-inner"><span>保存</span></span>
          </Button>
        </div>

        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">部门</span>
            <span class="yali-setting-desc">当前：{{ user?.department || '未设置' }}</span>
          </div>
          <Button @Click="toggle('dept')">
            <span class="yali-btn-inner"><span>{{ open === 'dept' ? '收起' : '修改' }}</span></span>
          </Button>
        </div>
        <div v-if="open === 'dept'" class="set-form">
          <ComboBox :ItemsSource="deptItems" v-model:SelectedIndex="deptIndex" PlaceholderText="选择部门" />
          <PasswordBox v-model:Password="form.confirm_password" PlaceholderText="输入密码以确认" />
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="saveDept">
            <span class="yali-btn-inner"><span>保存</span></span>
          </Button>
        </div>
      </section>

      <!-- ── 密码 ── -->
      <section class="yali-section">
        <TextBlock Text="修改密码" :FontSize="16" :FontWeight="600" />
        <div class="set-form set-form-block">
          <label class="yali-field">
            <span class="yali-field-label">当前密码</span>
            <PasswordBox v-model:Password="form.old_password" PlaceholderText="输入当前密码" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">新密码</span>
            <PasswordBox v-model:Password="form.new_password"
                         PlaceholderText="至少6位，含字母和数字" :MaxLength="50" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">确认新密码</span>
            <PasswordBox v-model:Password="form.new_password2" PlaceholderText="再次输入新密码" :MaxLength="50" />
          </label>
          <div class="yali-form-actions">
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy" @Click="savePassword">
              <span class="yali-btn-inner"><span>{{ busy ? '提交中…' : '修改密码' }}</span></span>
            </Button>
          </div>
        </div>
      </section>

      <!-- ── 成就 ── -->
      <section class="yali-section">
        <TextBlock Text="成就" :FontSize="16" :FontWeight="600" />
        <div class="set-ach-grid">
          <div v-for="a in achievements" :key="a.id" class="set-ach"
               :class="{ 'is-unlocked': unlocked.includes(a.id) }"
               :title="a.desc">
            <FontIcon :Glyph="unlocked.includes(a.id) ? GLYPH.starFilled : GLYPH.star" :FontSize="16" />
            <span class="set-ach-title">{{ unlocked.includes(a.id) ? a.title : '？？？' }}</span>
            <span class="set-ach-desc">{{ a.desc }}</span>
          </div>
        </div>
      </section>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiPost, getUser, toast } from '../../shared/api'

interface AchDef {
  id: string
  title: string
  desc: string
  icon?: string
}

const user = ref(getUser())
const busy = ref(false)
const open = ref<'' | 'name' | 'class' | 'dept'>('')

const form = reactive({
  name: '',
  class_name: '',
  confirm_password: '',
  old_password: '',
  new_password: '',
  new_password2: ''
})

const DEPARTMENTS = [
  '书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室'
]
/* 第 0 项是「未设置」：后端接受空串（auth.js change-department），
   旧版也允许把部门清空；而且必须按当前部门预选，否则每次进来都从第一项开始。 */
const deptItems = ['未设置', ...DEPARTMENTS]
const deptIndex = ref(
  user.value?.department ? Math.max(0, deptItems.indexOf(user.value.department)) : 0
)

const initial = computed(() => (user.value?.name ?? '?').slice(0, 1).toUpperCase())

const ROLE_TEXT: Record<string, string> = {
  public: '公共用户',
  member: '成员',
  officer: '干事',
  teacher: '教师',
  admin: '管理员',
  owner: '站长'
}
const roleText = computed(() => ROLE_TEXT[user.value?.role ?? ''] ?? '成员')

/* 成就定义来自 api.js。
   注意：它是经典脚本顶层的 `const`，只会进入全局词法环境，
   **不会**成为 window 的属性（`var` 才会）—— 所以必须用裸标识符引用，
   用 window.ACHIEVEMENT_DEFS 会永远是 undefined。 */
declare const ACHIEVEMENT_DEFS: AchDef[] | undefined

const achievements = ref<AchDef[]>(
  typeof ACHIEVEMENT_DEFS !== 'undefined' && Array.isArray(ACHIEVEMENT_DEFS)
    ? ACHIEVEMENT_DEFS
    : []
)
const totalAchievements = achievements.value.length
/* getAchievements 是函数声明，会挂到 window 上 */
const unlocked = ref<string[]>(
  (window as unknown as { getAchievements?: () => string[] }).getAchievements?.() ?? []
)

function toggle(which: 'name' | 'class' | 'dept') {
  open.value = open.value === which ? '' : which
}

function refreshUser() {
  const u = getUser()
  user.value = u
  if (u) localStorage.setItem('user', JSON.stringify(u))
}

/** 三个资料修改接口都用 { ..., password } 做二次确认，并把最新 user 回传 */
function adoptUser(data: { user?: unknown }) {
  if (data?.user && typeof data.user === 'object') {
    localStorage.setItem('user', JSON.stringify(data.user))
  }
  refreshUser()
}

function requirePassword() {
  if (!form.confirm_password) {
    toast('请输入密码以确认', 'error')
    return false
  }
  return true
}

function clearConfirm() {
  form.confirm_password = ''
}

async function saveName() {
  const name = form.name.trim()
  if (!name) return toast('请填写新的显示名', 'error')
  // 后端 NAME_MIN = 2，前端先拦一下省一次往返
  if (name.length < 2 || name.length > 20) return toast('姓名长度需在2-20字之间', 'error')
  if (!requirePassword()) return
  busy.value = true
  try {
    // 后端字段名是 new_name（不是 name），且必须带 password
    const data = await apiPost<{ user?: unknown }>('/api/auth/change-name', {
      new_name: form.name.trim(),
      password: form.confirm_password
    })
    adoptUser(data)
    form.name = ''
    clearConfirm()
    open.value = ''
    toast('显示名已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

async function saveClass() {
  const v = form.class_name.trim()
  const valid = (window as unknown as { isValidClass?: (s: string) => boolean }).isValidClass
  if (!v || (valid && !valid(v))) return toast('班级编号无效，请输入 4 位数字', 'error')
  if (!requirePassword()) return
  busy.value = true
  try {
    const data = await apiPost<{ user?: unknown }>('/api/auth/change-class', {
      class_name: v,
      password: form.confirm_password
    })
    adoptUser(data)
    form.class_name = ''
    clearConfirm()
    open.value = ''
    toast('班级已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

async function saveDept() {
  if (!requirePassword()) return
  busy.value = true
  try {
    // index 0 = 未设置 → 提交空串，允许清空部门
    const dept = deptIndex.value > 0 ? DEPARTMENTS[deptIndex.value - 1] : ''
    const data = await apiPost<{ user?: unknown }>('/api/auth/change-department', {
      department: dept,
      password: form.confirm_password
    })
    adoptUser(data)
    clearConfirm()
    open.value = ''
    toast('部门已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

async function savePassword() {
  if (!form.old_password || !form.new_password) return toast('请填写完整', 'error')
  if (form.new_password.length < 6) return toast('新密码至少 6 位', 'error')
  // 旧版要求两次输入一致（settings.js），少了这步打错一位就得靠登录失败才发现
  if (form.new_password !== form.new_password2) return toast('两次输入的新密码不一致', 'error')
  busy.value = true
  try {
    await apiPost('/api/auth/change-password', {
      old_password: form.old_password,
      new_password: form.new_password
    })
    form.old_password = ''
    form.new_password = ''
    form.new_password2 = ''
    toast('密码已修改', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}
</script>

<style>
.set-profile {
  display: flex;
  gap: 16px;
  align-items: center;
}
.set-avatar {
  width: 56px;
  height: 56px;
  flex: none;
}
.set-profile-body {
  min-width: 0;
}
.set-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.set-trophy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--accent-base);
}
.set-form {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 4px 0 12px;
}
.set-form > :first-child {
  flex: 1 1 180px;
  min-width: 0;
}
/* 第二个输入框（密码确认）给一个稳定的宽度，避免被压成窄条 */
.set-form > :nth-child(2) {
  flex: 1 1 160px;
  min-width: 0;
}
.set-form-block {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding-top: 14px;
}
.set-ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.set-ach {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--stroke-divider);
  border-radius: 6px;
  color: var(--text-tertiary);
  background: var(--card-bg-secondary);
}
.set-ach.is-unlocked {
  border-color: var(--accent-base);
  color: var(--accent-base);
}
.set-ach-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.set-ach.is-unlocked .set-ach-title {
  color: var(--accent-base);
}
.set-ach-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

@media (max-width: 640px) {
  .set-profile {
    flex-direction: column;
    align-items: flex-start;
  }
  .set-form {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
