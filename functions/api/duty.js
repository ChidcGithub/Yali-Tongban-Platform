import { json, error, isAdmin, parseBody, SALT_ROUNDS, createNotification } from './_utils.js';
import bcrypt from 'bcryptjs';

// ========== Staff ==========

export async function handleDutyStaffGet(env) {
  const rows = await env.DB.prepare(
    "SELECT id, user_id, department, class, name, is_active, created_at FROM duty_staff ORDER BY department, class"
  ).all();
  return json(rows.results || []);
}

export async function handleDutyStaffCreate(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const { department, class: cls, name } = body;
  if (!department || !cls || !name) return error('缺少必填字段', 400);

  const matched = await env.DB.prepare(
    "SELECT id FROM users WHERE class_name=? AND name=? LIMIT 1"
  ).bind(cls, name).first();

  let password = '';
  if (matched) {
    await env.DB.prepare("INSERT INTO duty_staff (user_id, department, class, name) VALUES (?,?,?,?)").bind(matched.id, department, cls, name).run();
  } else {
    password = Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await env.DB.prepare("INSERT INTO duty_staff (user_id, department, class, name, password) VALUES (0,?,?,?,?)").bind(department, cls, name, hash).run();
  }

  return json({ message: '已添加', password: password || undefined });
}

export async function handleDutyStaffUpload(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const list = (body.staffList || []).filter(s => s && s.class && s.name && s.department);
  const result = { inserted: 0, warnings: [] };
  const ops = [];

  for (const s of list) {
    const matched = await env.DB.prepare("SELECT id FROM users WHERE class_name=? AND name=? LIMIT 1").bind(s.class, s.name).first();
    if (matched) {
      ops.push(env.DB.prepare("INSERT INTO duty_staff (user_id, department, class, name) VALUES (?,?,?,?)").bind(matched.id, s.department, s.class, s.name));
      result.inserted++;
    } else {
      const password = Math.random().toString(36).slice(2, 8);
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      ops.push(env.DB.prepare("INSERT INTO duty_staff (user_id, department, class, name, password) VALUES (0,?,?,?,?)").bind(s.department, s.class, s.name, hash));
      result.inserted++;
      result.warnings.push({ row: `${s.class} ${s.name}`, reason: '未在平台注册，已分配初始密码' });
    }
  }

  if (ops.length > 0) await env.DB.batch(ops);
  return json(result);
}

export async function handleDutyStaffDelete(request, env, user, id) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM duty_attendance WHERE staff_id=?").bind(id),
    env.DB.prepare("DELETE FROM duty_score_record WHERE staff_id=?").bind(id),
    env.DB.prepare("DELETE FROM duty_staff WHERE id=?").bind(id),
  ]);
  const dr = await env.DB.prepare("SELECT changes()").first();
  if (!dr || dr['changes()'] === 0) return error('干事不存在', 404);
  return json({ message: '已移除' });
}

// ========== Schedule ==========

export async function handleDutyScheduleGenerate(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const staff = await env.DB.prepare("SELECT id FROM duty_staff WHERE is_active=1 ORDER BY id").all();
  const ids = (staff.results || []).map(s => s.id);
  if (ids.length < 2) return error('至少需要2名活跃干事', 400);

  const last = await env.DB.prepare("SELECT date FROM duty_schedule ORDER BY date DESC LIMIT 1").first();
  const start = last ? new Date(last.date + 'T00:00:00') : new Date();
  start.setDate(start.getDate() + 1);

  const lastSch = await env.DB.prepare("SELECT staff_a_id FROM duty_schedule ORDER BY id DESC LIMIT 1").first();
  let dayIdx = 0;
  if (lastSch) { const li = ids.indexOf(lastSch.staff_a_id); if (li >= 0) dayIdx = Math.floor(li / 2) + 1; }

  let gen = 0;
  const d = new Date(start);
  const inserts = [];
  for (let i = 0; i < 60; i++) {
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const ds = d.toISOString().slice(0, 10);
    const ex = await env.DB.prepare("SELECT id FROM duty_schedule WHERE date=?").bind(ds).first();
    if (ex) continue;
    const aIdx = dayIdx % ids.length;
    let bIdx = (dayIdx + 1) % ids.length;
    if (bIdx === aIdx) bIdx = (bIdx + 1) % ids.length;
    inserts.push(env.DB.prepare("INSERT OR IGNORE INTO duty_schedule (date, staff_a_id, staff_b_id) VALUES (?,?,?)").bind(ds, ids[aIdx], ids[bIdx]));
    gen++;
    dayIdx++;
  }

  if (inserts.length > 0) await env.DB.batch(inserts);
  return json({ generated: gen });
}

export async function handleDutyScheduleRange(env, url) {
  const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get('end');
  let q = "SELECT ds.*, a.department a_dept, a.class a_class, a.name a_name, b.department b_dept, b.class b_class, b.name b_name FROM duty_schedule ds LEFT JOIN duty_staff a ON ds.staff_a_id=a.id LEFT JOIN duty_staff b ON ds.staff_b_id=b.id WHERE ds.date>=?";
  const p = [start];
  if (end) { q += " AND ds.date<=?"; p.push(end); }
  q += " ORDER BY ds.date";
  const rows = await env.DB.prepare(q).bind(...p).all();
  return json(rows.results || []);
}

export async function handleDutyScheduleExport(env, url) {
  const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get('end');
  let q = "SELECT ds.*, a.department a_dept, a.class a_class, a.name a_name, b.department b_dept, b.class b_class, b.name b_name FROM duty_schedule ds LEFT JOIN duty_staff a ON ds.staff_a_id=a.id LEFT JOIN duty_staff b ON ds.staff_b_id=b.id WHERE ds.date>=?";
  const p = [start];
  if (end) { q += " AND ds.date<=?"; p.push(end); }
  q += " ORDER BY ds.date";
  const rows = await env.DB.prepare(q).bind(...p).all();
  let csv = "日期,干事A,干事B\n";
  for (const r of (rows.results || [])) {
    const aName = `${r.a_dept || ''}${r.a_class || ''} ${r.a_name || ''}`.trim();
    const bName = `${r.b_dept || ''}${r.b_class || ''} ${r.b_name || ''}`.trim();
    csv += `${r.date},${aName},${bName}\n`;
  }
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=schedule.csv' } });
}

// ========== Attendance ==========

async function autoMarkAbsent(env, schedule, today, periods, now) {
  const ops = [];
  for (const p of (periods || [])) {
    if (p.slot_type === 'no_duty') continue;
    const [h, m] = (p.start_time || '08:00').split(':').map(Number);
    const deadline = new Date(today + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
    deadline.setMinutes(deadline.getMinutes() + (p.auto_absent_min || 10) - 480);
    if (now <= deadline) continue;

    if (p.slot_type === 'small_break') {
      const aAttr = await env.DB.prepare("SELECT status FROM duty_attendance WHERE schedule_id=? AND staff_id=? AND period=?").bind(schedule.id, schedule.staff_a_id, p.label).first();
      const bAttr = await env.DB.prepare("SELECT status FROM duty_attendance WHERE schedule_id=? AND staff_id=? AND period=?").bind(schedule.id, schedule.staff_b_id, p.label).first();
      const aOk = aAttr && (aAttr.status === 'signed_in' || aAttr.status === 'completed');
      const bOk = bAttr && (bAttr.status === 'signed_in' || bAttr.status === 'completed');
      if (aOk || bOk) continue;
      for (const sid of [schedule.staff_a_id, schedule.staff_b_id]) {
        ops.push(env.DB.prepare("INSERT OR IGNORE INTO duty_attendance (schedule_id, staff_id, period, status, score_absent) VALUES (?,?,?,'absent',-1)").bind(schedule.id, sid, p.label));
        ops.push(env.DB.prepare("UPDATE duty_attendance SET status='absent', score_absent=-1 WHERE schedule_id=? AND staff_id=? AND period=? AND status='pending'").bind(schedule.id, sid, p.label));
        const dup = await env.DB.prepare("SELECT id FROM duty_score_record WHERE staff_id=? AND date=? AND period=? AND reason='缺岗' AND is_cancelled=0").bind(sid, today, p.label).first();
        if (!dup) ops.push(env.DB.prepare(
          "INSERT INTO duty_score_record (staff_id, date, period, score, reason, recorder) VALUES (?,?,?,?,?,?)"
        ).bind(sid, today, p.label, -1, '缺岗', 'system'));
      }
    } else {
      for (const sid of [schedule.staff_a_id, schedule.staff_b_id]) {
        const att = await env.DB.prepare("SELECT status FROM duty_attendance WHERE schedule_id=? AND staff_id=? AND period=?").bind(schedule.id, sid, p.label).first();
        if (att && (att.status === 'signed_in' || att.status === 'completed')) continue;
        ops.push(env.DB.prepare("INSERT OR IGNORE INTO duty_attendance (schedule_id, staff_id, period, status, score_absent) VALUES (?,?,?,'absent',-1)").bind(schedule.id, sid, p.label));
        ops.push(env.DB.prepare("UPDATE duty_attendance SET status='absent', score_absent=-1 WHERE schedule_id=? AND staff_id=? AND period=? AND status='pending'").bind(schedule.id, sid, p.label));
        const dup = await env.DB.prepare("SELECT id FROM duty_score_record WHERE staff_id=? AND date=? AND period=? AND reason='缺岗' AND is_cancelled=0").bind(sid, today, p.label).first();
        if (!dup) ops.push(env.DB.prepare(
          "INSERT INTO duty_score_record (staff_id, date, period, score, reason, recorder) VALUES (?,?,?,?,?,?)"
        ).bind(sid, today, p.label, -1, '缺岗', 'system'));
      }
    }
  }
  if (ops.length > 0) await env.DB.batch(ops);
}

export async function handleDutyAttendanceToday(env) {
  const beijingNow = new Date(Date.now() + 8 * 3600 * 1000);
  const today = beijingNow.toISOString().slice(0, 10);
  const schedule = await env.DB.prepare(
    "SELECT ds.*, a.department a_dept, a.class a_class, a.name a_name, a.user_id a_uid, b.department b_dept, b.class b_class, b.name b_name, b.user_id b_uid FROM duty_schedule ds LEFT JOIN duty_staff a ON ds.staff_a_id=a.id LEFT JOIN duty_staff b ON ds.staff_b_id=b.id WHERE ds.date=?"
  ).bind(today).first();

  if (!schedule) return json({ date: today, staff_a: null, staff_b: null, periods: [] });

  const periods = await env.DB.prepare("SELECT * FROM duty_period_config ORDER BY sort_order").all();
  await autoMarkAbsent(env, schedule, today, periods.results, new Date());

  const attRows = await env.DB.prepare("SELECT * FROM duty_attendance WHERE schedule_id=?").bind(schedule.id).all();
  const map = {};
  for (const a of (attRows.results || [])) map[`${a.staff_id}_${a.period}`] = a;

  return json({
    date: today, schedule_id: schedule.id,
    staff_a: { id: schedule.staff_a_id, department: schedule.a_dept, class: schedule.a_class, name: schedule.a_name, user_id: schedule.a_uid },
    staff_b: { id: schedule.staff_b_id, department: schedule.b_dept, class: schedule.b_class, name: schedule.b_name, user_id: schedule.b_uid },
    periods: (periods.results || []).map(p => {
      const a = map[`${schedule.staff_a_id}_${p.label}`] || { id: 0, status: 'pending', sign_in_time: null, sign_out_time: null, score_absent: 0, score_duration: 0 };
      const b = map[`${schedule.staff_b_id}_${p.label}`] || { id: 0, status: 'pending', sign_in_time: null, sign_out_time: null, score_absent: 0, score_duration: 0 };
      return {
        label: p.label, slot_type: p.slot_type, sort_order: p.sort_order, start_time: p.start_time, auto_absent_min: p.auto_absent_min,
        a: { attendance_id: a.id, status: a.status, sign_in_time: a.sign_in_time, sign_out_time: a.sign_out_time, score_absent: a.score_absent, score_duration: a.score_duration, total: (a.score_absent || 0) + (a.score_duration || 0) },
        b: { attendance_id: b.id, status: b.status, sign_in_time: b.sign_in_time, sign_out_time: b.sign_out_time, score_absent: b.score_absent, score_duration: b.score_duration, total: (b.score_absent || 0) + (b.score_duration || 0) },
      };
    }),
  });
}

export async function handleDutySignIn(request, env, user) {
  const body = await parseBody(request);
  const { schedule_id, staff_id, period } = body;
  if (!schedule_id || !staff_id || !period) return error('缺少必填字段', 400);

  const sch = await env.DB.prepare("SELECT staff_a_id, staff_b_id, date FROM duty_schedule WHERE id=?").bind(schedule_id).first();
  if (!sch) return error('排班不存在', 404);
  if (staff_id !== sch.staff_a_id && staff_id !== sch.staff_b_id) return error('你不在今日排班中', 403);

  // 未到签到时间无法签到：根据 duty_period_config.start_time（北京时间）判断
  const periodCfg = await env.DB.prepare("SELECT start_time, slot_type FROM duty_period_config WHERE label=?").bind(period).first();
  if (periodCfg && periodCfg.slot_type !== 'no_duty') {
    const [h, m] = (periodCfg.start_time || '08:00').split(':').map(Number);
    const startTime = new Date(sch.date + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
    startTime.setMinutes(startTime.getMinutes() - 480); // 北京时间转 UTC
    if (new Date() < startTime) {
      return error('未到签到时间，开始时间：' + (periodCfg.start_time || '08:00'), 400);
    }
  }

  const existing = await env.DB.prepare("SELECT id, status FROM duty_attendance WHERE schedule_id=? AND staff_id=? AND period=?").bind(schedule_id, staff_id, period).first();
  if (existing) {
    if (existing.status === 'signed_in') return error('已签到', 400);
    if (existing.status !== 'pending') return error('该时段已锁定', 400);
    await env.DB.prepare("UPDATE duty_attendance SET status='signed_in', sign_in_time=datetime('now') WHERE id=?").bind(existing.id).run();
    return json({ attendance_id: existing.id, status: 'signed_in', sign_in_time: new Date().toISOString() });
  }

  const r = await env.DB.prepare("INSERT INTO duty_attendance (schedule_id, staff_id, period, status, sign_in_time) VALUES (?,?,?,'signed_in',datetime('now'))").bind(schedule_id, staff_id, period).run();
  return json({ attendance_id: r.meta.last_row_id, status: 'signed_in', sign_in_time: new Date().toISOString() });
}

export async function handleDutySignOut(request, env, user) {
  const body = await parseBody(request);
  const { attendance_id } = body;
  if (!attendance_id) return error('缺少 attendance_id', 400);

  const att = await env.DB.prepare("SELECT * FROM duty_attendance WHERE id=?").bind(attendance_id).first();
  if (!att) return error('记录不存在', 404);
  if (att.status !== 'signed_in') return error('未在签到状态', 400);
  if (!att.sign_in_time) return error('签到时间异常', 500);

  const signIn = new Date(att.sign_in_time.includes('T') ? att.sign_in_time : att.sign_in_time.replace(' ', 'T') + 'Z');
  if (isNaN(signIn.getTime())) return error('签到时间格式异常', 500);
  const durSec = Math.floor((Date.now() - signIn.getTime()) / 1000);

  let score = 0, color = 'green';
  if (durSec < 120) { score = -0.5; color = 'pink'; }

  const sched = await env.DB.prepare("SELECT date FROM duty_schedule WHERE id=?").bind(att.schedule_id).first();
  const ops = [env.DB.prepare("UPDATE duty_attendance SET status='completed', sign_out_time=datetime('now'), duration_sec=?, score_duration=? WHERE id=?").bind(durSec, score, attendance_id)];
  if (score !== 0 && sched) {
    ops.push(env.DB.prepare(
      "INSERT INTO duty_score_record (staff_id, date, period, score, reason, recorder) VALUES (?,?,?,?,?,?)"
    ).bind(att.staff_id, sched.date, att.period, score, '在岗不足', 'system'));
  }
  await env.DB.batch(ops);

  return json({ status: 'completed', duration_sec: durSec, score, color });
}

// ========== Scores ==========

export async function handleDutyScoresGet(env, url) {
  const staffId = url.searchParams.get('staff_id');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const showCancelled = url.searchParams.get('show_cancelled') !== 'false';
  let q = "SELECT dsr.*, ds.department, ds.class, ds.name FROM duty_score_record dsr LEFT JOIN duty_staff ds ON dsr.staff_id=ds.id WHERE 1=1";
  const p = [];
  if (!showCancelled) { q += " AND dsr.is_cancelled=0"; }
  if (staffId) { q += " AND dsr.staff_id=?"; p.push(staffId); }
  if (dateFrom) { q += " AND dsr.date>=?"; p.push(dateFrom); }
  if (dateTo) { q += " AND dsr.date<=?"; p.push(dateTo); }
  q += " ORDER BY dsr.created_at DESC LIMIT 200";
  const rows = await env.DB.prepare(q).bind(...p).all();
  return json(rows.results || []);
}

export async function handleDutyScoreModify(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const { attendance_id, new_score, reason } = body;
  if (!attendance_id || new_score === undefined) return error('缺少必填字段', 400);

  const att = await env.DB.prepare("SELECT * FROM duty_attendance WHERE id=?").bind(attendance_id).first();
  if (!att) return error('记录不存在', 404);

  const sched = await env.DB.prepare("SELECT date FROM duty_schedule WHERE id=?").bind(att.schedule_id).first();
  if (!sched) return error('排班记录不存在', 404);
  const ops = [env.DB.prepare("UPDATE duty_attendance SET is_manual=1, modified_by=?, modified_reason=?, score_absent=?, score_duration=0 WHERE id=?").bind(user.name, reason || '', new_score, attendance_id)];
  const oldTotal = (att.score_absent || 0) + (att.score_duration || 0);
  if (new_score !== oldTotal) {
    ops.push(env.DB.prepare(
      "INSERT INTO duty_score_record (staff_id, date, period, score, reason, recorder) VALUES (?,?,?,?,?,?)"
    ).bind(att.staff_id, sched.date, att.period, new_score, reason || '管理员修改', user.name));
  }
  await env.DB.batch(ops);
  // 通知值日生分数变更
  try {
    const staff = await env.DB.prepare("SELECT user_id, name FROM duty_staff WHERE id=?").bind(att.staff_id).first();
    if (staff && staff.user_id) {
      await createNotification(env, staff.user_id, 'duty', '值日分数已修改', `您${sched.date} ${att.period} 的值日分数已被修改为 ${new_score} 分${reason ? `（原因：${reason}）` : ''}。`, `duty.html`, 'clock');
    }
  } catch {}
  return json({ message: '已修改' });
}

export async function handleDutyScoreCancel(request, env) {
  const body = await parseBody(request);
  const { score_record_id, reason, admin_id, password } = body;
  if (!score_record_id || !reason) return error('缺少必填字段', 400);

  if (!admin_id || !password) return error('需要销分人验证', 403);
  const admin = await env.DB.prepare("SELECT id, name, role, password_hash FROM users WHERE id=?").bind(admin_id).first();
  if (!admin || !['admin','owner','teacher'].includes(admin.role)) return error('销分人不是管理员', 403);
  if (!await bcrypt.compare(password, admin.password_hash)) return error('密码错误', 403);

  const rec = await env.DB.prepare("SELECT * FROM duty_score_record WHERE id=?").bind(score_record_id).first();
  if (!rec) return error('记录不存在', 404);
  if (rec.is_cancelled) return error('已销分', 400);

  const attRows = await env.DB.prepare(
    "SELECT da.id FROM duty_attendance da JOIN duty_schedule ds ON da.schedule_id=ds.id WHERE ds.date=? AND da.staff_id=? AND da.period=?"
  ).bind(rec.date, rec.staff_id, rec.period).all();
  const ops = [env.DB.prepare("UPDATE duty_score_record SET is_cancelled=1, cancel_reason=?, cancel_by=? WHERE id=?").bind(reason, admin.name, score_record_id)];
  for (const a of (attRows.results || [])) {
    ops.push(env.DB.prepare("UPDATE duty_attendance SET score_absent=0, score_duration=0 WHERE id=?").bind(a.id));
  }
  await env.DB.batch(ops);
  return json({ message: '已销分' });
}

export async function handleDutyScoreAdd(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const { staff_id, date, period, score, reason } = body;
  if (!staff_id || !date || !period || score === undefined || score === null) {
    return error('缺少必填字段（干事/日期/时段/分值）', 400);
  }
  const staff = await env.DB.prepare("SELECT id, user_id, name, department, class FROM duty_staff WHERE id=?").bind(staff_id).first();
  if (!staff) return error('干事不存在', 404);

  const numScore = Number(score);
  if (Number.isNaN(numScore)) return error('分值必须是数字', 400);

  await env.DB.prepare(
    "INSERT INTO duty_score_record (staff_id, date, period, score, reason, recorder) VALUES (?,?,?,?,?,?)"
  ).bind(staff_id, date, period, numScore, reason || '手动扣分', user.name).run();

  try {
    if (staff.user_id) {
      await createNotification(env, staff.user_id, 'duty', '值日扣分记录',
        `您${date} ${period} 被记录${numScore < 0 ? '扣分' : '加分'} ${numScore} 分（原因：${reason || '手动扣分'}，记录人：${user.name}）。`,
        'duty.html', 'alert-triangle');
    }
  } catch {}
  return json({ message: '已添加扣分记录' });
}

export async function handleDutyScoreBatchCancel(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const { score_record_ids, reason, admin_id, password } = body;
  if (!Array.isArray(score_record_ids) || score_record_ids.length === 0) return error('未选择记录', 400);
  if (!reason) return error('缺少销分理由', 400);
  if (!admin_id || !password) return error('需要销分人验证', 403);

  const admin = await env.DB.prepare("SELECT id, name, role, password_hash FROM users WHERE id=?").bind(admin_id).first();
  if (!admin || !['admin','owner','teacher'].includes(admin.role)) return error('销分人不是管理员', 403);
  if (!await bcrypt.compare(password, admin.password_hash)) return error('密码错误', 403);

  const placeholders = score_record_ids.map(() => '?').join(',');
  const recs = await env.DB.prepare(
    `SELECT id, staff_id, date, period, is_cancelled FROM duty_score_record WHERE id IN (${placeholders})`
  ).bind(...score_record_ids).all();
  const validRecs = (recs.results || []).filter(r => !r.is_cancelled);
  if (validRecs.length === 0) return error('所选记录均已销分或不存在', 400);

  const ops = [];
  const attSeen = new Set();
  for (const rec of validRecs) {
    ops.push(env.DB.prepare("UPDATE duty_score_record SET is_cancelled=1, cancel_reason=?, cancel_by=? WHERE id=?").bind(reason, admin.name, rec.id));
    const attKey = `${rec.date}|${rec.staff_id}|${rec.period}`;
    if (!attSeen.has(attKey)) {
      attSeen.add(attKey);
      const attRows = await env.DB.prepare(
        "SELECT da.id FROM duty_attendance da JOIN duty_schedule ds ON da.schedule_id=ds.id WHERE ds.date=? AND da.staff_id=? AND da.period=?"
      ).bind(rec.date, rec.staff_id, rec.period).all();
      for (const a of (attRows.results || [])) {
        ops.push(env.DB.prepare("UPDATE duty_attendance SET score_absent=0, score_duration=0 WHERE id=?").bind(a.id));
      }
    }
  }
  if (ops.length) await env.DB.batch(ops);
  return json({ message: `已销分 ${validRecs.length} 条`, cancelled: validRecs.length });
}

// ========== Admin Users ==========

export async function handleDutyAdminsList(env) {
  const rows = await env.DB.prepare(
    "SELECT id, name, role FROM users WHERE role IN ('admin','owner','teacher') ORDER BY name"
  ).all();
  return json(rows.results || []);
}

// ========== Department Stats ==========

export async function handleDutyDepartmentStats(env, url) {
  const weeks = parseInt(url.searchParams.get('weeks') || '2', 10);
  const days = weeks * 7;
  const rows = await env.DB.prepare(
    `SELECT ds.department, SUM(dsr.score) as total_score, COUNT(*) as record_count
     FROM duty_score_record dsr
     JOIN duty_staff ds ON dsr.staff_id = ds.id
     WHERE dsr.date >= date('now', '+8 hours', '-' || ? || ' days')
       AND dsr.is_cancelled = 0
       AND dsr.score < 0
     GROUP BY ds.department
     ORDER BY total_score ASC`
  ).bind(days).all();
  return json(rows.results || []);
}

// ========== Period Config ==========

export async function handleDutyPeriodsGet(env) {
  const rows = await env.DB.prepare("SELECT * FROM duty_period_config ORDER BY sort_order").all();
  return json(rows.results || []);
}

export async function handleDutyScheduleManual(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const { date, staff_a_id, staff_b_id } = body;
  if (!date || !staff_a_id || !staff_b_id) return error('缺少必填字段', 400);
  if (staff_a_id === staff_b_id) return error('两名干事不能相同', 400);
  await env.DB.prepare(
    "INSERT INTO duty_schedule (date, staff_a_id, staff_b_id) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET staff_a_id=excluded.staff_a_id, staff_b_id=excluded.staff_b_id"
  ).bind(date, staff_a_id, staff_b_id).run();
  return json({ message: '已保存' });
}

export async function handleDutyScheduleManualDelete(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date) return error('缺少 date 参数', 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM duty_attendance WHERE schedule_id IN (SELECT id FROM duty_schedule WHERE date=?)").bind(date),
    env.DB.prepare("DELETE FROM duty_score_record WHERE date=?").bind(date),
    env.DB.prepare("DELETE FROM duty_schedule WHERE date=?").bind(date),
  ]);
  return json({ message: '已删除' });
}

export async function handleDutyScheduleClearAll(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM duty_score_record"),
    env.DB.prepare("DELETE FROM duty_attendance"),
    env.DB.prepare("DELETE FROM duty_schedule"),
  ]);
  return json({ message: '已重置' });
}

export async function handleDutyPeriodsUpdate(request, env, user) {
  if (!isAdmin(user)) return error('需要管理员权限', 403);
  const body = await parseBody(request);
  const periods = body.periods || [];
  const VALID_SLOT_TYPES = ['small_break', 'big_break', 'no_duty'];
  const ops = [];
  for (const p of periods) {
    if (!VALID_SLOT_TYPES.includes(p.slot_type)) return error('无效的时段类型', 400);
    if (p.id) {
      ops.push(env.DB.prepare("UPDATE duty_period_config SET label=?, slot_type=?, sort_order=?, start_time=?, auto_absent_min=? WHERE id=?").bind(p.label, p.slot_type, p.sort_order, p.start_time || '08:00', p.auto_absent_min || 10, p.id));
    } else {
      ops.push(env.DB.prepare("INSERT OR REPLACE INTO duty_period_config (label, slot_type, sort_order, start_time, auto_absent_min) VALUES (?,?,?,?,?)").bind(p.label, p.slot_type, p.sort_order, p.start_time || '08:00', p.auto_absent_min || 10));
    }
  }
  if (ops.length > 0) await env.DB.batch(ops);
  return json({ message: '已更新' });
}
