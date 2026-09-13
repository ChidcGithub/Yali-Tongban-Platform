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

      <!-- 「伪装入侵」彩蛋的容器：仅在 404 且带 ?from= 时渲染。
           标记由旧 public/404.html 原样移植（src/pages/404/intruder.ts），
           默认 display:none，动画脚本会在需要时接管整屏。 -->
      <div v-if="intruderActive" v-html="intruderMarkup" />
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import YaliShell from './YaliShell.vue'
import { GLYPH } from '../shared/icons'
import { INTRUDER_MARKUP, startIntruder } from '../pages/404/intruder'

const props = defineProps<{
  current: string
  code: number
  question: string
  hint: string
}>()

const extra = ref('')
const intruderActive = ref(false)
const intruderMarkup = INTRUDER_MARKUP

function go(href: string) {
  window.location.href = href
}

function goBack() {
  if (window.history.length > 1) window.history.back()
  else go('services.html')
}

onMounted(async () => {
  /* 站点维护状态（沿用站点既有实现） */
  const check = (window as unknown as { checkSiteClosed?: () => void }).checkSiteClosed
  check?.()

  if (props.code !== 404) return

  const from = new URLSearchParams(window.location.search).get('from')
  if (!from) return

  /* 带 from 说明是从站内某处越权跳来的 —— 播放原页面的「伪装入侵」彩蛋。
     注意 intruder / frequent_404 两个成就是由动画脚本在收尾时解锁的
     （与原页面一致：不加 from 时既不计数也不解锁），这里不重复触发。 */
  extra.value = `来源页面：${from}`
  intruderActive.value = true
  // v-html 是异步渲染的，必须等 DOM 更新完再启动动画，
  // 否则 startIntruder 拿不到 #intrSeq 会直接返回
  await nextTick()
  startIntruder(from)
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
