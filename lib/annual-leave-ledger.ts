import { formatKoreanDateKey } from '@/lib/seoul-time';
import { syncApprovedLeaveRequestsToLedger } from '@/lib/unified-leave-ledger';
import {
  getD1Binding,
  getD1Drizzle,
  leave_requests as leaveRequestsTable,
  eq,
  and,
  desc,
  inArray,
} from '@/lib/db';
import {
  isAnnualLeaveType,
  isHalfLeaveType,
  getLeaveUnit,
  normalizeLeaveType,
  leaveTypeLookupAliases,
} from '@/lib/leave-type';

// leave_type SSOT: leave-type.ts — re-export for existing importers
export { isAnnualLeaveType, isHalfLeaveType, getLeaveUnit };

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
  const leaveType = normalizeLeaveType(params.leaveType);
  const { staffId, startDate, endDate } = params;
  const payload = buildLeaveRequestPayload({ ...params, leaveType });

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-ledger] D1 binding not available (ensureApprovedAnnualLeaveRequest)');
  const db = getD1Drizzle(d1);

  // 기존 레코드 조회 (staff_id + leave_type + start_date + end_date, 최신 순)
  // leave_type 은 정규 키 + 레거시 별칭 (연차 (1.0) 등) 으로 조회 — 대기 row 승격
  const typeAliases = leaveTypeLookupAliases(params.leaveType);
  const existingRows = await db
    .select({ id: leaveRequestsTable.id, status: leaveRequestsTable.status })
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.staff_id, staffId),
        inArray(leaveRequestsTable.leave_type, typeAliases),
        eq(leaveRequestsTable.start_date, startDate),
        eq(leaveRequestsTable.end_date, endDate),
      ),
    )
    .orderBy(desc(leaveRequestsTable.created_at))
    .limit(1);

  const existingRow = existingRows[0] ?? null;
  // 대기/빈 상태 포함 — 모바일 pre-insert 대기 row 를 승인으로 승격 (고아·이중 insert 방지)
  if (existingRow?.id) {
    if (!isApprovedLeaveStatus(existingRow.status)) {
      await db
        .update(leaveRequestsTable)
        .set({
          status: '승인',
          approved_at: payload.approved_at,
          // D1 스키마에 company_id 있음
          ...(params.companyId ? { company_id: params.companyId } : {}),
          days: payload.days ?? (isHalfLeaveType(payload.leave_type) ? 0.5 : calculateLeaveDays(payload.start_date, payload.end_date)) })
        .where(eq(leaveRequestsTable.id, existingRow.id));
    }
    return existingRow.id;
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

export function getHireDatePeriodRange(hireDateStr: string | null | undefined, baseDate = new Date()) {
  if (!hireDateStr) return null;
  const hireDate = new Date(hireDateStr);
  if (Number.isNaN(hireDate.getTime())) return null;

  const hireMonth = hireDate.getMonth();
  const hireDay = hireDate.getDate();

  let periodStart = new Date(baseDate.getFullYear(), hireMonth, hireDay);
  if (periodStart > baseDate) {
    periodStart = new Date(baseDate.getFullYear() - 1, hireMonth, hireDay);
  }

  const periodEnd = new Date(periodStart.getFullYear() + 1, hireMonth, hireDay);
  return { periodStart, periodEnd };
}

export type SyncAnnualLeaveUsedOptions = {
  year?: number;
  writeStaffMembers?: boolean;
  hireDate?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
};

/**
 * 승인된 연차 사용일수 집계.
 * - hireDate 지정 시: 입사일 기준 당해 연차 주기(periodStart ~ periodEnd)에 걸친 사용분만 집계
 * - year 지정 시: 해당 연도에 걸친 사용분만
 * - writeStaffMembers 기본 false → staff_members 미갱신
 */
export async function syncAnnualLeaveUsedForStaff(
  staffId: string,
  options?: SyncAnnualLeaveUsedOptions,
) {
  // leave_requests는 결재 workflow만 보관하고, 승인된 사용일수는 leave_ledger에만 반영한다.
  // options는 기존 호출부와의 호환을 위해 유지한다.
  void options;
  const summary = await syncApprovedLeaveRequestsToLedger(staffId);
  return summary.used;
}