/**
 * checkin-utils.ts
 *
 * 출퇴근기록(CommuteRecord) 화면의 비즈니스 헬퍼 모듈.
 * 데스크탑·모바일이 공유하는 동일 동작을 한 곳에 모아 회귀를 막는다.
 *
 * - 순수 함수: parseShiftTime, buildShiftBoundary 계열, calculateEarlyLeaveMinutes
 * - Supabase aware: syncToAttendances, resolveLateThreshold, resolveStaleOpenLog
 *
 * JM  : 단일 책임(체크인 도메인 헬퍼), 200줄 내외
 * JM3 : 실패는 호출부 try/catch로 위임, 내부에서는 명시 throw + logger.warn
 * JM4 : any 금지, 외부 입력은 좁은 타입으로 좁힘
 * JM5 : staff_id/work_date 외 임의값 절대 쿼리 주입 금지(매개변수 화이트리스트)
 */

import { logger } from '@/lib/logger';
import {
  buildShiftLookup,
  resolveAssignedShift,
  type ShiftAssignmentReference,
  type ShiftLookupRecord,
} from '@/lib/shift-resolution';
import { getStaffShifts } from '@/lib/staff-shift-resolver';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import type { CommuteLog, ShiftBoundary } from './commute-types';
import { decideCheckInStatus } from './late-status';

const COMMUTE_STATUS_TO_ATTENDANCES: Record<string, string> = {
  정상: 'present',
  지각: 'late',
  조퇴: 'early_leave',
  결근: 'absent',
};

// ---------------------------------------------------------------------------
// 순수 함수
// ---------------------------------------------------------------------------

export function parseShiftTime(value: string): { hour: number; minute: number } | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

export function buildFallbackShiftBoundary(department?: string): ShiftBoundary {
  const isMedicalStaff = department === '의료진';
  return {
    hour: isMedicalStaff ? 8 : 9,
    minute: isMedicalStaff ? 30 : 10,
    label: isMedicalStaff ? '08:30' : '09:10',
    endHour: null,
    endMinute: null,
    shiftKnown: false,
  };
}

export function buildShiftBoundary(
  startTime: string,
  endTime: string,
  fallbackDepartment?: string,
): ShiftBoundary {
  const start = parseShiftTime(startTime);
  if (!start) {
    return buildFallbackShiftBoundary(fallbackDepartment);
  }
  const end = parseShiftTime(endTime);
  return {
    hour: start.hour,
    minute: start.minute,
    label: `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`,
    endHour: end?.hour ?? null,
    endMinute: end?.minute ?? null,
    shiftKnown: true,
  };
}

export function buildDateWithTime(dateStr: string, hour: number, minute: number): Date {
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour, minute, 0, 0);
}

export function calculateEarlyLeaveMinutes(
  workDate: string,
  checkOutIso: string | null | undefined,
  boundary: ShiftBoundary,
): number {
  if (!workDate || !checkOutIso || boundary.endHour === null || boundary.endMinute === null) {
    return 0;
  }

  const actualCheckOut = new Date(checkOutIso);
  if (Number.isNaN(actualCheckOut.getTime())) return 0;

  const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
  const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);

  if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
    scheduledEnd.setDate(scheduledEnd.getDate() + 1);
  }

  // 야간근무자 자정 이후 체크인 보정
  const endMin = boundary.endHour * 60 + boundary.endMinute;
  const startMin = boundary.hour * 60 + boundary.minute;
  const isNightShift = endMin < startMin;
  if (isNightShift && actualCheckOut.getTime() < scheduledStart.getTime()) {
    scheduledStart.setDate(scheduledStart.getDate() - 1);
    scheduledEnd.setDate(scheduledEnd.getDate() - 1);
  }

  return Math.max(0, Math.round((scheduledEnd.getTime() - actualCheckOut.getTime()) / 60000));
}

// ---------------------------------------------------------------------------
// Supabase aware 헬퍼
// ---------------------------------------------------------------------------

export type LateThresholdContext = {
  shiftId?: string | null;
  department?: string | null;
  company?: string | null;
};

/**
 * 최신 근무유형 컨텍스트 조회 — 다중 근무유형 + staff_members 폴백.
 * UI 부수상태(staffShifts 등)에는 관여하지 않으니, 그 부분은 호출부에서 별도 처리.
 */
export async function fetchLatestStaffShiftContext(
  staffId: string,
  fallback: LateThresholdContext = {},
): Promise<LateThresholdContext> {
  if (!staffId) return fallback;
  try {
    const [shifts, staffRow] = await Promise.all([
      getStaffShifts(staffId),
      supabase
        .from('staff_members')
        .select('shift_id, department, company')
        .eq('id', staffId)
        .maybeSingle()
        .then((r) => r.data as Record<string, unknown> | null | undefined),
    ]);

    const primary = shifts.find((e) => e.isPrimary) ?? shifts[0] ?? null;
    return {
      shiftId:
        primary?.shiftId ||
        String(staffRow?.shift_id || '').trim() ||
        fallback.shiftId ||
        '',
      department:
        String(staffRow?.department || '').trim() || fallback.department || undefined,
      company:
        String(staffRow?.company || '').trim() || fallback.company || undefined,
    };
  } catch (error) {
    logger.warn('최신 근무유형 조회 실패:', error);
    return fallback;
  }
}

/**
 * 특정 일자의 지각 판정 임계값 조회.
 */
export async function resolveLateThreshold(
  staffId: string,
  workDate: string,
  fallback: LateThresholdContext = {},
): Promise<ShiftBoundary> {
  if (!staffId) return buildFallbackShiftBoundary(fallback.department ?? undefined);

  try {
    const [ctx, assignmentResult] = await Promise.all([
      fetchLatestStaffShiftContext(staffId, fallback),
      withMissingColumnFallback(
        () =>
          supabase
            .from('shift_assignments')
            .select('shift_id, shift_name')
            .eq('staff_id', staffId)
            .eq('work_date', workDate)
            .maybeSingle(),
        () =>
          supabase
            .from('shift_assignments')
            .select('shift_id')
            .eq('staff_id', staffId)
            .eq('work_date', workDate)
            .maybeSingle(),
        'shift_name',
      ),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;

    const effectiveDepartment = ctx.department || fallback.department || undefined;
    const assignment = (assignmentResult.data || null) as ShiftAssignmentReference | null;

    const shiftIds = Array.from(
      new Set(
        [String(assignment?.shift_id || '').trim(), String(ctx.shiftId || '').trim()].filter(Boolean),
      ),
    );
    const shiftNames = Array.from(
      new Set([String(assignment?.shift_name || '').trim()].filter(Boolean)),
    );

    if (shiftIds.length === 0 && shiftNames.length === 0) {
      return buildFallbackShiftBoundary(effectiveDepartment);
    }

    const [idsRes, namesRes] = await Promise.all([
      shiftIds.length > 0
        ? supabase
            .from('work_shifts')
            .select(
              'id, name, company_name, start_time, end_time, description, weekly_work_days, is_weekend_work, shift_type',
            )
            .in('id', shiftIds)
        : Promise.resolve({ data: [], error: null }),
      shiftNames.length > 0
        ? supabase
            .from('work_shifts')
            .select(
              'id, name, company_name, start_time, end_time, description, weekly_work_days, is_weekend_work, shift_type',
            )
            .in('name', shiftNames)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (idsRes.error) throw idsRes.error;
    if (namesRes.error) throw namesRes.error;

    const lookup = buildShiftLookup([
      ...((idsRes.data || []) as ShiftLookupRecord[]),
      ...((namesRes.data || []) as ShiftLookupRecord[]),
    ]);
    const shiftRow = resolveAssignedShift(assignment, lookup, {
      fallbackShiftId: ctx.shiftId || undefined,
      preferredCompany: ctx.company || undefined,
      workDate,
    });
    if (!shiftRow) return buildFallbackShiftBoundary(effectiveDepartment);

    const startTime = String(shiftRow.start_time || '').trim();
    const endTime = String(shiftRow.end_time || '').trim();
    const boundary = buildShiftBoundary(startTime, endTime, effectiveDepartment);
    return {
      ...boundary,
      shiftType: String(shiftRow.shift_type || '') || null,
      rosterAssigned: !!String(assignment?.shift_id || '').trim(),
    };
  } catch (error) {
    logger.warn('지각 기준 시간 조회 실패:', error);
    return buildFallbackShiftBoundary(fallback.department ?? undefined);
  }
}

/**
 * 근무유형(work_shifts) 시작시각 기준 체크인 상태(정상/지각) 해석. (모바일·데스크톱 공유)
 * 1일근무1일휴무는 근무표(shift_assignments) 배정 기준으로 근무일을 판정한다.
 */
export async function resolveCheckInStatus(
  staffId: string,
  workDate: string,
  checkInIso: string,
  fallback: LateThresholdContext = {},
): Promise<'정상' | '지각'> {
  const boundary = await resolveLateThreshold(staffId, workDate, fallback);
  return decideCheckInStatus(boundary, checkInIso);
}

/**
 * attendance → attendances 동기화. (근태관리메인/급여정산 연계)
 */
export async function syncToAttendances(
  staffId: string,
  workDate: string,
  checkIn: string | null,
  checkOut: string | null,
  status: string,
  options?: { earlyLeaveMinutes?: number | null },
): Promise<void> {
  if (!staffId) return;
  try {
    const attStatus = COMMUTE_STATUS_TO_ATTENDANCES[status] || 'present';
    const mins =
      checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000)
        : null;

    const basePayload = {
      staff_id: staffId,
      work_date: workDate,
      check_in_time: checkIn,
      check_out_time: checkOut,
      status: attStatus,
      work_hours_minutes: mins ?? undefined,
    };

    const earlyLeaveMinutes =
      attStatus === 'early_leave' ? Math.max(0, Number(options?.earlyLeaveMinutes || 0)) : 0;

    const result = await withMissingColumnFallback(
      () =>
        supabase.from('attendances').upsert(
          { ...basePayload, early_leave_minutes: earlyLeaveMinutes },
          { onConflict: 'staff_id,work_date' },
        ),
      () => supabase.from('attendances').upsert(basePayload, { onConflict: 'staff_id,work_date' }),
      'early_leave_minutes',
    );

    if (result.error) throw result.error;
  } catch (syncErr) {
    logger.warn('출퇴근 동기화 실패:', syncErr);
  }
}

/**
 * 전날 미퇴근 기록 탐색 (야간 근무자 자정 넘긴 케이스).
 * - logs가 이미 로드된 상태에서 그 안에서 찾는 동기 헬퍼.
 */
export function resolveStaleOpenLog(
  logs: CommuteLog[],
  currentDateKey: string,
): CommuteLog | null {
  return (
    logs.find((log) => {
      if (log.isVirtual) return false;
      if (!log.check_in || log.check_out) return false;
      const displayStatus = String(log.displayStatus || log.status || '').trim();
      if (displayStatus === '결근') return false;
      const date = String(log.date || '').slice(0, 10);
      return !!date && date !== currentDateKey;
    }) ?? null
  );
}
