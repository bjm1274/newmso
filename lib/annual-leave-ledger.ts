import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { formatKoreanDateKey } from '@/lib/seoul-time';

const APPROVED_STATUS_LABELS = new Set(['\uc2b9\uc778', 'approved']);

export function isAnnualLeaveType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;

  // '\uc5f0\ucc28(\uc774\ub825)': \ub9cc\ub8cc\ub41c \uc774\uc804 \uc0ac\uc774\ud074\uc758 \uc0ac\uc6a9 \uc774\ub825 \u2014 \uadfc\ud0dc \ud654\uba74\uc5d4 \ud45c\uc2dc\ud558\ub418
  // \ud604\uc7ac \uc794\uc5ec \uacc4\uc0b0(annual_leave_used)\uc5d0\ub294 \ud569\uc0b0\ud558\uc9c0 \uc54a\ub294\ub2e4.
  if (normalized.includes('\uc774\ub825')) return false;

  return (
    normalized === 'annual_leave' ||
    normalized === 'annual' ||
    normalized === '\uc5f0\ucc28' ||
    normalized === '\uc5f0\ucc28/\ud734\uac00' ||
    normalized.includes('\uc5f0\ucc28')
  );
}

export function isHalfLeaveType(value: unknown): boolean {
  return getLeaveUnit(value) === 0.5;
}

/**
 * \ud734\uac00 \uc720\ud615\ubcc4 1\ud68c\ub2f9 \uc18c\ubaa8 \uc77c\uc218 \ub2e8\uc704 \ubc18\ud658
 * - \ubc18\ucc28(\uc624\uc804/\uc624\ud6c4 \ud3ec\ud568): 0.5
 * - \uadf8 \uc678 \uc5f0\ucc28/\uacf5\uac00 \ub4f1 \ud480\ub370\uc774: 1.0
 * \uc8fc\uc758: \ubc18\ubc18\ucc28(0.25)\ub294 \uc774 \uc2dc\uc2a4\ud15c\uc5d0\uc11c \uc9c0\uc6d0\ud558\uc9c0 \uc54a\uc74c
 */
export function getLeaveUnit(value: unknown): 0.5 | 1.0 {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 1.0;

  const isHalf =
    normalized === 'half_leave' ||
    normalized === 'half-day' ||
    normalized === '\ubc18\ucc28' ||
    normalized === '\uc624\uc804\ubc18\ucc28' ||
    normalized === '\uc624\ud6c4\ubc18\ucc28' ||
    normalized.startsWith('\ubc18\ucc28') ||
    normalized.endsWith('\ubc18\ucc28');

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
  return inserted?.id ?? null;
}

export async function syncAnnualLeaveUsedForStaff(staffId: string, client: SupabaseClient = supabase) {
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
  return approvedAnnualLeaveDays;
}
