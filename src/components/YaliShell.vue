<template>
  <NavigationView
    :MenuItems="menuItems"
    :FooterMenuItems="footerItems"
    :SelectedItem="selectedItem"
    :IsSettingsVisible="false"
    :IsBackButtonVisible="'Collapsed'"
    PaneDisplayMode="Auto"
    :Header="headerText"
    @SelectionChanged="onSelectionChanged">
    <!-- 侧栏顶部：站点标识（原 nav.js 的 .nav-brand） -->
    <template #PaneHeader>
      <div class="yali-brand" @click="onBrandClick">
        <img src="/images/emblem.png" alt="" class="yali-brand-emblem" />
        <span class="yali-brand-text">雅礼团委 <small>· 通办</small></span>
      </div>
    </template>

    <!-- 侧栏底部：账户区 -->
    <template #PaneFooter>
      <div class="yali-account">
        <template v-if="user">
          <div class="yali-account-row">
            <FontIcon :Glyph="GLYPH.user" :FontSize="16" />
            <span class="yali-account-name">{{ user.name }}</span>
          </div>
          <Button class="yali-account-action" @click="onLogout">
            <span class="yali-account-action-inner">
              <FontIcon :Glyph="GLYPH.logout" :FontSize="14" />
              <span>登出</span>
            </span>
          </Button>
        </template>
        <template v-else>
          <Button class="yali-account-action" @click="go('login.html')">
            <span class="yali-account-action-inner">
              <FontIcon :Glyph="GLYPH.user" :FontSize="14" />
              <span>登录</span>
            </span>
          </Button>
        </template>
      </div>
    </template>

    <!-- 全局加载条：接管 nav.js 原先的「顶部加载指示」职责
         状态来自 public/js/winui-legacy-bridge.js 抛出的事件（api.js 每次请求会触发） -->
    <ProgressBar
      v-if="loading"
      class="yali-progress"
      :IsIndeterminate="progressTotal === 0"
      :Value="progressDone"
      :Maximum="progressTotal || 100"
      :MinHeight="3" />

    <!-- 页面主体
         NavigationView 的内容区（.win-nav-content）本身是 overflow:hidden 的 flex 列，
         且 WinUI 的 theme.css 给 html/body 设了 overflow:hidden —— 不套 ScrollViewer
         的话超出视口的内容会被直接裁掉、无法滚动。这里統一包一层，页面只管写内容。 -->
    <ScrollViewer
      class="yali-scroll"
      VerticalScrollMode="Auto"
      VerticalScrollBarVisibility="Auto"
      HorizontalScrollMode="Disabled"
      HorizontalScrollBarVisibility="Disabled">
      <slot />
    </ScrollViewer>
  </NavigationView>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GLYPH } from '../shared/icons'
import {
  currentUser,
  navigateTo,
  toMenuItems,
  visibleNavItems,
  type NavEntry
} from '../shared/nav'

const props = defineProps<{
  /** 当前页面的 id，与 nav.js 的 currentPage 一致 */
  current: string
  /** 内容区标题 */
  title?: string
}>()

const user = ref(currentUser())
const messagesEnabled = ref(false)
/** 消息未读数：NavigationView 的菜单项原生支持 infoBadge，
    而 InfoBadge 只接受数字 Value（Value >= 0 时显示、-1 为隐藏） */
const unreadCount = ref(0)

/* 主菜单 */
const menuItems = computed<NavEntry[]>(() => toMenuItems(visibleNavItems()))

/* 侧栏底部条目：消息（功能开关控制）、个性化、关于 */
const footerItems = computed<NavEntry[]>(() => {
  const items = []
  if (messagesEnabled.value) {
    items.push({
      id: 'messages',
      label: '消息',
      icon: GLYPH.messages,
      href: 'messages.html',
      Content: '消息',
      Icon: GLYPH.messages,
      Tag: 'messages',
      ...(unreadCount.value > 0 ? { InfoBadge: { Value: unreadCount.value } } : {})
    })
  }
  items.push(
    {
      id: 'personalize',
      label: '个性化',
      icon: GLYPH.settings,
      href: 'personalize.html',
      Content: '个性化',
      Icon: GLYPH.settings,
      Tag: 'personalize'
    },
    {
      id: 'about',
      label: '关于',
      icon: GLYPH.about,
      href: 'about.html',
      Content: '关于',
      Icon: GLYPH.about,
      Tag: 'about'
    }
  )
  return items
})

const selectedItem = computed<NavEntry | null>(() => {
  const all = [...menuItems.value, ...footerItems.value]
  return all.find((i) => i.id === props.current) ?? null
})

const headerText = computed(() => props.title ?? '')

function go(href: string) {
  navigateTo(href)
}

function onSelectionChanged(args: { SelectedItem?: NavEntry; IsSettingsSelected?: boolean }) {
  const item = args?.SelectedItem
  if (!item?.href || item.id === props.current) return
  go(item.href)
}

function onLogout() {
  const fn = (window as unknown as { logout?: () => void }).logout
  if (fn) fn()
  else {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = 'services.html'
  }
}

/* 成就「击掌！」—— 原实现在 nav.js 里挂在 .nav-brand 上，此处等价保留 */
let brandClicks = Number(localStorage.getItem('_hf') || 0)
function onBrandClick() {
  brandClicks += 1
  localStorage.setItem('_hf', String(brandClicks))
  if (brandClicks < 10) return
  brandClicks = 0
  localStorage.removeItem('_hf')
  const unlock = (window as unknown as {
    unlockAchievement?: (id: string) => Promise<unknown>
  }).unlockAchievement
  const toast = (window as unknown as {
    showAchievementToast?: (id: string) => void
  }).showAchievementToast
  unlock?.('high_five').then((ok) => {
    if (ok) toast?.('high_five')
  })
}

/* 遗留脚本（api.js / utils.js）的加载指示 → 顶部 ProgressBar */
const loading = ref(false)
const progressDone = ref(0)
const progressTotal = ref(0)

function onLegacyLoading(e: Event) {
  const d = (e as CustomEvent).detail as {
    active: boolean
    done: number
    total: number
  }
  loading.value = !!d?.active
  progressDone.value = d?.done ?? 0
  progressTotal.value = d?.total ?? 0
}

onMounted(() => {
  // 兼容既有依赖 <html data-page> 的样式与逻辑（原 nav.js 会设置它）
  document.documentElement.setAttribute('data-page', props.current)

  window.addEventListener('yali:nav-loading', onLegacyLoading)

  // 消息入口受功能开关控制，与原 nav.js 的 initMessagesIcon 一致
  const check = (window as unknown as {
    isFeatureEnabled?: (k: string) => Promise<boolean>
  }).isFeatureEnabled
  if (typeof check === 'function') {
    check('messages').then((enabled) => {
      messagesEnabled.value = !!enabled
      if (enabled) void loadUnread()
    })
  }
})

/** 拉取未读消息数（仅在功能开启且已登录时才有意义，失败静默） */
async function loadUnread() {
  try {
    const d = await apiGet<{ count?: number }>('/api/messages/unread-count')
    unreadCount.value = Number(d?.count) || 0
  } catch {
    unreadCount.value = 0
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('yali:nav-loading', onLegacyLoading)
})
</script>

<style>
/* 顶部加载条：紧贴内容区上沿（仅 3px，出现/消失不会造成明显跳动） */
.yali-progress {
  flex: none;
  width: 100%;
}

/* 滚动容器：撑满内容区，滚动交给它自己处理 */
.yali-scroll {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.yali-scroll > :deep(*) {
  min-height: 100%;
}

/* 侧栏品牌区
   侧栏顶部那一行同时放着「折叠按钮」和本区，需让开按钮的宽度（48px 紧凑列） */
.yali-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 4px 44px;
  cursor: pointer;
  user-select: none;
}
.yali-brand-emblem {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex: none;
}
.yali-brand-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}
.yali-brand-text small {
  font-weight: 400;
  color: var(--text-secondary);
}

/* 侧栏账户区 */
.yali-account {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}
.yali-account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--text-secondary);
}
.yali-account-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.yali-account-action-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
