import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  leave_requests as leaveRequestsTable,
  staff_members as staffMembersTable,
  eq,
  and,
  desc,
} from '@/lib/db';
import { logD1MirrorFailure } from '@/lib/db/mirror-metrics';

const APPROVED_STATUS_LABELS = new Set(['승인', 'approved']);

export function isAnnualLeaveType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;

  // '연차(이력)': 만료된 이전 사이클의 사용 이력 — 근태 화면엔 표시하되
  // 현재 잔여 계산(annual_leave_used)에는 합산하지 않는다.
  if (normalized.includes('이력')) return false;

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

    if (isHalfLeaveType(row?.leave_type)) {
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
};

function buildLeaveRequestPayload(params: EnsureApprovedAnnualLeaveRequestParams) {
  const optionalEntries = Object.entries({
    approval_id: params.approvalId ?? null,
    company_id: params.companyId ?? null,
    company_name: params.companyName ?? null,
    delegate_id: params.delegateId ?? null,
    delegate_name: params.delegateName ?? null,
    delegate_department: params.delegateDepartment ?? null,
    delegate_position: params.delegatePosition ?? null,
  }).filter(([, value]) => value != null && String(value).trim() !== '');

  return {
    staff_id: params.staffId,
    leave_type: params.leaveType,
    start_date: params.startDate,
    end_date: params.endDate,
    reason: params.reason,
    status: '승인',
    approved_at: new Date().toISOString(),
    optionalEntries,
  };
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
};

export async function ensureApprovedAnnualLeaveRequest(params: {
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
}, client: SupabaseClient = supabase) {
  const { staffId, leaveType, startDate, endDate } = params;
  const payload = buildLeaveRequestPayload(params);

  const backend = await resolveDataBackend();

  if (backend === 'd1') {
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
          })
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
    };
    await db.insert(leaveRequestsTable).values(insertValues);
    return newId;
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────
  const optionalColumnNames = payload.optionalEntries.map(([columnName]) => columnName);

  const { data: existing, error: existingError } = await client
    .from('leave_requests')
    .select('id, status')
    .eq('staff_id', staffId)
    .eq('leave_type', leaveType)
    .eq('start_date', startDate)
    .eq('end_date', endDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  const matched = Array.isArray(existing)
    ? existing.find((row) => isApprovedLeaveStatus(row?.status) || String(row?.status ?? '').trim() === '')
    : null;

  if (matched?.id) {
    if (!isApprovedLeaveStatus(matched.status)) {
      const { error: approveError } = await withMissingColumnsFallback(
        (omittedColumns) =>
          client
            .from('leave_requests')
            .update({
              status: '승인',
              approved_at: payload.approved_at,
              ...Object.fromEntries(
                payload.optionalEntries.filter(([columnName]) => !omittedColumns.has(columnName))
              ),
            })
            .eq('id', matched.id),
        optionalColumnNames,
      );

      if (approveError) throw approveError;

      // dual-write: leave_requests.status 미러 (best-effort)
      if (backend === 'dual-write') {
        try {
          const d1 = await getD1Binding();
          if (d1) {
            const db = getD1Drizzle(d1);
            await db
              .update(leaveRequestsTable)
              .set({ status: '승인', approved_at: payload.approved_at })
              .where(eq(leaveRequestsTable.id, matched.id));
          }
        } catch (mirrorErr) {
          logD1MirrorFailure(mirrorErr, { label: 'mirror:leave_requests.approve', backend });
        }
      }
    }

    return matched.id;
  }

  const insertResult: { data: { id: string | null } | null; error: unknown } =
    await withMissingColumnsFallback<{ id: string | null }>(
    (omittedColumns) =>
      client
        .from('leave_requests')
        .insert({
          staff_id: payload.staff_id,
          leave_type: payload.leave_type,
          start_date: payload.start_date,
          end_date: payload.end_date,
          reason: payload.reason,
          status: payload.status,
          approved_at: payload.approved_at,
          ...Object.fromEntries(
            payload.optionalEntries.filter(([columnName]) => !omittedColumns.has(columnName))
          ),
        })
        .select('id')
        .single(),
      optionalColumnNames,
    );

  const inserted = insertResult.data;
  const insertError = insertResult.error;
  if (insertError) throw insertError;

  // dual-write: leave_requests 신규 insert 미러 (best-effort)
  if (backend === 'dual-write' && inserted?.id) {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        const d1InsertValues: D1LeaveRequestInsert = {
          id: inserted.id,
          staff_id: payload.staff_id,
          leave_type: payload.leave_type,
          start_date: payload.start_date,
          end_date: payload.end_date,
          reason: payload.reason,
          status: payload.status,
          approved_at: payload.approved_at,
          company_id: params.companyId ?? null,
          created_at: new Date().toISOString(),
        };
        await db.insert(leaveRequestsTable).values(d1InsertValues).onConflictDoNothing();
      }
    } catch (mirrorErr) {
      logD1MirrorFailure(mirrorErr, { label: 'mirror:leave_requests.insert', backend });
    }
  }

  return inserted?.id ?? null;
}

export async function syncAnnualLeaveUsedForStaff(staffId: string, client: SupabaseClient = supabase) {
  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[annual-leave-ledger] D1 binding not available (syncAnnualLeaveUsedForStaff)');
    const db = getD1Drizzle(d1);

    const rows = await db
      .select({
        leave_type: leaveRequestsTable.leave_type,
        start_date: leaveRequestsTable.start_date,
        end_date: leaveRequestsTable.end_date,
        status: leaveRequestsTable.status,
      })
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.staff_id, staffId));

    const approvedAnnualLeaveDays = rows.reduce((sum, row) => {
      if (!isApprovedLeaveStatus(row?.status)) return sum;
      const unit = getLeaveUnit(row?.leave_type);
      if (unit === 0.5) return sum + 0.5;
      if (!isAnnualLeaveType(row?.leave_type)) return sum;
      return sum + calculateLeaveDays(row?.start_date, row?.end_date);
    }, 0);

    await db
      .update(staffMembersTable)
      .set({ annual_leave_used: approvedAnnualLeaveDays })
      .where(eq(staffMembersTable.id, staffId));

    return approvedAnnualLeaveDays;
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────
  const { data, error } = await client
    .from('leave_requests')
    .select('leave_type, start_date, end_date, status')
    .eq('staff_id', staffId);

  if (error) throw error;

  const approvedAnnualLeaveDays = (data || []).reduce((sum, row) => {
    if (!isApprovedLeaveStatus(row?.status)) {
      return sum;
    }

    const unit = getLeaveUnit(row?.leave_type);

    // 반차(0.5단위): 단일 날짜에 0.5일 소모
    if (unit === 0.5) {
      return sum + 0.5;
    }

    // 풀데이 연차만 날짜 범위 계산
    if (!isAnnualLeaveType(row?.leave_type)) {
      return sum;
    }

    return sum + calculateLeaveDays(row?.start_date, row?.end_date);
  }, 0);

  const { error: updateError } = await client
    .from('staff_members')
    .update({ annual_leave_used: approvedAnnualLeaveDays })
    .eq('id', staffId);

  if (updateError) throw updateError;

  // dual-write: staff_members.annual_leave_used 미러 (best-effort)
  if (backend === 'dual-write') {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        await db
          .update(staffMembersTable)
          .set({ annual_leave_used: approvedAnnualLeaveDays })
          .where(eq(staffMembersTable.id, staffId));
      }
    } catch (mirrorErr) {
      logD1MirrorFailure(mirrorErr, { label: 'mirror:staff_members.annual_leave_used', backend });
    }
  }

  return approvedAnnualLeaveDays;
}
