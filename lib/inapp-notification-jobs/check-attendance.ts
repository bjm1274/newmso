/**
 * Phase 8-A — 출퇴근 이벤트 알림 보강.
 * attendance 최근 ATTENDANCE_LOOKBACK_MIN(5) 분 내 created → staff_id 에게 'attendance' 알림.
 * dedupe key: `attendance:{id}:{status_key}` (status_key: checkin/checkout/late/absent)
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked,
} from './types';

type AttendanceRow = {
  id: string;
  staff_id: string | null;
  date: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
};

const ATTENDANCE_LOOKBACK_MIN = 5;

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
      body: `${row.date} 퇴근 처리되었습니다.`,
    };
  }
  if (row.check_in) {
    if (status === '지각') {
      return {
        statusKey: 'late',
        title: '지각 처리',
        body: `${row.date} 출근이 지각으로 기록되었습니다.`,
      };
    }
    return {
      statusKey: 'checkin',
      title: '출근 기록',
      body: `${row.date} 출근 처리되었습니다.`,
    };
  }
  if (status === '결근') {
    return {
      statusKey: 'absent',
      title: '결근 처리',
      body: `${row.date} 결근으로 기록되었습니다. 관리자에게 문의해 주세요.`,
    };
  }
  return null;
}

export async function checkAttendanceEvents(
  supabase: SupabaseClient,
): Promise<CheckJobResult> {
  const cutoff = new Date(Date.now() - ATTENDANCE_LOOKBACK_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('attendance')
    .select('id, staff_id, date, check_in, check_out, status')
    .gte('created_at', cutoff)
    .limit(500);
  if (error) return { detected: 0, created: 0, errors: [error.message] };

  const rows = (data ?? []) as AttendanceRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys(supabase, 'attendance', userIds);
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
        dedupe_key: dedupeKey,
      },
      read_at: null,
    });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(supabase, toInsert);
  return { detected: rows.length, created, errors };
}
