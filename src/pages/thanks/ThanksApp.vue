<template>
  <YaliShell current="thanks" title="致谢">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="感谢以下开源库与服务的支持" />
      </header>

      <section v-for="(section, i) in CREDITS" :key="i" class="yali-section">
        <TextBlock v-if="section.title" :Text="section.title" :FontSize="16" :FontWeight="600"
                   class="yali-thanks-title" />
        <TextBlock v-if="section.sub" :Text="section.sub" class="yali-muted" />

        <div class="yali-thanks-list">
          <div v-for="item in section.items" :key="item.name" class="yali-thanks-item">
            <FontIcon :Glyph="GLYPH.package" :FontSize="16" class="yali-thanks-icon" />
            <div class="yali-thanks-body">
              <div class="yali-thanks-head">
                <!-- 有源码地址就把名称本身做成外链，地址另起一行完整显示 -->
                <a v-if="item.url" class="yali-thanks-name yali-thanks-link" :href="item.url"
                   target="_blank" rel="noopener noreferrer">{{ item.name }}</a>
                <span v-else class="yali-thanks-name">{{ item.name }}</span>
                <span v-if="item.license" class="yali-chip">{{ item.license }}</span>
              </div>
              <p v-if="item.author" class="yali-thanks-meta">作者 · {{ item.author }}</p>
              <p v-if="item.desc" class="yali-thanks-desc">{{ item.desc }}</p>
              <a v-if="item.url" class="yali-thanks-url" :href="item.url" target="_blank"
                 rel="noopener noreferrer">{{ prettyUrl(item.url) }}</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { CREDITS } from './credits'

/** 地址去掉协议头再显示：卡片窄，完整 https:// 会把行撑爆 */
function prettyUrl(url: string) {
  return url.replace(/^https?:\/\//, '')
}
</script>

<style>
.yali-thanks-title {
  display: block;
  margin-bottom: 12px;
}
.yali-thanks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.yali-thanks-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.yali-thanks-icon {
  color: var(--text-tertiary);
  margin-top: 2px;
  flex: none;
}
.yali-thanks-body {
  min-width: 0;
}
.yali-thanks-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.yali-thanks-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.yali-thanks-desc {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.yali-thanks-meta {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}
.yali-thanks-link {
  text-decoration: none;
}
.yali-thanks-link:hover {
  text-decoration: underline;
}
.yali-thanks-url {
  display: inline-block;
  margin-top: 2px;
  max-width: 100%;
  font-size: 12.5px;
  color: var(--md-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.yali-thanks-url:hover {
  text-decoration: underline;
}
</style>
