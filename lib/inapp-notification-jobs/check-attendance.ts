/**
 * Phase 8-A — 출퇴근 이벤트 알림 보강.
 * attendance 최근 ATTENDANCE_LOOKBACK_MIN 분 내 created → staff_id 에게 'attendance' 알림.
 * dedupe key: `attendance:{id}:{status_key}` (status_key: checkin/checkout/late/absent)
 *
 * lookback: 인앱 cron 이 외부 5분 주기 또는 일 1회 piggyback 모두 커버하도록
 * 26시간(1560분). 중복은 loadExistingDedupeKeys(7일) 로 차단.
 */
import 'server-only';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked } from './types';
import {
  getD1Binding,
  getD1Drizzle,
  attendance as attendanceTable,
  gte } from '@/lib/db';

type AttendanceRow = {
  id: string;
  staff_id: string | null;
  date: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
};

/** 일 1회 piggyback 실행 시 누락 방지 — 26h (외부 5분 cron 과 호환, dedupe로 중복 차단) */
const ATTENDANCE_LOOKBACK_MIN = 26 * 60;

function resolveAttendanceEvent(row: AttendanceRow): {
  statusKey: string;
  title: string;
  body: string;
} | null {
  const status = String(row.status || '').trim();
  if (row.check_out) {
    return {
      statusKey: 'checkout',
      title: '퇴근 기록',
      body: `${row.date} 퇴근 처리되었습니다.` };
  }
  if (row.check_in) {
    if (status === '지각') {
      return {
        statusKey: 'late',
        title: '지각 처리',
        body: `${row.date} 출근이 지각으로 기록되었습니다.` };
    }
    return {
      statusKey: 'checkin',
      title: '출근 기록',
      body: `${row.date} 출근 처리되었습니다.` };
  }
  if (status === '결근') {
    return {
      statusKey: 'absent',
      title: '결근 처리',
      body: `${row.date} 결근으로 기록되었습니다. 관리자에게 문의해 주세요.` };
  }
  return null;
}

export async function checkAttendanceEvents(): Promise<CheckJobResult> {
  const cutoff = new Date(Date.now() - ATTENDANCE_LOOKBACK_MIN * 60 * 1000).toISOString();
  const d1 = await getD1Binding();
  if (!d1) return { detected: 0, created: 0, errors: ['[check-attendance] D1 binding not available'] };
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: attendanceTable.id,
      staff_id: attendanceTable.staff_id,
      date: attendanceTable.date,
      check_in: attendanceTable.check_in,
      check_out: attendanceTable.check_out,
      status: attendanceTable.status })
    .from(attendanceTable)
    .where(gte(attendanceTable.created_at, cutoff))
    .limit(500);
  const rows = d1Rows as AttendanceRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys('attendance', userIds);
  } catch (err) {
    return { detected: rows.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const row of rows) {
    const staffId = String(row.staff_id ?? '');
    if (!staffId) continue;
    const evt = resolveAttendanceEvent(row);
    if (!evt) continue;
    const dedupeKey = `attendance:${row.id}:${evt.statusKey}`;
    if (sentKeys.has(`${staffId}|${dedupeKey}`)) continue;
    toInsert.push({
      user_id: staffId,
      type: 'attendance',
      title: evt.title,
      body: evt.body,
      metadata: {
        type: 'attendance',
        attendance_id: row.id,
        status_key: evt.statusKey,
        dedupe_key: dedupeKey },
      read_at: null });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(toInsert);
  return { detected: rows.length, created, errors };
}
