<template>
  <YaliShell current="about" title="关于">
    <div class="yali-page">
      <!-- 页头：三枚徽标（连点 5 次触发彩蛋成就） -->
      <header class="yali-about-head">
        <button class="yali-about-title" type="button" @click="go('changelog.html')">
          <span>关于</span>
        </button>
        <div class="yali-about-emblems">
          <a href="https://www.gqt.org.cn/" target="_blank" rel="noopener" title="共青团">
            <img src="/images/league-emblem.png" alt="团徽" />
          </a>
          <a href="https://yali.csedu.gov.cn/wzsy" target="_blank" rel="noopener" title="雅礼中学">
            <img src="/images/emblem.png" alt="雅礼校徽" />
          </a>
          <button type="button" class="yali-emblem-btn" title="通办平台" @click="onEmblemTap">
            <img src="/images/the-office.png" alt="通办平台" />
          </button>
        </div>
      </header>

      <TextBlock class="yali-page-desc" Text="雅礼团委 · 通办 —— 一站式线上办事与服务系统" />

      <!-- 版本信息 -->
      <section class="yali-section yali-section-link" @click="go('changelog.html')">
        <div class="yali-section-head">
          <TextBlock Text="版本信息" :FontSize="16" :FontWeight="600" />
          <FontIcon :Glyph="GLYPH.forward" :FontSize="14" class="yali-muted-icon" />
        </div>
        <div class="yali-kv">
          <span class="yali-kv-key">当前版本</span>
          <span class="yali-kv-val">{{ version }}</span>
        </div>
        <div class="yali-kv">
          <span class="yali-kv-key">部署时间</span>
          <span class="yali-kv-val">{{ deployed }}</span>
        </div>
      </section>

      <!-- 功能介绍 -->
      <section class="yali-section">
        <TextBlock Text="功能介绍" :FontSize="16" :FontWeight="600" />
        <div class="yali-feature-list">
          <div v-for="f in visibleFeatures" :key="f.title" class="yali-feature">
            <FontIcon :Glyph="f.icon" :FontSize="16" class="yali-feature-icon" />
            <div>
              <h3 class="yali-feature-title">{{ f.title }}</h3>
              <p class="yali-feature-desc">{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 个性化 -->
      <section class="yali-section yali-section-link" @click="go('personalize.html')">
        <div class="yali-link-row">
          <FontIcon :Glyph="GLYPH.settings" :FontSize="16" />
          <div>
            <h3 class="yali-feature-title">个性化</h3>
            <p class="yali-feature-desc">主题模式、强调色、字号与动效，按你的习惯调整界面</p>
          </div>
        </div>
      </section>

      <!-- 关于作者 -->
      <section class="yali-section">
        <TextBlock Text="关于作者" :FontSize="16" :FontWeight="600" />
        <div class="yali-author">
          <PersonPicture class="yali-author-avatar" :Initials="'C'" />
          <div>
            <h3 class="yali-feature-title">Chidc</h3>
            <p class="yali-feature-desc">开发者 &amp; 站长 · 2517班</p>
            <div class="yali-kv">
              <span class="yali-kv-key">GitHub</span>
              <a class="yali-kv-link" href="https://github.com/chidcgithub" target="_blank" rel="noopener">
                github.com/chidcgithub
              </a>
            </div>
            <div class="yali-kv">
              <span class="yali-kv-key">Mail</span>
              <a class="yali-kv-link" href="mailto:chidcout@outlook.com">chidcout@outlook.com</a>
            </div>
          </div>
        </div>
      </section>

      <!-- 鸣谢 -->
      <section class="yali-section yali-section-link" @click="go('thanks.html')">
        <div class="yali-link-row">
          <FontIcon :Glyph="GLYPH.package" :FontSize="16" />
          <div>
            <h3 class="yali-feature-title">鸣谢</h3>
            <p class="yali-feature-desc">感谢所有开源库与服务的支持</p>
          </div>
        </div>
      </section>

      <!-- 连点 3 次进诊断页 —— 这是全站**唯一**的 debug.html 入口（导航里没有它） -->
      <p class="yali-muted yali-about-foot about-foot-link" role="button" tabindex="0"
         @click="tapDebug" @keydown.enter="tapDebug">
        长沙市雅礼中学团委 通办 © 2026 <span class="about-version">{{ APP_VERSION }}</span>
      </p>
      <p class="yali-muted yali-about-foot">展示用途的示例项目，非雅礼中学官方平台</p>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { getUser } from '../../shared/api'

const version = ref(
  (window as unknown as { APP_VERSION?: string }).APP_VERSION ?? '4.0.0-0915'
)
const deployed = ref(
  (window as unknown as { APP_DEPLOYED?: string }).APP_DEPLOYED ?? ''
)

interface Feature {
  icon: string
  title: string
  desc: string
  minRole?: string
}

/* 取自原 about.html 的功能清单，图标换成已验证的 WinUI 字形 */
const FEATURES: Feature[] = [
  { icon: GLYPH.services, title: '报修服务', desc: '提交校园设施报修问题，实时跟踪处理进度，支持图片上传。' },
  { icon: GLYPH.announcements, title: '公告通知', desc: '发布团委重要通知与活动公告，支持图文混排与评论互动。' },
  { icon: GLYPH.moment, title: '动态', desc: '团委动态与通知，支持评论互动。' },
  { icon: GLYPH.polls, title: '投票系统', desc: '发起和参与团委投票，支持单选、多选、主观题与配图，可导出结果。' },
  { icon: GLYPH.finance, title: '财务管理', desc: '记录团委收支明细，按月汇总统计，支持标签分类。', minRole: 'member' },
  { icon: GLYPH.check, title: '审核系统', desc: '图片审核流程，支持通过/拒绝操作并填写审核意见。', minRole: 'admin' },
  { icon: GLYPH.feedback, title: '反馈', desc: '向平台提交建议或问题，帮助我们持续改进。' },
  { icon: GLYPH.duty, title: '值日签到', desc: '学生会办公室值日签到与扣分管理，支持签到计时与自动缺岗标记。' }
]

const ROLE_WEIGHT: Record<string, number> = { member: 2, admin: 3, owner: 4, teacher: 3 }

const visibleFeatures = computed(() => {
  const user = getUser()
  const weight = user ? ROLE_WEIGHT[user.role ?? ''] ?? 0 : 0
  return FEATURES.filter((f) => !f.minRole || weight >= (ROLE_WEIGHT[f.minRole] ?? 99))
})

/* 成就：easter_egg —— 点击通办平台徽标 5 次 */
let emblemClicks = Number(localStorage.getItem('_emblemClicks') || '0')
function onEmblemTap() {
  emblemClicks += 1
  localStorage.setItem('_emblemClicks', String(emblemClicks))
  if (emblemClicks < 5) return
  localStorage.removeItem('_emblemClicks')
  emblemClicks = 0
  const unlock = (window as unknown as {
    unlockAchievement?: (id: string) => Promise<unknown>
  }).unlockAchievement
  const toast = (window as unknown as {
    showAchievementToast?: (id: string) => void
  }).showAchievementToast
  unlock?.('easter_egg').then((ok) => {
    if (ok) toast?.('easter_egg')
  })
}

function go(href: string) {
  window.location.href = href
}

/* ── debug.html 入口：页脚连点 3 次（1 秒内）──
   迁移时漏掉了这段，导致 debug.html 变成只能手输 URL 的死页 */
let debugTaps = 0
let debugTimer: number | undefined
function tapDebug() {
  debugTaps += 1
  if (debugTimer) window.clearTimeout(debugTimer)
  debugTimer = window.setTimeout(() => {
    debugTaps = 0
  }, 1000)
  if (debugTaps >= 3) {
    debugTaps = 0
    if (debugTimer) window.clearTimeout(debugTimer)
    window.location.href = 'debug.html'
  }
}
</script>

<style>
.yali-about-head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.yali-about-title {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}
.yali-about-title:hover {
  color: var(--accent-base);
}
.yali-about-emblems {
  display: flex;
  align-items: center;
  gap: 10px;
}
.yali-about-emblems img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  display: block;
}
.yali-emblem-btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  opacity: 0.55;
}
.yali-emblem-btn:hover {
  opacity: 1;
}

.yali-section-link {
  cursor: pointer;
}
.yali-section-link:hover {
  background: var(--subtle-secondary);
}

.yali-kv {
  display: flex;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}
.yali-kv-key {
  color: var(--text-tertiary);
  min-width: 76px;
}
.yali-kv-val {
  color: var(--text-primary);
}
.yali-kv-link {
  color: var(--accent-base);
  text-decoration: none;
}
.yali-kv-link:hover {
  text-decoration: underline;
}

.yali-feature-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.yali-feature {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.yali-feature-icon {
  color: var(--text-tertiary);
  margin-top: 2px;
  flex: none;
}
.yali-feature-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.yali-feature-desc {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.yali-link-row {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--text-tertiary);
}
.yali-author {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-top: 14px;
}
.yali-author-avatar {
  width: 48px;
  height: 48px;
  flex: none;
}
.yali-about-foot {
  text-align: center;
  margin-top: 20px;
}
.about-foot-link {
  cursor: pointer;
  user-select: none;
}
.about-version {
  opacity: 0.5;
}
</style>
