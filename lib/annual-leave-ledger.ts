import { supabase } from '@/lib/supabase';

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

export async function ensureApprovedAnnualLeaveRequest(params: {
  staffId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const { staffId, leaveType, startDate, endDate, reason } = params;

  const { data: existing, error: existingError } = await supabase
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
      const { error: approveError } = await supabase
        .from('leave_requests')
        .update({
          status: '\uc2b9\uc778',
          approved_at: new Date().toISOString(),
        })
        .eq('id', matched.id);

      if (approveError) throw approveError;
    }

    return matched.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('leave_requests')
    .insert({
      staff_id: staffId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: '\uc2b9\uc778',
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) throw insertError;
  return inserted?.id ?? null;
}

export async function syncAnnualLeaveUsedForStaff(staffId: string) {
  const { data, error } = await supabase
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

  const { error: updateError } = await supabase
    .from('staff_members')
    .update({ annual_leave_used: approvedAnnualLeaveDays })
    .eq('id', staffId);

  if (updateError) throw updateError;
  return approvedAnnualLeaveDays;
}
