<template>
  <YaliShell current="personalize" title="个性化">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="主题、强调色、字号与动效，按你的习惯调整" />
      </header>

      <!-- 主题模式 -->
      <section class="yali-section">
        <TextBlock Text="主题模式" :FontSize="16" :FontWeight="600" />
        <RadioButtons :ItemsSource="THEMES" v-model:SelectedIndex="themeIndex"
                      class="pz-radios" @SelectionChanged="onThemeChange" />
      </section>

      <!-- 强调色 -->
      <section class="yali-section">
        <TextBlock Text="强调色" :FontSize="16" :FontWeight="600" />
        <div class="pz-colors">
          <button v-for="c in COLORS" :key="c.val" class="pz-color"
                  :class="{ 'is-active': prefs.color === c.val }"
                  :title="c.name" :style="{ background: c.val }"
                  type="button" @click="setColor(c.val)">
            <FontIcon v-if="prefs.color === c.val" :Glyph="GLYPH.check" :FontSize="14" />
          </button>
        </div>
        <p class="yali-muted pz-hint">当前：{{ currentColorName }}</p>
      </section>

      <!-- 字号 -->
      <section class="yali-section">
        <TextBlock Text="字体大小" :FontSize="16" :FontWeight="600" />
        <div class="pz-slider-row">
          <TextBlock Text="小" class="yali-muted" />
          <Slider :Minimum="13" :Maximum="18" :StepFrequency="1"
                  :Value="prefs.fontSize" class="pz-slider" @ValueChanged="onFontChange" />
          <TextBlock Text="大" class="yali-muted" />
          <span class="pz-value">{{ prefs.fontSize }}px</span>
        </div>
      </section>

      <!-- 动效 -->
      <section class="yali-section">
        <TextBlock Text="动效" :FontSize="16" :FontWeight="600" />
        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">减少动效</span>
            <span class="yali-setting-desc">降低界面过渡与动画幅度</span>
          </div>
          <ToggleSwitch v-model:IsOn="reduceAnimation" @Toggled="onAnimationToggle" />
        </div>
        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">完全关闭动效</span>
            <span class="yali-setting-desc">适用于低性能设备或不适自动效的情况</span>
          </div>
          <ToggleSwitch v-model:IsOn="noAnimation" @Toggled="onNoAnimationToggle" />
        </div>
        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">Super Graphic</span>
            <span class="yali-setting-desc">粒子特效、卡片倾斜、彩纸散落等华丽效果</span>
          </div>
          <ToggleSwitch v-model:IsOn="superGraphic" @Toggled="onSuperGraphicToggle" />
        </div>
      </section>

      <!-- 重置 -->
      <section class="yali-section">
        <div class="yali-setting-row">
          <div class="yali-setting-label">
            <span class="yali-setting-title">重置所有个性化设置</span>
            <span class="yali-setting-desc">恢复为默认主题、雅礼深蓝与中等字号</span>
          </div>
          <Button @Click="resetAll">
            <span class="yali-btn-inner">
              <FontIcon :Glyph="GLYPH.refresh" :FontSize="14" /><span>重置</span>
            </span>
          </Button>
        </div>
      </section>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { toast } from '../../shared/api'

interface Prefs {
  theme?: 'light' | 'dark' | 'auto'
  color?: string
  fontSize?: number
  animation?: boolean
  noAnimation?: boolean
  superGraphic?: boolean
}

const THEMES = ['浅色', '深色', '跟随系统']
const THEME_VALUES: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto']

const COLORS = [
  { name: '雅礼深蓝', val: '#0D2137' },
  { name: '青竹绿', val: '#0D7C3F' },
  { name: '典雅紫', val: '#6C3483' },
  { name: '活力橙', val: '#E67E22' },
  { name: '醒目红', val: '#C41E24' },
  { name: '清新青', val: '#1A8A8A' }
]

const prefs = reactive<Prefs>({
  theme: 'light',
  color: '#0D2137',
  fontSize: 15,
  animation: true,
  noAnimation: false,
  superGraphic: false
})

const themeIndex = ref(0)
const reduceAnimation = ref(false)
const noAnimation = ref(false)
const superGraphic = ref(false)

const currentColorName = computed(
  () => COLORS.find((c) => c.val === prefs.color)?.name ?? prefs.color
)

/* ── 读写 ── */
function loadPrefs() {
  let raw = localStorage.getItem('personalize')
  if (!raw) {
    const m = document.cookie.match(/(?:^|;\s*)personalize=([^;]*)/)
    if (m) raw = decodeURIComponent(m[1])
  }
  let saved: Prefs = {}
  try {
    saved = JSON.parse(raw || '{}')
  } catch {
    saved = {}
  }
  Object.assign(prefs, {
    theme: saved.theme ?? 'light',
    color: saved.color ?? '#0D2137',
    fontSize: saved.fontSize ?? 15,
    animation: saved.animation !== false,
    noAnimation: saved.noAnimation === true,
    superGraphic: saved.superGraphic === true
  })
  themeIndex.value = Math.max(0, THEME_VALUES.indexOf(prefs.theme ?? 'light'))
  reduceAnimation.value = prefs.animation === false
  noAnimation.value = prefs.noAnimation === true
  superGraphic.value = prefs.superGraphic === true
}

function persist() {
  localStorage.setItem('personalize', JSON.stringify(prefs))
  /* 顺带写 cookie，保证与未迁移页面共享同一份偏好 */
  document.cookie = `personalize=${encodeURIComponent(JSON.stringify(prefs))};path=/;max-age=31536000`
}

/**
 * 即时应用
 *
 * 与原 api.js 的 applyPersonalize 保持一致：站点那支是 IIFE，只在页面加载时跑一次，
 * 所以在个性化页里改完必须自己应用一遍（否则要刷新才生效）。
 */
function apply() {
  const root = document.documentElement

  /* 主题：本页已由 theme.ts 的镜像负责 theme-light/theme-dark 同步 */
  if (prefs.theme === 'dark') {
    root.classList.add('dark')
  } else if (prefs.theme === 'light') {
    root.classList.remove('dark')
  } else {
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  }

  /* 强调色：写 --md-primary，WinUI 桥接层正是从这里取 accent */
  if (prefs.color) {
    root.style.setProperty('--md-primary', prefs.color)
    const r = parseInt(prefs.color.slice(1, 3), 16)
    const g = parseInt(prefs.color.slice(3, 5), 16)
    const b = parseInt(prefs.color.slice(5, 7), 16)
    root.style.setProperty('--md-primary-dim', `rgba(${r},${g},${b},.8)`)
  }

  root.style.fontSize = `${prefs.fontSize}px`

  root.classList.toggle('reduce-animation', prefs.animation === false)
  root.classList.toggle('no-animation', prefs.noAnimation === true)
  root.classList.toggle('super-graphic', prefs.superGraphic === true)

  if (prefs.superGraphic) ensureSuperGraphicAssets()
}

function ensureSuperGraphicAssets() {
  if (!document.getElementById('sgCss')) {
    const link = document.createElement('link')
    link.id = 'sgCss'
    link.rel = 'stylesheet'
    link.href = '/css/graphic.css'
    document.head.appendChild(link)
  }
  if (!document.getElementById('sgJs')) {
    const script = document.createElement('script')
    script.id = 'sgJs'
    script.src = '/js/graphic.js'
    document.head.appendChild(script)
  }
}

/* ── 成就 ── */
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

/* 五彩斑斓的黑：10 秒内切换 6 次以上主题色 */
let colorSwitchTimes: number[] = []
function checkColorFreak() {
  const now = Date.now()
  colorSwitchTimes = colorSwitchTimes.filter((t) => now - t < 10000)
  colorSwitchTimes.push(now)
  if (colorSwitchTimes.length >= 6) {
    colorSwitchTimes = []
    unlock('color_freak')
  }
}

/* 黑白无常：深浅模式切换 20 次以上 */
let themeSwitches = 0
function onThemeChange(args?: { SelectedIndex?: number }) {
  const idx = args?.SelectedIndex ?? themeIndex.value
  const next = THEME_VALUES[idx] ?? 'light'
  if (next === prefs.theme) return
  prefs.theme = next
  persist()
  apply()
  themeSwitches += 1
  if (themeSwitches >= 20) {
    themeSwitches = 0
    unlock('ocd')
  }
}

function setColor(val: string) {
  if (prefs.color === val) return
  prefs.color = val
  persist()
  apply()
  checkColorFreak()
}

function onFontChange(args: { Value?: number }) {
  const v = Math.round(Number(args?.Value ?? prefs.fontSize))
  if (v === prefs.fontSize) return
  prefs.fontSize = v
  persist()
  apply()
}

function onAnimationToggle() {
  prefs.animation = !reduceAnimation.value
  persist()
  apply()
}

function onNoAnimationToggle() {
  prefs.noAnimation = noAnimation.value
  persist()
  apply()
}

function onSuperGraphicToggle() {
  prefs.superGraphic = superGraphic.value
  persist()
  apply()
  if (prefs.superGraphic) unlock('super_graphic')
}

function resetAll() {
  Object.assign(prefs, {
    theme: 'light',
    color: '#0D2137',
    fontSize: 15,
    animation: true,
    noAnimation: false,
    superGraphic: false
  })
  themeIndex.value = 0
  reduceAnimation.value = false
  noAnimation.value = false
  superGraphic.value = false
  persist()
  apply()
  toast('已恢复默认设置', 'success')
  unlock('reset_master')
}

onMounted(() => {
  loadPrefs()
  /* 进入页面时把当前偏好应用一遍，保证与已存状态一致 */
  apply()
})
</script>

<style>
.pz-radios {
  margin-top: 10px;
}
.pz-colors {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.pz-color {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  padding: 0;
  outline: 1px solid var(--stroke-divider);
  outline-offset: 2px;
}
.pz-color.is-active {
  border-color: var(--text-primary);
}
.pz-hint {
  margin-top: 10px;
}
.pz-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.pz-slider {
  flex: 1;
  min-width: 0;
}
.pz-value {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 44px;
  text-align: right;
}
</style>
