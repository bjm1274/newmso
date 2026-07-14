import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  getD1Binding,
  getD1Drizzle,
  leave_requests as leaveRequestsTable,
  staff_members as staffMembersTable,
  eq,
  and,
  desc } from '@/lib/db';

const APPROVED_STATUS_LABELS = new Set(['승인', 'approved']);

export function isAnnualLeaveType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;

  // '연차(이력)': 과거 엑셀로 입력된 사용 내역('연차(이력)')도
  // 현재 잔여 계산(annual_leave_used)에 정상 합산하여 잔여값을 차감하도록 변경합니다.
  if (normalized.includes('부여')) return false;

  return (
    normalized === 'annual_leave' ||
    normalized === 'annual' ||
    normalized === '연차' ||
    normalized === '연차/휴가' ||
    normalized.includes('연차')
  );
}

export function isHalfLeaveType(value: unknown): boolean {
  return getLeaveUnit(value) === 0.5;
}

/**
 * 휴가 유형별 1회당 소모 일수 단위 반환
 * - 반차(오전/오후 포함): 0.5
 * - 그 외 연차/공가 등 풀데이: 1.0
 * 주의: 반반차(0.25)는 이 시스템에서 지원하지 않음
 */
export function getLeaveUnit(value: unknown): 0.5 | 1.0 {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 1.0;

  const isHalf =
    normalized === 'half_leave' ||
    normalized === 'half-day' ||
    normalized === '반차' ||
    normalized === '오전반차' ||
    normalized === '오후반차' ||
    normalized.startsWith('반차') ||
    normalized.endsWith('반차');

  return isHalf ? 0.5 : 1.0;
}

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

  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

function clipDateRangeToYear(
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

    // 반차도 연도 clip — 서버 syncAnnualLeaveUsedForStaff 와 동일 (과거 연도 반차 과대합산 방지)
    if (isHalfLeaveType(row?.leave_type)) {
      const halfClipped = clipDateRangeToYear(
        row?.start_date as string | null | undefined,
        row?.end_date as string | null | undefined,
        year,
      );
      if (!halfClipped) return sum;
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

    return (
      sum +
      calculateLeaveDays(
        formatKoreanDateKey(clippedRange.start),
        formatKoreanDateKey(clippedRange.end)
      )
    );
  }, 0);
}

type EnsureApprovedAnnualLeaveRequestParams = {
  staffId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  approvalId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  delegateId?: string | null;
  delegateName?: string | null;
  delegateDepartment?: string | null;
  delegatePosition?: string | null;
  days?: number | null;
};

function buildLeaveRequestPayload(params: EnsureApprovedAnnualLeaveRequestParams) {
  return {
    staff_id: params.staffId,
    leave_type: params.leaveType,
    start_date: params.startDate,
    end_date: params.endDate,
    reason: params.reason,
    status: '승인',
    approved_at: new Date().toISOString(),
    days: params.days ?? null };
}

// D1 leave_requests 스키마에 존재하는 컬럼만 사용하는 insert 타입
type D1LeaveRequestInsert = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  approved_at: string;
  company_id: string | null;
  created_at: string;
  days: number | null;
};

export async function ensureApprovedAnnualLeaveRequest(params: EnsureApprovedAnnualLeaveRequestParams) {
  const { staffId, leaveType, startDate, endDate } = params;
  const payload = buildLeaveRequestPayload(params);

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-ledger] D1 binding not available (ensureApprovedAnnualLeaveRequest)');
  const db = getD1Drizzle(d1);

  // 기존 레코드 조회 (staff_id + leave_type + start_date + end_date, 최신 순)
  const existingRows = await db
    .select({ id: leaveRequestsTable.id, status: leaveRequestsTable.status })
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.staff_id, staffId),
        eq(leaveRequestsTable.leave_type, leaveType),
        eq(leaveRequestsTable.start_date, startDate),
        eq(leaveRequestsTable.end_date, endDate),
      ),
    )
    .orderBy(desc(leaveRequestsTable.created_at))
    .limit(1);

  const existingRow = existingRows[0] ?? null;
  const matchedRow =
    existingRow &&
    (isApprovedLeaveStatus(existingRow.status) || String(existingRow.status ?? '').trim() === '')
      ? existingRow
      : null;

  if (matchedRow?.id) {
    if (!isApprovedLeaveStatus(matchedRow.status)) {
      await db
        .update(leaveRequestsTable)
        .set({
          status: '승인',
          approved_at: payload.approved_at,
          // D1 스키마에 company_id 있음
          ...(params.companyId ? { company_id: params.companyId } : {}),
          days: payload.days ?? (isHalfLeaveType(payload.leave_type) ? 0.5 : calculateLeaveDays(payload.start_date, payload.end_date)) })
        .where(eq(leaveRequestsTable.id, matchedRow.id));
    }
    return matchedRow.id;
  }

  // INSERT — D1 스키마에 없는 컬럼(approval_id, company_name, delegate_* 등) 제외
  const newId = crypto.randomUUID();
  const insertValues: D1LeaveRequestInsert = {
    id: newId,
    staff_id: payload.staff_id,
    leave_type: payload.leave_type,
    start_date: payload.start_date,
    end_date: payload.end_date,
    reason: payload.reason,
    status: payload.status,
    approved_at: payload.approved_at,
    company_id: params.companyId ?? null,
    created_at: new Date().toISOString(),
    days: payload.days ?? (isHalfLeaveType(payload.leave_type) ? 0.5 : calculateLeaveDays(payload.start_date, payload.end_date)) };
  await db.insert(leaveRequestsTable).values(insertValues);
  return newId;
}

export type SyncAnnualLeaveUsedOptions = {
  /** 지정 시 해당 연도 사용분만 합산 (leave_balances 정합용) */
  year?: number;
  /**
   * true면 staff_members.annual_leave_used 도 갱신.
   * 기본 false — 직원 명단/필드 보호 (잔액은 leave_balances 로 관리)
   */
  writeStaffMembers?: boolean;
};

/**
 * 승인된 연차 사용일수 집계.
 * - year 미지정: 전 기간 합 (레거시)
 * - year 지정: 해당 연도에 걸친 사용분만 (잔액 테이블 SSOT)
 * - writeStaffMembers 기본 false → staff_members 미갱신
 */
export async function syncAnnualLeaveUsedForStaff(
  staffId: string,
  options?: SyncAnnualLeaveUsedOptions,
) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-ledger] D1 binding not available (syncAnnualLeaveUsedForStaff)');
  const db = getD1Drizzle(d1);
  const year = options?.year;
  const writeStaff = options?.writeStaffMembers === true;

  const rows = await db
    .select({
      leave_type: leaveRequestsTable.leave_type,
      start_date: leaveRequestsTable.start_date,
      end_date: leaveRequestsTable.end_date,
      status: leaveRequestsTable.status,
      days: leaveRequestsTable.days })
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.staff_id, staffId));

  const approvedAnnualLeaveDays = rows.reduce((sum, row) => {
    if (!isApprovedLeaveStatus(row?.status)) return sum;
    // '연차(부여)'는 사용이 아니라 신규 부여
    if (row?.leave_type === '연차(부여)') return sum;

    const isHalf = getLeaveUnit(row?.leave_type) === 0.5;
    if (!isHalf && !isAnnualLeaveType(row?.leave_type)) return sum;

    if (year != null) {
      const clipped = clipDateRangeToYear(
        row?.start_date as string,
        row?.end_date as string,
        year,
      );
      if (!clipped) return sum;
      if (isHalf) return sum + 0.5;
      const startY = String(row?.start_date || '').slice(0, 4);
      const endY = String(row?.end_date || row?.start_date || '').slice(0, 4);
      const dbDays = row.days != null ? Number(row.days) : null;
      if (startY === String(year) && endY === String(year) && dbDays != null && !Number.isNaN(dbDays)) {
        return sum + dbDays;
      }
      return (
        sum +
        calculateLeaveDays(
          formatKoreanDateKey(clipped.start),
          formatKoreanDateKey(clipped.end),
        )
      );
    }

    if (isHalf) return sum + 0.5;
    const dbDays = row.days != null ? Number(row.days) : null;
    if (dbDays !== null && !Number.isNaN(dbDays)) return sum + dbDays;
    return sum + calculateLeaveDays(row?.start_date, row?.end_date);
  }, 0);

  if (writeStaff) {
    await db
      .update(staffMembersTable)
      .set({ annual_leave_used: approvedAnnualLeaveDays })
      .where(eq(staffMembersTable.id, staffId));
  }

  return approvedAnnualLeaveDays;
}
