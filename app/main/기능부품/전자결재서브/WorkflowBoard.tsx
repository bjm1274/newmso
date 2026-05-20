'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { StaffMember } from '@/types';
import { LucideIcon } from '../조직도서브/조직도측면창';
import { buildApprovalWorkflowSummary } from './ApprovalRiskReviewDialog';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };

export type WorkflowStage = 'draft' | 'pending' | 'review' | 'approved' | 'rejected';

type ColumnTone = 'gray' | 'warn' | 'accent' | 'success' | 'danger';

type WorkflowColumn = {
  id: WorkflowStage;
  label: string;
  tone: ColumnTone;
  docs: ApprovalRecord[];
};

type WorkflowBoardProps = {
  documents: ApprovalRecord[];
  myStaffId?: string | null;
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  onSelectDocument: (id: string) => void;
};

const COLUMN_TONE_STYLE: Record<ColumnTone, { border: string; chipBg: string; chipColor: string; headColor: string }> = {
  gray: {
    border: 'var(--toss-gray-2)',
    chipBg: 'var(--muted)',
    chipColor: 'var(--muted-foreground)',
    headColor: 'var(--foreground)',
  },
  warn: {
    border: 'var(--warning)',
    chipBg: 'var(--warning-light)',
    chipColor: 'var(--warning)',
    headColor: 'var(--warning)',
  },
  accent: {
    border: 'var(--accent)',
    chipBg: 'var(--accent-selected-subtle)',
    chipColor: 'var(--accent)',
    headColor: 'var(--accent)',
  },
  success: {
    border: 'var(--success)',
    chipBg: 'var(--success-light)',
    chipColor: 'var(--success)',
    headColor: 'var(--success)',
  },
  danger: {
    border: 'var(--danger)',
    chipBg: 'var(--danger-light)',
    chipColor: 'var(--danger)',
    headColor: 'var(--danger)',
  },
};

function formatBoardDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const datePart = raw.slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[1]}.${parts[2]}`;
  return datePart;
}

function isUrgent(item: ApprovalRecord): boolean {
  const meta = item.meta_data as Record<string, unknown> | null | undefined;
  if (meta?.urgent === true) return true;
  const extra = item.extra_data as Record<string, unknown> | null | undefined;
  if (extra?.urgent === true) return true;
  const priority = String(meta?.priority || extra?.priority || '').toLowerCase();
  return priority.includes('urgent') || priority.includes('긴급');
}

function classifyStage(
  item: ApprovalRecord,
  myStaffId: string | null | undefined,
  currentApproverId: string | null,
): WorkflowStage {
  const status = String(item.status || '대기').trim();
  if (status.includes('승인') || status.includes('완료')) return 'approved';
  if (status.includes('반려')) return 'rejected';
  // 대기 흐름: 현재 결재자가 나면 '검토 중', 아니면 '결재 대기'
  if (myStaffId && currentApproverId && String(myStaffId) === String(currentApproverId)) {
    return 'review';
  }
  return 'pending';
}

function StageDots({
  total,
  currentIndex,
  rejected,
}: {
  total: number;
  currentIndex: number;
  rejected: boolean;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, index) => {
        const done = index < currentIndex;
        const isOn = index === currentIndex && !rejected;
        const isRejected = rejected && index === currentIndex;
        let bg = 'var(--muted)';
        let color = 'var(--muted-foreground)';
        let content: ReactNode = String(index + 1);
        if (done) {
          bg = 'var(--success)';
          color = '#fff';
          content = <LucideIcon name="Check" size={8} strokeWidth={3} />;
        } else if (isRejected) {
          bg = 'var(--danger)';
          color = '#fff';
          content = <LucideIcon name="X" size={8} strokeWidth={3} />;
        } else if (isOn) {
          bg = 'var(--accent)';
          color = '#fff';
        }
        return (
          <span
            key={index}
            aria-hidden
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black"
            style={{ background: bg, color }}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}

function BoardCard({
  item,
  staffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalTemplateMeta,
  onSelect,
}: {
  item: ApprovalRecord;
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  onSelect: () => void;
}) {
  const templateMeta = resolveApprovalTemplateMeta(item);
  const typeLabel = templateMeta.name || String(item.type || '결재');
  const title = String(item.title || '제목 없음');
  const sender = String(item.sender_name || '사용자');
  const summary = buildApprovalWorkflowSummary({
    item,
    staffs,
    resolveApprovalLineIds,
    resolveCurrentApproverId,
  });
  const status = String(item.status || '대기');
  const rejected = status.includes('반려');
  const approved = status.includes('승인') || status.includes('완료');
  const totalSteps = Math.max(summary.totalSteps, 1);
  const currentIndex = approved
    ? totalSteps
    : rejected
      ? Math.max(summary.currentStep - 1, 0)
      : Math.max(summary.currentStep - 1, 0);
  const urgent = isUrgent(item);
  const date = formatBoardDate(item.created_at);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`workflow-card-${String(item.id || '')}`}
      className="group block w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5 text-left transition-all hover:border-[var(--accent)]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
        {typeLabel}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] font-bold text-[var(--foreground)]">{title}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted-foreground)]">
        <span
          aria-hidden
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--muted)] text-[9px] font-black text-[var(--foreground)]"
        >
          {sender.charAt(0)}
        </span>
        <span className="truncate">{sender}</span>
        {urgent && (
          <span className="ml-auto rounded-[var(--radius-sm)] bg-[var(--danger-light)] px-1.5 py-0.5 text-[9px] font-black text-[var(--danger)]">
            긴급
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <StageDots total={totalSteps} currentIndex={currentIndex} rejected={rejected} />
        {date && <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{date}</span>}
      </div>
    </button>
  );
}

export default function WorkflowBoard({
  documents,
  myStaffId,
  staffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalTemplateMeta,
  onSelectDocument,
}: WorkflowBoardProps) {
  const columns = useMemo<WorkflowColumn[]>(() => {
    const buckets: Record<WorkflowStage, ApprovalRecord[]> = {
      draft: [],
      pending: [],
      review: [],
      approved: [],
      rejected: [],
    };
    for (const item of documents) {
      const currentApproverId = resolveCurrentApproverId(item);
      const stage = classifyStage(item, myStaffId, currentApproverId);
      buckets[stage].push(item);
    }
    return [
      { id: 'draft', label: '기안 작성', tone: 'gray', docs: buckets.draft },
      { id: 'pending', label: '결재 대기', tone: 'warn', docs: buckets.pending },
      { id: 'review', label: '검토 중', tone: 'accent', docs: buckets.review },
      { id: 'approved', label: '완료', tone: 'success', docs: buckets.approved },
      { id: 'rejected', label: '반려', tone: 'danger', docs: buckets.rejected },
    ];
  }, [documents, myStaffId, resolveCurrentApproverId]);

  return (
    <section
      aria-label="결재 워크플로 보드"
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))' }}
    >
      {columns.map((column) => {
        const tone = COLUMN_TONE_STYLE[column.tone];
        const headStyle: CSSProperties = {
          borderLeft: `3px solid ${tone.border}`,
        };
        return (
          <div
            key={column.id}
            className="flex min-w-0 flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle,var(--muted))]/40"
          >
            <header
              className="flex items-center justify-between gap-2 rounded-t-[var(--radius-md)] bg-[var(--card)] px-3 py-2"
              style={headStyle}
            >
              <span
                className="text-[12px] font-black"
                style={{ color: tone.headColor }}
              >
                {column.label}
              </span>
              <span
                className="inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black"
                style={{ background: tone.chipBg, color: tone.chipColor }}
              >
                {column.docs.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {column.docs.length === 0 ? (
                <p className="py-6 text-center text-[11px] font-semibold text-[var(--muted-foreground)]">
                  문서 없음
                </p>
              ) : (
                column.docs.map((item) => (
                  <BoardCard
                    key={String(item.id || '')}
                    item={item}
                    staffs={staffs}
                    resolveApprovalLineIds={resolveApprovalLineIds}
                    resolveCurrentApproverId={resolveCurrentApproverId}
                    resolveApprovalTemplateMeta={resolveApprovalTemplateMeta}
                    onSelect={() => onSelectDocument(String(item.id || ''))}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
