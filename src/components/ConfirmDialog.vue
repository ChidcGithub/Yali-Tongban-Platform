<template>
  <!--
    全站对话框宿主（确认 / 输入 / 提示）。
    样式与「提交问题」等表单对话框完全一致 —— 用的就是同一个 ContentDialog，
    区别只在于内容是一段文字（输入模式再加一个 TextBox）。
  -->
  <ContentDialog
    :IsOpen="dialogState.open"
    :Title="dialogState.title || '确认操作'"
    :PrimaryButtonText="primaryText"
    :CloseButtonText="dialogState.alertOnly ? '' : dialogState.cancelText || '取消'"
    :DefaultButton="'Primary'"
    :IsPrimaryButtonEnabled="primaryEnabled"
    @update:IsOpen="onOpenChange"
    @PrimaryButtonClick="onConfirm">
    <div class="yali-confirm" :class="{ 'yali-confirm-danger': dialogState.danger }">
      <p class="yali-confirm-msg">{{ dialogState.message }}</p>

      <div v-if="dialogState.mode === 'prompt'" class="yali-confirm-field">
        <TextBox
          v-model:Text="dialogState.input"
          :PlaceholderText="dialogState.placeholder || ''"
          :MaxLength="dialogState.maxLength || 200"
          class="yali-confirm-input" />
        <p v-if="promptError" class="yali-confirm-error">{{ promptError }}</p>
      </div>

      <p v-if="counting" class="yali-confirm-hint">
        <FontIcon :Glyph="GLYPH.about" :FontSize="13" />
        <span>请等待 {{ secondsLeft }} 秒后确认…</span>
      </p>
    </div>
  </ContentDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dialogState, settleDialog } from '../shared/confirm'
import { GLYPH } from '../shared/icons'

const secondsLeft = ref(0)
let timer: number | undefined
let settled = false

const counting = computed(() => secondsLeft.value > 0)

const primaryText = computed(() => {
  const base = dialogState.confirmText || (dialogState.alertOnly ? '知道了' : '确定')
  return counting.value ? `${base}（${secondsLeft.value}）` : base
})

/** 输入模式的实时校验：不合法就禁用主按钮并显示原因 */
const promptError = computed(() => {
  if (dialogState.mode !== 'prompt') return ''
  return dialogState.validate?.(dialogState.input) ?? ''
})

const primaryEnabled = computed(() => !counting.value && !promptError.value)

function stopTimer() {
  if (timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

/* 打开时启动倒计时；关闭时清理。
   不用 immediate —— 宿主常驻挂载，open 初始就是 false。 */
watch(
  () => dialogState.open,
  (open) => {
    stopTimer()
    if (!open) return
    settled = false
    const total = Math.max(0, Math.floor(Number(dialogState.countdown) || 0))
    secondsLeft.value = total
    if (!total) return
    timer = window.setInterval(() => {
      secondsLeft.value -= 1
      if (secondsLeft.value <= 0) stopTimer()
    }, 1000)
  }
)

function onConfirm() {
  if (!primaryEnabled.value) return
  finish(dialogState.mode === 'prompt' ? dialogState.input.trim() : true)
}

/** 按钮点击与「点遮罩 / 按 Esc 关闭」都会走到这里，只结算一次 */
function onOpenChange(value: boolean) {
  if (!value) finish(null)
}

function finish(result: boolean | string | null) {
  if (settled) return
  settled = true
  stopTimer()
  settleDialog(result)
}
</script>

<style>
.yali-confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.yali-confirm-msg {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--md-on-surface);
  white-space: pre-line;
}

.yali-confirm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.yali-confirm-input {
  width: 100%;
}

.yali-confirm-error {
  margin: 0;
  font-size: 12px;
  color: var(--md-error, #b3261e);
}

.yali-confirm-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--md-on-surface-variant);
}

/* 危险操作：主按钮改成警示色。
   ContentDialog 的按钮在组件内部、拿不到 ref，这里用 :has() 从内容反选祖先
   再定位主按钮（比给组件加 class 可靠 —— 那个组件的根是 Teleport）。
   注意 DefaultButton 固定为 'Primary'：若设成 'Close'，ContentDialog 会把
   「取消」渲染成强调按钮（深蓝实心），和红色的主按钮挤在一起很难看，
   反而让人以为「取消」才是被推荐的选项。 */
.content-dialog:has(.yali-confirm-danger) .content-dialog-primary {
  background: var(--md-error, #b3261e) !important;
  border-color: transparent !important;
  color: #fff !important;
}
.content-dialog:has(.yali-confirm-danger) .content-dialog-primary:hover:not(:disabled) {
  filter: brightness(1.12);
}
.content-dialog:has(.yali-confirm-danger) .content-dialog-primary .win-textblock {
  color: #fff !important;
}
</style>
