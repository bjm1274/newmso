import 'server-only';
export * from '@/lib/annual-leave-calculator';
import {
  calculateLeaveDays,
  isApprovedLeaveStatus,
  isHalfLeaveType,
  normalizeLeaveType,
  leaveTypeLookupAliases,
} from '@/lib/annual-leave-calculator';

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

  const { getD1Binding, getD1Drizzle, leave_requests, eq, and, desc, inArray } = await import('@/lib/db');
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-ledger] D1 binding not available (ensureApprovedAnnualLeaveRequest)');
  const db = getD1Drizzle(d1);

  // 기존 레코드 조회 (staff_id + leave_type + start_date + end_date, 최신 순)
  // leave_type 은 정규 키 + 레거시 별칭 (연차 (1.0) 등) 으로 조회 — 대기 row 승격
  const typeAliases = leaveTypeLookupAliases(params.leaveType);
  const existingRows = await db
    .select({ id: leave_requests.id, status: leave_requests.status })
    .from(leave_requests)
    .where(
      and(
        eq(leave_requests.staff_id, staffId),
        inArray(leave_requests.leave_type, typeAliases),
        eq(leave_requests.start_date, startDate),
        eq(leave_requests.end_date, endDate),
      ),
    )
    .orderBy(desc(leave_requests.created_at))
    .limit(1);

  const existingRow = existingRows[0] ?? null;
  // 대기/빈 상태 포함 — 모바일 pre-insert 대기 row 를 승인으로 승격 (고아·이중 insert 방지)
  if (existingRow?.id) {
    if (!isApprovedLeaveStatus(existingRow.status)) {
      await db
        .update(leave_requests)
        .set({
          status: '승인',
          approved_at: payload.approved_at,
          // D1 스키마에 company_id 있음
          ...(params.companyId ? { company_id: params.companyId } : {}),
          days: payload.days ?? (isHalfLeaveType(payload.leave_type) ? 0.5 : calculateLeaveDays(payload.start_date, payload.end_date)) })
        .where(eq(leave_requests.id, existingRow.id));
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
  await db.insert(leave_requests).values(insertValues);
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
  const { syncApprovedLeaveRequestsToLedger } = await import('@/lib/unified-leave-ledger');
  const summary = await syncApprovedLeaveRequestsToLedger(staffId);
  return summary.used;
}
