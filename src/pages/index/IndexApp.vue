<template>
  <div class="splash">
    <div class="splash-inner">
      <img src="/images/emblem.png" alt="雅礼团委" class="splash-emblem" />
      <TextBlock class="splash-title" Text="雅礼团委 · 通办" :FontSize="22" :FontWeight="600" />
      <TextBlock class="splash-sub" Text="一站式工作管理平台" />
      <ProgressBar class="splash-bar" :IsIndeterminate="true" :MinHeight="4" />
      <TextBlock class="splash-version" :Text="'v' + version" />
      <TextBlock class="splash-skip" Text="点击任意处跳过" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/* 启动闪屏：不进 NavigationView 外壳，用全屏 WinUI 排版 */
const version = ref(
  (window as unknown as { APP_VERSION?: string }).APP_VERSION ?? '4.0.0-0915'
)

let timer: number | undefined

function go() {
  window.location.href = 'services.html'
}

function onAnyClick() {
  if (timer) window.clearTimeout(timer)
  go()
}

onMounted(() => {
  // 站点维护状态检查（沿用站点既有实现）
  const check = (window as unknown as { checkSiteClosed?: () => void }).checkSiteClosed
  check?.()

  timer = window.setTimeout(go, 1800)
  document.addEventListener('click', onAnyClick, { once: true })
})

onBeforeUnmount(() => {
  if (timer) window.clearTimeout(timer)
  document.removeEventListener('click', onAnyClick)
})
</script>

<style>
.splash {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-bg);
  text-align: center;
}
.splash-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  width: 100%;
}
.splash-emblem {
  width: 88px;
  height: 88px;
  object-fit: contain;
  margin-bottom: 12px;
}
.splash-title {
  color: var(--text-primary);
}
.splash-sub {
  color: var(--text-secondary);
  margin-bottom: 20px;
}
.splash-bar {
  width: 200px;
}
.splash-version {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 1px;
}
.splash-skip {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
