import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  appendApprovalHistory,
  getApprovalRevision,
  isApprovalLocked,
  isApprovalOverdue,
  resolveApprovalDelayConfig } from '@/lib/approval-workflow';
import { isActiveStaff } from '@/lib/active-staff';
import {
  normalizeApprovalLineIds as normalizeApprovalLineIdsCore,
  resolveApprovalLineIds as resolveApprovalLineIdsCore,
  resolveStoredCurrentApproverId as resolveStoredCurrentApproverIdCore } from '@/lib/approval-shared';
import type { StaffMember } from '@/types';
import { APPROVER_POSITIONS } from './approval-constants';
import { useApprovalDelegation } from './useApprovalDelegation';
import { useApprovalHistoryEntry } from './useApprovalHistoryEntry';

type ApprovalRecord = Record<string, unknown>;
type ApprovalHistoryEntry = Parameters<typeof appendApprovalHistory>[1];

type UseApprovalRoutingParams = {
  user: StaffMember | null;
  approvalDirectoryStaffs: StaffMember[];
  setApprovals: Dispatch<SetStateAction<ApprovalRecord[]>>;
};

export function useApprovalRouting({
  user,
  approvalDirectoryStaffs,
  setApprovals }: UseApprovalRoutingParams) {
  const approverCandidates = useMemo(() => {
    const source = approvalDirectoryStaffs;
    if (!Array.isArray(source)) return [];
    const order = (staff: StaffMember) => APPROVER_POSITIONS.indexOf(String(staff.position || '').trim());
    return [...source]
      .filter((staff) => isActiveStaff(staff) && APPROVER_POSITIONS.includes(String(staff.position || '').trim()))
      .sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
  }, [approvalDirectoryStaffs]);

  const normalizeApprovalLineIds = useCallback((line: unknown): string[] => normalizeApprovalLineIdsCore(line), []);

  const resolveApprovalLineIds = useCallback((item: ApprovalRecord): string[] => resolveApprovalLineIdsCore(item), []);

  const approvalStaffMap = useMemo(
    () => new Map((Array.isArray(approvalDirectoryStaffs) ? approvalDirectoryStaffs : []).map((staff) => [String(staff.id), staff])),
    [approvalDirectoryStaffs]
  );

  const resolveApprovalDelayConfigForStaff = useCallback((staffId: string | null | undefined) => {
    if (!staffId) return resolveApprovalDelayConfig(null);
    const matchedStaff = approvalStaffMap.get(String(staffId));
    return resolveApprovalDelayConfig(
      matchedStaff && typeof matchedStaff === 'object' ? (matchedStaff as unknown as ApprovalRecord) : null
    );
  }, [approvalStaffMap]);

  const resolveApprovalDelayHoursForStaff = useCallback((staffId: string | null | undefined) => {
    return resolveApprovalDelayConfigForStaff(staffId).thresholdHours;
  }, [resolveApprovalDelayConfigForStaff]);

  const resolveStoredCurrentApproverId = useCallback(
    (item: ApprovalRecord): string | null => resolveStoredCurrentApproverIdCore(item),
    []
  );

  const buildApprovalHistoryEntry = useApprovalHistoryEntry(user);

  const {
    resolveEffectiveApproverId,
    resolveApprovalDelegateSnapshot,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting } = useApprovalDelegation({
    approvalStaffMap,
    normalizeApprovalLineIds,
    resolveStoredCurrentApproverId,
    resolveApprovalDelayConfigForStaff,
    buildApprovalHistoryEntry,
    setApprovals });

  const resolveCurrentApproverId = useCallback((item: ApprovalRecord): string | null => {
    return resolveEffectiveApproverId(resolveStoredCurrentApproverId(item));
  }, [resolveEffectiveApproverId, resolveStoredCurrentApproverId]);

  const resolveApprovalDelaySnapshot = useCallback((item: ApprovalRecord) => {
    const originalApproverId = resolveStoredCurrentApproverId(item);
    const delayConfig = resolveApprovalDelayConfigForStaff(originalApproverId);
    const thresholdHours = delayConfig.thresholdHours;
    const createdAt = String(item?.created_at || '');
    const createdDate = createdAt ? new Date(createdAt) : null;
    const elapsedHours =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60)))
        : 0;
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const tracker =
      metaData?.delay_notification && typeof metaData.delay_notification === 'object'
        ? (metaData.delay_notification as ApprovalRecord)
        : null;
    return {
      thresholdHours,
      repeatHours: Math.max(1, Number(tracker?.repeat_hours) || delayConfig.repeatHours),
      maxNotifications: Math.max(1, Number(tracker?.max_notifications) || delayConfig.maxNotifications),
      elapsedHours,
      overdue: String(item?.status || '').trim() === '대기' && isApprovalOverdue(item, thresholdHours),
      lastNotifiedAt: String(tracker?.last_notified_at || ''),
      notificationCount: Math.max(0, Number(tracker?.count) || 0) };
  }, [resolveApprovalDelayConfigForStaff, resolveStoredCurrentApproverId]);

  const resolveApprovalLockSnapshot = useCallback((item: ApprovalRecord) => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    if (!isApprovalLocked(metaData)) {
      return {
        lockedAt: '',
        lockedById: '',
        lockedByName: '',
        revision: 1 };
    }
    const lockedById = String(metaData?.edit_locked_by || '');
    const lockedByStaff = lockedById ? approvalStaffMap.get(lockedById) : null;
    return {
      lockedAt: String(metaData?.edit_locked_at || ''),
      lockedById,
      lockedByName: lockedByStaff?.name || lockedById || '시스템',
      revision: getApprovalRevision(metaData) };
  }, [approvalStaffMap]);

  return {
    approvalStaffMap,
    approverCandidates,
    normalizeApprovalLineIds,
    resolveApprovalLineIds,
    resolveApprovalDelayConfigForStaff,
    resolveApprovalDelayHoursForStaff,
    resolveStoredCurrentApproverId,
    resolveEffectiveApproverId,
    resolveCurrentApproverId,
    resolveApprovalDelegateSnapshot,
    resolveApprovalDelaySnapshot,
    resolveApprovalLockSnapshot,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting };
}
