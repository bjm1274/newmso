import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import {
  appendApprovalHistory,
  getApprovalRevision,
  isApprovalLocked,
  lockApprovalMeta,
} from '@/lib/approval-workflow';
import { supabase } from '@/lib/supabase';
import { useApprovalHistoryEntry } from './useApprovalHistoryEntry';
import type { StaffMember } from '@/types';
import type {
  TransitionApprovalsOnServer,
} from './useApprovalBulkActions';

type ApprovalRecord = Record<string, unknown>;
type ApprovalHistoryEntry = Parameters<typeof appendApprovalHistory>[1];

type UseApprovalActionsParams = {
  user: StaffMember | null;
  openConfirm: (options: any) => Promise<boolean>;
  openPrompt: (options: any) => Promise<string | null>;
  fetchApprovals: () => void | Promise<void>;
  markApprovalNotificationsAsRead: (approvalIds: string[]) => void | Promise<void>;
  transitionApprovalsOnServer: TransitionApprovalsOnServer;
  resolveStoredCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveEffectiveApproverId: (approverId: string | null | undefined) => string | null;
  syncDelegatedApprovalRouting: (item: ApprovalRecord, currentApproverId: string | null) => Promise<unknown>;
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  normalizeApprovalLineIds: (line: unknown) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  setComposeSeedApproval: Dispatch<SetStateAction<ApprovalRecord | null>>;
  setSelectedApprovalId: Dispatch<SetStateAction<string | null>>;
  resolveAccessibleView: (requestedView?: string | null) => string | null;
  setViewMode: Dispatch<SetStateAction<string>>;
  onViewChange?: (view: string) => void;
};

export function useApprovalActions({
  user,
  openConfirm,
  openPrompt,
  fetchApprovals,
  markApprovalNotificationsAsRead,
  transitionApprovalsOnServer,
  resolveStoredCurrentApproverId,
  resolveEffectiveApproverId,
  syncDelegatedApprovalRouting,
  resolveCurrentApproverId,
  setComposeSeedApproval,
  setSelectedApprovalId,
  resolveAccessibleView,
  setViewMode,
  onViewChange,
}: UseApprovalActionsParams) {
  const canUserApproveItem = useCallback((item: ApprovalRecord) => {
    if (item?.status !== '대기' || !user?.id) return false;
    return String(resolveCurrentApproverId(item) || '') === String(user.id);
  }, [resolveCurrentApproverId, user?.id]);

  const canUserRecallItem = useCallback((item: ApprovalRecord) => {
    if (item?.status !== '대기' || !user?.id) return false;
    return String(item?.sender_id || '') === String(user.id);
  }, [user?.id]);

  const isApprovalEditLockedItem = useCallback((item: ApprovalRecord) => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    return isApprovalLocked(metaData);
  }, []);

  const buildApprovalHistoryEntry = useApprovalHistoryEntry(user);

  const buildNextApprovalMetaData = useCallback(
    (
      baseMetaData: ApprovalRecord | null | undefined,
      action: ApprovalHistoryEntry['action'],
      options?: {
        note?: string | null;
        lock?: boolean;
        currentApproverId?: string | null;
        revision?: number | null;
      }
    ) => {
      let nextMetaData = appendApprovalHistory(baseMetaData, {
        ...buildApprovalHistoryEntry(action, options?.note),
        current_approver_id: options?.currentApproverId ?? null,
        revision: options?.revision ?? null,
      });
      if (options?.lock) {
        nextMetaData = appendApprovalHistory(lockApprovalMeta(nextMetaData, user?.id ? String(user.id) : null), {
          ...buildApprovalHistoryEntry('locked', '결재 문서 잠금'),
          revision: options?.revision ?? null,
        });
      }
      return nextMetaData;
    },
    [buildApprovalHistoryEntry, user?.id]
  );

  const handleApproveAction = useCallback(async (item: ApprovalRecord) => {
    const comment = await openPrompt({
      title: '결재 승인',
      description: '승인 관련 데이터가 즉시 반영됩니다. 코멘트를 선택 입력합니다.',
      confirmText: '승인',
      cancelText: '취소',
      tone: 'accent',
      inputType: 'textarea',
      placeholder: '승인 코멘트를 입력해 주세요. (선택)',
      helperText: '비워 두어도 승인 처리됩니다.',
    });
    if (comment === null) return;

    try {
      const payload = await transitionApprovalsOnServer({
        action: 'approve',
        approvalIds: [String(item.id || '')],
        reason: comment,
      });
      const result = payload.results[0];

      if (result?.ok) {
        if (result.finalApproval) {
          const supplySummary = result.supplySummary;
          if (supplySummary) {
            const issueReadyCount = Number(supplySummary?.issue_ready_count || 0);
            const orderRequiredCount = Number(supplySummary?.order_required_count || 0);
            toast(
              `최종 승인했습니다. 출고 가능 ${issueReadyCount}건, 발주 필요 ${orderRequiredCount}건을 확인해 주세요.`,
              'success'
            );
          } else if (result.alreadyProcessed) {
            toast('최종 승인 후처리가 이미 완료되어 동기화만 다시 확인했습니다.', 'success');
          } else {
            toast('최종 승인 처리가 완료되었습니다.', 'success');
          }

          const warnings = (Array.isArray(result.warnings) ? result.warnings : []) as unknown[];
          if (warnings.length > 0) {
            toast(`일부 후처리에 확인이 필요합니다.\n${String(warnings[0] ?? '')}`, 'warning');
          }
        } else {
          toast('승인되어 다음 결재자에게 진행되었습니다.', 'success');
        }

        fetchApprovals();
        void markApprovalNotificationsAsRead([String(result.approvalId || item.id || '')]);
        return;
      }

      if (result?.error) {
        toast(result.error, 'error');
        return;
      }
    } catch (serverTransitionError) {
      console.error('승인 서버 처리 실패:', serverTransitionError);
      toast('승인 처리를 서버에서 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    toast('승인 처리 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
  }, [
    fetchApprovals,
    markApprovalNotificationsAsRead,
    openPrompt,
    transitionApprovalsOnServer,
  ]);

  const handleRejectAction = useCallback(async (item: ApprovalRecord) => {
    const originalCurrentApproverId = resolveStoredCurrentApproverId(item);
    const currentApproverId = resolveEffectiveApproverId(originalCurrentApproverId);
    if (!currentApproverId) {
      toast('결재자가 지정되지 않아 반려할 수 없습니다. 결재선을 다시 확인해 주세요.', 'warning');
      return;
    }
    if (String(currentApproverId) !== String(user?.id)) {
      toast('현재 결재자만 반려할 수 있습니다.');
      return;
    }

    const reason = await openPrompt({
      title: '결재 반려',
      description: '반려 사유를 선택 입력합니다.',
      confirmText: '반려',
      cancelText: '취소',
      tone: 'danger',
      inputType: 'textarea',
      placeholder: '반려 사유를 입력해 주세요.',
      helperText: '비워 두면 기본 반려 문구로 저장됩니다.',
    });
    if (reason === null) return;

    try {
      const payload = await transitionApprovalsOnServer({
        action: 'reject',
        approvalIds: [String(item.id || '')],
        reason,
      });
      const result = payload.results[0];
      if (result?.ok) {
        toast('반려 처리했습니다.', 'success');
        fetchApprovals();
        void markApprovalNotificationsAsRead([String(result.approvalId || item.id || '')]);
        return;
      }
      if (result?.error) {
        toast(result.error, 'error');
        return;
      }
    } catch (serverTransitionError) {
      console.error('반려 서버 처리 실패, 클라이언트 fallback 실행:', serverTransitionError);
    }

    const routingError = await syncDelegatedApprovalRouting(item, originalCurrentApproverId);
    if (routingError) {
      toast('결재선을 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const rejectMetaData = item.meta_data as ApprovalRecord | null | undefined;
    const nextRejectedMetaData = buildNextApprovalMetaData(rejectMetaData, 'rejected', {
      note: reason || '반려',
      lock: true,
      currentApproverId,
      revision: getApprovalRevision(rejectMetaData),
    });
    const rejectResult = await supabase
      .from('approvals')
      .update({ status: '반려', meta_data: { ...nextRejectedMetaData, reject_reason: reason } })
      .eq('id', item.id);

    if (!rejectResult.error) {
      toast('반려 처리했습니다.', 'success');
      fetchApprovals();
      void markApprovalNotificationsAsRead([String(item.id || '')]);
      return;
    }

    const { error } = await supabase
      .from('approvals')
      .update({ status: '반려', meta_data: { ...(nextRejectedMetaData || {}), reject_reason: reason } })
      .eq('id', item.id);
    if (!error) {
      toast('반려 처리했습니다.', 'success');
      fetchApprovals();
      void markApprovalNotificationsAsRead([String(item.id || '')]);
    } else {
      toast(`반려 처리에 실패했습니다. ${error?.message || ''}`, 'error');
    }
  }, [
    buildNextApprovalMetaData,
    fetchApprovals,
    markApprovalNotificationsAsRead,
    openPrompt,
    resolveEffectiveApproverId,
    resolveStoredCurrentApproverId,
    syncDelegatedApprovalRouting,
    transitionApprovalsOnServer,
    user?.id,
  ]);

  const handleRecallAction = useCallback(async (item: ApprovalRecord) => {
    if (!canUserRecallItem(item)) {
      toast('대기 중인 내 기안만 회수할 수 있습니다.', 'warning');
      return;
    }

    const confirmed = await openConfirm({
      title: '기안 회수',
      description: '회수 후 수정 화면으로 바로 이동합니다.',
      confirmText: '회수',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    const recalledMetaData = {
      ...((item.meta_data as ApprovalRecord | null | undefined) || {}),
      recalled_at: new Date().toISOString(),
      recalled_by: user?.id,
    };
    const recalledHistoryMetaData = appendApprovalHistory(recalledMetaData, {
      ...buildApprovalHistoryEntry('recalled', '회수 후 수정'),
      revision: getApprovalRevision(recalledMetaData),
    });

    const { error } = await supabase
      .from('approvals')
      .update({
        status: '회수',
        current_approver_id: null,
        meta_data: recalledHistoryMetaData,
      })
      .eq('id', item.id);

    if (error) {
      toast(`기안 회수에 실패했습니다. ${error.message || ''}`, 'error');
      return;
    }

    setComposeSeedApproval({
      ...item,
      status: '회수',
      current_approver_id: null,
      meta_data: recalledHistoryMetaData,
    });
    setSelectedApprovalId(null);
    const nextView = resolveAccessibleView('작성하기');
    if (nextView) {
      setViewMode(nextView);
      if (typeof onViewChange === 'function') onViewChange(nextView);
    }
    fetchApprovals();
    toast('기안을 회수했고 작성하기에서 바로 수정할 수 있습니다.', 'success');
  }, [
    buildApprovalHistoryEntry,
    canUserRecallItem,
    fetchApprovals,
    onViewChange,
    openConfirm,
    resolveAccessibleView,
    setComposeSeedApproval,
    setSelectedApprovalId,
    setViewMode,
    user?.id,
  ]);

  return {
    canUserApproveItem,
    canUserRecallItem,
    isApprovalEditLockedItem,
    handleApproveAction,
    handleRejectAction,
    handleRecallAction,
  };
}
