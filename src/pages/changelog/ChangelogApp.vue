<template>
  <YaliShell current="changelog" title="更新日志">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="记录每一次改动" />
      </header>

      <div class="yali-log-list">
        <Expander
          v-for="(entry, i) in entries"
          :key="entry.version"
          class="yali-log-item"
          :Header="entry.version + '  ·  ' + entry.date"
          :IsExpanded="i < 3"
          @Expanding="onEntryExpanded">
          <div class="yali-log-body">
            <div v-for="(item, j) in entry.items" :key="j" class="yali-log-row">
              <span class="yali-chip" :class="chipClass(item.type)">{{ typeLabel(item.type) }}</span>
              <span v-if="item.ach" class="yali-log-text yali-log-ach" role="button" tabindex="0"
                    @click="unlockEaster(item.ach)" @keydown.enter="unlockEaster(item.ach)">
                {{ item.text }}
              </span>
              <span v-else class="yali-log-text">{{ item.text }}</span>
            </div>
          </div>
        </Expander>
      </div>

      <p class="yali-muted yali-log-foot">共 {{ entries.length }} 个版本</p>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'

interface LogItem {
  type: string
  text: string
  ach?: string
}
interface LogEntry {
  date: string
  version: string
  items: LogItem[]
}

/* 数据来自 /js/changelog-data.js（沿用站点既有数据源，避免两处维护） */
const entries = ref<LogEntry[]>(
  (window as unknown as { CHANGELOG_ENTRIES?: LogEntry[] }).CHANGELOG_ENTRIES ?? []
)

const TYPE_LABELS: Record<string, string> = {
  add: '新增',
  change: '改进',
  fix: '修复',
  ui: 'UI',
  security: '安全',
  refactor: '重构',
  perf: '性能',
  easter: '彩蛋'
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type
}

function chipClass(type: string) {
  if (type === 'fix') return 'yali-chip-done'
  if (type === 'security') return 'yali-chip-danger'
  if (type === 'add' || type === 'ui' || type === 'easter') return 'yali-chip-accent'
  return 'yali-chip-info'
}

/* ── 成就：read_all_changelog —— 全部条目展开并停留 30 秒 ── */
const openedCount = ref(0)
const totalEntries = entries.value.length
let achTimer: number | undefined

function onEntryExpanded() {
  openedCount.value += 1
  if (achTimer || openedCount.value < totalEntries) return
  achTimer = window.setTimeout(async () => {
    const unlock = (window as unknown as {
      unlockAchievement?: (id: string) => Promise<unknown>
    }).unlockAchievement
    const toast = (window as unknown as {
      showAchievementToast?: (id: string) => void
    }).showAchievementToast
    if (await unlock?.('read_all_changelog')) toast?.('read_all_changelog')
  }, 30000)
}

/* ── 成就：green_bubble —— 点击神秘句子 ── */
async function unlockEaster(id: string) {
  const unlock = (window as unknown as {
    unlockAchievement?: (id: string) => Promise<unknown>
  }).unlockAchievement
  const toast = (window as unknown as {
    showAchievementToast?: (id: string) => void
  }).showAchievementToast
  unlock?.(id).then((ok) => {
    if (ok) toast?.(id)
  })
}
</script>

<style>
.yali-log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}
.yali-log-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.yali-log-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.yali-log-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}
/* 可点击的彩蛋句子 */
.yali-log-ach {
  cursor: pointer;
  color: var(--accent-base);
  font-weight: 500;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.yali-log-ach:hover {
  opacity: 0.75;
}
.yali-log-ach:focus-visible {
  outline: 2px solid var(--accent-base);
  outline-offset: 2px;
  border-radius: 4px;
}
.yali-log-foot {
  margin-top: 16px;
  text-align: center;
}
</style>
