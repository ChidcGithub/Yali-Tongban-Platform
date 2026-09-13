<template>
  <YaliShell current="activities" title="活动">
    <div class="yali-page">
      <div v-if="loading" class="yali-loading">
        <ProgressRing :IsActive="true" :Width="32" :Height="32" />
        <TextBlock Text="加载中…" class="yali-muted" />
      </div>

      <div v-else-if="!items.length" class="yali-loading">
        <FontIcon :Glyph="GLYPH.activities" :FontSize="28" class="yali-muted-icon" />
        <TextBlock Text="暂无活动" class="yali-muted" />
      </div>

      <ListView v-else :ItemsSource="items" SelectionMode="None" class="yali-list">
        <template #item="{ item }">
          <div class="yali-item">
            <div class="yali-item-head">
              <TextBlock :Text="item.name" class="yali-item-title" TextWrapping="Wrap" />
              <span v-if="item.need_volunteers" class="yali-chip yali-chip-warn">需志愿者</span>
            </div>

            <div class="yali-item-meta">
              <span v-if="item.location">地点：{{ item.location }}</span>
              <span>{{ formatTime(item.time) }}</span>
              <span v-if="item.departments">部门：{{ item.departments }}</span>
            </div>

            <div class="act-footer">
              <span class="yali-muted">发布人：{{ item.created_by }}</span>
              <div class="yali-item-actions">
                <template v-if="item.need_volunteers">
                  <Button :IsEnabled="!item._signedUp" @Click="signup(item)"
                          :Style="item._signedUp ? '' : '{StaticResource AccentButtonStyle}'">
                    <span class="yali-btn-inner">
                      <FontIcon :Glyph="GLYPH.check" :FontSize="14" />
                      <span>{{ item._signedUp ? '已报名' : '报名志愿者' }}</span>
                    </span>
                  </Button>
                  <Button @Click="viewVolunteers(item)">
                    <span class="yali-btn-inner">
                      <FontIcon :Glyph="GLYPH.people" :FontSize="14" />
                      <span>{{ item.volunteer_count || 0 }} 人</span>
                    </span>
                  </Button>
                </template>
                <Button v-if="admin" @Click="remove(item)">
                  <span class="yali-btn-inner">
                    <FontIcon :Glyph="GLYPH.delete" :FontSize="14" /><span>删除</span>
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </template>
      </ListView>
    </div>

    <button v-if="admin" class="yali-fab" type="button" aria-label="发布活动" @click="dialogOpen = true">
      <FontIcon :Glyph="GLYPH.add" :FontSize="18" />
    </button>

    <!-- 发布活动 -->
    <ContentDialog :IsOpen="dialogOpen" Title="发布活动" CloseButtonText="取消"
                   @update:IsOpen="dialogOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">活动名称 <em>*</em></span>
          <TextBox v-model:Text="draft.name" PlaceholderText="如：秋季志愿服务" :MaxLength="100" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">时间 <em>*</em></span>
          <TextBox v-model:Text="draft.time" PlaceholderText="如：2026-10-01 09:00" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">地点</span>
          <TextBox v-model:Text="draft.location" PlaceholderText="选填" :MaxLength="200" />
        </label>
        <label class="yali-field">
          <span class="yali-field-label">参与部门</span>
          <TextBox v-model:Text="draft.departments" PlaceholderText="选填，如：组织部、宣传部" :MaxLength="200" />
        </label>
        <div class="yali-field">
          <ToggleSwitch v-model:IsOn="draft.need_volunteers" OnContent="需要志愿者" OffContent="不需要志愿者" />
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="dialogOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="create">
            <span class="yali-btn-inner"><span>{{ saving ? '发布中…' : '发布' }}</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 匿名报名 -->
    <ContentDialog :IsOpen="signupOpen" Title="报名志愿者" CloseButtonText="取消"
                   @update:IsOpen="signupOpen = $event">
      <div class="yali-form">
        <label class="yali-field">
          <span class="yali-field-label">你的姓名 <em>*</em></span>
          <TextBox v-model:Text="volunteerName" PlaceholderText="请输入你的姓名" :MaxLength="50" />
        </label>
        <div class="yali-field">
          <span class="yali-field-label">人机验证</span>
          <div id="yaliVolunteerCaptcha"></div>
        </div>
        <div class="yali-form-actions">
          <Button :IsEnabled="!saving" @Click="signupOpen = false">
            <span class="yali-btn-inner"><span>取消</span></span>
          </Button>
          <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving"
                  @Click="confirmAnonymous">
            <span class="yali-btn-inner"><span>报名</span></span>
          </Button>
        </div>
      </div>
    </ContentDialog>

    <!-- 志愿者名单 -->
    <ContentDialog :IsOpen="listOpen" Title="志愿者名单" CloseButtonText="关闭"
                   @update:IsOpen="listOpen = $event">
      <div class="vol-list">
        <p v-if="volLoading" class="yali-muted">加载中…</p>
        <p v-else-if="!volunteers.length" class="yali-muted">还没有人报名</p>
        <div v-for="v in volunteers" :key="v.id ?? v.name" class="vol-item">
          <FontIcon :Glyph="GLYPH.person" :FontSize="14" />
          <span>{{ v.name }}</span>
          <span v-if="v.created_at" class="yali-muted">{{ formatTime(v.created_at) }}</span>
        </div>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, formatTime, getUser, isAdmin, legacy, toast } from '../../shared/api'

interface Activity {
  id: number
  name: string
  location?: string
  time: string
  departments?: string
  need_volunteers?: boolean | number
  created_by: string
  volunteer_count?: number
  /** 后端返回：当前登录用户是否已报名（未登录时不返回） */
  signed_up?: number
  _signedUp?: boolean
}

const user = ref(getUser())
const admin = isAdmin()
const items = ref<Activity[]>([])
const loading = ref(true)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await apiGet<Activity[]>('/api/activities')
    // 后端在登录态下会返回 signed_up（已报名次数），映射成本地状态，
    // 否则已报名用户仍会看到可点击的「报名志愿者」按钮
    items.value = (data ?? []).map((a) => ({ ...a, _signedUp: !!a.signed_up }))
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

/* ── 报名 ── */
const signupOpen = ref(false)
const volunteerName = ref('')
let signupTarget: Activity | null = null
type Captcha = { getData: () => Record<string, string>; refresh: () => void }
let captcha: Captcha | null = null

function signup(a: Activity) {
  if (user.value) {
    doSignup(a.id, undefined, a)
    return
  }
  signupTarget = a
  volunteerName.value = ''
  signupOpen.value = true
}

watch(signupOpen, async (open) => {
  if (!open) return
  await nextTick()
  const Ctor = legacy.CaptchaWidget
  if (Ctor) captcha = new Ctor('yaliVolunteerCaptcha')
})

function confirmAnonymous() {
  if (!volunteerName.value.trim()) return toast('请填写姓名', 'error')
  if (signupTarget) doSignup(signupTarget.id, volunteerName.value.trim(), signupTarget)
}

async function doSignup(id: number, name: string | undefined, a: Activity) {
  try {
    const body: Record<string, unknown> = {}
    if (name) body.name = name
    if (!user.value && captcha) Object.assign(body, captcha.getData())
    await apiPost(`/api/activities/${id}/volunteer`, body)
    a._signedUp = true
    a.volunteer_count = (a.volunteer_count || 0) + 1
    signupOpen.value = false
    toast('报名成功', 'success')
    legacy.checkNovice?.()
  } catch (err) {
    toast((err as Error).message, 'error')
    captcha?.refresh()
  }
}

/* ── 志愿者名单 ── */
const listOpen = ref(false)
const volLoading = ref(false)
const volunteers = ref<Array<{ id?: number; name: string; created_at?: string }>>([])

async function viewVolunteers(a: Activity) {
  listOpen.value = true
  volLoading.value = true
  volunteers.value = []
  try {
    volunteers.value = await apiGet<Array<{ id?: number; name: string; created_at?: string }>>(
      `/api/activities/${a.id}/volunteers`
    )
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    volLoading.value = false
  }
}

async function remove(a: Activity) {
  if (!window.confirm(`确定删除活动「${a.name}」吗？`)) return
  try {
    await apiDel(`/api/activities/${a.id}`)
    items.value = items.value.filter((x) => x.id !== a.id)
    toast('活动已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 发布活动 ── */
const dialogOpen = ref(false)
const draft = reactive({
  name: '',
  time: '',
  location: '',
  departments: '',
  need_volunteers: false
})

async function create() {
  if (!draft.name.trim() || !draft.time.trim()) return toast('活动名称与时间为必填', 'error')
  saving.value = true
  try {
    const data = await apiPost<Activity>('/api/activities', {
      name: draft.name,
      location: draft.location,
      time: draft.time,
      departments: draft.departments,
      need_volunteers: draft.need_volunteers
    })
    items.value.unshift(data)
    toast('发布成功', 'success')
    dialogOpen.value = false
    draft.name = ''
    draft.time = ''
    draft.location = ''
    draft.departments = ''
    draft.need_volunteers = false
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style>
.act-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.vol-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 320px;
}
.vol-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}
.vol-item .yali-muted {
  margin-left: auto;
}
</style>
