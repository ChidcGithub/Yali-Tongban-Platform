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
                <span class="yali-thanks-name">{{ item.name }}</span>
                <span v-if="item.license" class="yali-chip">{{ item.license }}</span>
              </div>
              <p v-if="item.desc" class="yali-thanks-desc">{{ item.desc }}</p>
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
</style>
