<template>
  <YaliShell current="login" title="登录">
    <div class="login-page">
      <div class="login-card">
        <TextBlock class="login-title" Text="雅礼团委 · 通办" :FontSize="24" :FontWeight="600" />
        <TextBlock class="login-sub" Text="成员登录 / 注册申请" />

        <SelectorBar :Items="tabs" :SelectedItem="selectedTab" @SelectionChanged="onTabChanged"
                     class="login-tabs" />

        <!-- 两个表单都用 v-show 而不是 v-if/v-else：
             验证码容器必须在挂载时就存在于 DOM 里。CaptchaWidget 的构造函数
             拿不到容器会**静默返回**（captcha.js:16-19），于是 regCaptcha.input
             永远是 undefined、getData() 恒返回空 token —— 注册必然报「人机验证失败」。
             旧页面正是用 display:none 让两个容器都留着的（login.html）。 -->
        <form v-show="tab === 'login'" class="login-form" @submit.prevent="handleLogin">
          <label class="yali-field">
            <span class="yali-field-label">姓名</span>
            <TextBox v-model:Text="loginForm.name" PlaceholderText="输入你的姓名" :MaxLength="20" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">密码</span>
            <PasswordBox v-model:Password="loginForm.password" PlaceholderText="输入密码" :MaxLength="50" />
          </label>
          <div class="yali-field">
            <span class="yali-field-label">人机验证</span>
            <div id="yaliLoginCaptcha"></div>
          </div>
          <p v-if="loginError" class="login-msg login-msg-error">{{ loginError }}</p>
          <!-- 唯一提交入口是表单的 submit：Button 渲染出的原生 <button> 默认 type=submit，
               再挂一个 @Click 就会「点一次发两遍」（Click + submit 各触发一次）。 -->
          <Button class="login-submit" type="submit" :Style="'{StaticResource AccentButtonStyle}'"
                  :IsEnabled="!busy">
            <span class="yali-btn-inner"><span>{{ busy ? '登录中…' : '登录' }}</span></span>
          </Button>
        </form>

        <!-- ── 注册 ── -->
        <form v-show="tab === 'register'" class="login-form" @submit.prevent="handleRegister">
          <label class="yali-field">
            <span class="yali-field-label">姓名</span>
            <TextBox v-model:Text="regForm.name" PlaceholderText="输入你的姓名" :MaxLength="20"
                     @TextChanged="onNameInput" />
            <span v-if="nameMsg" class="login-hint" :class="nameOk ? 'is-ok' : 'is-bad'">{{ nameMsg }}</span>
          </label>
          <label class="yali-field">
            <span class="yali-field-label">班级 <em>*</em></span>
            <TextBox v-model:Text="regForm.class_name" PlaceholderText="如 2501" :MaxLength="4" @TextChanged="onClassInput" />
            <span v-if="classMsg" class="login-hint" :class="classOk ? 'is-ok' : 'is-bad'">{{ classMsg }}</span>
          </label>
          <label class="yali-field">
            <span class="yali-field-label">所属部门</span>
            <ComboBox :ItemsSource="departments" v-model:SelectedIndex="regDeptIndex"
                      PlaceholderText="未选择" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">密码</span>
            <PasswordBox v-model:Password="regForm.password"
                         PlaceholderText="设置密码（至少6位，含字母和数字）" :MaxLength="50" />
          </label>
          <label class="yali-field">
            <span class="yali-field-label">确认密码</span>
            <PasswordBox v-model:Password="regForm.confirm" PlaceholderText="再次输入密码" :MaxLength="50" />
          </label>
          <div class="yali-field">
            <span class="yali-field-label">人机验证</span>
            <div id="yaliRegCaptcha"></div>
          </div>
          <p v-if="regMsg" class="login-msg" :class="regOk ? 'login-msg-ok' : 'login-msg-error'">{{ regMsg }}</p>
          <Button class="login-submit" type="submit" :Style="'{StaticResource AccentButtonStyle}'"
                  :IsEnabled="!busy">
            <span class="yali-btn-inner"><span>{{ busy ? '提交中…' : '提交注册申请' }}</span></span>
          </Button>
        </form>
      </div>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { apiGet, apiPost, mountCaptcha, toast } from '../../shared/api'

const TABS = [
  { Text: '登录', Tag: 'login' },
  { Text: '注册', Tag: 'register' }
]
const tabs = TABS
const tab = ref<'login' | 'register'>('login')
const selectedTab = ref(TABS[0])
const busy = ref(false)

function onTabChanged(args: { SelectedItem?: { Tag?: string } }) {
  const t = args?.SelectedItem?.Tag
  if (t === 'login' || t === 'register') tab.value = t
}

watch(tab, (t) => {
  selectedTab.value = TABS.find((x) => x.Tag === t) ?? TABS[0]
  loginError.value = ''
  regMsg.value = ''
})

/* ── 验证码（WinUIonWeb 无此控件，沿用站点现有实现） ── */
type Captcha = { getData: () => Record<string, string>; refresh: () => void }
let loginCaptcha: Captcha | null = null
let regCaptcha: Captcha | null = null

onMounted(async () => {
  await nextTick()
  /* 两个表单都用 v-show，所以两个容器在挂载时都已存在（见模板注释）。
     mountCaptcha 在容器缺失时会显式告警，而不是静默失败。 */
  loginCaptcha = mountCaptcha('yaliLoginCaptcha')
  regCaptcha = mountCaptcha('yaliRegCaptcha')
})

/* ── 登录 ── */
const loginForm = reactive({ name: '', password: '' })
const loginError = ref('')

const unlock = (id: string) => {
  const fn = (window as unknown as {
    unlockAchievement?: (i: string) => Promise<unknown>
  }).unlockAchievement
  const toastFn = (window as unknown as {
    showAchievementToast?: (i: string) => void
  }).showAchievementToast
  // ?. 要一路串下去：unlockAchievement 返回 undefined 时直接 .then 会抛 TypeError
  fn?.(id)?.then((ok) => {
    if (ok) toastFn?.(id)
  })
}

async function handleLogin() {
  if (busy.value) return
  if (!loginForm.name.trim() || !loginForm.password) {
    loginError.value = '请输入姓名与密码'
    return
  }
  busy.value = true
  loginError.value = ''
  try {
    const data = await apiPost<{
      user: Record<string, unknown>
      password_reset?: boolean
    }>('/api/auth/signin', {
      name: loginForm.name,
      password: loginForm.password,
      ...(loginCaptcha ? loginCaptcha.getData() : {})
    })

    localStorage.removeItem('_loginFail')
    localStorage.setItem('user', JSON.stringify(data.user))

    /* 鸽子：距上次登录超过 31 天 */
    const lastLogin = localStorage.getItem('_lastLogin')
    if (lastLogin && (Date.now() - Number(lastLogin)) / 86400000 > 31) {
      unlock('pigeon')
    }
    localStorage.setItem('_lastLogin', String(Date.now()))

    /* 全勤奖：连续 7 天登录 */
    const today = new Date().toDateString()
    const dates: string[] = JSON.parse(localStorage.getItem('_loginDates') || '[]')
    const lastDate = dates.length ? dates[dates.length - 1] : null
    if (lastDate !== today) {
      if (lastDate && (Date.now() - new Date(lastDate).getTime()) / 86400000 <= 1.5) {
        dates.push(today)
        if (dates.length > 7) dates.shift()
        if (dates.length >= 7) unlock('attendance')
      } else {
        dates.length = 0
        dates.push(today)
      }
      localStorage.setItem('_loginDates', JSON.stringify(dates))
    }

    /* 月光族：当月最后一天 */
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    if (now.getDate() === lastDay) unlock('moonlight')

    /* 周年庆：注册满一年那天 */
    const regDate = (data.user.created_at as string) || localStorage.getItem('_regDate')
    if (regDate) {
      const d = new Date(regDate.endsWith('Z') ? regDate : regDate + 'Z')
      if (!isNaN(d.getTime()) && now.getMonth() === d.getMonth() && now.getDate() === d.getDate()) {
        unlock('anniversary')
      }
    }
    localStorage.setItem('_regDate', (data.user.created_at as string) || String(Date.now()))

    if (data.password_reset) {
      window.alert('你的账号密码已重置，初始密码为 Yali@1234，请及时修改密码')
    }

    /* 把离线累积的成就合并到服务端 */
    const local = (() => {
      try {
        return JSON.parse(localStorage.getItem('achievements') || '[]') as string[]
      } catch {
        return []
      }
    })()
    if (local.length) {
      const server = (data.user.achievements as string[]) || []
      for (const id of local.filter((a) => !server.includes(a))) {
        try {
          await apiPost('/api/achievements/unlock', { id })
        } catch {
          /* 忽略单个失败 */
        }
      }
      localStorage.removeItem('achievements')
    }

    const checkCounts = (window as unknown as { checkCountAchievements?: () => void })
      .checkCountAchievements
    try {
      checkCounts?.()
    } catch {
      /* 忽略 */
    }

    window.location.href = 'services.html'
  } catch (err) {
    loginError.value = (err as Error).message
    loginCaptcha?.refresh()
    const fails = Number(localStorage.getItem('_loginFail') || 0) + 1
    localStorage.setItem('_loginFail', String(fails))
    if (fails >= 3) {
      localStorage.removeItem('_loginFail')
      unlock('locked_out')
    }
  } finally {
    busy.value = false
  }
}

/* ── 注册 ── */
const DEPARTMENTS = [
  '书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室'
]
const departments = DEPARTMENTS
const regDeptIndex = ref(-1)
const regForm = reactive({ name: '', class_name: '', password: '', confirm: '' })
const regMsg = ref('')
const regOk = ref(false)
const nameMsg = ref('')
const nameOk = ref(false)
const classMsg = ref('')
const classOk = ref(false)

let nameTimer: number | undefined
function onNameInput() {
  const val = regForm.name.trim()
  if (nameTimer) window.clearTimeout(nameTimer)
  if (val.length < 2) {
    nameMsg.value = ''
    return
  }
  nameTimer = window.setTimeout(async () => {
    try {
      const d = await apiGet<{ available: boolean }>(
        '/api/auth/check-name?name=' + encodeURIComponent(val)
      )
      nameOk.value = !!d.available
      nameMsg.value = d.available ? '✓ 该姓名可用' : '该姓名已被注册'
    } catch {
      nameMsg.value = ''
    }
  }, 350)
}

function onClassInput() {
  const val = regForm.class_name.trim()
  if (!val) {
    classMsg.value = ''
    return
  }
  if (!/^\d{4}$/.test(val)) {
    classOk.value = false
    classMsg.value = '请输入4位数字'
    return
  }
  const valid = (window as unknown as { isValidClass?: (v: string) => boolean }).isValidClass
  classOk.value = valid ? valid(val) : true
  classMsg.value = classOk.value ? '✓ 有效班级' : '班级编号不在允许范围内'
}

async function handleRegister() {
  if (busy.value) return
  regMsg.value = ''
  regOk.value = false
  if (regForm.password !== regForm.confirm) {
    regMsg.value = '两次密码输入不一致'
    return
  }
  if (regForm.password.length < 6) {
    regMsg.value = '密码至少 6 位'
    return
  }
  const valid = (window as unknown as { isValidClass?: (v: string) => boolean }).isValidClass
  if (valid && !valid(regForm.class_name)) {
    regMsg.value = '班级格式无效，请输入4位班级编号（如2501）'
    return
  }
  busy.value = true
  try {
    await apiPost('/api/auth/register', {
      name: regForm.name,
      class_name: regForm.class_name,
      department: regDepartment(),
      password: regForm.password,
      ...(regCaptcha ? regCaptcha.getData() : {})
    })
    regOk.value = true
    regMsg.value = '注册申请已提交，请等待管理员审核'
    regForm.name = ''
    regForm.class_name = ''
    regForm.password = ''
    regForm.confirm = ''
    regDeptIndex.value = -1
    // 旧页面在 2 秒后自动切回登录页签（login.html:261），保留该行为
    window.setTimeout(() => {
      if (tab.value === 'register') tab.value = 'login'
    }, 2000)
    regCaptcha?.refresh()
  } catch (err) {
    regMsg.value = (err as Error).message
    regCaptcha?.refresh()
    toast((err as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

function regDepartment() {
  return regDeptIndex.value >= 0 ? DEPARTMENTS[regDeptIndex.value] : ''
}
</script>

<style>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px 64px;
}
.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px 28px;
  border: 1px solid var(--card-stroke);
  border-radius: 8px;
  background: var(--card-bg);
}
.login-title {
  display: block;
  text-align: center;
  color: var(--accent-base);
  margin-bottom: 4px;
}
.login-sub {
  display: block;
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.login-tabs {
  margin-bottom: 18px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.login-submit {
  margin-top: 4px;
}
.login-hint {
  font-size: 12px;
  margin-top: 2px;
}
.login-hint.is-ok {
  color: #0f7b0f;
}
.login-hint.is-bad {
  color: #c42b1c;
}
.login-msg {
  margin: 0;
  font-size: 13px;
  text-align: center;
}
.login-msg-error {
  color: #c42b1c;
}
.login-msg-ok {
  color: #0f7b0f;
}
html.theme-dark .login-hint.is-ok,
html.theme-dark .login-msg-ok {
  color: #6ccb5f;
}
html.theme-dark .login-hint.is-bad,
html.theme-dark .login-msg-error {
  color: #ff99a4;
}

@media (max-width: 640px) {
  .login-page {
    align-items: flex-start;
    padding: 16px 16px 48px;
  }
  .login-card {
    padding: 24px 20px;
  }
}
</style>
