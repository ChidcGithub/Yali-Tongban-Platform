<template>
  <!--
    未填班级时的强制补填表单。样式与「提交问题」等对话框一致（同一个 ContentDialog）。
    没有「取消」按钮 —— 与旧版 overlay 一样关不掉；唯一的出口是「退出登录」。
  -->
  <ContentDialog
    :IsOpen="classPromptState.open"
    Title="填写班级"
    PrimaryButtonText="保存"
    SecondaryButtonText="退出登录"
    :IsPrimaryButtonEnabled="canSubmit"
    :DefaultButton="'Primary'"
    @update:IsOpen="onOpenChange"
    @PrimaryButtonClick="submit"
    @SecondaryButtonClick="logout">
    <div class="yali-form yali-cls">
      <p class="yali-cls-tip">请填写你的班级以继续使用</p>

      <label class="yali-field">
        <span class="yali-field-label">班级 <em>*</em></span>
        <TextBox
          v-model:Text="className"
          PlaceholderText="如 2501"
          :MaxLength="4" />
      </label>

      <label class="yali-field">
        <span class="yali-field-label">密码 <em>*</em></span>
        <PasswordBox v-model:Password="password" PlaceholderText="输入密码确认" />
      </label>

      <p v-if="error" class="yali-cls-error">{{ error }}</p>
      <p v-else-if="className && classError(className)" class="yali-cls-error">
        {{ classError(className) }}
      </p>
    </div>
  </ContentDialog>
</template>

<script setup lang="ts">
/**
 * 班级补填表单宿主（挂在 body 的单例，见 shared/bootstrap.ts）。
 *
 * 触发点：`shared/guard.ts` 的 `checkAuth()` —— 与旧版 auth.js 同一位置。
 */
import { computed, ref, watch } from 'vue'
import { apiPost, logoutUser, toast } from '../shared/api'
import { classError, classPromptState, settleClassPrompt } from '../shared/classprompt'

const className = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const canSubmit = computed(
  () => !busy.value && !classError(className.value) && password.value.length > 0
)

/* 每次打开都清空：密码不该留，班级也不预填（旧版同样不预填） */
watch(
  () => classPromptState.open,
  (open) => {
    if (!open) return
    className.value = ''
    password.value = ''
    error.value = ''
    busy.value = false
  }
)

function onOpenChange(value: boolean) {
  /* 对话框本来就不该被关掉（没有取消按钮、遮罩不响应）。
     万一被 Esc 之类的路径关掉，这里重新打开 —— 否则 Promise 永远悬着，
     调用方的 await 会卡住，页面看上去「什么都没发生」。 */
  if (!value && classPromptState.open) {
    classPromptState.open = true
  }
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await apiPost<{ user?: unknown }>('/api/auth/change-class', {
      class_name: className.value.trim(),
      password: password.value
    })
    if (data?.user && typeof data.user === 'object') {
      localStorage.setItem('user', JSON.stringify(data.user))
    }
    toast('班级已更新', 'success')
    settleClassPrompt(true)
  } catch (err) {
    // 密码错、班级格式不对等都在这里回显（旧版也是把错误留在表单里）
    error.value = (err as Error).message
    password.value = ''
  } finally {
    busy.value = false
  }
}

/**
 * 退出登录（这个表单唯一的出口）。
 *
 * ⚠️ 原先这里调的是 `window.logout` —— 那是 nav.js 的旧实现，
 * 而 WinUI 页面不加载 nav.js，所以它一直是 undefined：
 * 点下去只是把表单关掉，**人还是登录着的**（cookie 还在），
 * 下次进守卫页又被 `/api/auth/me` 恢复。现在真的走后端登出。
 */
async function logout() {
  settleClassPrompt(false)
  await logoutUser()
  window.location.replace('services.html')
}
</script>

<style>
.yali-cls {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.yali-cls-tip {
  margin: 0;
  font-size: 13px;
  color: var(--md-on-surface-variant);
}

.yali-cls-error {
  margin: 0;
  font-size: 12px;
  color: var(--md-error, #b3261e);
}
</style>
