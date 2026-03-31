import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';

const APPROVED_STATUS_LABELS = new Set(['\uc2b9\uc778', 'approved']);

export function isAnnualLeaveType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'annual_leave' ||
    normalized === 'annual' ||
    normalized === '\uc5f0\ucc28' ||
    normalized === '\uc5f0\ucc28/\ud734\uac00' ||
    normalized.includes('\uc5f0\ucc28')
  );
}

export function isHalfLeaveType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'half_leave' ||
    normalized === 'half-day' ||
    normalized === '\ubc18\ucc28' ||
    normalized.includes('\ubc18\ucc28')
  );
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
        clippedRange.start.toISOString().slice(0, 10),
        clippedRange.end.toISOString().slice(0, 10)
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
    if (!isApprovedLeaveStatus(row?.status) || !isAnnualLeaveType(row?.leave_type)) {
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
