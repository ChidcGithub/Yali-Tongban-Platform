import { json, error, setCleanupCount, checkSiteClosed, requireMember, autoCleanup, initDB, isAdmin, isOwner, parseBody, signTokenForUser, respondWithToken, setTokenCookie, addAchievementBatchEntry, generateCaptcha, verifyCaptcha } from './_utils.js';
import { handleLogin, handleRegister, handleMe, handleCheckName, handleChangePassword, handleChangeName, handleChangeClass, handleChangeOwnDepartment } from './auth.js';
import { handleGetIssues, handleCreateIssue, handleUpdateIssueStatus, handleDeleteIssue } from './issues.js';
import { handleCreateFeedback, handleGetFeedback, handleDeleteFeedback } from './feedback.js';
import { handleGetAnnouncements, handleCreateAnnouncement, handleDeleteAnnouncement, handleUpdateAnnouncement, handleReviewAnnouncement, handleAddAnnouncementImage } from './announcements.js';
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

  try {
    // Sync
    if (path === '/api/sync' && method === 'POST') return handleSync(request, env);

    // Captcha（自研图形验证码，无需登录）
    if (path === '/api/captcha/generate' && method === 'GET') {
      const { token, svg } = await generateCaptcha(env);
      return json({ token, svg }, 200, { 'Cache-Control': 'no-store' });
    }

    // Auth
    if ((path === '/api/auth/login' || path === '/api/auth/signin') && method === 'POST') return handleLogin(request, env);
    if (path === '/api/auth/register' && method === 'POST') return handleRegister(request, env);
    if (path === '/api/auth/me' && method === 'GET') return handleMe(request, env);
    if (path === '/api/auth/check-name' && method === 'GET') return handleCheckName(request, env);
    if (path === '/api/auth/logout' && method === 'POST') {
      return json({ message: '已登出' }, 200, { 'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (path === '/api/auth/change-password' && method === 'POST') return handleChangePassword(request, env, user);
    if (path === '/api/auth/change-name' && method === 'POST') return handleChangeName(request, env, user);
    if (path === '/api/auth/change-class' && method === 'POST') return handleChangeClass(request, env, user);
    if (path === '/api/auth/change-department' && method === 'POST') return handleChangeOwnDepartment(request, env, user);

    // Issues
    if (path === '/api/issues' && method === 'GET') return handleGetIssues(env);
    if (path === '/api/issues' && method === 'POST') return handleCreateIssue(request, env);
    const issueMatch = path.match(/^\/api\/issues\/(\d+)\/status$/);
    if (issueMatch && method === 'PUT') return handleUpdateIssueStatus(request, env, issueMatch[1], user);
    const issueDel = path.match(/^\/api\/issues\/(\d+)$/);
    if (issueDel && method === 'DELETE') return handleDeleteIssue(request, env, issueDel[1], user);

    // Feedback
    if (path === '/api/feedback' && method === 'POST') return handleCreateFeedback(request, env);

    // Announcements
    if (path === '/api/announcements' && method === 'GET') return handleGetAnnouncements(env);
    if (path === '/api/announcements' && method === 'POST') return handleCreateAnnouncement(request, env, user);
    const announceIdMatch = path.match(/^\/api\/announcements\/(\d+)$/);
    if (announceIdMatch) {
      if (method === 'GET') return handleGetAnnouncements(env, announceIdMatch[1]);
      if (method === 'DELETE') return handleDeleteAnnouncement(request, env, announceIdMatch[1], user);
      if (method === 'PUT') return handleUpdateAnnouncement(request, env, announceIdMatch[1], user);
    }
    const reviewAnnounceMatch = path.match(/^\/api\/announcements\/(\d+)\/status$/);
    if (reviewAnnounceMatch && method === 'PUT') return handleReviewAnnouncement(request, env, reviewAnnounceMatch[1], user);
    const announceImagesMatch = path.match(/^\/api\/announcements\/(\d+)\/images$/);
    if (announceImagesMatch && method === 'POST') return handleAddAnnouncementImage(request, env, announceImagesMatch[1], user);

    // Finance
    if (path === '/api/finance' && method === 'GET') return handleGetFinance(env, user, url.searchParams.get('department'));
    if (path === '/api/finance' && method === 'POST') return handleCreateFinance(request, env, user);
    const financeMatch = path.match(/^\/api\/finance\/(\d+)\/complete$/);
    if (financeMatch && method === 'PUT') return handleCompleteFinance(request, env, financeMatch[1], user);
    const financeReimburseMatch = path.match(/^\/api\/finance\/(\d+)\/reimburse$/);
    if (financeReimburseMatch && method === 'PUT') return handleReimburseFinance(request, env, financeReimburseMatch[1], user);
    const financeUnreimburseMatch = path.match(/^\/api\/finance\/(\d+)\/unreimburse$/);
    if (financeUnreimburseMatch && method === 'PUT') return handleUnreimburseFinance(request, env, financeUnreimburseMatch[1], user);
    const financeDeleteMatch = path.match(/^\/api\/finance\/(\d+)$/);
    if (financeDeleteMatch && method === 'DELETE') return handleDeleteFinance(request, env, financeDeleteMatch[1], user);

    // Reviews
    if (path === '/api/reviews' && method === 'GET') return handleGetReviews(env, user);
    if (path === '/api/reviews' && method === 'POST') return handleCreateReview(request, env, user);
    const reviewMatch = path.match(/^\/api\/reviews\/(\d+)\/review$/);
    if (reviewMatch && method === 'PUT') return handleReviewItem(request, env, reviewMatch[1], user);
    const reviewDel = path.match(/^\/api\/reviews\/(\d+)$/);
    if (reviewDel && method === 'DELETE') return handleDeleteReview(request, env, reviewDel[1], user);

    // Banner
    if (path === '/api/banner' && method === 'GET') return handleGetBanner(env);

    // Activities
    if (path === '/api/activities' && method === 'GET') return handleGetActivities(env, user);
    if (path === '/api/activities' && method === 'POST') return handleCreateActivity(request, env, user);
    const activityVolunteer = path.match(/^\/api\/activities\/(\d+)\/volunteer$/);
    if (activityVolunteer) {
      if (method === 'POST') return handleSignupVolunteer(request, env, activityVolunteer[1], user);
      if (method === 'DELETE') return handleUnsignupVolunteer(request, env, activityVolunteer[1], user);
    }
    const activityVolunteersList = path.match(/^\/api\/activities\/(\d+)\/volunteers$/);
    if (activityVolunteersList && method === 'GET') return handleGetActivityVolunteers(env, activityVolunteersList[1]);
    const activityDel = path.match(/^\/api\/activities\/(\d+)$/);
    if (activityDel && method === 'DELETE') return handleDeleteActivity(request, env, activityDel[1], user);

    // Hall Bookings
    if (path === '/api/hall/bookings' && method === 'GET') return handleGetHallBookings(env, user);
    if (path === '/api/hall/bookings' && method === 'POST') return handleCreateHallBooking(request, env, user);
    if (path === '/api/hall/bookings/pending' && method === 'GET') return handleGetHallPendingWithConflicts(env, user);
    const hallWithdrawMatch = path.match(/^\/api\/hall\/bookings\/(\d+)\/withdraw$/);
    if (hallWithdrawMatch && method === 'POST') return handleWithdrawHallBooking(request, env, hallWithdrawMatch[1], user);
    const hallDeleteMatch = path.match(/^\/api\/hall\/bookings\/(\d+)$/);
    if (hallDeleteMatch && method === 'DELETE') return handleDeleteHallBooking(request, env, hallDeleteMatch[1], user);
    const hallReviewMatch = path.match(/^\/api\/hall\/bookings\/(\d+)\/review$/);
    if (hallReviewMatch && method === 'POST') return handleReviewHallBooking(request, env, hallReviewMatch[1], user);

    // Achievements
    if (path === '/api/achievements/unlock' && method === 'POST') return handleUnlockAchievement(request, env, user);
    if (path === '/api/achievements/check-counts' && method === 'POST') return handleCheckCounts(request, env, user);

    // Admin
    if (path.startsWith('/api/admin')) {
      if (!user || !isAdmin(user)) return error('需要管理员权限', 403);
      if (path === '/api/admin/members' && method === 'GET') return handleGetMembers(env, url);
      if (path === '/api/admin/registrations' && method === 'GET') return handleGetRegistrations(env);
      const approveMatch = path.match(/^\/api\/admin\/registrations\/(\d+)\/approve$/);
      if (approveMatch && method === 'POST') return handleApproveRegistration(request, env, approveMatch[1]);
      const rejectMatch = path.match(/^\/api\/admin\/registrations\/(\d+)\/reject$/);
      if (rejectMatch && method === 'POST') return handleRejectRegistration(request, env, rejectMatch[1]);
      const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
      if (userMatch && method === 'GET') return handleGetUser(env, userMatch[1]);
      if (userMatch && method === 'DELETE') return handleDeleteUser(request, env, userMatch[1], user?.userId);
      const delFinanceMatch = path.match(/^\/api\/admin\/finance\/(\d+)$/);
      if (delFinanceMatch && method === 'DELETE') return handleDeleteFinance(request, env, delFinanceMatch[1], user);
      if (path === '/api/admin/clear-all' && method === 'POST') {
        if (!isOwner(user)) return error('需要网站管理者权限', 403);
        return handleClearAll(request, env);
      }
      if (path === '/api/admin/settings' && method === 'GET') return handleGetAdminSettings(env);
      if (path === '/api/admin/settings' && method === 'PUT') {
        if (!isOwner(user)) return error('需要网站管理者权限', 403);
        return handleUpdateSettings(request, env);
      }
      if (path === '/api/admin/storage' && method === 'GET') return handleGetStorage(env);
      const roleMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
      if (roleMatch && method === 'PUT') return handleUpdateRole(request, env, roleMatch[1], user);
      if (path === '/api/admin/users' && method === 'GET') return handleGetAllUsers(env, url);
      if (path === '/api/admin/users/batch-import' && method === 'POST') return handleBatchImport(request, env);
      if (path === '/api/admin/users/batch-approve' && method === 'POST') return handleBatchApprove(request, env);
      const resetPwdMatch = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
      if (resetPwdMatch && method === 'PUT') return handleResetPassword(request, env, resetPwdMatch[1]);
      const adminNameMatch = path.match(/^\/api\/admin\/users\/(\d+)\/name$/);
      if (adminNameMatch && method === 'PUT') return handleAdminChangeName(request, env, adminNameMatch[1]);
      const deptMatch = path.match(/^\/api\/admin\/users\/(\d+)\/department$/);
      if (deptMatch && method === 'PUT') return handleSetDepartment(request, env, deptMatch[1]);
      if (path === '/api/admin/feedback' && method === 'GET') return handleGetFeedback(env);
      const feedbackDel = path.match(/^\/api\/admin\/feedback\/(\d+)$/);
      if (feedbackDel && method === 'DELETE') return handleDeleteFeedback(env, feedbackDel[1]);
      // 功能开关管理
      if (path === '/api/admin/features' && method === 'GET') return handleAdminGetFeatures(env);
      if (path === '/api/admin/features' && method === 'POST') return handleAdminToggleFeature(request, env);
      const featureInviteMatch = path.match(/^\/api\/admin\/features\/([a-z0-9_]+)\/invite$/);
      if (featureInviteMatch && method === 'POST') return handleAdminInvite(request, env, featureInviteMatch[1]);
      const featureResetMatch = path.match(/^\/api\/admin\/features\/([a-z0-9_]+)\/reset$/);
      if (featureResetMatch && method === 'POST') return handleAdminResetUser(request, env, featureResetMatch[1]);
      const featureInvitationsMatch = path.match(/^\/api\/admin\/features\/([a-z0-9_]+)\/invitations$/);
      if (featureInvitationsMatch && method === 'GET') return handleAdminGetInvitations(env, url, featureInvitationsMatch[1]);
      return error('未知的管理接口', 404);
    }

    // Features（用户端）
    if (path === '/api/features/pending' && method === 'GET') return handleGetPendingFeatures(env, user);
    if (path === '/api/features/enabled' && method === 'GET') return handleGetEnabledFeatures(env, user);
    const featureRespondMatch = path.match(/^\/api\/features\/([a-z0-9_]+)\/respond$/);
    if (featureRespondMatch && method === 'POST') return handleRespondFeature(request, env, featureRespondMatch[1], user);

    // Messages
    if (path === '/api/messages' && method === 'GET') return handleGetMessages(env, user, url);
    if (path === '/api/messages/unread-count' && method === 'GET') return handleGetUnreadCount(env, user);
    if (path === '/api/messages/read-all' && method === 'POST') return handleMarkAllRead(request, env, user);
    if (path === '/api/messages' && method === 'DELETE') return handleClearRead(env, user);
    const msgIdMatch = path.match(/^\/api\/messages\/(\d+)$/);
    if (msgIdMatch && method === 'POST') return handleMarkRead(env, user, msgIdMatch[1]);
    if (msgIdMatch && method === 'DELETE') return handleDeleteMessage(env, user, msgIdMatch[1]);

    // Comments
    const commentsGetMatch = path.match(/^\/api\/comments\/(announcement|issue)\/(\d+)$/);
    if (commentsGetMatch && method === 'GET') return handleGetComments(env, commentsGetMatch[1], commentsGetMatch[2]);
    if (path === '/api/comments' && method === 'POST') return handleCreateComment(request, env, user);
    const commentsEditMatch = path.match(/^\/api\/comments\/(\d+)$/);
    if (commentsEditMatch && method === 'PUT') return handleUpdateComment(request, env, commentsEditMatch[1], user);
    if (commentsEditMatch && method === 'DELETE') return handleDeleteComment(request, env, commentsEditMatch[1], user);

    // Public settings
    if (path === '/api/settings' && method === 'GET') return handleGetPublicSettings(env);

    // Feed (formerly Chat)
    if (path === '/api/chat/messages' && method === 'GET') {
      return handleGetFeedMessages(env, user, url);
    }
    const feedDelMatch = path.match(/^\/api\/chat\/messages\/(\d+)$/);
    if (feedDelMatch && method === 'DELETE') return handleDeleteChatMessage(env, feedDelMatch[1], request, user);
    const feedCommentMatch = path.match(/^\/api\/feed\/(\d+)\/comment$/);
    if (feedCommentMatch && method === 'POST') return handleAddFeedComment(request, env, feedCommentMatch[1], user);
    const feedCommentsMatch = path.match(/^\/api\/feed\/(\d+)\/comments$/);
    if (feedCommentsMatch && method === 'GET') return handleGetFeedComments(env, feedCommentsMatch[1]);

    // Polls
    if (path === '/api/polls' && method === 'GET') return handleGetPolls(env);
    if (path === '/api/polls' && method === 'POST') return handleCreatePoll(request, env, user);
    const pollGetMatch = path.match(/^\/api\/polls\/(\d+)$/);
    if (pollGetMatch && method === 'GET') return handleGetPoll(env, pollGetMatch[1]);
    const pollVoteMatch = path.match(/^\/api\/polls\/(\d+)\/vote$/);
    if (pollVoteMatch && method === 'POST') return handleVotePoll(request, env, pollVoteMatch[1]);
    const pollResultsMatch = path.match(/^\/api\/polls\/(\d+)\/results$/);
    if (pollResultsMatch && method === 'GET') return handleGetPollResults(env, pollResultsMatch[1], user);
    const pollExportMatch = path.match(/^\/api\/polls\/(\d+)\/export$/);
    if (pollExportMatch && method === 'GET') return handleExportPollResults(env, pollExportMatch[1], user);
    const pollMyVoteMatch = path.match(/^\/api\/polls\/(\d+)\/my-vote$/);
    if (pollMyVoteMatch && method === 'GET') return handleGetMyVote(env, pollMyVoteMatch[1], request);
    const pollDelMatch = path.match(/^\/api\/polls\/(\d+)$/);
    if (pollDelMatch && method === 'DELETE') return handleDeletePoll(request, env, pollDelMatch[1], user);

    // Duty
    if (path === '/api/duty/staff' && method === 'GET') return handleDutyStaffGet(env);
    if (path === '/api/duty/staff' && method === 'POST') return handleDutyStaffCreate(request, env, user);
    if (path === '/api/duty/staff/upload' && method === 'POST') return handleDutyStaffUpload(request, env, user);
    const dutyStaffDel = path.match(/^\/api\/duty\/staff\/(\d+)$/);
    if (dutyStaffDel && method === 'DELETE') return handleDutyStaffDelete(request, env, user, dutyStaffDel[1]);

    if (path === '/api/duty/schedule/generate' && method === 'POST') return handleDutyScheduleGenerate(request, env, user);
    if (path === '/api/duty/schedule/today' && method === 'GET') return handleDutyAttendanceToday(env);
    if (path === '/api/duty/schedule' && method === 'GET') return handleDutyScheduleRange(env, url);
    if (path === '/api/duty/schedule/export' && method === 'GET') return handleDutyScheduleExport(env, url);

    if (path === '/api/duty/attendance/today' && method === 'GET') return handleDutyAttendanceToday(env);
    if (path === '/api/duty/attendance/sign-in' && method === 'POST') return handleDutySignIn(request, env, user);
    if (path === '/api/duty/attendance/sign-out' && method === 'POST') return handleDutySignOut(request, env, user);

    if (path === '/api/duty/scores' && method === 'GET') return handleDutyScoresGet(env, url);
    if (path === '/api/duty/scores/add' && method === 'POST') return handleDutyScoreAdd(request, env, user);
    if (path === '/api/duty/scores/modify' && method === 'POST') return handleDutyScoreModify(request, env, user);
    if (path === '/api/duty/scores/cancel' && method === 'POST') return handleDutyScoreCancel(request, env);
    if (path === '/api/duty/scores/batch-cancel' && method === 'POST') return handleDutyScoreBatchCancel(request, env, user);

    if (path === '/api/duty/department-stats' && method === 'GET') return handleDutyDepartmentStats(env, url);

    if (path === '/api/duty/schedule/manual' && method === 'POST') return handleDutyScheduleManual(request, env, user);
    if (path === '/api/duty/schedule/manual' && method === 'DELETE') return handleDutyScheduleManualDelete(request, env, user);
    if (path === '/api/duty/schedule/clear-all' && method === 'POST') return handleDutyScheduleClearAll(request, env, user);

    if (path === '/api/duty/periods' && method === 'GET') return handleDutyPeriodsGet(env);
    if (path === '/api/duty/periods' && method === 'PUT') return handleDutyPeriodsUpdate(request, env, user);

    if (path === '/api/duty/admins' && method === 'GET') return handleDutyAdminsList(env);

    return error('接口不存在', 404);
  } catch (e) {
    console.error('API Error:', e);
    return error('服务器内部错误，请稍后重试', 500);
  }
}
