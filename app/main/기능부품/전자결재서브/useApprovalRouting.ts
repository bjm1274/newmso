import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { upsertNotificationWithDedupe } from '@/lib/notification-utils';
import {
  appendApprovalHistory,
  getApprovalRevision,
  isApprovalLocked,
  isApprovalOverdue,
  markDelayNotification,
  resolveApprovalDelayConfig,
  shouldSendDelayNotification,
} from '@/lib/approval-workflow';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import {
  normalizeApprovalLineIds as normalizeApprovalLineIdsCore,
  resolveApprovalLineIds as resolveApprovalLineIdsCore,
  resolveStoredCurrentApproverId as resolveStoredCurrentApproverIdCore,
  buildApprovalHistoryEntryCore,
} from '@/lib/approval-shared';
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

  const buildApprovalHistoryEntry = useCallback(
    (action: ApprovalHistoryEntry['action'], note?: string | null) =>
      buildApprovalHistoryEntryCore(
        user?.id ? String(user.id) : null,
        user?.name ? String(user.name) : null,
        action,
        note
      ),
    [user?.id, user?.name]
  );

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
      const tracker = (metaData?.delay_notification && typeof metaData.delay_notification === 'object')
        ? (metaData.delay_notification as ApprovalRecord)
        : null;
      const previousCount = Math.max(0, Number(tracker?.count) || 0);
      const nextCount = previousCount + 1;
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
        // 결정적 ID로 dedupe — 여러 탭/기기 동시 실행 시 중복 알림 방지
        await upsertNotificationWithDedupe({
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
            delay_count: nextCount,
          },
          dedupeKey: `approval-delay:${String(item.id)}:${currentApproverId}:${nextCount}`,
        });
        await supabase.from('approvals').update({ meta_data: nextMetaData }).eq('id', item.id);
      } catch (delayError) {
        console.error('approval delay notification failed:', delayError);
      }
    }
  }, [buildApprovalHistoryEntry, resolveApprovalDelayConfigForStaff, resolveCurrentApproverId, resolveStoredCurrentApproverId]);

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
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting,
  };
}
