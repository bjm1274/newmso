import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { upsertNotificationWithDedupe } from '@/lib/notification-utils';
import {
  appendApprovalHistory,
  getApprovalRevision,
  isApprovalOverdue,
  markDelayNotification,
  shouldSendDelayNotification } from '@/lib/approval-workflow';
import { resolveEffectiveApproverIdCore } from '@/lib/approval-shared';
import { isMissingColumnError } from '@/lib/db-compat';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';

type ApprovalRecord = Record<string, unknown>;
type ApprovalHistoryEntry = Parameters<typeof appendApprovalHistory>[1];

type ApprovalDelayConfig = {
  thresholdHours: number;
  repeatHours: number;
  maxNotifications: number;
};

type UseApprovalDelegationParams = {
  approvalStaffMap: Map<string, StaffMember>;
  normalizeApprovalLineIds: (line: unknown) => string[];
  resolveStoredCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalDelayConfigForStaff: (staffId: string | null | undefined) => ApprovalDelayConfig;
  buildApprovalHistoryEntry: (action: ApprovalHistoryEntry['action'], note?: string | null) => ApprovalHistoryEntry;
  setApprovals: Dispatch<SetStateAction<ApprovalRecord[]>>;
};

export function useApprovalDelegation({
  approvalStaffMap,
  normalizeApprovalLineIds,
  resolveStoredCurrentApproverId,
  resolveApprovalDelayConfigForStaff,
  buildApprovalHistoryEntry,
  setApprovals }: UseApprovalDelegationParams) {
  const resolveEffectiveApproverId = useCallback((approverId: string | null | undefined) => {
    if (!approverId) return null;
    const matchedStaff = approvalStaffMap.get(String(approverId));
    return resolveEffectiveApproverIdCore(
      approverId,
      matchedStaff && typeof matchedStaff === 'object' ? (matchedStaff as unknown as ApprovalRecord) : null
    );
  }, [approvalStaffMap]);

  const resolveApprovalDelegateSnapshot = useCallback((item: ApprovalRecord) => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const originalApproverId = String(metaData?.delegated_from_id || resolveStoredCurrentApproverId(item) || '');
    const effectiveApproverId = String(metaData?.delegated_to_id || resolveEffectiveApproverId(originalApproverId) || '');
    if (!originalApproverId || !effectiveApproverId || originalApproverId === effectiveApproverId) {
      return {
        delegatedFromId: '',
        delegatedToId: '',
        delegatedFromName: '',
        delegatedToName: '',
        delegatedAt: '' };
    }
    const originalApprover = approvalStaffMap.get(originalApproverId);
    const effectiveApprover = approvalStaffMap.get(effectiveApproverId);
    return {
      delegatedFromId: originalApproverId,
      delegatedToId: effectiveApproverId,
      delegatedFromName: originalApprover?.name || originalApproverId,
      delegatedToName: effectiveApprover?.name || effectiveApproverId,
      delegatedAt: String(metaData?.delegated_at || '') };
  }, [approvalStaffMap, resolveEffectiveApproverId, resolveStoredCurrentApproverId]);

  const syncDelegatedApprovalDelayNotifications = useCallback(async (items: ApprovalRecord[]) => {
    const overdueItems = items.filter((item) => {
      const originalApproverId = resolveStoredCurrentApproverId(item);
      const currentApproverId = resolveEffectiveApproverId(originalApproverId);
      if (!currentApproverId) return false;
      const delayConfig = resolveApprovalDelayConfigForStaff(originalApproverId);
      if (!isApprovalOverdue(item, delayConfig.thresholdHours)) return false;
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
      const currentApproverId = resolveEffectiveApproverId(originalApproverId);
      if (!currentApproverId) continue;
      const delayConfig = resolveApprovalDelayConfigForStaff(originalApproverId);
      const delayHours = delayConfig.thresholdHours;
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
          revision: getApprovalRevision(metaData) }
      );

      try {
        // 같은 결재+승인자+회차에 대해 어디서 호출되든 1건만 생성되도록 결정적 ID로 dedupe.
        // 여러 탭/기기가 동시에 syncDelegatedApprovalDelayNotifications를 실행해도 중복 알림 방지.
        await upsertNotificationWithDedupe({
          user_id: currentApproverId,
          type: 'approval',
          title: `[결재 지연] ${String(item.title || '전자결재 문서')}`,
          body: `${String(item.sender_name || '기안자')} 문서가 ${delayHours}시간 이상 대기 중입니다.`,
          metadata: {
            id: item.id,
            approval_id: item.id,
            type: 'approval',
            approval_view: '결재함',
            approval_role: 'delayed',
            delay_hours: delayConfig.thresholdHours,
            delay_repeat_hours: delayConfig.repeatHours,
            delay_max_notifications: delayConfig.maxNotifications,
            delay_count: nextCount },
          dedupeKey: `approval-delay:${String(item.id)}:${currentApproverId}:${nextCount}` });
        await db.from('approvals').update({ meta_data: nextMetaData }).eq('id', item.id);
      } catch (delayError) {
        console.error('approval delay notification failed:', delayError);
      }
    }
  }, [buildApprovalHistoryEntry, resolveApprovalDelayConfigForStaff, resolveEffectiveApproverId, resolveStoredCurrentApproverId]);

  const syncDelegatedApprovalRouting = useCallback(async (item: ApprovalRecord, currentApproverId: string | null) => {
    if (!item?.id || !currentApproverId) return null;
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const storedLineIds = normalizeApprovalLineIds(item.approver_line ?? metaData?.approver_line);
    const effectiveApproverId = resolveEffectiveApproverId(currentApproverId) || currentApproverId;
    const updates: ApprovalRecord = {};

    if (String(item.current_approver_id || '') !== String(effectiveApproverId)) {
      updates.current_approver_id = effectiveApproverId;
    }
    if (storedLineIds.length === 0) {
      updates.approver_line = [currentApproverId];
    }
    if (
      String(effectiveApproverId) !== String(currentApproverId) &&
      String(metaData?.delegated_to_id || '') !== String(effectiveApproverId)
    ) {
      updates.meta_data = appendApprovalHistory(
        {
          ...(metaData || {}),
          delegated_from_id: currentApproverId,
          delegated_to_id: effectiveApproverId,
          delegated_at: new Date().toISOString() },
        {
          ...buildApprovalHistoryEntry('delegated', `${currentApproverId} -> ${effectiveApproverId}`),
          current_approver_id: effectiveApproverId,
          revision: getApprovalRevision(metaData) }
      );
    }

    if (Object.keys(updates).length === 0) return null;

    let effectiveUpdates = { ...updates };
    while (true) {
      if (Object.keys(effectiveUpdates).length === 0) return null;

      const { error } = await db.from('approvals').update(effectiveUpdates).eq('id', item.id);
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
  }, [buildApprovalHistoryEntry, normalizeApprovalLineIds, resolveEffectiveApproverId, setApprovals]);

  return {
    resolveEffectiveApproverId,
    resolveApprovalDelegateSnapshot,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting };
}
