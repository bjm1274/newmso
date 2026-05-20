'use client';

import { Fragment, useMemo } from 'react';
import type { StaffMember } from '@/types';
import { getApprovalEditHistory, type ApprovalHistoryEntry } from '@/lib/approval-workflow';
import { LucideIcon } from '../조직도서브/조직도측면창';

type ApprovalRecord = Record<string, unknown>;

export type ApprovalLineStepState = 'draft' | 'done' | 'rejected' | 'on' | 'pending';

type Step = {
  staffId: string | null;
  name: string;
  role: string;
  state: ApprovalLineStepState;
  actionLabel: string;
  timeLabel: string;
};

type ApprovalLineTimelineProps = {
  item: ApprovalRecord;
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  /** 작성하기 미리보기 모드 (지금/상신 시 알림 표시) */
  composeMode?: boolean;
};

const STATE_STYLE: Record<
  ApprovalLineStepState,
  { border: string; pillBg: string; pillColor: string; nameColor: string }
> = {
  draft: {
    border: 'var(--accent)',
    pillBg: 'var(--accent-selected-subtle)',
    pillColor: 'var(--accent)',
    nameColor: 'var(--foreground)',
  },
  done: {
    border: 'var(--success)',
    pillBg: 'var(--success-light)',
    pillColor: 'var(--success)',
    nameColor: 'var(--foreground)',
  },
  rejected: {
    border: 'var(--danger)',
    pillBg: 'var(--danger-light)',
    pillColor: 'var(--danger)',
    nameColor: 'var(--foreground)',
  },
  on: {
    border: 'var(--warning)',
    pillBg: 'var(--warning-light)',
    pillColor: 'var(--warning)',
    nameColor: 'var(--foreground)',
  },
  pending: {
    border: 'var(--toss-gray-2)',
    pillBg: 'var(--muted)',
    pillColor: 'var(--muted-foreground)',
    nameColor: 'var(--muted-foreground)',
  },
};

function formatTimeShort(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

function elapsedHoursFromIso(value?: string | null): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return 0;
  return Math.round(diffMs / (1000 * 60 * 60));
}

function resolveStaffEntry(staffs: StaffMember[], staffId: string | null) {
  if (!staffId) return null;
  return staffs.find((staff) => String(staff.id) === String(staffId)) || null;
}

function findHistoryFor(history: ApprovalHistoryEntry[], staffId: string | null) {
  if (!staffId) return null;
  // 가장 최근 항목부터 검색 — 동일 결재자 재상신 시 최신 액션 우선
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (String(entry.actor_id || '') === String(staffId)) {
      if (entry.action === 'approved_step' || entry.action === 'approved_final' || entry.action === 'rejected') {
        return entry;
      }
    }
  }
  return null;
}

function buildSteps({
  item,
  staffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  composeMode,
}: ApprovalLineTimelineProps): { drafterStep: Step | null; steps: Step[] } {
  const lineIds = resolveApprovalLineIds(item);
  const currentApproverId = resolveCurrentApproverId(item);
  const status = String(item.status || '대기');
  const rejected = status.includes('반려');
  const finalApproved = status.includes('승인') || status.includes('완료');
  const meta = (item.meta_data as Record<string, unknown> | null | undefined) || {};
  const history = getApprovalEditHistory(meta);
  const createdAt = String(item.created_at || '') || null;

  const senderId = String(item.sender_id || meta.sender_id || '') || null;
  const senderName = String(item.sender_name || meta.sender_name || '기안자') || '기안자';
  const drafterStep: Step | null = composeMode || senderId
    ? {
        staffId: senderId,
        name: senderName,
        role: '기안자',
        state: 'draft',
        actionLabel: '기안',
        timeLabel: composeMode ? '지금' : formatTimeShort(createdAt),
      }
    : null;

  const currentIndex = currentApproverId
    ? lineIds.findIndex((id) => String(id) === String(currentApproverId))
    : -1;

  const steps: Step[] = lineIds.map((staffId, index) => {
    const staff = resolveStaffEntry(staffs, staffId);
    const name = staff?.name || '확인 필요';
    const role = staff?.position || (index === lineIds.length - 1 ? '전결' : '검토');
    const historyEntry = findHistoryFor(history, staffId);

    if (historyEntry?.action === 'rejected') {
      return {
        staffId,
        name,
        role,
        state: 'rejected',
        actionLabel: '반려',
        timeLabel: formatTimeShort(historyEntry.at),
      };
    }
    if (historyEntry?.action === 'approved_step' || historyEntry?.action === 'approved_final') {
      return {
        staffId,
        name,
        role,
        state: 'done',
        actionLabel: '승인',
        timeLabel: formatTimeShort(historyEntry.at),
      };
    }

    // 최종 승인 상태인데 history 항목이 누락된 경우 — 현재 인덱스 이전은 done
    if (finalApproved) {
      return {
        staffId,
        name,
        role,
        state: 'done',
        actionLabel: '승인',
        timeLabel: '',
      };
    }
    if (rejected) {
      // 반려된 문서에서 현재 단계 이후는 그냥 미진행
      return {
        staffId,
        name,
        role,
        state: 'pending',
        actionLabel: '대기 예정',
        timeLabel: '',
      };
    }

    const isCurrent = !composeMode && index === currentIndex;
    if (isCurrent) {
      const elapsed = elapsedHoursFromIso(createdAt);
      return {
        staffId,
        name,
        role,
        state: 'on',
        actionLabel: '대기 중',
        timeLabel: elapsed > 0 ? `${elapsed}시간 경과` : '대기 중',
      };
    }
    // 미래 단계
    return {
      staffId,
      name,
      role,
      state: 'pending',
      actionLabel: composeMode ? '상신 시 알림' : '대기 예정',
      timeLabel: '',
    };
  });

  return { drafterStep, steps };
}

function StepCard({ step }: { step: Step }) {
  const style = STATE_STYLE[step.state];
  return (
    <div
      className="flex min-w-[96px] flex-col items-center gap-1 rounded-[var(--radius-md)] border bg-[var(--card)] px-2 py-1.5"
      style={{ borderColor: style.border }}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: style.pillBg, color: style.pillColor }}
      >
        {step.state === 'done' ? (
          <LucideIcon name="Check" size={12} strokeWidth={2.6} />
        ) : step.state === 'rejected' ? (
          <LucideIcon name="X" size={12} strokeWidth={2.6} />
        ) : step.state === 'on' ? (
          <LucideIcon name="Clock" size={11} strokeWidth={2.4} />
        ) : (
          (step.name || '·').charAt(0)
        )}
      </span>
      <p className="text-center text-[11px] font-black leading-tight" style={{ color: style.nameColor }}>
        {step.name}
      </p>
      <p className="text-center text-[9px] font-semibold leading-tight text-[var(--muted-foreground)]">{step.role}</p>
      <div
        className="flex w-full flex-col items-center rounded-[var(--radius-sm,4px)] px-1 py-0.5"
        style={{ background: style.pillBg, color: style.pillColor }}
      >
        <span className="text-[9px] font-black uppercase tracking-wider leading-tight">{step.actionLabel}</span>
        {step.timeLabel && <span className="text-[9px] font-semibold leading-tight opacity-90">{step.timeLabel}</span>}
      </div>
    </div>
  );
}

function ConnectorBar({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="h-0 w-4 shrink-0 self-center border-t-2 border-dashed"
      style={{ borderColor: done ? 'var(--success)' : 'var(--toss-gray-2)' }}
    />
  );
}

export default function ApprovalLineTimeline(props: ApprovalLineTimelineProps) {
  const { drafterStep, steps } = useMemo(() => buildSteps(props), [props]);
  const allSteps = drafterStep ? [drafterStep, ...steps] : steps;
  if (allSteps.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[12px] font-semibold text-[var(--muted-foreground)]">
        결재선이 지정되지 않았습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit items-stretch gap-0 pb-1">
        {allSteps.map((step, index) => (
          <Fragment key={`${step.staffId || 'drafter'}-${index}`}>
            <StepCard step={step} />
            {index < allSteps.length - 1 && (
              <ConnectorBar done={step.state === 'done' || step.state === 'draft'} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
