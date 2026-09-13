<template>
  <YaliShell current="polls" :title="poll?.title ?? '投票详情'">
    <div class="yali-page yali-detail-page">
      <div v-if="loading" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!poll" class="yali-loading">
        <TextBlock Text="投票不存在或已被删除" class="yali-muted" />
        <Button @Click="go('polls.html')">
          <span class="yali-btn-inner">
            <FontIcon :Glyph="GLYPH.back" :FontSize="14" /><span>返回投票列表</span>
          </span>
        </Button>
      </div>

      <template v-else>
        <section class="yali-section">
          <div class="yali-item-head">
            <TextBlock :Text="poll.title" :FontSize="20" :FontWeight="600" TextWrapping="Wrap" />
            <span class="yali-chip" :class="poll.status === 'open' ? 'yali-chip-accent' : 'yali-chip-done'">
              {{ poll.status === 'open' ? '进行中' : '已结束' }}
            </span>
          </div>
          <TextBlock v-if="poll.description" :Text="poll.description" TextWrapping="Wrap"
                     class="yali-item-body pv-desc" />
          <div class="yali-item-meta">
            <span>{{ poll.created_by }}</span>
            <span>{{ poll.total_votes }} 人参与</span>
            <span v-if="poll.min_role">{{ poll.min_role === 'admin' ? '仅管理员' : '仅登录用户' }}</span>
            <span v-if="classList.length">仅限 {{ classList.join('、') }}</span>
            <span v-if="poll.require_name">需留名</span>
          </div>
        </section>

        <!-- 已投过：直接看结果 -->
        <section v-if="voted" class="yali-section">
          <TextBlock Text="投票结果" :FontSize="16" :FontWeight="600" />
          <div v-if="resultsLoading" class="yali-muted pv-gap">加载中…</div>
          <template v-else>
            <div v-for="(qr, qi) in results" :key="qi" class="pv-result">
              <TextBlock :Text="(qi + 1) + '. ' + qr.title" :FontSize="14" :FontWeight="500" />
              <div v-if="qr.result?.options" class="pv-result-options">
                <div v-for="(opt, oi) in qr.result.options" :key="oi" class="pv-result-opt">
                  <div class="pv-result-head">
                    <span>{{ opt }}</span>
                    <span class="yali-muted">
                      {{ qr.result.counts?.[oi] ?? 0 }} 票
                      ({{ pct(qr.result.counts?.[oi] ?? 0, qr.result.total) }}%)
                    </span>
                  </div>
                  <ProgressBar :Value="(qr.result.counts?.[oi] ?? 0)" :Maximum="Math.max(...(qr.result.counts ?? [1]), 1)"
                               :MinHeight="6" />
                </div>
              </div>
              <div v-else-if="qr.result?.texts" class="pv-result-texts">
                <p v-for="(t, ti) in qr.result.texts" :key="ti" class="pv-text">{{ t }}</p>
              </div>
            </div>
            <Button class="pv-back" @Click="go('polls.html')">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.back" :FontSize="14" /><span>返回投票列表</span>
              </span>
            </Button>
          </template>
        </section>

        <!-- 无参与资格：说明原因，不渲染必然被拒的表单 -->
        <section v-else-if="blockReason" class="yali-section">
          <div class="yali-loading pv-gap">
            <FontIcon :Glyph="GLYPH.lock" :FontSize="24" class="yali-muted-icon" />
            <TextBlock :Text="blockReason" class="yali-muted" />
          </div>
        </section>

        <section v-else-if="poll.status !== 'open'" class="yali-section">
          <div class="yali-loading pv-gap">
            <FontIcon :Glyph="GLYPH.clock" :FontSize="24" class="yali-muted-icon" />
            <TextBlock Text="此投票已结束" class="yali-muted" />
          </div>
        </section>

        <!-- 未投票：答题 -->
        <template v-else>
          <section v-for="(q, qi) in poll.questions ?? []" :key="q.id ?? qi" class="yali-section">
            <div class="pv-q-head">
              <TextBlock :Text="(qi + 1) + '. ' + q.title" :FontSize="15" :FontWeight="500" TextWrapping="Wrap" />
              <span class="yali-chip">{{ typeText(q.type) }}</span>
            </div>

            <RadioButtons v-if="q.type === 'single'" :ItemsSource="q.options ?? []"
                          :SelectedIndex="singleIdx[qi] ?? -1" class="pv-gap"
                          @SelectionChanged="(a) => (singleIdx[qi] = a?.SelectedIndex ?? -1)" />

            <div v-else-if="q.type === 'multiple'" class="pv-multi">
              <CheckBox v-for="(opt, oi) in q.options ?? []" :key="oi"
                        :Content="opt" v-model:IsChecked="multiSel[qi][oi]" />
            </div>

            <TextBox v-else v-model:Text="textAns[qi]" PlaceholderText="填写你的回答" :MaxLength="1000"
                     AcceptsReturn TextWrapping="Wrap" class="pv-gap pv-textarea" />
          </section>

          <section class="yali-section">
            <label v-if="needName" class="yali-field">
              <span class="yali-field-label">你的姓名 <em>*</em></span>
              <TextBox v-model:Text="voterName" PlaceholderText="请输入你的姓名" :MaxLength="50" />
            </label>
            <div class="yali-field pv-gap">
              <span class="yali-field-label">人机验证</span>
              <div id="yaliPollCaptcha"></div>
            </div>
            <div v-if="error" class="pv-error">{{ error }}</div>
            <div class="yali-form-actions">
              <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!submitting" @Click="submitVote">
                <span class="yali-btn-inner"><span>{{ submitting ? '提交中…' : '提交投票' }}</span></span>
              </Button>
            </div>
          </section>
        </template>
      </template>
    </div>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiGet, apiPost, getUser, legacy, toast } from '../../shared/api'

interface Question {
  id: number
  type: 'single' | 'multiple' | 'text'
  title: string
  options?: string[]
}
interface Poll {
  id: number
  title: string
  description?: string
  status?: string
  created_by: string
  total_votes: number
  require_name?: 0 | 1
  min_role?: string | null
  /** 详情接口会把班级白名单解析成数组 */
  allowed_classes?: string | string[]
  questions?: Question[]
}
interface QuestionResult {
  title: string
  type: string
  result?: { options?: string[]; counts?: number[]; total?: number; texts?: string[] }
}

const id = new URLSearchParams(window.location.search).get('id')
const user = ref(getUser())

const poll = ref<Poll | null>(null)
const loading = ref(true)
const voted = ref(false)
const submitting = ref(false)
const error = ref('')

const singleIdx = reactive<Record<number, number>>({})
const multiSel = reactive<Record<number, boolean[]>>({})
const textAns = reactive<Record<number, string>>({})
const voterName = ref('')

const needName = ref(false)

/* ── 参与资格：与后端 handleVotePoll 及旧版 poll.js 的判定保持一致 ──
   不符合条件的用户不该看到投票表单（否则一提交必然被 403 拒绝） */
const ROLE_WEIGHT: Record<string, number> = { member: 2, admin: 3, owner: 4 }

const classList = computed<string[]>(() => {
  const raw = poll.value?.allowed_classes
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

const blockReason = computed(() => {
  const p = poll.value
  if (!p) return ''
  const u = user.value
  const weight = u ? ROLE_WEIGHT[u.role] || 0 : 0
  const minWeight = p.min_role ? ROLE_WEIGHT[p.min_role] || 0 : 0
  if (p.min_role && weight < minWeight) {
    return p.min_role === 'admin' ? '此投票仅限管理员参与' : '此投票仅限登录用户参与'
  }
  const classes = classList.value
  if (classes.length > 0 && (!u || !u.class_name || !classes.includes(u.class_name))) {
    return `此投票仅限 ${classes.join('、')} 参与`
  }
  return ''
})

const canVote = computed(() => !voted.value && !blockReason.value && poll.value?.status === 'open')

type Captcha = { getData: () => Record<string, string>; refresh: () => void }
let captcha: Captcha | null = null

function typeText(t: string) {
  return t === 'single' ? '单选' : t === 'multiple' ? '多选' : '主观题'
}

async function load() {
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    poll.value = await apiGet<Poll>(`/api/polls/${id}`)
    needName.value = !!poll.value.require_name && !user.value
    initMulti()

    /* 是否已投过 */
    try {
      const mine = await apiGet<unknown>(`/api/polls/${id}/my-vote`)
      voted.value = !!mine && (!Array.isArray(mine) || mine.length > 0)
    } catch {
      voted.value = false
    }

    if (voted.value) await loadResults()

    await nextTick()
    const Ctor = legacy.CaptchaWidget
    if (Ctor && canVote.value) captcha = new Ctor('yaliPollCaptcha')
  } catch (err) {
    toast((err as Error).message, 'error')
    poll.value = null
  } finally {
    loading.value = false
  }
}

function initMulti() {
  /* 多选题的勾选状态需要预先按选项数量初始化，v-model 才能直接绑定 */
  ;(poll.value?.questions ?? []).forEach((q, qi) => {
    if (q.type === 'multiple') multiSel[qi] = new Array(q.options?.length ?? 0).fill(false)
  })
}

async function submitVote() {
  if (!poll.value) return
  error.value = ''
  const answers: Array<{ question_id: number; answer: number | number[] | string }> = []

  for (let qi = 0; qi < (poll.value.questions ?? []).length; qi++) {
    const q = poll.value.questions![qi]
    if (q.type === 'single') {
      const idx = singleIdx[qi] ?? -1
      if (idx < 0) {
        error.value = '请回答所有题目'
        return
      }
      answers.push({ question_id: q.id, answer: idx })
    } else if (q.type === 'multiple') {
      const sel = (multiSel[qi] ?? []).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
      if (!sel.length) {
        error.value = '请回答所有题目'
        return
      }
      answers.push({ question_id: q.id, answer: sel })
    } else {
      const t = (textAns[qi] ?? '').trim()
      if (!t) {
        error.value = '请回答所有题目'
        return
      }
      answers.push({ question_id: q.id, answer: t })
    }
  }

  if (needName.value && !voterName.value.trim()) {
    error.value = '请填写你的姓名'
    return
  }

  submitting.value = true
  try {
    await apiPost(`/api/polls/${poll.value.id}/vote`, {
      answers,
      voter_name: voterName.value.trim(),
      ...(captcha ? captcha.getData() : {})
    })
    poll.value.total_votes += 1
    voted.value = true
    toast('投票成功，感谢参与', 'success')
    legacy.checkNovice?.()
    await loadResults()
  } catch (err) {
    error.value = (err as Error).message
    captcha?.refresh()
  } finally {
    submitting.value = false
  }
}

/* ── 结果 ── */
const results = ref<QuestionResult[]>([])
const resultsLoading = ref(false)

async function loadResults() {
  if (!poll.value) return
  resultsLoading.value = true
  try {
    const data = await apiGet<{ questionResults?: QuestionResult[] }>(
      `/api/polls/${poll.value.id}/results`
    )
    results.value = data.questionResults ?? []
  } catch {
    results.value = []
  } finally {
    resultsLoading.value = false
  }
}

function pct(count: number, total?: number) {
  if (!total) return '0.0'
  return ((count / total) * 100).toFixed(1)
}

function go(href: string) {
  window.location.href = href
}

onMounted(load)
</script>

<style>
.yali-detail-page {
  max-width: 860px;
}
.pv-desc {
  margin-top: 6px;
}
.pv-gap {
  margin-top: 12px;
}
.pv-q-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pv-multi {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.pv-textarea {
  min-height: 80px;
}
.pv-error {
  margin-top: 10px;
  font-size: 13px;
  color: #c42b1c;
}
html.theme-dark .pv-error {
  color: #ff99a4;
}
.pv-result {
  margin-top: 18px;
}
.pv-result-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.pv-result-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 3px;
}
.pv-result-texts {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pv-text {
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 13px;
  background: var(--subtle-secondary);
  color: var(--text-primary);
}
.pv-back {
  margin-top: 20px;
}
</style>
