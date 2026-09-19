<template>
  <!--
    首次使用欢迎引导。
    只在「主页（services）+ 每个浏览器一次」出现；
    无论怎么关掉（开始使用 / Esc）都记为已读，之后不再打扰。

    设计约束：简洁干练 —— 一句话定位 + 两列功能速览（名称与侧栏一致，
    用户在这里看到的叫什么，之后在侧栏里就叫什么）+ 一行提示。
  -->
  <ContentDialog
    :IsOpen="open"
    Title="欢迎使用雅礼团委 · 通办"
    PrimaryButtonText="开始使用"
    :DefaultButton="'Primary'"
    @update:IsOpen="setOpen"
  >
    <p class="yali-welcome-lead">一站式线上办事与服务系统</p>

    <div class="yali-welcome-grid">
      <div v-for="f in FEATURES" :key="f.label" class="yali-welcome-item">
        <FontIcon :Glyph="f.icon" :FontSize="17" />
        <div class="yali-welcome-text">
          <p class="yali-welcome-name">{{ f.label }}</p>
          <p class="yali-welcome-desc">{{ f.desc }}</p>
        </div>
      </div>
    </div>

    <p class="yali-welcome-hint">部分功能需登录后使用 · 更新记录见「关于」页</p>
  </ContentDialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { GLYPH } from '../shared/icons'

const KEY = 'welcome_seen'
const open = ref(false)

/** 名称与侧栏导航（shared/nav.ts）逐字一致 —— 欢迎页是导航的预告，不是另一套叫法 */
const FEATURES = [
  { icon: GLYPH.services, label: '服务', desc: '报修与意见反馈' },
  { icon: GLYPH.announcements, label: '公告', desc: '团委通知' },
  { icon: GLYPH.activities, label: '活动', desc: '报名与志愿者' },
  { icon: GLYPH.duty, label: '值日', desc: '排班与签到' },
  { icon: GLYPH.finance, label: '财务', desc: '部门收支记录' },
  { icon: GLYPH.polls, label: '投票', desc: '发起与参与' },
  { icon: GLYPH.moment, label: '动态', desc: '校园动态' },
  { icon: GLYPH.messages, label: '消息', desc: '站内通知' },
  { icon: GLYPH.settings, label: '个性化', desc: '字号与显示偏好' },
  { icon: GLYPH.admin, label: '管理', desc: '管理员专用' }
] as const

onMounted(() => {
  /* ⚠️ Cloudflare Pages 会把 /services.html **308 到 /services**（clean URL），
     所以线上 pathname 没有 .html —— 两种形态都要认。
     （第一版只认 .html，本地全绿、线上不弹，就是栽在这里。）
     只在主页弹：从深链（某条公告/投票）进来的访客不打扰。 */
  if (!/\/services(\.html)?$/.test(location.pathname)) return
  if (localStorage.getItem(KEY)) return

  /* ⚠️ 不能在 onMounted 里同步打开。
     这个组件是独立 Vue 应用（mountSingleton），同步置 open=true 会让
     ContentDialog 的进场过渡与首帧渲染挤在一起 —— 过渡的 transitionend /
     animationend 永远不触发，overlay 永远停在 `enter-from`（opacity:0）：
     对话框在 DOM 里、能点，但**看不见**（排查时极易当成"没弹出来"）。
     等浏览器画完第一帧再弹，过渡正常走完。 */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      open.value = true
    })
  })
})

function setOpen(v: boolean) {
  open.value = v
  // 任何方式关掉（开始使用 / Esc / 点遮罩）都算看过
  if (!v) localStorage.setItem(KEY, '1')
}
</script>

<style>
.yali-welcome-lead {
  margin: 0 0 14px;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.yali-welcome-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.yali-welcome-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 6px;
  background: var(--subtle-secondary, rgba(0, 0, 0, 0.03));
}

.yali-welcome-item .win-font-icon {
  margin-top: 2px;
  color: var(--md-primary);
  flex: 0 0 auto;
}

.yali-welcome-text {
  min-width: 0;
}

.yali-welcome-name {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.yali-welcome-desc {
  margin: 1px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-tertiary);
}

.yali-welcome-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .yali-welcome-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
