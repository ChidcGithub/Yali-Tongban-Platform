<template>
  <YaliShell current="debug" title="调试">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="站点诊断信息（敏感值已脱敏）" />
      </header>

      <div v-if="!user" class="yali-loading">
        <TextBlock Text="需要登录后查看" class="yali-muted" />
        <Button @Click="go('login.html')">
          <span class="yali-btn-inner"><span>前往登录</span></span>
        </Button>
      </div>

      <template v-else>
        <Expander v-for="s in sections" :key="s.title" :Header="s.title" :IsExpanded="s.open">
          <div class="dbg-body">
            <div v-for="row in s.rows" :key="row.k" class="dbg-row">
              <span class="dbg-key">{{ row.k }}</span>
              <span class="dbg-val">{{ row.v }}</span>
            </div>
            <p v-if="!s.rows.length" class="yali-muted">（空）</p>
          </div>
        </Expander>
      </template>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { getUser } from '../../shared/api'

const user = ref(getUser())

/** 敏感值脱敏：保留首尾各 3 位 */
function mask(val: unknown) {
  const s = String(val ?? '')
  if (!s) return '(空)'
  if (s.length <= 6) return '***'
  return s.slice(0, 3) + '****' + s.slice(-3)
}

const sections = computed(() => {
  const out: Array<{ title: string; open: boolean; rows: Array<{ k: string; v: string }> }> = []

  /* 账号 */
  out.push({
    title: '账号',
    open: true,
    rows: [
      { k: '姓名', v: user.value?.name ?? '—' },
      { k: '角色', v: user.value?.role ?? '—' },
      { k: '班级', v: user.value?.class_name ?? '—' },
      { k: '部门', v: user.value?.department ?? '—' }
    ]
  })

  /* 版本与部署 */
  const w = window as unknown as { APP_VERSION?: string; APP_DEPLOYED?: string }
  out.push({
    title: '版本',
    open: true,
    rows: [
      { k: '版本号', v: w.APP_VERSION ?? '—' },
      { k: '部署时间', v: w.APP_DEPLOYED ?? '—' },
      { k: '设计系统', v: 'WinUIonWeb（vendor）' }
    ]
  })

  /* 个性化偏好 */
  let prefs: Record<string, unknown> = {}
  try {
    prefs = JSON.parse(localStorage.getItem('personalize') || '{}')
  } catch {
    prefs = {}
  }
  out.push({
    title: '个性化偏好',
    open: false,
    rows: Object.entries(prefs).map(([k, v]) => ({ k, v: String(v) }))
  })

  /* localStorage 键（值脱敏） */
  const lsRows: Array<{ k: string; v: string }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    lsRows.push({ k: key, v: mask(localStorage.getItem(key)) })
  }
  out.push({ title: `localStorage（${lsRows.length} 项）`, open: false, rows: lsRows })

  /* Cookie（脱敏） */
  const cookieRows = document.cookie
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const i = c.indexOf('=')
      const k = i >= 0 ? c.slice(0, i) : c
      const v = i >= 0 ? c.slice(i + 1) : ''
      return { k, v: mask(decodeURIComponent(v)) }
    })
  out.push({ title: `Cookie（${cookieRows.length} 项）`, open: false, rows: cookieRows })

  return out
})

function go(href: string) {
  window.location.href = href
}
</script>

<style>
.dbg-body {
  padding: 6px 0 10px;
}
.dbg-row {
  display: flex;
  gap: 12px;
  padding: 3px 0;
  font-size: 13px;
  align-items: baseline;
}
.dbg-key {
  min-width: 140px;
  color: var(--text-tertiary);
  word-break: break-all;
}
.dbg-val {
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  word-break: break-all;
}
</style>
