<template>
  <YaliShell current="feedback" title="反馈">
    <div class="yali-page">
      <header class="yali-page-head">
        <TextBlock class="yali-page-desc" Text="告诉我们你的想法" />
      </header>

      <section class="yali-section">
        <div class="yali-form">
          <label class="yali-field">
            <span class="yali-field-label">反馈内容 <em>*</em></span>
            <TextBox v-model:Text="form.content" PlaceholderText="说说你的建议或遇到的问题…" :MaxLength="2000"
                     AcceptsReturn TextWrapping="Wrap" class="fb-content" />
          </label>

          <label class="yali-field">
            <span class="yali-field-label">相关模块</span>
            <ComboBox :ItemsSource="SECTIONS" v-model:SelectedIndex="sectionIndex"
                      PlaceholderText="未指定" />
          </label>

          <label class="yali-field">
            <span class="yali-field-label">联系方式</span>
            <TextBox v-model:Text="form.contact" PlaceholderText="选填，方便我们回复你" :MaxLength="100" />
          </label>

          <div class="yali-field">
            <span class="yali-field-label">人机验证</span>
            <div id="yaliFeedbackCaptcha"></div>
          </div>

          <div class="yali-form-actions">
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!busy"
                    @Click="submit">
              <span class="yali-btn-inner"><span>{{ busy ? '发送中…' : '发送反馈' }}</span></span>
            </Button>
          </div>

          <p v-if="sent" class="yali-muted">已发送。你的反馈会出现在管理面板中。</p>
        </div>
      </section>

      <p class="yali-muted fb-foot">当前版本 v{{ version }}</p>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { apiPost, legacy, mountCaptcha, toast } from '../../shared/api'

const SECTIONS = ['动态', '公告', '投票', '财务', '活动', '其它']
const sectionIndex = ref(-1)

const form = reactive({ content: '', contact: '' })
const busy = ref(false)
const sent = ref(false)
const version = (window as unknown as { APP_VERSION?: string }).APP_VERSION ?? '3.0.0'

type Captcha = { getData: () => Record<string, string>; refresh: () => void }
let captcha: Captcha | null = null

onMounted(async () => {
  await nextTick()
  captcha = mountCaptcha('yaliFeedbackCaptcha')
})

async function submit() {
  if (!form.content.trim()) {
    toast('请填写反馈内容', 'error')
    return
  }
  busy.value = true
  try {
    await apiPost('/api/feedback', {
      content: form.content,
      contact: form.contact || '',
      page: window.location.pathname,
      section: sectionIndex.value >= 0 ? SECTIONS[sectionIndex.value] : '',
      version,
      ...(captcha ? captcha.getData() : {})
    })
    toast('反馈已发送，感谢你的意见', 'success')

    /* 成就：feedback_first / feedback_tenth */
    const count = Number(localStorage.getItem('_fc') || 0) + 1
    localStorage.setItem('_fc', String(count))
    if (count === 1 || count === 10) {
      const id = count === 1 ? 'feedback_first' : 'feedback_tenth'
      const unlock = (window as unknown as {
        unlockAchievement?: (i: string) => Promise<unknown>
      }).unlockAchievement
      const showToast = (window as unknown as {
        showAchievementToast?: (i: string) => void
      }).showAchievementToast
      unlock?.(id).then((ok) => {
        if (ok) showToast?.(id)
      })
    }

    form.content = ''
    form.contact = ''
    sectionIndex.value = -1
    sent.value = true
    captcha?.refresh()
  } catch (err) {
    toast((err as Error).message, 'error')
    captcha?.refresh()
  } finally {
    busy.value = false
  }
}
</script>

<style>
.fb-content {
  min-height: 140px;
}
.fb-foot {
  margin-top: 16px;
  text-align: center;
}
</style>
