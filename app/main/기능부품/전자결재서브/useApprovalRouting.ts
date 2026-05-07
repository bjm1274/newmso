import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { insertNotificationsOrThrow } from '@/lib/notification-utils';
import {
  appendApprovalHistory,
  getApprovalRevision,
  isApprovalLocked,
  isApprovalOverdue,
  markDelayNotification,
  resolveApprovalDelayConfig,
  shouldSendDelayNotification,
} from '@/lib/approval-workflow';
import { isMissingColumnError } from '@/lib/supabase-compat';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import type { StaffMember } from '@/types';
import { APPROVER_POSITIONS } from './approval-constants';
import { useApprovalDelegation } from './useApprovalDelegation';

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
  setApprovals,
}: UseApprovalRoutingParams) {
  const approverCandidates = useMemo(() => {
    const source = approvalDirectoryStaffs;
    if (!Array.isArray(source)) return [];
    const order = (staff: StaffMember) => APPROVER_POSITIONS.indexOf(String(staff.position || '').trim());
    return [...source]
      .filter((staff) => isActiveStaff(staff) && APPROVER_POSITIONS.includes(String(staff.position || '').trim()))
      .sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
  }, [approvalDirectoryStaffs]);

  const normalizeApprovalLineIds = useCallback((line: unknown): string[] => {
    if (!Array.isArray(line)) return [];
    const ids = line
      .map((entry: unknown) => {
        if (entry == null) return null;
        if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
        if (typeof entry === 'object' && entry !== null && 'id' in entry && (entry as ApprovalRecord).id != null) return String((entry as ApprovalRecord).id);
        return null;
      })
      .filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, []);

  const resolveApprovalLineIds = useCallback((item: ApprovalRecord): string[] => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const explicitLineIds = normalizeApprovalLineIds(item?.approver_line ?? metaData?.approver_line);
    if (explicitLineIds.length > 0) return explicitLineIds;
    if (item?.current_approver_id != null) return [String(item.current_approver_id)];
    return [];
  }, [normalizeApprovalLineIds]);

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

  const resolveStoredCurrentApproverId = useCallback((item: ApprovalRecord): string | null => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
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
  }, [resolveApprovalLineIds]);

  const buildApprovalHistoryEntry = useCallback((action: ApprovalHistoryEntry['action'], note?: string | null) => ({
    action,
    actor_id: user?.id ? String(user.id) : null,
    actor_name: user?.name ? String(user.name) : null,
    note: note ?? null,
  }), [user?.id, user?.name]);

  const {
    resolveEffectiveApproverId,
    resolveApprovalDelegateSnapshot,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting,
  } = useApprovalDelegation({
    approvalStaffMap,
    normalizeApprovalLineIds,
    resolveStoredCurrentApproverId,
    resolveApprovalDelayConfigForStaff,
    buildApprovalHistoryEntry,
    setApprovals,
  });

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
      notificationCount: Math.max(0, Number(tracker?.count) || 0),
    };
  }, [resolveApprovalDelayConfigForStaff, resolveStoredCurrentApproverId]);

  const resolveApprovalLockSnapshot = useCallback((item: ApprovalRecord) => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    if (!isApprovalLocked(metaData)) {
      return {
        lockedAt: '',
        lockedById: '',
        lockedByName: '',
        revision: 1,
      };
    }
    const lockedById = String(metaData?.edit_locked_by || '');
    const lockedByStaff = lockedById ? approvalStaffMap.get(lockedById) : null;
    return {
      lockedAt: String(metaData?.edit_locked_at || ''),
      lockedById,
      lockedByName: lockedByStaff?.name || lockedById || '시스템',
      revision: getApprovalRevision(metaData),
    };
  }, [approvalStaffMap]);

  const syncApprovalDelayNotifications = useCallback(async (items: ApprovalRecord[]) => {
    const overdueItems = items.filter((item) => {
      const originalApproverId = resolveStoredCurrentApproverId(item);
      const delayConfig = resolveApprovalDelayConfigForStaff(originalApproverId);
      if (!isApprovalOverdue(item, delayConfig.thresholdHours)) return false;
      const currentApproverId = resolveCurrentApproverId(item);
      if (!currentApproverId) return false;
      const metaData = item?.meta_data as ApprovalRecord | null | undefined;
      return shouldSendDelayNotification(
        metaData,
        currentApproverId,
        delayConfig.thresholdHours,
        delayConfig.repeatHours,
        delayConfig.maxNotifications
      );
    });

    if (overdueItems.length === 0) return;

    for (const item of overdueItems) {
      const originalApproverId = resolveStoredCurrentApproverId(item);
      const delayConfig = resolveApprovalDelayConfigForStaff(originalApproverId);
      const currentApproverId = resolveCurrentApproverId(item);
      if (!currentApproverId) continue;
      const metaData = item?.meta_data as ApprovalRecord | null | undefined;
      const nextMetaData = appendApprovalHistory(
        markDelayNotification(
          metaData,
          currentApproverId,
          delayConfig.thresholdHours,
          delayConfig.repeatHours,
          delayConfig.maxNotifications
        ),
        {
          ...buildApprovalHistoryEntry('delay_notified', '결재 지연 알림 발송'),
          current_approver_id: currentApproverId,
          revision: getApprovalRevision(metaData),
        }
      );

      try {
        await insertNotificationsOrThrow({
          user_id: currentApproverId,
          type: 'approval',
          title: `[결재 지연] ${String(item.title || '전자결재 문서')}`,
          body: `${String(item.sender_name || '기안자')} 문서가 ${delayConfig.thresholdHours}시간 이상 대기 중입니다.`,
          metadata: {
            id: item.id,
            approval_id: item.id,
            type: 'approval',
            approval_view: '결재함',
            approval_role: 'delayed',
            delay_hours: delayConfig.thresholdHours,
            delay_repeat_hours: delayConfig.repeatHours,
            delay_max_notifications: delayConfig.maxNotifications,
          },
        });
        await supabase.from('approvals').update({ meta_data: nextMetaData }).eq('id', item.id);
      } catch (delayError) {
        console.error('approval delay notification failed:', delayError);
      }
    }
  }, [buildApprovalHistoryEntry, resolveApprovalDelayConfigForStaff, resolveCurrentApproverId, resolveStoredCurrentApproverId]);

  const syncApprovalRouting = useCallback(async (item: ApprovalRecord, currentApproverId: string | null) => {
    if (!item?.id || !currentApproverId) return null;
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const storedLineIds = normalizeApprovalLineIds(item.approver_line ?? metaData?.approver_line);
    const updates: ApprovalRecord = {};

    if (!item.current_approver_id) {
      updates.current_approver_id = currentApproverId;
    }
    if (storedLineIds.length === 0) {
      updates.approver_line = [currentApproverId];
    }
    if (Object.keys(updates).length === 0) return null;

    let effectiveUpdates = { ...updates };
    while (true) {
      if (Object.keys(effectiveUpdates).length === 0) return null;

      const { error } = await supabase.from('approvals').update(effectiveUpdates).eq('id', item.id);
      if (!isMissingColumnError(error, 'approver_line') || !('approver_line' in effectiveUpdates)) {
        if (!error) {
          setApprovals((prev) => prev.map((approval) => (
            approval.id === item.id ? { ...approval, ...effectiveUpdates } : approval
          )));
        }
        return error;
      }

      const { approver_line, ...legacyUpdates } = effectiveUpdates;
      void approver_line;
      effectiveUpdates = legacyUpdates;
    }
  }, [normalizeApprovalLineIds, setApprovals]);

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
    syncApprovalDelayNotifications,
    syncApprovalRouting,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting,
  };
}
