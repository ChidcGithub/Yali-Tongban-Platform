<template>
  <Transition name="yali-cookie">
    <div v-if="visible" class="yali-cookie win-theme-scope" role="status" aria-live="polite">
      <FontIcon :Glyph="GLYPH.about" :FontSize="18" class="yali-cookie-icon" />
      <p class="yali-cookie-text">
        本站使用 Cookie 维持登录。继续使用即表示同意。
      </p>
      <Button
        class="yali-cookie-btn"
        :Style="'{StaticResource AccentButtonStyle}'"
        @Click="accept">
        <span class="yali-btn-inner"><span>知道了</span></span>
      </Button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * Cookie 告知横幅（WinUI 版）
 *
 * 旧实现在 `public/js/api.js` 的 `initCookieConsent()` 里，注入的是
 * 旧设计系统的 DOM（`.cookie-banner` + `.btn`）—— 在 WinUI 界面里底部那条
 * 一眼就能看出「不是这套皮」。这里用站点的 ContentDialog 同一套控件与令牌重做。
 *
 * 与旧版保持一致的三件事：
 *   1. 只在没接受过时出现（localStorage `cookieConsent`）
 *   2. 「知道了」写 localStorage 并解锁成就 `cookie_monster`
 *   3. 接受后滑出消失
 *
 * 挂载方式见 `shared/bootstrap.ts`：和确认框一样挂在 body 上，
 * 每个页面只需一份，尺寸固定在视口底部居中。
 */
import { onMounted, ref } from 'vue'
import { GLYPH } from '../shared/icons'

const visible = ref(false)

/* 让遗留实现让位：api.js 的 initCookieConsent 见到这个标记就不再注入旧横幅
   （它注入的 DOM 用的是旧设计系统的类名，会和新版叠在一起出现两条） */
;(window as unknown as { __winuiCookieBanner?: boolean }).__winuiCookieBanner = true

onMounted(() => {
  if (localStorage.getItem('cookieConsent')) return
  // 稍等一下再出现：首次进入页面先让内容渲染，横幅滑入不会和首屏动画打架
  window.setTimeout(() => (visible.value = true), 600)
})

function accept() {
  localStorage.setItem('cookieConsent', 'true')
  visible.value = false

  /* 成就沿用站点既有实现（api.js 注册在 window 上） */
  const w = window as unknown as {
    unlockAchievement?: (id: string) => Promise<boolean>
    showAchievementToast?: (id: string) => void
  }
  w.unlockAchievement?.('cookie_monster').then((ok) => {
    if (ok) w.showAchievementToast?.('cookie_monster')
  })
}
</script>

<style>
/* 固定在底部居中；宽度与 ContentDialog 的观感一致，不占满整屏 */
.yali-cookie {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 90000;
  box-sizing: border-box;
  width: min(560px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--StrokeSurfaceDefault, rgba(0, 0, 0, 0.06));
  background: var(--SolidBackgroundFillColorTertiary, var(--md-surface, #fff));
  color: var(--TextFillColorPrimaryBrush, var(--md-on-surface, #1a1a1a));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.yali-cookie-icon {
  flex: none;
  color: var(--AccentTextFillColorPrimaryBrush, var(--md-primary));
}

.yali-cookie-text {
  flex: 1 1 auto;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.yali-cookie-btn {
  flex: none;
}

/* 入场/退场：轻微上浮，和 WinUI 的 Show 动画节奏一致 */
.yali-cookie-enter-active,
.yali-cookie-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.yali-cookie-enter-from,
.yali-cookie-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

@media (max-width: 480px) {
  .yali-cookie {
    flex-wrap: wrap;
    gap: 8px;
  }
  .yali-cookie-text {
    flex-basis: calc(100% - 30px);
  }
  .yali-cookie-btn {
    margin-left: auto;
  }
}
</style>
