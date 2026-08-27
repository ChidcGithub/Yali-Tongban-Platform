import { json, error, setCleanupCount, checkSiteClosed, requireMember, autoCleanup, initDB, isAdmin, isOwner, generateCaptcha } from './_utils.js';
import { handleLogin, handleRegister, handleMe, handleCheckName, handleChangePassword, handleChangeName, handleChangeClass, handleChangeOwnDepartment } from './auth.js';
import { handleGetIssues, handleCreateIssue, handleUpdateIssueStatus, handleDeleteIssue } from './issues.js';
import { handleCreateFeedback, handleGetFeedback, handleDeleteFeedback } from './feedback.js';
import { handleGetAnnouncements, handleGetAnnouncementImages, handleCreateAnnouncement, handleDeleteAnnouncement, handleUpdateAnnouncement, handleReviewAnnouncement, handleAddAnnouncementImage } from './announcements.js';
import { handleGetFinance, handleCreateFinance, handleCompleteFinance, handleReimburseFinance, handleUnreimburseFinance, handleDeleteFinance } from './finance.js';
import { handleGetReviews, handleCreateReview, handleReviewItem, handleDeleteReview } from './reviews.js';
import { handleGetActivities, handleCreateActivity, handleDeleteActivity, handleSignupVolunteer, handleUnsignupVolunteer, handleGetActivityVolunteers } from './activities.js';
import { handleGetHallBookings, handleCreateHallBooking, handleWithdrawHallBooking, handleDeleteHallBooking, handleReviewHallBooking, handleGetHallPendingWithConflicts } from './halls.js';
import { handleUnlockAchievement, handleCheckCounts } from './achievements.js';
import { handleGetComments, handleCreateComment, handleUpdateComment, handleDeleteComment } from './comments.js';
import { handleGetFeedMessages, handleDeleteChatMessage, handleAddFeedComment, handleGetFeedComments } from './feed.js';
import { handleGetPolls, handleGetPoll, handleCreatePoll, handleVotePoll, handleGetPollResults, handleExportPollResults, handleDeletePoll, handleGetMyVote } from './polls.js';
import { handleGetMembers, handleGetRegistrations, handleApproveRegistration, handleRejectRegistration, handleDeleteUser, handleClearAll, handleGetAdminSettings, handleUpdateSettings, handleGetStorage, handleUpdateRole, handleGetAllUsers, handleGetUser, handleResetPassword, handleAdminChangeName, handleSetDepartment, handleBatchImport, handleBatchApprove } from './admin.js';
import { handleSync } from './sync.js';
import { handleGetBanner } from './banner.js';
import { handleGetPublicSettings } from './settings.js';
import { handleDutyStaffGet, handleDutyStaffCreate, handleDutyStaffUpload, handleDutyStaffDelete, handleDutyScheduleGenerate, handleDutyScheduleRange, handleDutyScheduleExport, handleDutyAttendanceToday, handleDutySignIn, handleDutySignOut, handleDutyScoresGet, handleDutyScoreModify, handleDutyScoreCancel, handleDutyScoreAdd, handleDutyScoreBatchCancel, handleDutyAdminsList, handleDutyPeriodsGet, handleDutyPeriodsUpdate, handleDutyScheduleManual, handleDutyScheduleManualDelete, handleDutyScheduleClearAll, handleDutyDepartmentStats } from './duty.js';
import { handleAdminGetFeatures, handleAdminToggleFeature, handleAdminInvite, handleAdminResetUser, handleAdminGetInvitations, handleGetPendingFeatures, handleRespondFeature, handleGetEnabledFeatures } from './features.js';
import { handleGetMessages, handleGetUnreadCount, handleMarkRead, handleMarkAllRead, handleDeleteMessage, handleClearRead } from './messages.js';

/* ═══════════════════════════════════════════════════════
   声明式路由表（原 292 行 if/else 重构而来）
   - p: 字符串精确路径 或 正则（匹配结果在 ctx.m）
   - m: HTTP 方法（null = 任意）
   - h: 处理函数，接收 { request, env, user, url, m }
   - owner: 需要网站管理者（owner）权限
   ═══════════════════════════════════════════════════════ */
const routes = [
  // Sync
  { p: '/api/sync', m: 'POST', h: c => handleSync(c.request, c.env) },
  // Captcha（自研图形验证码，无需登录）
  { p: '/api/captcha/generate', m: 'GET', h: async c => { const { token, svg } = await generateCaptcha(c.env); return json({ token, svg }, 200, { 'Cache-Control': 'no-store' }); } },
  // Auth
  { p: '/api/auth/login', m: 'POST', h: c => handleLogin(c.request, c.env) },
  { p: '/api/auth/signin', m: 'POST', h: c => handleLogin(c.request, c.env) },
  { p: '/api/auth/register', m: 'POST', h: c => handleRegister(c.request, c.env) },
  { p: '/api/auth/me', m: 'GET', h: c => handleMe(c.request, c.env) },
  { p: '/api/auth/check-name', m: 'GET', h: c => handleCheckName(c.request, c.env) },
  { p: '/api/auth/logout', m: 'POST', h: () => json({ message: '已登出' }, 200, { 'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' }) },
  { p: '/api/auth/change-password', m: 'POST', h: c => handleChangePassword(c.request, c.env, c.user) },
  { p: '/api/auth/change-name', m: 'POST', h: c => handleChangeName(c.request, c.env, c.user) },
  { p: '/api/auth/change-class', m: 'POST', h: c => handleChangeClass(c.request, c.env, c.user) },
  { p: '/api/auth/change-department', m: 'POST', h: c => handleChangeOwnDepartment(c.request, c.env, c.user) },
  // Issues
  { p: '/api/issues', m: 'GET', h: c => handleGetIssues(c.env) },
  { p: '/api/issues', m: 'POST', h: c => handleCreateIssue(c.request, c.env) },
  { p: /^\/api\/issues\/(\d+)\/status$/, m: 'PUT', h: c => handleUpdateIssueStatus(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/issues\/(\d+)$/, m: 'DELETE', h: c => handleDeleteIssue(c.request, c.env, c.m[1], c.user) },
  // Feedback
  { p: '/api/feedback', m: 'POST', h: c => handleCreateFeedback(c.request, c.env) },
  // Announcements
  { p: '/api/announcements/images', m: 'GET', h: c => handleGetAnnouncementImages(c.env, c.url.searchParams.get('ids')) },
  { p: '/api/announcements', m: 'GET', h: c => handleGetAnnouncements(c.env) },
  { p: '/api/announcements', m: 'POST', h: c => handleCreateAnnouncement(c.request, c.env, c.user) },
  { p: /^\/api\/announcements\/(\d+)$/, m: 'GET', h: c => handleGetAnnouncements(c.env, c.m[1]) },
  { p: /^\/api\/announcements\/(\d+)$/, m: 'DELETE', h: c => handleDeleteAnnouncement(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/announcements\/(\d+)$/, m: 'PUT', h: c => handleUpdateAnnouncement(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/announcements\/(\d+)\/status$/, m: 'PUT', h: c => handleReviewAnnouncement(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/announcements\/(\d+)\/images$/, m: 'POST', h: c => handleAddAnnouncementImage(c.request, c.env, c.m[1], c.user) },
  // Finance
  { p: '/api/finance', m: 'GET', h: c => handleGetFinance(c.env, c.user, c.url.searchParams.get('department')) },
  { p: '/api/finance', m: 'POST', h: c => handleCreateFinance(c.request, c.env, c.user) },
  { p: /^\/api\/finance\/(\d+)\/complete$/, m: 'PUT', h: c => handleCompleteFinance(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/finance\/(\d+)\/reimburse$/, m: 'PUT', h: c => handleReimburseFinance(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/finance\/(\d+)\/unreimburse$/, m: 'PUT', h: c => handleUnreimburseFinance(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/finance\/(\d+)$/, m: 'DELETE', h: c => handleDeleteFinance(c.request, c.env, c.m[1], c.user) },
  // Reviews
  { p: '/api/reviews', m: 'GET', h: c => handleGetReviews(c.env, c.user) },
  { p: '/api/reviews', m: 'POST', h: c => handleCreateReview(c.request, c.env, c.user) },
  { p: /^\/api\/reviews\/(\d+)\/review$/, m: 'PUT', h: c => handleReviewItem(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/reviews\/(\d+)$/, m: 'DELETE', h: c => handleDeleteReview(c.request, c.env, c.m[1], c.user) },
  // Banner
  { p: '/api/banner', m: 'GET', h: c => handleGetBanner(c.env) },
  // Activities
  { p: '/api/activities', m: 'GET', h: c => handleGetActivities(c.env, c.user) },
  { p: '/api/activities', m: 'POST', h: c => handleCreateActivity(c.request, c.env, c.user) },
  { p: /^\/api\/activities\/(\d+)\/volunteer$/, m: 'POST', h: c => handleSignupVolunteer(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/activities\/(\d+)\/volunteer$/, m: 'DELETE', h: c => handleUnsignupVolunteer(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/activities\/(\d+)\/volunteers$/, m: 'GET', h: c => handleGetActivityVolunteers(c.env, c.m[1]) },
  { p: /^\/api\/activities\/(\d+)$/, m: 'DELETE', h: c => handleDeleteActivity(c.request, c.env, c.m[1], c.user) },
  // Hall Bookings
  { p: '/api/hall/bookings', m: 'GET', h: c => handleGetHallBookings(c.env, c.user) },
  { p: '/api/hall/bookings', m: 'POST', h: c => handleCreateHallBooking(c.request, c.env, c.user) },
  { p: '/api/hall/bookings/pending', m: 'GET', h: c => handleGetHallPendingWithConflicts(c.env, c.user) },
  { p: /^\/api\/hall\/bookings\/(\d+)\/withdraw$/, m: 'POST', h: c => handleWithdrawHallBooking(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/hall\/bookings\/(\d+)$/, m: 'DELETE', h: c => handleDeleteHallBooking(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/hall\/bookings\/(\d+)\/review$/, m: 'POST', h: c => handleReviewHallBooking(c.request, c.env, c.m[1], c.user) },
  // Achievements
  { p: '/api/achievements/unlock', m: 'POST', h: c => handleUnlockAchievement(c.request, c.env, c.user) },
  { p: '/api/achievements/check-counts', m: 'POST', h: c => handleCheckCounts(c.request, c.env, c.user) },
  // Admin（统一权限检查见下方 path.startsWith('/api/admin')）
  { p: '/api/admin/members', m: 'GET', h: c => handleGetMembers(c.env, c.url) },
  { p: '/api/admin/registrations', m: 'GET', h: c => handleGetRegistrations(c.env) },
  { p: /^\/api\/admin\/registrations\/(\d+)\/approve$/, m: 'POST', h: c => handleApproveRegistration(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/registrations\/(\d+)\/reject$/, m: 'POST', h: c => handleRejectRegistration(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/users\/(\d+)$/, m: 'GET', h: c => handleGetUser(c.env, c.m[1]) },
  { p: /^\/api\/admin\/users\/(\d+)$/, m: 'DELETE', h: c => handleDeleteUser(c.request, c.env, c.m[1], c.user?.userId) },
  { p: /^\/api\/admin\/finance\/(\d+)$/, m: 'DELETE', h: c => handleDeleteFinance(c.request, c.env, c.m[1], c.user) },
  { p: '/api/admin/clear-all', m: 'POST', owner: true, h: c => handleClearAll(c.request, c.env) },
  { p: '/api/admin/settings', m: 'GET', h: c => handleGetAdminSettings(c.env) },
  { p: '/api/admin/settings', m: 'PUT', owner: true, h: c => handleUpdateSettings(c.request, c.env) },
  { p: '/api/admin/storage', m: 'GET', h: c => handleGetStorage(c.env) },
  { p: /^\/api\/admin\/users\/(\d+)\/role$/, m: 'PUT', h: c => handleUpdateRole(c.request, c.env, c.m[1], c.user) },
  { p: '/api/admin/users', m: 'GET', h: c => handleGetAllUsers(c.env, c.url) },
  { p: '/api/admin/users/batch-import', m: 'POST', h: c => handleBatchImport(c.request, c.env) },
  { p: '/api/admin/users/batch-approve', m: 'POST', h: c => handleBatchApprove(c.request, c.env) },
  { p: /^\/api\/admin\/users\/(\d+)\/reset-password$/, m: 'PUT', h: c => handleResetPassword(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/users\/(\d+)\/name$/, m: 'PUT', h: c => handleAdminChangeName(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/users\/(\d+)\/department$/, m: 'PUT', h: c => handleSetDepartment(c.request, c.env, c.m[1]) },
  { p: '/api/admin/feedback', m: 'GET', h: c => handleGetFeedback(c.env) },
  { p: /^\/api\/admin\/feedback\/(\d+)$/, m: 'DELETE', h: c => handleDeleteFeedback(c.env, c.m[1]) },
  // 功能开关管理
  { p: '/api/admin/features', m: 'GET', h: c => handleAdminGetFeatures(c.env) },
  { p: '/api/admin/features', m: 'POST', h: c => handleAdminToggleFeature(c.request, c.env) },
  { p: /^\/api\/admin\/features\/([a-z0-9_]+)\/invite$/, m: 'POST', h: c => handleAdminInvite(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/features\/([a-z0-9_]+)\/reset$/, m: 'POST', h: c => handleAdminResetUser(c.request, c.env, c.m[1]) },
  { p: /^\/api\/admin\/features\/([a-z0-9_]+)\/invitations$/, m: 'GET', h: c => handleAdminGetInvitations(c.env, c.url, c.m[1]) },
  // Features（用户端）
  { p: '/api/features/pending', m: 'GET', h: c => handleGetPendingFeatures(c.env, c.user) },
  { p: '/api/features/enabled', m: 'GET', h: c => handleGetEnabledFeatures(c.env, c.user) },
  { p: /^\/api\/features\/([a-z0-9_]+)\/respond$/, m: 'POST', h: c => handleRespondFeature(c.request, c.env, c.m[1], c.user) },
  // Messages
  { p: '/api/messages', m: 'GET', h: c => handleGetMessages(c.env, c.user, c.url) },
  { p: '/api/messages/unread-count', m: 'GET', h: c => handleGetUnreadCount(c.env, c.user) },
  { p: '/api/messages/read-all', m: 'POST', h: c => handleMarkAllRead(c.request, c.env, c.user) },
  { p: '/api/messages', m: 'DELETE', h: c => handleClearRead(c.env, c.user) },
  { p: /^\/api\/messages\/(\d+)$/, m: 'POST', h: c => handleMarkRead(c.env, c.user, c.m[1]) },
  { p: /^\/api\/messages\/(\d+)$/, m: 'DELETE', h: c => handleDeleteMessage(c.env, c.user, c.m[1]) },
  // Comments
  { p: /^\/api\/comments\/(announcement|issue)\/(\d+)$/, m: 'GET', h: c => handleGetComments(c.env, c.m[1], c.m[2]) },
  { p: '/api/comments', m: 'POST', h: c => handleCreateComment(c.request, c.env, c.user) },
  { p: /^\/api\/comments\/(\d+)$/, m: 'PUT', h: c => handleUpdateComment(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/comments\/(\d+)$/, m: 'DELETE', h: c => handleDeleteComment(c.request, c.env, c.m[1], c.user) },
  // Public settings
  { p: '/api/settings', m: 'GET', h: c => handleGetPublicSettings(c.env) },
  // Feed (formerly Chat)
  { p: '/api/chat/messages', m: 'GET', h: c => handleGetFeedMessages(c.env, c.user, c.url) },
  { p: /^\/api\/chat\/messages\/(\d+)$/, m: 'DELETE', h: c => handleDeleteChatMessage(c.env, c.m[1], c.request, c.user) },
  { p: /^\/api\/feed\/(\d+)\/comment$/, m: 'POST', h: c => handleAddFeedComment(c.request, c.env, c.m[1], c.user) },
  { p: /^\/api\/feed\/(\d+)\/comments$/, m: 'GET', h: c => handleGetFeedComments(c.env, c.m[1]) },
  // Polls
  { p: '/api/polls', m: 'GET', h: c => handleGetPolls(c.env) },
  { p: '/api/polls', m: 'POST', h: c => handleCreatePoll(c.request, c.env, c.user) },
  { p: /^\/api\/polls\/(\d+)$/, m: 'GET', h: c => handleGetPoll(c.env, c.m[1]) },
  { p: /^\/api\/polls\/(\d+)\/vote$/, m: 'POST', h: c => handleVotePoll(c.request, c.env, c.m[1]) },
  { p: /^\/api\/polls\/(\d+)\/results$/, m: 'GET', h: c => handleGetPollResults(c.env, c.m[1], c.user) },
  { p: /^\/api\/polls\/(\d+)\/export$/, m: 'GET', h: c => handleExportPollResults(c.env, c.m[1], c.user) },
  { p: /^\/api\/polls\/(\d+)\/my-vote$/, m: 'GET', h: c => handleGetMyVote(c.env, c.m[1], c.request) },
  { p: /^\/api\/polls\/(\d+)$/, m: 'DELETE', h: c => handleDeletePoll(c.request, c.env, c.m[1], c.user) },
  // Duty
  { p: '/api/duty/staff', m: 'GET', h: c => handleDutyStaffGet(c.env) },
  { p: '/api/duty/staff', m: 'POST', h: c => handleDutyStaffCreate(c.request, c.env, c.user) },
  { p: '/api/duty/staff/upload', m: 'POST', h: c => handleDutyStaffUpload(c.request, c.env, c.user) },
  { p: /^\/api\/duty\/staff\/(\d+)$/, m: 'DELETE', h: c => handleDutyStaffDelete(c.request, c.env, c.user, c.m[1]) },
  { p: '/api/duty/schedule/generate', m: 'POST', h: c => handleDutyScheduleGenerate(c.request, c.env, c.user) },
  { p: '/api/duty/schedule/today', m: 'GET', h: c => handleDutyAttendanceToday(c.env) },
  { p: '/api/duty/schedule', m: 'GET', h: c => handleDutyScheduleRange(c.env, c.url) },
  { p: '/api/duty/schedule/export', m: 'GET', h: c => handleDutyScheduleExport(c.env, c.url) },
  { p: '/api/duty/attendance/today', m: 'GET', h: c => handleDutyAttendanceToday(c.env) },
  { p: '/api/duty/attendance/sign-in', m: 'POST', h: c => handleDutySignIn(c.request, c.env, c.user) },
  { p: '/api/duty/attendance/sign-out', m: 'POST', h: c => handleDutySignOut(c.request, c.env, c.user) },
  { p: '/api/duty/scores', m: 'GET', h: c => handleDutyScoresGet(c.env, c.url) },
  { p: '/api/duty/scores/add', m: 'POST', h: c => handleDutyScoreAdd(c.request, c.env, c.user) },
  { p: '/api/duty/scores/modify', m: 'POST', h: c => handleDutyScoreModify(c.request, c.env, c.user) },
  { p: '/api/duty/scores/cancel', m: 'POST', h: c => handleDutyScoreCancel(c.request, c.env) },
  { p: '/api/duty/scores/batch-cancel', m: 'POST', h: c => handleDutyScoreBatchCancel(c.request, c.env, c.user) },
  { p: '/api/duty/department-stats', m: 'GET', h: c => handleDutyDepartmentStats(c.env, c.url) },
  { p: '/api/duty/schedule/manual', m: 'POST', h: c => handleDutyScheduleManual(c.request, c.env, c.user) },
  { p: '/api/duty/schedule/manual', m: 'DELETE', h: c => handleDutyScheduleManualDelete(c.request, c.env, c.user) },
  { p: '/api/duty/schedule/clear-all', m: 'POST', h: c => handleDutyScheduleClearAll(c.request, c.env, c.user) },
  { p: '/api/duty/periods', m: 'GET', h: c => handleDutyPeriodsGet(c.env) },
  { p: '/api/duty/periods', m: 'PUT', h: c => handleDutyPeriodsUpdate(c.request, c.env, c.user) },
  { p: '/api/duty/admins', m: 'GET', h: c => handleDutyAdminsList(c.env) },
];

// 路由匹配（独立导出，供单元测试直接验证真实逻辑）
export function matchRoute(path, method) {
  for (const r of routes) {
    let m = null;
    if (typeof r.p === 'string') {
      if (r.p !== path) continue;
    } else {
      m = path.match(r.p);
      if (!m) continue;
    }
    if (r.m && r.m !== method) continue;
    return { r, m };
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    await initDB(env);
  } catch {
    return error('服务器初始化失败', 500);
  }

  try {
    setCleanupCount(await autoCleanup(env));
  } catch {}

  try {
    const closed = await checkSiteClosed(request, env);
    if (closed) return error(closed, 503);
  } catch {
    return error('服务器内部错误', 500);
  }

  let user;
  try {
    user = await requireMember(request, env);
  } catch {
    return error('服务器内部错误', 500);
  }

  // Admin 前缀统一权限检查（与管理员接口同属一处维护）
  if (path.startsWith('/api/admin') && !(user && isAdmin(user))) {
    return error('需要管理员权限', 403);
  }

  const hit = matchRoute(path, method);
  if (!hit) {
    if (path.startsWith('/api/admin')) return error('未知的管理接口', 404);
    return error('接口不存在', 404);
  }
  try {
    if (hit.r.owner && !isOwner(user)) return error('需要网站管理者权限', 403);
    return await hit.r.h({ request, env, user, url, m: hit.m });
  } catch (e) {
    console.error('API Error:', e);
    return error('服务器内部错误，请稍后重试', 500);
  }
}
