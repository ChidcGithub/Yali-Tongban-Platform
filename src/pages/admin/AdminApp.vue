<template>
  <YaliShell current="admin" title="管理">
    <div class="yali-page">
    <!-- SelectorBar 的 SelectionChanged 首参是 sender，只暴露 Items / SelectedItem，
         没有 SelectedIndex —— 必须自己 indexOf，否则 tabIndex 恒被写回 0 -->
    <SelectorBar :Items="tabItems" :SelectedItem="tabItems[tabIndex]" class="ad-tabs"
                 @SelectionChanged="(a) => (tabIndex = a?.Items?.indexOf(a.SelectedItem) ?? 0)" />

      <!-- ── 注册审批 ── -->
      <template v-if="tabIndex === 0">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'待审批注册（' + registrations.length + '）'" :FontSize="15" :FontWeight="500" />
            <Button :IsEnabled="!!registrations.length" @Click="batchApprove">
              <span class="yali-btn-inner"><span>全部批准</span></span>
            </Button>
          </div>
          <p v-if="!registrations.length" class="yali-muted ad-gap">没有待审批的注册申请</p>
          <div v-for="u in registrations" :key="u.id" class="ad-row">
            <span class="ad-name">{{ u.name }}</span>
            <span class="yali-muted">{{ u.class_name || '—' }}</span>
            <span class="yali-chip">{{ u.department || '未选部门' }}</span>
            <div class="ad-actions">
              <Button @Click="approve(u)">
                <span class="yali-btn-inner"><span>批准</span></span>
              </Button>
              <Button @Click="reject(u)">
                <span class="yali-btn-inner"><span>拒绝</span></span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 成员管理 ── -->
      <template v-else-if="tabIndex === 1">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'成员（' + users.length + '）'" :FontSize="15" :FontWeight="500" />
            <div class="yali-head-tools">
              <TextBox v-model:Text="keyword" PlaceholderText="搜索姓名" class="ad-search" />
              <Button @Click="openImport">
                <span class="yali-btn-inner"><span>批量导入</span></span>
              </Button>
              <Button @Click="loadMoreUsers" :IsEnabled="hasMoreUsers && !usersLoading">
                <span class="yali-btn-inner"><span>{{ usersLoading ? '加载中…' : '加载更多' }}</span></span>
              </Button>
            </div>
          </div>
          <div v-for="u in filteredUsers" :key="u.id" class="ad-row">
            <span class="ad-name">{{ u.name }}</span>
            <span class="yali-muted">{{ u.class_name || '—' }}</span>
            <span class="yali-chip">{{ u.department || '未分配' }}</span>
            <!-- ComboBox 的 SelectionChanged 不含 SelectedIndex，索引只从 update:SelectedIndex 出来 -->
            <ComboBox :ItemsSource="ROLE_LABELS" :SelectedIndex="roleIndex[u.id]"
                      class="ad-role" @update:SelectedIndex="(i) => changeRole(u, i)" />
            <div class="ad-actions">
              <Button @Click="renameUser(u)">
                <span class="yali-btn-inner"><span>改名</span></span>
              </Button>
              <Button @Click="changeDept(u)">
                <span class="yali-btn-inner"><span>改部门</span></span>
              </Button>
              <Button @Click="resetPassword(u)">
                <span class="yali-btn-inner"><span>重置密码</span></span>
              </Button>
              <!-- 自己删不了（后端 admin.js 明确拒绝）；站长也不能被删 -->
              <Button v-if="canDeleteUser(u)" @Click="removeUser(u)">
                <span class="yali-btn-inner">
                  <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>删除</span>
                </span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 公告审核 ── -->
      <template v-else-if="tabIndex === 2">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="`公告（${announcements.length} 条）`" :FontSize="15" :FontWeight="500" />
            <span v-if="pendingAnnounceCount" class="yali-chip yali-chip-warn">
              待审核 {{ pendingAnnounceCount }}
            </span>
          </div>

          <div class="ad-filter-row">
            <button v-for="f in ANNOUNCE_FILTERS" :key="f" class="btn btn-sm"
                    :class="announceFilter === f ? 'btn-primary' : 'btn-outline'"
                    type="button" @click="announceFilter = f">
              {{ f === 'all' ? '全部' : f }}
            </button>
          </div>

          <p v-if="!filteredAnnouncements.length" class="yali-muted ad-gap">暂无公告</p>
          <div v-for="a in filteredAnnouncements" :key="a.id" class="yali-item">
            <div class="yali-item-head">
              <TextBlock :Text="a.title" class="yali-item-title" TextWrapping="Wrap" />
              <span class="yali-chip" :class="announceChip(a.status)">{{ a.status || '已通过' }}</span>
            </div>
            <TextBlock :Text="a.content" TextWrapping="Wrap" class="yali-item-body" />
            <!-- 公告缩略图：旧版 loadAdminAnnImages 会按批拉 /api/announcements/images?ids= -->
            <div v-if="announceImages[a.id] && announceImages[a.id].length" class="yali-img-row">
              <img v-for="(u, i) in announceImages[a.id]" :key="i" :src="toBlobUrl(u)" alt="公告图片"
                   @click="openLightbox(toBlobUrl(u))" />
            </div>
            <div v-else-if="a.has_image" class="yali-img-skeleton" aria-hidden="true">
              <div class="yali-shimmer" />
            </div>
            <div v-if="a.reject_reason" class="yali-muted ad-gap">拒绝理由：{{ a.reject_reason }}</div>
            <div class="yali-item-meta">
              <span>{{ a.created_by }}</span>
              <span>{{ formatTime(a.created_at) }}</span>
              <span v-if="a.comment_count">评论 {{ a.comment_count }}</span>
            </div>
            <div class="yali-item-actions">
              <button v-if="a.status === '待审核'" class="btn btn-sm btn-primary" type="button"
                      @click="reviewAnnouncement(a, '已通过')">通过</button>
              <button v-if="a.status === '待审核'" class="btn btn-sm btn-danger-outline" type="button"
                      @click="askRejectAnnouncement(a)">拒绝</button>
              <button class="btn btn-sm btn-danger-outline" type="button"
                      @click="removeAnnouncement(a)">删除</button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 审核记录 ── -->
      <template v-else-if="tabIndex === 3">
        <section class="yali-section">
          <TextBlock :Text="`审核记录（${reviews.length}）`" :FontSize="15" :FontWeight="500" />
          <p v-if="!reviews.length" class="yali-muted ad-gap">暂无待审核记录</p>
          <div v-for="r in reviews" :key="r.id" class="yali-item">
            <div class="yali-item-head">
              <span class="yali-chip" :class="reviewChip(r.status)">{{ r.status }}</span>
              <span class="yali-muted">{{ r.created_by }} · {{ formatTime(r.created_at) }}</span>
            </div>
            <div v-if="reviewImages[r.id]" class="ad-review-media">
              <img :src="toBlobUrl(reviewImages[r.id])" alt="审核材料"
                   class="ad-review-img" @click="openLightbox(toBlobUrl(reviewImages[r.id]))" />
            </div>
            <div v-else-if="r.has_image" class="yali-img-skeleton ad-review-skeleton" aria-hidden="true">
              <div class="yali-shimmer" />
            </div>
            <div v-if="r.reject_reason" class="yali-muted ad-gap">拒绝理由：{{ r.reject_reason }}</div>
            <div v-if="r.reviewed_by" class="yali-muted ad-gap">
              审核者：{{ r.reviewed_by }}（{{ (r.reviewed_at || '').slice(0, 16) }}）
            </div>
            <div class="yali-item-actions">
              <button v-if="r.status === '待审核'" class="btn btn-sm btn-primary" type="button"
                      @click="reviewItem(r, '通过')">通过</button>
              <button v-if="r.status === '待审核'" class="btn btn-sm btn-danger-outline" type="button"
                      @click="askRejectReview(r)">拒绝</button>
              <button class="btn btn-sm btn-danger-outline" type="button"
                      @click="removeReview(r)">删除</button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 反馈 ── -->
      <template v-else-if="tabIndex === 4">
        <section class="yali-section">
          <TextBlock :Text="'用户反馈（' + feedback.length + '）'" :FontSize="15" :FontWeight="500" />
          <p v-if="!feedback.length" class="yali-muted ad-gap">暂无反馈</p>
          <div v-for="f in feedback" :key="f.id" class="ad-feedback">
            <div class="ad-feedback-head">
              <span class="yali-muted">{{ formatTime(f.created_at) }}</span>
              <span v-if="f.section" class="yali-chip">{{ f.section }}</span>
              <span v-if="f.version" class="yali-chip">v{{ f.version }}</span>
              <button class="ad-del" type="button" title="删除" @click="removeFeedback(f)">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="13" />
              </button>
            </div>
            <p class="ad-feedback-text">{{ f.content }}</p>
            <p v-if="f.contact || f.page" class="yali-muted ad-feedback-meta">
              <span v-if="f.contact">联系方式：{{ f.contact }}</span>
              <span v-if="f.page">来源：{{ f.page }}</span>
            </p>
          </div>
        </section>
      </template>

      <!-- ── 报修管理（旧版 admin.js 的问题反馈管理） ── -->
      <template v-else-if="tabIndex === 5">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'报修记录（' + issues.length + '）'" :FontSize="15" :FontWeight="500" />
            <Button @Click="loadIssues">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.refresh" :FontSize="13" /><span>刷新</span>
              </span>
            </Button>
          </div>
          <p v-if="issuesError" class="yali-muted ad-gap">加载失败：{{ issuesError }}</p>
          <p v-else-if="!issues.length" class="yali-muted ad-gap">暂无报修记录</p>
          <div v-for="it in issues" :key="it.id" class="yali-item">
            <div class="yali-item-head">
              <TextBlock :Text="it.location" class="yali-item-title" TextWrapping="Wrap" />
              <span class="yali-chip">{{ it.status }}</span>
            </div>
            <TextBlock :Text="it.description" TextWrapping="Wrap" class="yali-item-body" />
            <p v-if="it.notes" class="yali-muted">备注：{{ it.notes }}</p>
            <div class="yali-item-meta">
              <span>{{ it.submitted_by }}</span>
              <span>{{ formatTime(it.created_at) }}</span>
            </div>
            <div v-if="issueImages[it.id]" class="ad-review-media">
              <img :src="toBlobUrl(issueImages[it.id])" alt="报修图片" class="ad-review-img"
                   @click="openLightbox(toBlobUrl(issueImages[it.id]))" />
            </div>
            <div class="yali-item-actions">
              <button class="btn btn-sm btn-danger-outline" type="button" @click="removeIssue(it)">删除</button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 财务记录管理（旧版 admin.js 的财务记录，DELETE /api/admin/finance/:id） ── -->
      <template v-else-if="tabIndex === 6">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="'财务记录（' + financeList.length + '）'" :FontSize="15" :FontWeight="500" />
            <Button @Click="loadFinance">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.refresh" :FontSize="13" /><span>刷新</span>
              </span>
            </Button>
          </div>
          <p v-if="financeError" class="yali-muted ad-gap">加载失败：{{ financeError }}</p>
          <p v-else-if="!financeList.length" class="yali-muted ad-gap">暂无财务记录</p>
          <div v-for="f in financeList" :key="f.id" class="ad-row">
            <span class="yali-chip" :class="f.type === '收入' ? 'yali-chip-accent' : 'yali-chip-warn'">{{ f.type }}</span>
            <span class="ad-name">¥{{ f.amount }}</span>
            <span class="yali-muted">{{ f.status }}</span>
            <span class="yali-muted">{{ f.department || '—' }}</span>
            <span class="yali-muted">{{ f.created_by }} · {{ formatTime(f.created_at) }}</span>
            <div class="ad-actions">
              <img v-if="financeImages[f.id]" :src="toBlobUrl(financeImages[f.id])" alt="票据"
                   class="ad-review-img ad-fin-thumb"
                   @click="openLightbox(toBlobUrl(financeImages[f.id]))" />
              <button class="btn btn-sm btn-danger-outline" type="button" @click="removeFinance(f)">删除</button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 功能开关（旧版 admin.js 的功能管理：启用 / 全员邀请 / 邀请详情 / 重置） ── -->
      <template v-else-if="tabIndex === 7">
        <section class="yali-section">
          <div class="yali-section-head">
            <TextBlock :Text="`预定义功能（${features.length}）`" :FontSize="15" :FontWeight="500" />
            <Button @Click="loadFeatures">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.refresh" :FontSize="13" /><span>刷新</span>
              </span>
            </Button>
          </div>
          <p v-if="featuresError" class="yali-muted ad-gap">加载失败：{{ featuresError }}</p>
          <p v-else-if="!features.length" class="yali-muted ad-gap">暂无预定义功能</p>

          <div v-for="f in features" :key="f.key" class="yali-item">
            <div class="yali-item-head">
              <TextBlock :Text="f.name" class="yali-item-title" />
              <span class="yali-chip" :class="f.globally_enabled ? 'yali-chip-accent' : 'yali-chip-done'">
                {{ f.globally_enabled ? '已启用' : '未启用' }}
              </span>
            </div>
            <TextBlock :Text="f.description" TextWrapping="Wrap" class="yali-item-body" />
            <div class="yali-item-meta">
              <span>key：{{ f.key }}</span>
              <span v-for="(n, st) in f.stats || {}" :key="st">{{ st }} {{ n }}</span>
            </div>
            <div class="yali-item-actions">
              <Button @Click="toggleFeature(f, !f.globally_enabled)">
                <span class="yali-btn-inner"><span>{{ f.globally_enabled ? '禁用' : '启用' }}</span></span>
              </Button>
              <Button :IsEnabled="!!f.globally_enabled" @Click="inviteAll(f)">
                <span class="yali-btn-inner"><span>全员邀请</span></span>
              </Button>
              <Button @Click="showInvitations(f)">
                <span class="yali-btn-inner"><span>邀请详情</span></span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <!-- ── 站点设置 ── -->
      <template v-else>
        <!-- 维护开关只对站长开放：PUT /api/admin/settings 在路由表标了 owner:true，
             普通管理员点了必然 403（旧版 admin.js 也是仅 owner 渲染这块） -->
        <section v-if="isOwner" class="yali-section">
          <TextBlock Text="站点开关" :FontSize="15" :FontWeight="500" />
          <div class="yali-setting-row">
            <div class="yali-setting-label">
              <span class="yali-setting-title">关闭站点（维护模式）</span>
              <span class="yali-setting-desc">
                开启后普通用户只能看到维护提示；管理员仍可登录解除
              </span>
            </div>
            <ToggleSwitch v-model:IsOn="settings.site_closed" @Toggled="onClosedToggle" />
          </div>
          <label v-if="settings.site_closed" class="yali-field ad-gap">
            <span class="yali-field-label">维护提示文案</span>
            <TextBox v-model:Text="settings.site_closed_message" :MaxLength="500"
                     PlaceholderText="雅礼团委-通办暂时关闭" />
          </label>
          <div class="yali-form-actions">
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!saving" @Click="saveSettings">
              <span class="yali-btn-inner"><span>{{ saving ? '保存中…' : '保存设置' }}</span></span>
            </Button>
          </div>
          <p v-if="settings.site_closed_by" class="yali-muted ad-gap">
            上次由 {{ settings.site_closed_by }} 操作
          </p>
        </section>

        <section v-if="storageError" class="yali-section">
          <TextBlock Text="存储统计" :FontSize="15" :FontWeight="500" />
          <p class="yali-muted ad-gap">加载失败：{{ storageError }}</p>
          <div class="yali-form-actions">
            <Button @Click="loadStorage">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.refresh" :FontSize="13" /><span>重试</span>
              </span>
            </Button>
          </div>
        </section>

        <section v-else-if="storage" class="yali-section">
          <TextBlock Text="存储统计" :FontSize="15" :FontWeight="500" />

          <div class="ad-bar-row">
            <div class="ad-bar-head">
              <span>图片</span>
              <span><strong>{{ fmtMB(storage.imageBytes) }}</strong> / 5 GB</span>
            </div>
            <div class="ad-bar">
              <div class="ad-bar-fill" :class="pctClass(storage.percent)"
                   :style="{ width: Math.min(storage.percent ?? 0, 100) + '%' }" />
            </div>
            <div class="ad-bar-pct">{{ (storage.percent ?? 0).toFixed(1) }}%</div>
          </div>

          <div class="ad-bar-row">
            <div class="ad-bar-head">
              <span>文本</span>
              <span><strong>{{ fmtMB(storage.textBytes) }}</strong> / 5 GB</span>
            </div>
            <div class="ad-bar">
              <div class="ad-bar-fill" :class="pctClass(textPercent)"
                   :style="{ width: Math.min(textPercent, 100) + '%' }" />
            </div>
            <div class="ad-bar-pct">{{ textPercent.toFixed(1) }}%</div>
          </div>

          <div class="ad-counts">
            <span v-for="row in storageCounts" :key="row.label">
              {{ row.label }} {{ row.value }}
            </span>
          </div>
        </section>

        <!-- 清空数据只对站长开放：POST /api/admin/clear-all 在路由表标了 owner:true -->
        <section v-if="isOwner" class="yali-section">
          <TextBlock Text="危险操作" :FontSize="15" :FontWeight="500" />
          <div class="yali-setting-row">
            <div class="yali-setting-label">
              <span class="yali-setting-title">清空全部数据</span>
              <span class="yali-setting-desc">删除所有业务数据，仅保留账号与站点设置。不可撤销</span>
            </div>
            <Button @Click="clearAll">
              <span class="yali-btn-inner">
                <FontIcon :Glyph="GLYPH.delete" :FontSize="13" /><span>清空</span>
              </span>
            </Button>
          </div>
        </section>
      </template>
    </div>

    <!-- 邀请详情（可重置某人的响应，让他能被重新邀请） -->
    <ContentDialog :IsOpen="inviteDialog" :Title="'邀请详情 · ' + inviteFeatureName" CloseButtonText="关闭"
                   @update:IsOpen="inviteDialog = $event">
      <div class="yali-form">
        <p v-if="inviteLoading" class="yali-muted">加载中…</p>
        <p v-else-if="!invitations.length" class="yali-muted">还没有邀请记录</p>
        <div v-for="iv in invitations" :key="iv.user_id" class="ad-row">
          <span class="ad-name">{{ iv.name }}</span>
          <span class="yali-chip">{{ iv.status }}</span>
          <span class="yali-muted">{{ formatTime(iv.invited_at) }}</span>
          <div class="ad-actions">
            <Button @Click="resetInvitation(iv)">
              <span class="yali-btn-inner"><span>重置</span></span>
            </Button>
          </div>
        </div>
      </div>
    </ContentDialog>

    <!-- 批量导入成员 -->
    <ContentDialog :IsOpen="importOpen" Title="批量导入成员" CloseButtonText="关闭"
                   @update:IsOpen="importOpen = $event">
      <div class="yali-form">
        <SelectorBar :Items="importModes" :SelectedItem="importModes[importMode]"
                     @SelectionChanged="(a) => { importMode = a?.Items?.indexOf(a.SelectedItem) ?? 0; importParsed = [] }" />

        <label v-if="importMode === 0" class="yali-field ad-gap">
          <span class="yali-field-label">上传 CSV 文件</span>
          <input type="file" accept=".csv" class="form-input" @change="onImportFile" />
          <span class="yali-setting-desc">格式：姓名,密码,班级,部门（每行一条，部门可选）</span>
        </label>

        <label v-else-if="importMode === 1" class="yali-field ad-gap">
          <span class="yali-field-label">上传 JSON 文件</span>
          <input type="file" accept=".json" class="form-input" @change="onImportFile" />
          <span class="yali-setting-desc">
            格式：[{&quot;name&quot;:&quot;…&quot;,&quot;password&quot;:&quot;…&quot;,&quot;class_name&quot;:&quot;…&quot;,&quot;department&quot;:&quot;…&quot;}]
          </span>
        </label>

        <template v-else>
          <label class="yali-field ad-gap">
            <span class="yali-field-label">手动输入</span>
            <TextBox v-model:Text="importText" AcceptsReturn TextWrapping="Wrap"
                     PlaceholderText="每行一条：姓名 密码 班级 部门
例如：张三 abc123 2501 宣传部" />
          </label>
          <div class="yali-form-actions">
            <Button @Click="parseManual">
              <span class="yali-btn-inner"><span>解析</span></span>
            </Button>
          </div>
        </template>

        <template v-if="importParsed.length">
          <TextBlock :Text="`解析出 ${importParsed.length} 条，确认后提交`"
                     :FontSize="13" :FontWeight="500" class="ad-gap" />
          <div class="ad-import-preview">
            <div v-for="(u, i) in importParsed" :key="i" class="ad-import-row">
              <span class="ad-name">{{ u.name }}</span>
              <span class="yali-muted">{{ u.class_name || '—' }}</span>
              <span class="yali-chip">{{ u.department || '未分配' }}</span>
            </div>
          </div>
          <div class="yali-form-actions">
            <Button :Style="'{StaticResource AccentButtonStyle}'" :IsEnabled="!importing" @Click="confirmImport">
              <span class="yali-btn-inner"><span>{{ importing ? '导入中…' : '确认导入' }}</span></span>
            </Button>
          </div>
        </template>

        <p v-if="importResult" class="yali-muted ad-gap">{{ importResult }}</p>
      </div>
    </ContentDialog>
  </YaliShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import YaliShell from '../../components/YaliShell.vue'
import { GLYPH } from '../../shared/icons'
import { apiDel, apiGet, apiPost, apiPut, formatTime, getUser, isAdmin, openLightbox, toast, toBlobUrl } from '../../shared/api'

/* 标签顺序与旧后台一致：注册审批 / 成员 / 公告审核 / 审核记录 / 反馈 / 报修管理 /
   财务记录 / 功能开关 / 站点设置。
   后四个标签在迁移时被漏掉了，导致 /api/issues 的删除入口、DELETE /api/admin/finance/:id
   以及整套 /api/admin/features* 一度没有任何消费者。站点设置固定放在最后，
   loadForTab 的兜底分支对应它。 */
const TABS = [
  '注册审批',
  '成员管理',
  '公告审核',
  '审核记录',
  '反馈',
  '报修管理',
  '财务记录',
  '功能开关',
  '站点设置'
]
const tabItems = TABS.map((Text) => ({ Text }))

/** 标签页可由 ?tab=<序号或名称> 指定，便于分享链接与刷新后保持 */
const initialTab = (() => {
  const raw = new URLSearchParams(window.location.search).get('tab')
  if (!raw) return 0
  const byName = TABS.indexOf(raw)
  if (byName >= 0) return byName
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n < TABS.length ? n : 0
})()
const tabIndex = ref(initialTab)

/** 站长专属操作（维护开关、清空数据）的判断依据 */
const isOwner = computed(() => getUser()?.role === 'owner')

watch(tabIndex, (i) => {
  const url = new URL(window.location.href)
  if (i === 0) url.searchParams.delete('tab')
  else url.searchParams.set('tab', String(i))
  window.history.replaceState(null, '', url)
})
const saving = ref(false)

interface User {
  id: number
  name: string
  role: string
  class_name?: string
  department?: string
  created_at?: string
}
interface Feedback {
  id: number
  content: string
  contact?: string
  page?: string
  section?: string
  version?: string
  created_at: string
}
/** GET /api/issues（列表接口只给 has_image 标记） */
interface Issue {
  id: number
  location: string
  description: string
  notes?: string
  status: string
  submitted_by: string
  created_at: string
  has_image?: number | boolean
}
/** GET /api/finance */
interface FinanceRow {
  id: number
  type: string
  amount: number | string
  status: string
  department?: string
  notes?: string
  created_by: string
  created_at: string
  has_image?: number | boolean
}
/** GET /api/admin/features（键名见 features.js handleAdminGetFeatures） */
interface AdminFeature {
  key: string
  name: string
  description: string
  icon?: string
  globally_enabled: boolean
  stats?: Record<string, number>
}
/** GET /api/admin/features/:key/invitations */
interface AdminInvitation {
  user_id: number
  name: string
  status: string
  invited_at?: string
  responded_at?: string
}

/* 可改角色：与后端 handleUpdateRole 的白名单一致
   （['member','admin','owner','teacher','public']）。早先表里有 '待审批'→'pending'，
   后端明确拒绝，选中就会报「无效角色」。 */
const ROLE_LABELS = ['公共用户', '成员', '教师', '管理员', '站长']
const ROLE_VALUES = ['public', 'member', 'teacher', 'admin', 'owner']
/** 与后端 DEPARTMENTS 白名单一致（_utils.js） */
const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室']
/** 角色不在白名单时的兜底显示索引（成员） */
const ROLE_FALLBACK = ROLE_VALUES.indexOf('member')

/* ── 注册审批 ── */
const registrations = ref<User[]>([])

async function loadRegistrations() {
  try {
    registrations.value = (await apiGet<User[]>('/api/admin/registrations')) ?? []
  } catch (err) {
    toast((err as Error).message, 'error')
    registrations.value = []
  }
}

async function approve(u: User) {
  try {
    await apiPost(`/api/admin/registrations/${u.id}/approve`)
    registrations.value = registrations.value.filter((x) => x.id !== u.id)
    toast(`已批准 ${u.name}`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function reject(u: User) {
  if (!window.confirm(`确定拒绝 ${u.name} 的注册申请吗？`)) return
  try {
    await apiPost(`/api/admin/registrations/${u.id}/reject`)
    registrations.value = registrations.value.filter((x) => x.id !== u.id)
    toast('已拒绝', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function batchApprove() {
  if (!window.confirm(`确定批准全部 ${registrations.value.length} 条注册申请吗？`)) return
  try {
    await apiPost('/api/admin/users/batch-approve', {
      ids: registrations.value.map((u) => u.id)
    })
    registrations.value = []
    toast('已全部批准', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 成员管理 ── */
const users = ref<User[]>([])
const usersLoading = ref(false)
const hasMoreUsers = ref(true)
const keyword = ref('')
const roleIndex = reactive<Record<number, number>>({})
let userOffset = 0
/** 后端 handleGetAllUsers 的 limit 是写死的 200，这里必须与之保持一致，
    否则 offset 步进对不上（传 limit=50 也只返回 200 条） */
const PAGE = 200

async function loadUsers(reset = false) {
  if (usersLoading.value) return
  usersLoading.value = true
  if (reset) {
    userOffset = 0
    users.value = []
  }
  try {
    // 该接口返回的是 { results, hasMore } 包装对象，不是数组
    const data = await apiGet<{ results?: User[]; hasMore?: boolean }>(
      `/api/admin/users?offset=${userOffset}`
    )
    const arr = Array.isArray(data?.results) ? data.results : []
    users.value = [...users.value, ...arr]
    userOffset += arr.length
    hasMoreUsers.value = !!data?.hasMore
    for (const u of arr) {
      const i = ROLE_VALUES.indexOf(u.role)
      roleIndex[u.id] = i >= 0 ? i : ROLE_FALLBACK
    }
  } catch (err) {
    toast((err as Error).message, 'error')
    hasMoreUsers.value = false
  } finally {
    usersLoading.value = false
  }
}

function loadMoreUsers() {
  loadUsers(false)
}

const filteredUsers = computed(() => {
  const kw = keyword.value.trim()
  return kw ? users.value.filter((u) => u.name.includes(kw)) : users.value
})

async function changeRole(u: User, i: number) {
  if (i == null || i < 0 || i >= ROLE_VALUES.length) return
  const role = ROLE_VALUES[i]
  roleIndex[u.id] = i // 受控回写：ComboBox 只读 :SelectedIndex
  if (role === u.role) return
  // 与后端一致：只有站长能授予站长；站长本人的角色不可改
  const me = getUser()
  if (u.role === 'owner') return toast('不能修改站长的角色', 'error')
  if (role === 'owner' && me?.role !== 'owner') return toast('只有站长可以授予站长权限', 'error')
  if (role === 'public' && !window.confirm(`将 ${u.name} 改为公共账号？公共账号全站仅允许一个。`)) {
    const old = ROLE_VALUES.indexOf(u.role)
    roleIndex[u.id] = old >= 0 ? old : ROLE_FALLBACK
    return
  }
  try {
    await apiPut(`/api/admin/users/${u.id}/role`, { role })
    u.role = role
    toast(`${u.name} 的角色已改为${ROLE_LABELS[i]}`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
    const old = ROLE_VALUES.indexOf(u.role)
    roleIndex[u.id] = old >= 0 ? old : ROLE_FALLBACK
  }
}

/** 初始密码：与后端 handleResetPassword 同一口径（校验通过） */
const RESET_PASSWORD = 'Yali@1234'

async function resetPassword(u: User) {
  if (!window.confirm(`确定把 ${u.name} 的密码重置为初始密码吗？`)) return
  try {
    // 后端要求 body.password，不传 body 会直接返回「请提供新密码」
    await apiPut(`/api/admin/users/${u.id}/reset-password`, { password: RESET_PASSWORD })
    toast(`密码已重置为 ${RESET_PASSWORD}`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function removeUser(u: User) {
  if (!window.confirm(`确定删除用户 ${u.name} 吗？此操作不可撤销。`)) return
  try {
    await apiDel(`/api/admin/users/${u.id}`)
    users.value = users.value.filter((x) => x.id !== u.id)
    toast('用户已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* 后端的删除限制：不能删自己、不能删站长（admin.js）
   这里也把 admin/teacher 之外的角色之外的情况收一收，避免点了必然 403 */
function canDeleteUser(u: User) {
  const me = getUser()
  if (me && me.name === u.name) return false
  return u.role !== 'owner'
}

/** 改名：PUT /api/admin/users/:id/name { name }（2-20 字、不能与站长重名、不能改站长） */
async function renameUser(u: User) {
  if (u.role === 'owner') return toast('不能修改站长姓名', 'error')
  const input = window.prompt(`修改 ${u.name} 的姓名（2-20 字）`, u.name)
  if (input === null) return
  const name = input.trim()
  if (name.length < 2 || name.length > 20) return toast('姓名长度需在2-20字之间', 'error')
  if (name === u.name) return
  try {
    await apiPut(`/api/admin/users/${u.id}/name`, { name })
    u.name = name
    toast('姓名已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/** 改部门：PUT /api/admin/users/:id/department { department }（空串 = 未分配） */
async function changeDept(u: User) {
  const options = ['未分配', ...DEPARTMENTS]
  const input = window.prompt(
    `修改 ${u.name} 的部门\n可选：${options.join(' / ')}`,
    u.department || '未分配'
  )
  if (input === null) return
  const raw = input.trim()
  if (raw && !DEPARTMENTS.includes(raw) && raw !== '未分配') {
    return toast('部门不在可选范围内', 'error')
  }
  const department = raw === '未分配' ? '' : raw
  try {
    await apiPut(`/api/admin/users/${u.id}/department`, { department })
    u.department = department
    toast('部门已更新', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 反馈 ── */
const feedback = ref<Feedback[]>([])

/* ── 公告审核 ── */
interface AdminAnnouncement {
  id: number
  title: string
  content: string
  status?: string
  created_by: string
  created_at: string
  reject_reason?: string
  comment_count?: number
  /** 列表接口是 v2 瘦身结构，只给标记；图片走 /api/announcements/images?ids= */
  has_image?: number | boolean
}

const ANNOUNCE_FILTERS = ['all', '待审核', '已通过', '已拒绝']

const announcements = ref<AdminAnnouncement[]>([])
const announceFilter = ref('all')

const pendingAnnounceCount = computed(
  () => announcements.value.filter((a) => a.status === '待审核').length
)
const filteredAnnouncements = computed(() =>
  announceFilter.value === 'all'
    ? announcements.value
    : announcements.value.filter((a) => (a.status || '已通过') === announceFilter.value)
)

function announceChip(status?: string) {
  if (status === '待审核') return 'yali-chip-warn'
  if (status === '已拒绝') return 'yali-chip-danger'
  return 'yali-chip-done'
}

async function loadAnnouncements() {
  try {
    announcements.value = (await apiGet<AdminAnnouncement[]>('/api/announcements')) ?? []
    void loadAnnounceImagesLazy()
  } catch (err) {
    toast((err as Error).message, 'error')
    announcements.value = []
  }
}

/* 公告缩略图：每批 4 条（旧版 loadAdminAnnImages 同一策略） */
const announceImages = reactive<Record<number, string[]>>({})

async function loadAnnounceImagesLazy() {
  const pending = announcements.value
    .filter((a) => a.has_image && !(a.id in announceImages))
    .map((a) => a.id)
  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4)
    let map: Record<string, string[]> = {}
    try {
      map = await apiGet<Record<string, string[]>>(
        `/api/announcements/images?ids=${batch.join(',')}`
      )
    } catch {
      map = {}
    }
    for (const id of batch) {
      const urls = map?.[id]
      announceImages[id] = Array.isArray(urls) ? urls : []
    }
  }
}

async function reviewAnnouncement(a: AdminAnnouncement, status: '已通过' | '已拒绝', reason = '') {
  try {
    // 后端要求：status 只能是 已通过 / 已拒绝；拒绝时必须给理由
    await apiPut(`/api/announcements/${a.id}/status`, { status, reject_reason: reason })
    a.status = status
    a.reject_reason = reason
    toast(status === '已通过' ? '公告已通过' : '公告已拒绝', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function askRejectAnnouncement(a: AdminAnnouncement) {
  const reason = window.prompt('请填写拒绝理由（必填，不超过 500 字）')
  if (reason === null) return
  if (!reason.trim()) return toast('拒绝时必须填写理由', 'error')
  void reviewAnnouncement(a, '已拒绝', reason.trim())
}

async function removeAnnouncement(a: AdminAnnouncement) {
  if (!window.confirm(`确定删除公告「${a.title}」吗？`)) return
  try {
    await apiDel(`/api/announcements/${a.id}`)
    announcements.value = announcements.value.filter((x) => x.id !== a.id)
    toast('公告已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 审核记录 ── */
interface ReviewItem {
  id: number
  status: string
  reject_reason?: string
  created_by: string
  created_at: string
  reviewed_by?: string
  reviewed_at?: string
  /** 列表只给标记，图片走 /api/reviews/images?ids= 按批取（每条都是一整张 base64） */
  has_image?: number
}

const reviews = ref<ReviewItem[]>([])
const reviewImages = reactive<Record<number, string>>({})

function reviewChip(status: string) {
  if (status === '待审核') return 'yali-chip-warn'
  if (status === '拒绝') return 'yali-chip-danger'
  return 'yali-chip-done'
}

async function loadReviews() {
  try {
    reviews.value = (await apiGet<ReviewItem[]>('/api/reviews')) ?? []
    void loadReviewImagesLazy()
  } catch (err) {
    toast((err as Error).message, 'error')
    reviews.value = []
  }
}

/** 每批 4 条取图（与站点其它列表同一策略） */
async function loadReviewImagesLazy() {
  const pending = reviews.value
    .filter((r) => r.has_image && !(r.id in reviewImages))
    .map((r) => r.id)
  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4)
    let map: Record<string, string> = {}
    try {
      map = await apiGet<Record<string, string>>(`/api/reviews/images?ids=${batch.join(',')}`)
    } catch {
      map = {}
    }
    // 取不到图就不要登记这个 key —— 登记成空串会让 `v-else-if="r.has_image"` 的
    // 骨架屏永远转下去（既不显示图，也不显示「无图」）
    for (const id of batch) {
      const url = map?.[id]
      if (url) reviewImages[id] = url
    }
  }
}

async function reviewItem(r: ReviewItem, status: '通过' | '拒绝', reason = '') {
  try {
    // 后端这里的取值是 通过 / 拒绝（与公告审核的 已通过/已拒绝 不同）
    await apiPut(`/api/reviews/${r.id}/review`, { status, reject_reason: reason })
    r.status = status
    r.reject_reason = reason
    toast(status === '通过' ? '已通过' : '已拒绝', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function askRejectReview(r: ReviewItem) {
  const reason = window.prompt('请填写拒绝理由（必填，不超过 500 字）')
  if (reason === null) return
  if (!reason.trim()) return toast('拒绝时必须填写理由', 'error')
  void reviewItem(r, '拒绝', reason.trim())
}

async function removeReview(r: ReviewItem) {
  if (!window.confirm('确定删除这条审核记录吗？')) return
  try {
    await apiDel(`/api/reviews/${r.id}`)
    reviews.value = reviews.value.filter((x) => x.id !== r.id)
    toast('审核记录已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 批量导入成员 ──
   后端 POST /api/admin/users/batch-import { users: [{name,password,class_name,department}] }
   返回 { success, skipped, failed: [{index,name,reason}] }。
   解析口径与旧页面一致：CSV 按逗号、手动输入按空白分隔。 */
interface ImportUser {
  name: string
  password: string
  class_name?: string
  department?: string
}

const importModes = ['CSV 文件', 'JSON 文件', '手动输入'].map((Text) => ({ Text }))
const importOpen = ref(false)
const importMode = ref(0)
const importText = ref('')
const importParsed = ref<ImportUser[]>([])
const importing = ref(false)
const importResult = ref('')

function openImport() {
  importOpen.value = true
  importMode.value = 0
  importText.value = ''
  importParsed.value = []
  importResult.value = ''
}

function normalizeImport(list: unknown[]): ImportUser[] {
  return list
    .map((raw) => {
      const u = raw as Record<string, unknown>
      return {
        name: String(u.name ?? '').trim(),
        password: String(u.password ?? '').trim(),
        class_name: String(u.class_name ?? '').trim(),
        department: String(u.department ?? '').trim()
      }
    })
    .filter((u) => u.name && u.password)
}

function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result ?? '')
    try {
      if (importMode.value === 1) {
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('JSON 顶层必须是数组')
        importParsed.value = normalizeImport(parsed)
      } else {
        importParsed.value = normalizeImport(
          text
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
              const p = line.split(',').map((s) => s.trim())
              return { name: p[0], password: p[1], class_name: p[2], department: p[3] }
            })
        )
      }
      if (!importParsed.value.length) toast('没有解析出有效数据（姓名与密码都要有）', 'error')
    } catch (err) {
      importParsed.value = []
      toast('解析失败：' + (err as Error).message, 'error')
    }
  }
  reader.readAsText(file)
}

function parseManual() {
  const lines = importText.value.split('\n').filter((l) => l.trim())
  if (!lines.length) return toast('请输入数据', 'error')
  importParsed.value = normalizeImport(
    lines.map((line) => {
      const p = line.trim().split(/\s+/)
      return { name: p[0], password: p[1], class_name: p[2], department: p[3] }
    })
  )
  if (!importParsed.value.length) toast('没有解析出有效数据（姓名与密码都要有）', 'error')
}

async function confirmImport() {
  if (!importParsed.value.length) return
  importing.value = true
  importResult.value = ''
  try {
    const res = await apiPost<{
      success?: number
      skipped?: number
      failed?: Array<{ name: string; reason: string }>
    }>('/api/admin/users/batch-import', { users: importParsed.value })
    const failed = res?.failed ?? []
    importResult.value =
      `成功 ${res?.success ?? 0} 条，跳过重复 ${res?.skipped ?? 0} 条，失败 ${failed.length} 条` +
      (failed.length ? '：' + failed.slice(0, 5).map((f) => `${f.name}（${f.reason}）`).join('、') : '')
    toast('导入完成', 'success')
    importParsed.value = []
    await loadUsers(true)
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    importing.value = false
  }
}

async function loadFeedback() {
  try {
    feedback.value = (await apiGet<Feedback[]>('/api/admin/feedback')) ?? []
  } catch {
    feedback.value = []
  }
}

async function removeFeedback(f: Feedback) {
  if (!window.confirm('确定删除这条反馈吗？')) return
  try {
    await apiDel(`/api/admin/feedback/${f.id}`)
    feedback.value = feedback.value.filter((x) => x.id !== f.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 报修管理（旧版 admin.js 的问题反馈管理） ── */
const issues = ref<Issue[]>([])
const issuesError = ref('')
const issueImages = reactive<Record<number, string>>({})

async function loadIssues() {
  issuesError.value = ''
  try {
    issues.value = (await apiGet<Issue[]>('/api/issues')) ?? []
    void loadIssueImagesLazy()
  } catch (err) {
    // 失败与「一条都没有」长得一样，必须显式区分
    issuesError.value = (err as Error).message || '加载失败'
    issues.value = []
  }
}

/** 每批 4 条取图（与站点其它列表同一策略） */
async function loadIssueImagesLazy() {
  const pending = issues.value
    .filter((i) => i.has_image && !(i.id in issueImages))
    .map((i) => i.id)
  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4)
    let map: Record<string, string> = {}
    try {
      map = await apiGet<Record<string, string>>(`/api/issues/images?ids=${batch.join(',')}`)
    } catch {
      map = {}
    }
    for (const id of batch) {
      const url = map?.[id]
      if (url) issueImages[id] = url
    }
  }
}

async function removeIssue(it: Issue) {
  if (!window.confirm(`确定删除报修「${it.location}」吗？此操作不可撤销。`)) return
  try {
    await apiDel(`/api/issues/${it.id}`)
    issues.value = issues.value.filter((x) => x.id !== it.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 财务记录管理 ── */
const financeList = ref<FinanceRow[]>([])
const financeError = ref('')
const financeImages = reactive<Record<number, string>>({})

async function loadFinance() {
  financeError.value = ''
  try {
    financeList.value = (await apiGet<FinanceRow[]>('/api/finance')) ?? []
    void loadFinanceImagesLazy()
  } catch (err) {
    financeError.value = (err as Error).message || '加载失败'
    financeList.value = []
  }
}

async function loadFinanceImagesLazy() {
  const pending = financeList.value
    .filter((f) => f.has_image && !(f.id in financeImages))
    .map((f) => f.id)
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8)
    let map: Record<string, string> = {}
    try {
      map = await apiGet<Record<string, string>>(`/api/finance/images?ids=${batch.join(',')}`)
    } catch {
      map = {}
    }
    for (const id of batch) {
      const url = map?.[id]
      if (url) financeImages[id] = url
    }
  }
}

async function removeFinance(f: FinanceRow) {
  if (!window.confirm('确定删除这条财务记录吗？此操作不可撤销。')) return
  try {
    // 管理端删除走 /api/admin/finance/:id（路由标了 owner+ 权限），不是 /api/finance/:id
    await apiDel(`/api/admin/finance/${f.id}`)
    financeList.value = financeList.value.filter((x) => x.id !== f.id)
    toast('已删除', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 功能开关：预定义功能的启用 / 邀请（旧版 admin.js 的功能管理） ──
   接口：GET/POST /api/admin/features、POST .../invite、GET .../invitations、POST .../reset */
const features = ref<AdminFeature[]>([])
const featuresError = ref('')

async function loadFeatures() {
  featuresError.value = ''
  try {
    const data = await apiGet<{ features?: AdminFeature[] }>('/api/admin/features')
    features.value = data?.features ?? []
  } catch (err) {
    featuresError.value = (err as Error).message || '加载失败'
    features.value = []
  }
}

async function toggleFeature(f: AdminFeature, enabled: boolean) {
  try {
    // 后端字段：{ key, globally_enabled }
    await apiPost('/api/admin/features', { key: f.key, globally_enabled: enabled })
    f.globally_enabled = enabled
    toast(enabled ? `已启用「${f.name}」` : `已禁用「${f.name}」`, 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function inviteAll(f: AdminFeature) {
  if (!window.confirm(`确定向全部已通过用户发送「${f.name}」邀请吗？`)) return
  try {
    // 后端要求 all:true（或 user_ids 数组）
    const res = await apiPost<{ invited?: number; skipped?: number }>(
      `/api/admin/features/${f.key}/invite`,
      { all: true }
    )
    toast(`已邀请 ${res?.invited ?? 0} 人（跳过 ${res?.skipped ?? 0} 人）`, 'success')
    loadFeatures()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

const inviteDialog = ref(false)
const inviteLoading = ref(false)
const inviteFeatureName = ref('')
const inviteFeatureKey = ref('')
const invitations = ref<AdminInvitation[]>([])

async function showInvitations(f: AdminFeature) {
  inviteFeatureKey.value = f.key
  inviteFeatureName.value = f.name
  invitations.value = []
  inviteDialog.value = true
  inviteLoading.value = true
  try {
    const data = await apiGet<{ invitations?: AdminInvitation[] }>(
      `/api/admin/features/${f.key}/invitations`
    )
    invitations.value = data?.invitations ?? []
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    inviteLoading.value = false
  }
}

async function resetInvitation(iv: AdminInvitation) {
  if (!window.confirm(`重置 ${iv.name} 的响应？重置后可以重新邀请。`)) return
  try {
    await apiPost(`/api/admin/features/${inviteFeatureKey.value}/reset`, { user_id: iv.user_id })
    invitations.value = invitations.value.filter((x) => x.user_id !== iv.user_id)
    toast('已重置', 'success')
    loadFeatures()
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

/* ── 设置 ── */
const settings = reactive({
  site_closed: false,
  site_closed_message: '',
  site_closed_by: ''
})
/** /api/admin/storage 返回的是字节数与各类计数（键名见 _utils.getStorageStats） */
interface StorageStats {
  imageBytes?: number
  textBytes?: number
  totalBytes?: number
  limitBytes?: number
  percent?: number
  totalPercent?: number
  financeCount?: number
  userCount?: number
  issueCount?: number
  announceCount?: number
  reviewCount?: number
  chatCount?: number
  hallCount?: number
  pollCount?: number
  commentCount?: number
  volunteerCount?: number
  feedCommentCount?: number
}

const D1_LIMIT = 5 * 1024 * 1024 * 1024
const storage = ref<StorageStats | null>(null)
/** 存储统计加载失败的原因；失败时区块不能整块消失（否则和「没有这个功能」没区别） */
const storageError = ref('')

function fmtMB(bytes?: number) {
  return ((bytes ?? 0) / 1024 / 1024).toFixed(2) + ' MB'
}

const textPercent = computed(() => ((storage.value?.textBytes ?? 0) / D1_LIMIT) * 100)

function pctClass(pct?: number) {
  const p = pct ?? 0
  return p > 80 ? 'is-danger' : p > 50 ? 'is-warn' : 'is-ok'
}

const storageCounts = computed(() => {
  const s = storage.value
  if (!s) return []
  return [
    { label: '财务', value: s.financeCount ?? 0 },
    { label: '报修', value: s.issueCount ?? 0 },
    { label: '公告', value: s.announceCount ?? 0 },
    { label: '审核', value: s.reviewCount ?? 0 },
    { label: '动态', value: s.chatCount ?? 0 },
    { label: '千报', value: s.hallCount ?? 0 },
    { label: '投票', value: s.pollCount ?? 0 },
    { label: '评论', value: s.commentCount ?? 0 },
    { label: '用户', value: s.userCount ?? 0 },
    { label: '志愿', value: s.volunteerCount ?? 0 }
  ]
})

async function loadSettings() {
  try {
    const d = await apiGet<Record<string, unknown>>('/api/admin/settings')
    Object.assign(settings, {
      // settings 表里 value 是 TEXT：'true' / 'false'。
      // `!!'false'` 是 true —— 早先这样写会把「已恢复开放」的站点显示成「已关闭」，
      // 管理员再点保存就把 'true' 写回去，真的把站点关掉。
      site_closed: d?.site_closed === 'true',
      site_closed_message: (d?.site_closed_message as string) ?? '',
      site_closed_by: (d?.site_closed_by as string) ?? ''
    })
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function loadStorage() {
  try {
    storage.value = await apiGet<StorageStats>('/api/admin/storage')
    storageError.value = ''
  } catch (err) {
    // 失败不能与「还没有数据」同貌：区块会整块消失，看起来像功能不存在
    storage.value = null
    storageError.value = (err as Error).message || '存储统计加载失败'
  }
}

function onClosedToggle() {
  /* 由 v-model 更新，保存时一并提交 */
}

async function saveSettings() {
  saving.value = true
  try {
    await apiPut('/api/admin/settings', {
      site_closed: settings.site_closed ? 'true' : 'false',
      // 后端只写传入的 key，漏了这个字段「上次由谁操作」会永远停在旧值
      site_closed_by: getUser()?.name ?? '',
      site_closed_message: settings.site_closed_message
    })
    settings.site_closed_by = getUser()?.name ?? ''
    toast('设置已保存', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function clearAll() {
  if (!window.confirm('确定清空全部业务数据吗？此操作不可撤销。')) return
  if (!window.confirm('再次确认：清空后无法恢复，是否继续？')) return
  // 旧版是三级确认（admin.js），这里保留第三级，避免误触
  if (!window.confirm('最后确认：真的要清空所有业务数据吗？')) return
  try {
    await apiPost('/api/admin/clear-all')
    toast('已清空全部数据', 'success')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

function loadForTab(i: number) {
  if (i === 0) loadRegistrations()
  else if (i === 1) loadUsers(true)
  else if (i === 2) loadAnnouncements()
  else if (i === 3) loadReviews()
  else if (i === 4) loadFeedback()
  else if (i === 5) loadIssues()
  else if (i === 6) loadFinance()
  else if (i === 7) loadFeatures()
  else {
    loadSettings()
    loadStorage()
  }
}

watch(tabIndex, loadForTab)

onMounted(() => {
  /* 非管理员进来只会看到满屏 403 报错 —— 直接请回服务页
     （旧版 admin.js 开头就是 requireAdmin()） */
  if (!isAdmin()) {
    window.location.replace('services.html')
    return
  }
  loadForTab(tabIndex.value)
})
</script>

<style>
.ad-tabs {
  margin-bottom: 16px;
}
.ad-gap {
  margin-top: 12px;
}
.ad-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke-divider);
  font-size: 13px;
  flex-wrap: wrap;
}
.ad-name {
  font-weight: 500;
  color: var(--text-primary);
  min-width: 80px;
}
.ad-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.ad-role {
  width: 130px;
}
.ad-search {
  width: 180px;
}
.ad-del {
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 4px;
}
.ad-del:hover {
  background: var(--subtle-tertiary);
  color: var(--text-primary);
}
.ad-feedback {
  padding: 10px 0;
  border-bottom: 1px solid var(--stroke-divider);
}
.ad-feedback-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.ad-feedback-head .ad-del {
  margin-left: auto;
}
.ad-feedback-text {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.ad-feedback-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 4px 0 0;
}
.ad-kv {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 6px 12px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-primary);
}

/* 存储占用条（颜色随占比变化：正常 / 偏高 / 告警） */
.ad-bar-row {
  margin-top: 12px;
}
.ad-bar-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}
.ad-bar {
  margin-top: 4px;
  height: 6px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--control-stroke-default, rgba(128, 128, 128, 0.24));
}
.ad-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.ad-bar-fill.is-ok { background: var(--color-text-success, #0f7b0f); }
.ad-bar-fill.is-warn { background: var(--color-text-caution, #9d5d00); }
.ad-bar-fill.is-danger { background: var(--accent-base); }
.ad-bar-pct {
  margin-top: 2px;
  font-size: 11px;
  text-align: right;
  color: var(--text-tertiary);
}
.ad-filter-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.ad-import-preview {
  max-height: 220px;
  overflow-y: auto;
  margin-top: 8px;
  border: 1px solid var(--stroke-divider);
  border-radius: 6px;
  padding: 6px 10px;
}
.ad-import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--stroke-divider);
}
.ad-import-row:last-child {
  border-bottom: none;
}
.ad-review-media {
  margin-top: 8px;
}
.ad-review-skeleton {
  margin-top: 8px;
  width: 200px;
  height: 120px;
}
.ad-review-img {
  margin-top: 8px;
  max-width: 100%;
  max-height: 220px;
  width: auto;
  border-radius: 6px;
  cursor: pointer;
}
/* 财务票据缩略图：跟在操作按钮行里，得压小并去掉上外边距 */
.ad-fin-thumb {
  margin-top: 0;
  max-height: 40px;
  border-radius: 4px;
}
.ad-counts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 4px 10px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .ad-search,
  .ad-role {
    width: 100%;
  }
  .ad-actions {
    margin-left: 0;
  }
}
</style>
