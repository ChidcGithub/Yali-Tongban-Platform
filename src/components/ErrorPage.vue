<template>
  <YaliShell :current="current" :title="String(code)">
    <div class="err-page">
      <div class="err-card">
        <span class="err-label">ERROR {{ code }}</span>
        <TextBlock class="err-code" :Text="String(code)" />
        <TextBlock class="err-question" :Text="question" />
        <TextBlock class="err-hint" :Text="hint" />

        <div class="err-actions">
          <Button :Style="'{StaticResource AccentButtonStyle}'" @Click="go('services.html')">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.back" :FontSize="14" /><span>返回首页</span>
            </span>
          </Button>
          <Button @Click="goBack">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.back" :FontSize="14" /><span>上一页</span>
            </span>
          </Button>
        </div>

        <p v-if="extra" class="err-extra">{{ extra }}</p>
      </div>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import YaliShell from './YaliShell.vue'
import { GLYPH } from '../shared/icons'
import { toast } from '../shared/api'

const props = defineProps<{
  current: string
  code: number
  question: string
  hint: string
}>()

const extra = ref('')

function go(href: string) {
  window.location.href = href
}

function goBack() {
  if (window.history.length > 1) window.history.back()
  else go('services.html')
}

function unlock(id: string) {
  const fn = (window as unknown as {
    unlockAchievement?: (i: string) => Promise<unknown>
  }).unlockAchievement
  const toastFn = (window as unknown as {
    showAchievementToast?: (i: string) => void
  }).showAchievementToast
  fn?.(id).then((ok) => {
    if (ok) toastFn?.(id)
  })
}

onMounted(() => {
  /* 站点维护状态（沿用站点既有实现） */
  const check = (window as unknown as { checkSiteClosed?: () => void }).checkSiteClosed
  check?.()

  const params = new URLSearchParams(window.location.search)
  const from = params.get('from')

  if (props.code === 404) {
    /* 累计访问 404 三次 → 404常客 */
    const count = Number(localStorage.getItem('_404count') || 0) + 1
    localStorage.setItem('_404count', String(count))
    if (count >= 3) {
      localStorage.removeItem('_404count')
      unlock('frequent_404')
    }

    /* 带 from 参数说明是从站内某处越权跳来的 → 入侵者
       （原页面这里还有一段伪装终端动画，属自成一体的彩蛋，
        本轮未迁移；成就触发保留） */
    if (from) {
      extra.value = `来源页面：${from}`
      unlock('intruder')
      toast('检测到越权访问', 'error')
    }
  }
})
</script>

<style>
.err-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}
.err-card {
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.err-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
}
.err-code {
  font-size: 88px;
  font-weight: 600;
  line-height: 1;
  color: var(--accent-base);
  letter-spacing: -0.04em;
}
.err-question {
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
}
.err-hint {
  font-size: 13px;
  color: var(--text-secondary);
}
.err-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.err-extra {
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
