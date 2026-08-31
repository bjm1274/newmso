import { useCallback, type Dispatch, type SetStateAction } from 'react';
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

  /**
   * 결재 지연 알림 — 이 구현이 유일한 정본이다.
   *
   * 예전에는 useApprovalRouting 에도 거의 같은 코드(syncApprovalDelayNotifications)가
   * 한 벌 더 있었는데, 훅이 반환만 하고 호출부가 0건인 사장 코드였다. 두 벌이
   * 미묘하게 달라(알림 metadata 의 dedupe_key 유무) 어느 쪽이 실제 동작인지
   * 코드만 봐서는 알 수 없었으므로 죽은 쪽을 지웠다.
   */
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
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
              delay_count: nextCount,
              dedupe_key: `approval-delay:${String(item.id)}:${currentApproverId}:${nextCount}` } }),
        });
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
