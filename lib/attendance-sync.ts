/**
 * attendance (단수) ↔ attendances (복수) dual-write 헬퍼.
 *
 * 스키마 공존:
 *  - attendance  : date, check_in/out, 한글 status (마이페이지·체크인 1차)
 *  - attendances : work_date, check_in_time/out, 영문 status (근태관리·급여 연계)
 *
 * 쓰기 규칙:
 *  1) 단수 attendance 를 먼저 기록
 *  2) syncAttendanceToAttendances 로 복수 attendances 동기화
 *
 * 기존 checkin-utils.syncToAttendances 시그니처는 호환 re-export.
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db-client';
import { withMissingColumnFallback } from '@/lib/db-compat';
import { getKoreanMinutesOfDay } from '@/lib/date-formatter';

/** 레거시(한글) → 모던(영문) status 맵 */
export const LEGACY_STATUS_TO_MODERN: Record<string, string> = {
  정상: 'present',
  지각: 'late',
  조퇴: 'early_leave',
  결근: 'absent',
  present: 'present',
  late: 'late',
  early_leave: 'early_leave',
  absent: 'absent',
};

/** 모던 → 레거시 (status-only 정정 등) */
export const MODERN_STATUS_TO_LEGACY: Record<string, string> = {
  present: '정상',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
};

export type AttendanceSyncSnapshot = {
  checkIn?: string | null;
  checkOut?: string | null;
  status?: string | null;
  earlyLeaveMinutes?: number | null;
};

export type AttendanceWriteResult<T = Record<string, unknown>> = {
  data: T | null;
  error: Error | null;
};

function toModernStatus(status: string | null | undefined): string {
  const key = String(status || '').trim();
  return LEGACY_STATUS_TO_MODERN[key] || 'present';
}

// KST 고정. 예전에는 ISO 문자열에서 **첫** `HH:MM` 을 정규식으로 뽑아
// `2026-08-09T20:09:29Z` 에서 20:09(UTC)를 얻었고, 폴백의 getHours() 도
// 런타임 TZ 를 따랐다. 비교 대상인 시프트 시작 시각은 KST 라 9시간 어긋났다.
const parseTimeToMinutes = getKoreanMinutesOfDay;

function workMinutes(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
): number | null {
  if (!checkIn || !checkOut) return null;

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);

  // ISO 8601 타임스탬프 두 개 모두 정상이면 시각 차이 계산
  if (!Number.isNaN(inDate.getTime()) && !Number.isNaN(outDate.getTime())) {
    let diffMs = outDate.getTime() - inDate.getTime();
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // 야간 자정 보정
    const mins = Math.round(diffMs / 60000);
    return Number.isFinite(mins) && mins >= 0 ? mins : null;
  }

  // HH:mm 문자열 폴백
  const inMins = parseTimeToMinutes(checkIn);
  const outMins = parseTimeToMinutes(checkOut);
  if (inMins === null || outMins === null) return null;

  let diff = outMins - inMins;
  if (diff < 0) diff += 24 * 60; // 야간 자정 보정
  return diff;
}

/**
 * attendance → attendances 동기화.
 *
 * - snapshot 이 있으면 그 값을 사용
 * - 없으면 attendance 단수 행을 읽어 동기화 (`syncAttendanceToAttendances(staffId, date)`)
 */
export async function syncAttendanceToAttendances(
  staffId: string,
  date: string,
  snapshot?: AttendanceSyncSnapshot,
): Promise<void> {
  if (!staffId || !date) return;

  try {
    let checkIn = snapshot?.checkIn ?? null;
    let checkOut = snapshot?.checkOut ?? null;
    let status = snapshot?.status ?? null;
    const earlyLeaveMinutesOpt = snapshot?.earlyLeaveMinutes;

    if (checkIn === null && checkOut === null && status === null) {
      const { data: row, error } = await db
        .from('attendance')
        .select('check_in, check_out, status')
        .eq('staff_id', staffId)
        .eq('date', date)
        .maybeSingle();
      if (error) throw error;
      if (!row) return;
      const rec = row as Record<string, unknown>;
      checkIn = (rec.check_in as string | null) ?? null;
      checkOut = (rec.check_out as string | null) ?? null;
      status = (rec.status as string | null) ?? null;
    }

    const attStatus = toModernStatus(status);
    const mins = workMinutes(checkIn, checkOut);

    const basePayload: Record<string, unknown> = {
      staff_id: staffId,
      work_date: date,
      check_in_time: checkIn,
      check_out_time: checkOut,
      status: attStatus,
      work_hours_minutes: mins ?? undefined,
    };

    const earlyLeaveMinutes =
      attStatus === 'early_leave'
        ? Math.max(0, Number(earlyLeaveMinutesOpt || 0))
        : 0;

    const result = await withMissingColumnFallback(
      () =>
        db.from('attendances').upsert(
          { ...basePayload, early_leave_minutes: earlyLeaveMinutes },
          { onConflict: 'staff_id,work_date' },
        ),
      () => db.from('attendances').upsert(basePayload, { onConflict: 'staff_id,work_date' }),
      'early_leave_minutes',
    );

    if (result.error) throw result.error;
  } catch (syncErr) {
    logger.warn('출퇴근 동기화 실패 (attendance → attendances):', syncErr);
  }
}

/**
 * 기존 checkin-utils 시그니처 호환.
 * @deprecated 신규 코드는 syncAttendanceToAttendances 사용
 */
export async function syncToAttendances(
  staffId: string,
  workDate: string,
  checkIn: string | null,
  checkOut: string | null,
  status: string,
  options?: { earlyLeaveMinutes?: number | null },
): Promise<void> {
  await syncAttendanceToAttendances(staffId, workDate, {
    checkIn,
    checkOut,
    status,
    earlyLeaveMinutes: options?.earlyLeaveMinutes,
  });
}

/**
 * 출근 dual-write: attendance upsert 후 attendances 동기화.
 */
export async function upsertAttendanceCheckIn(params: {
  staffId: string;
  date: string;
  checkIn: string;
  status: string;
}): Promise<AttendanceWriteResult> {
  const { staffId, date, checkIn, status } = params;
  if (!staffId || !date) {
    return { data: null, error: new Error('staffId/date 필요') };
  }

  try {
    const { data, error } = await db
      .from('attendance')
      .upsert(
        [
          {
            staff_id: staffId,
            date,
            check_in: checkIn,
            status,
          },
        ],
        { onConflict: 'staff_id,date' },
      )
      .select()
      .single();

    if (error) throw error;

    await syncAttendanceToAttendances(staffId, date, {
      checkIn,
      checkOut: null,
      status,
    });

    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * 퇴근 dual-write: attendance update 후 attendances 동기화.
 * requireOpen=true 이면 check_out IS NULL 행만 갱신 (데스크톱 중복 퇴근 방지).
 */
export async function upsertAttendanceCheckOut(params: {
  staffId: string;
  date: string;
  checkOut: string;
  status: string;
  checkIn?: string | null;
  earlyLeaveMinutes?: number | null;
  requireOpen?: boolean;
}): Promise<AttendanceWriteResult> {
  const {
    staffId,
    date,
    checkOut,
    status,
    checkIn = null,
    earlyLeaveMinutes = null,
    requireOpen = false,
  } = params;

  if (!staffId || !date) {
    return { data: null, error: new Error('staffId/date 필요') };
  }

  try {
    let query = db
      .from('attendance')
      .update({ check_out: checkOut, status })
      .eq('staff_id', staffId)
      .eq('date', date);

    if (requireOpen) {
      query = query.is('check_out', null);
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data && requireOpen) {
      return {
        data: null,
        error: new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.'),
      };
    }

    const row = (data as Record<string, unknown> | null) ?? null;
    const resolvedCheckIn =
      checkIn ?? (row?.check_in as string | null | undefined) ?? null;

    await syncAttendanceToAttendances(staffId, date, {
      checkIn: resolvedCheckIn,
      checkOut,
      status,
      earlyLeaveMinutes,
    });

    return { data: row, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * status-only dual upsert (출결정정 반영 등).
 * check_in/out 은 건드리지 않고 status 만 양쪽에 맞춤.
 */
export async function writeAttendanceStatus(params: {
  staffId: string;
  date: string;
  /** 한글(레거시) status. 미지정 시 modernStatus 로부터 역산 */
  legacyStatus?: string;
  /** 영문(모던) status. 미지정 시 legacyStatus 로부터 변환 */
  modernStatus?: string;
}): Promise<void> {
  const { staffId, date } = params;
  if (!staffId || !date) return;

  const legacy =
    params.legacyStatus ||
    (params.modernStatus
      ? MODERN_STATUS_TO_LEGACY[params.modernStatus] || '정상'
      : '정상');
  const modern = params.modernStatus || toModernStatus(legacy);

  await db.from('attendance').upsert(
    { staff_id: staffId, date, status: legacy },
    { onConflict: 'staff_id,date' },
  );

  await db.from('attendances').upsert(
    { staff_id: staffId, work_date: date, status: modern },
    { onConflict: 'staff_id,work_date' },
  );
}

/**
 * 출결정정 유형 → dual status 반영.
 * resolveAttendanceCorrectionStatusPair 와 동일 맵.
 */
export async function applyAttendanceCorrectionStatus(
  staffId: string,
  date: string,
  correctionType: string,
): Promise<void> {
  const statusMap: Record<string, { legacy: string; modern: string }> = {
    정상반영: { legacy: '정상', modern: 'present' },
    지각처리: { legacy: '지각', modern: 'late' },
    결근처리: { legacy: '결근', modern: 'absent' },
  };
  const pair = statusMap[correctionType] || statusMap['정상반영'];
  await writeAttendanceStatus({
    staffId,
    date,
    legacyStatus: pair.legacy,
    modernStatus: pair.modern,
  });
}
