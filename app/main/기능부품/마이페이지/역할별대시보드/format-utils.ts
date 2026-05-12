import { resolveApprovalDelegateConfig } from '@/lib/approval-workflow';
import type { ApprovalRow, TodayAttendance } from './types';

export function formatTodayAttendancePrimary(
  todayAttendance: TodayAttendance,
  formatTime: (value: string | null) => string,
) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '연차';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '반차';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '병가';
  return formatTime(todayAttendance.in);
}

export function formatTodayAttendanceSecondary(
  todayAttendance: TodayAttendance,
  formatTime: (value: string | null) => string,
) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '승인된 연차 일정';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '승인된 반차 일정';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '승인된 병가 일정';
  return todayAttendance.out ? `퇴근 ${formatTime(todayAttendance.out)}` : null;
}

export function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  const ids = line
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
      if (typeof entry === 'object' && entry !== null && 'id' in entry && (entry as Record<string, unknown>).id != null) {
        return String((entry as Record<string, unknown>).id);
      }
      return null;
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

export function resolveApprovalLineIds(item: ApprovalRow): string[] {
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  const explicitLineIds = normalizeApprovalLineIds(item?.approver_line ?? metaData?.approver_line);
  if (explicitLineIds.length > 0) return explicitLineIds;
  if (item?.current_approver_id != null) return [String(item.current_approver_id)];
  return [];
}

export function resolveStoredCurrentApproverId(item: ApprovalRow): string | null {
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  if (item?.current_approver_id != null) {
    const currentApproverId = String(item.current_approver_id);
    const delegatedToId = String(metaData?.delegated_to_id || '');
    const delegatedFromId = String(metaData?.delegated_from_id || '');
    if (delegatedToId && delegatedToId === currentApproverId && delegatedFromId) {
      return delegatedFromId;
    }
    return currentApproverId;
  }

  const lineIds = resolveApprovalLineIds(item);
  return lineIds[0] ?? null;
}

export function resolveEffectiveApproverId(
  approverId: string | null | undefined,
  approverMap: Map<string, Record<string, unknown>>,
) {
  if (!approverId) return null;
  const matchedApprover = approverMap.get(String(approverId));
  const delegateConfig = resolveApprovalDelegateConfig(matchedApprover ?? null);
  if (delegateConfig.active && delegateConfig.delegateId) {
    return String(delegateConfig.delegateId);
  }
  return String(approverId);
}
