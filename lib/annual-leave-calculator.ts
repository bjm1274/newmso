import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  isAnnualLeaveType,
  isHalfLeaveType,
  getLeaveUnit,
  normalizeLeaveType,
  leaveTypeLookupAliases,
} from '@/lib/leave-type';

export { isAnnualLeaveType, isHalfLeaveType, getLeaveUnit, normalizeLeaveType, leaveTypeLookupAliases };

const APPROVED_STATUS_LABELS = new Set(['승인', 'approved']);

export function isApprovedLeaveStatus(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return APPROVED_STATUS_LABELS.has(normalized);
}

export function calculateLeaveDays(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!startDate) return 0;

  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  // 종료 < 시작(데이터 오류)이면 시작일 1일로 처리 — 음수 일수 방지
  if (end.getTime() < start.getTime()) {
    return 1;
  }

  let workDays = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      workDays += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return Math.max(1, workDays);
}

export function clipDateRangeToYear(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  year: number
) {
  if (!startDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const rangeStart = new Date(Math.max(start.getTime(), new Date(`${year}-01-01T00:00:00`).getTime()));
  const rangeEnd = new Date(Math.min(end.getTime(), new Date(`${year}-12-31T23:59:59`).getTime()));

  if (rangeStart.getTime() > rangeEnd.getTime()) {
    return null;
  }

  return { start: rangeStart, end: rangeEnd };
}

export function calculateApprovedAnnualLeaveUsage(
  rows: Array<Record<string, unknown>> | null | undefined,
  year = new Date().getFullYear()
) {
  return (rows || []).reduce((sum, row) => {
    if (!isApprovedLeaveStatus(row?.status)) {
      return sum;
    }

    // '연차(부여)'는 사용이 아니라 신규 부여 — 서버 sync 와 동일
    if (String(row?.leave_type ?? '').includes('부여')) {
      return sum;
    }

    // 반차/반반차 연도 clip 및 dbDays 우선 적용 (과거 연도 반차 과대합산 방지 및 0.25일 지원)
    if (isHalfLeaveType(row?.leave_type)) {
      const halfClipped = clipDateRangeToYear(
        row?.start_date as string | null | undefined,
        row?.end_date as string | null | undefined,
        year,
      );
      if (!halfClipped) return sum;
      const dbDays = row?.days != null ? Number(row.days) : null;
      if (dbDays != null && !Number.isNaN(dbDays) && dbDays > 0) {
        return sum + dbDays;
      }
      return sum + 0.5;
    }

    if (!isAnnualLeaveType(row?.leave_type)) {
      return sum;
    }

    const clippedRange = clipDateRangeToYear(
      row?.start_date as string | null | undefined,
      row?.end_date as string | null | undefined,
      year
    );

    if (!clippedRange) {
      return sum;
    }

    // 당해 연도 안 전부 포함이면 DB days 우선 (서버 sync 와 동일) — 클라이언트/서버 잔여 불일치 방지
    const startY = String(row?.start_date || '').slice(0, 4);
    const endY = String(row?.end_date || row?.start_date || '').slice(0, 4);
    const dbDays = row?.days != null ? Number(row.days) : null;
    if (
      startY === String(year) &&
      endY === String(year) &&
      dbDays != null &&
      !Number.isNaN(dbDays)
    ) {
      return sum + dbDays;
    }

    return (
      sum +
      calculateLeaveDays(
        formatKoreanDateKey(clippedRange.start),
        formatKoreanDateKey(clippedRange.end)
      )
    );
  }, 0);
}
