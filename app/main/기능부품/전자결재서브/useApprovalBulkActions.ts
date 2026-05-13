import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';

export type TransitionApprovalsPayload = {
  ok: true;
  action: 'approve' | 'reject';
  summary: {
    total: number;
    successCount: number;
    failCount: number;
    finalApprovalCount: number;
    warningCount: number;
  };
  results: Array<{
    approvalId: string;
    ok: boolean;
    status: string;
    finalApproval: boolean;
    nextApproverId?: string | null;
    alreadyProcessed?: boolean;
    warnings?: string[];
    supplySummary?: {
      issue_ready_count?: number;
      order_required_count?: number;
    } | null;
    error?: string;
  }>;
};

export type ProcessFinalApprovalPayload = {
  ok: true;
  alreadyProcessed?: boolean;
  warnings?: string[];
  supplySummary?: {
    issue_ready_count?: number;
    order_required_count?: number;
  } | null;
};

export type TransitionApprovalsOnServer = (params: {
  action: 'approve' | 'reject';
  approvalIds: string[];
  reason?: string | null;
}) => Promise<TransitionApprovalsPayload>;

export type ProcessFinalApprovalOnServer = (approvalId: string) => Promise<ProcessFinalApprovalPayload>;

type UseApprovalBulkActionsParams = {
  selectedApprovalIds: string[];
  setSelectedApprovalIds: Dispatch<SetStateAction<string[]>>;
  openConfirm: (options: any) => Promise<boolean>;
  openPrompt: (options: any) => Promise<string | null>;
  fetchApprovals: () => void | Promise<void>;
  markApprovalNotificationsAsRead: (approvalIds: string[]) => void | Promise<void>;
};

export function useApprovalBulkActions({
  selectedApprovalIds,
  setSelectedApprovalIds,
  openConfirm,
  openPrompt,
  fetchApprovals,
  markApprovalNotificationsAsRead,
}: UseApprovalBulkActionsParams) {
  const processFinalApprovalOnServer = useCallback(async (approvalId: string) => {
    const response = await fetch('/api/approvals/process-final', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approvalId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || response.statusText || 'Failed to process final approval'));
    }

    return payload as ProcessFinalApprovalPayload;
  }, []);

  const transitionApprovalsOnServer = useCallback(async (params: {
    action: 'approve' | 'reject';
    approvalIds: string[];
    reason?: string | null;
  }) => {
    const response = await fetch('/api/approvals/transition', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || response.statusText || 'Failed to transition approvals'));
    }

    return payload as TransitionApprovalsPayload;
  }, []);

  const handleBulkApprove = useCallback(async (options?: { skipConfirm?: boolean; comment?: string }) => {
    const count = selectedApprovalIds.length;
    if (count === 0) return;
    const comment = options?.skipConfirm
      ? options.comment ?? ''
      : await openPrompt({
          title: '일괄 승인',
          description: `선택한 ${count}건을 승인합니다. 코멘트를 선택 입력합니다.`,
          confirmText: '승인',
          cancelText: '취소',
          tone: 'accent',
          inputType: 'textarea',
          placeholder: '승인 코멘트를 입력해 주세요. (선택)',
          helperText: '비워 두어도 일괄 승인됩니다.',
        });
    if (comment === null) return;
    try {
      const payload = await transitionApprovalsOnServer({
        action: 'approve',
        approvalIds: selectedApprovalIds,
        reason: comment || null,
      });

      setSelectedApprovalIds([]);
      if (payload.summary.failCount > 0) {
        const firstError = payload.results.find((result) => !result.ok)?.error;
        toast(
          `${payload.summary.successCount}건 승인 완료, ${payload.summary.failCount}건 실패했습니다.${firstError ? `\n${firstError}` : ''}`,
          'error'
        );
      } else {
        toast(
          `${payload.summary.successCount}건 승인 처리되었습니다. 최종 승인 ${payload.summary.finalApprovalCount}건`,
          'success'
        );
      }
      if (payload.summary.warningCount > 0) {
        toast(`일부 후처리에 확인이 필요합니다. 경고 ${payload.summary.warningCount}건`, 'warning');
      }
      fetchApprovals();
      void markApprovalNotificationsAsRead(
        payload.results.filter((result) => result.ok).map((result) => result.approvalId)
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : '일괄 승인 처리에 실패했습니다.',
        'error'
      );
    }
  }, [fetchApprovals, markApprovalNotificationsAsRead, openPrompt, selectedApprovalIds, setSelectedApprovalIds, transitionApprovalsOnServer]);

  const handleBulkReject = useCallback(async (options?: { reason?: string; skipPrompt?: boolean }) => {
    const count = selectedApprovalIds.length;
    if (count === 0) return;
    const reason = options?.skipPrompt
      ? options.reason ?? ''
      : await openPrompt({
          title: '일괄 반려',
          description: `선택한 ${count}건을 반려합니다. 사유는 선택 입력입니다.`,
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
        approvalIds: selectedApprovalIds,
        reason,
      });

      setSelectedApprovalIds([]);
      if (payload.summary.failCount > 0) {
        const firstError = payload.results.find((result) => !result.ok)?.error;
        toast(
          `${payload.summary.successCount}건 반려 완료, ${payload.summary.failCount}건 실패했습니다.${firstError ? `\n${firstError}` : ''}`,
          'error'
        );
      } else {
        toast(`${payload.summary.successCount}건이 일괄 반려 처리되었습니다.`, 'success');
      }
      fetchApprovals();
      void markApprovalNotificationsAsRead(
        payload.results.filter((result) => result.ok).map((result) => result.approvalId)
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : '일괄 반려 처리에 실패했습니다.',
        'error'
      );
    }
  }, [fetchApprovals, markApprovalNotificationsAsRead, openPrompt, selectedApprovalIds, setSelectedApprovalIds, transitionApprovalsOnServer]);

  return {
    processFinalApprovalOnServer,
    transitionApprovalsOnServer,
    handleBulkApprove,
    handleBulkReject,
  };
}
