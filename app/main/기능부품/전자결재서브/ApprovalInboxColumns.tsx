'use client';

import type { StaffMember } from '@/types';
import type { Column } from '@/app/components/ResponsiveTable';
import {
  ApprovalProgressSummary,
  buildApprovalWorkflowSummary,
} from './ApprovalRiskReviewDialog';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type DelaySnapshot = {
  overdue: boolean;
  notificationCount: number;
  elapsedHours?: number;
  thresholdHours?: number;
};

export function formatInboxDraftDate(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '-';
  const datePart = raw.slice(0, 10);
  const [, month, day] = datePart.split('-');
  return month && day ? `${month}.${day}` : datePart;
}

export function getInboxStatusTone(statusValue: unknown): { label: string; className: string } {
  const status = String(statusValue || '대기').trim();
  if (status.includes('승인')) return { label: '승인', className: 'erp-status erp-status-green' };
  if (status.includes('반려')) return { label: '반려', className: 'erp-status erp-status-red' };
  return { label: '대기', className: 'erp-status erp-status-yellow' };
}

type BuildInboxColumnsParams = {
  lookupStaffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalDelaySnapshot: (item: ApprovalRecord) => DelaySnapshot;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  canUserRecallItem: (item: ApprovalRecord) => boolean;
  canUserApproveItem: (item: ApprovalRecord) => boolean;
  handleApproveAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRejectAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRecallAction: (item: ApprovalRecord) => void | Promise<void>;
  onOpenDetail: (id: string) => void;
};

export function buildApprovalInboxColumns(params: BuildInboxColumnsParams): Column<ApprovalRecord>[] {
  const {
    lookupStaffs,
    resolveApprovalLineIds,
    resolveCurrentApproverId,
    resolveApprovalDelaySnapshot,
    resolveApprovalTemplateMeta,
    canUserRecallItem,
    canUserApproveItem,
    handleApproveAction,
    handleRejectAction,
    handleRecallAction,
    onOpenDetail,
  } = params;

  return [
    {
      key: 'title',
      label: '문서 제목',
      primary: true,
      render: (item) => (
        <div className="min-w-[220px]" data-testid={`approval-card-${String(item.id || '')}`}>
          <p className="font-bold text-[var(--foreground)]">{String(item.title || '제목 없음')}</p>
          <ApprovalProgressSummary
            item={item}
            staffs={lookupStaffs}
            resolveApprovalLineIds={resolveApprovalLineIds}
            resolveCurrentApproverId={resolveCurrentApproverId}
            resolveApprovalDelaySnapshot={resolveApprovalDelaySnapshot}
            compact
          />
        </div>
      ),
    },
    {
      key: 'sender_name',
      label: '기안자',
      render: (item) => String(item.sender_name || '사용자'),
    },
    {
      key: 'type',
      label: '문서 유형',
      render: (item) => {
        const templateMeta = resolveApprovalTemplateMeta(item);
        return <span className="erp-status erp-status-blue">{templateMeta.name || String(item.type || '결재')}</span>;
      },
    },
    {
      key: 'created_at',
      label: '기안일',
      render: (item) => formatInboxDraftDate(item.created_at),
    },
    {
      key: 'status',
      label: '상태',
      render: (item) => {
        const status = getInboxStatusTone(item.status);
        const workflowSummary = buildApprovalWorkflowSummary({
          item,
          staffs: lookupStaffs,
          resolveApprovalLineIds,
          resolveCurrentApproverId,
        });
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={status.className}>{status.label}</span>
            {String(item.status || '').includes('대기') && (
              <span className="text-[10px] font-bold text-[var(--muted-foreground)]">
                {workflowSummary.currentApproverName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: '__actions',
      label: '관리',
      align: 'right',
      render: (item) => {
        const itemId = String(item.id || '');
        return (
          <div
            className="flex items-center justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {canUserRecallItem(item) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleRecallAction(item);
                }}
                className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--toss-gray-4)] shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
              >
                회수 후 수정
              </button>
            )}
            {canUserApproveItem(item) && String(item.status || '').includes('대기') && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleApproveAction(item);
                  }}
                  className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--success)] shadow-sm transition-all hover:bg-[var(--success-light)]"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleRejectAction(item);
                  }}
                  className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--danger)] shadow-sm transition-all hover:bg-[var(--danger-light)]"
                >
                  반려
                </button>
              </>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetail(itemId);
              }}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
            >
              상세
            </button>
          </div>
        );
      },
    },
  ];
}
