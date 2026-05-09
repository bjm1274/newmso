'use client';

import type { StaffMember } from '@/types';
import { getApprovalEditHistory } from '@/lib/approval-workflow';
import { LucideIcon } from '../조직도서브/조직도측면창';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type DelaySnapshot = { overdue: boolean; notificationCount: number; elapsedHours?: number; thresholdHours?: number };

export type ApprovalWorkflowSummary = {
  lineIds: string[];
  currentApproverId: string | null;
  currentStep: number;
  totalSteps: number;
  isFinalStep: boolean;
  currentApproverName: string;
  rejectReason: string;
};

export function resolveStaffLabel(staffs: StaffMember[], staffId: string | null | undefined) {
  if (!staffId) return '미지정';
  const matched = staffs.find((staff) => String(staff.id) === String(staffId));
  if (!matched) return staffId;
  return [matched.name, matched.position].filter(Boolean).join(' ');
}

export function resolveRejectReason(item: ApprovalRecord) {
  const metaData = item.meta_data as ApprovalRecord | null | undefined;
  const explicitReason = String(metaData?.reject_reason || '').trim();
  if (explicitReason) return explicitReason;

  const rejectedHistory = getApprovalEditHistory(metaData)
    .slice()
    .reverse()
    .find((entry) => entry.action === 'rejected' && String(entry.note || '').trim());
  return rejectedHistory ? String(rejectedHistory.note || '').trim() : '';
}

export function buildApprovalWorkflowSummary(params: {
  item: ApprovalRecord;
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
}): ApprovalWorkflowSummary {
  const lineIds = params.resolveApprovalLineIds(params.item);
  const currentApproverId = params.resolveCurrentApproverId(params.item);
  const currentIndex = currentApproverId ? lineIds.findIndex((id) => String(id) === String(currentApproverId)) : -1;
  const totalSteps = Math.max(lineIds.length, currentApproverId ? 1 : 0);
  const currentStep = currentIndex >= 0 ? currentIndex + 1 : totalSteps > 0 ? 1 : 0;

  return {
    lineIds,
    currentApproverId,
    currentStep,
    totalSteps,
    isFinalStep: totalSteps > 0 && currentStep === totalSteps,
    currentApproverName: resolveStaffLabel(params.staffs, currentApproverId),
    rejectReason: resolveRejectReason(params.item),
  };
}

export function ApprovalProgressSummary({
  item,
  staffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalDelaySnapshot,
  compact = false,
}: {
  item: ApprovalRecord;
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalDelaySnapshot?: (item: ApprovalRecord) => DelaySnapshot;
  compact?: boolean;
}) {
  const summary = buildApprovalWorkflowSummary({
    item,
    staffs,
    resolveApprovalLineIds,
    resolveCurrentApproverId,
  });
  const delay = resolveApprovalDelaySnapshot?.(item);
  const status = String(item.status || '대기');

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="erp-status erp-status-blue">
          {summary.totalSteps > 0 ? `${summary.currentStep}/${summary.totalSteps}단계` : '결재선 미지정'}
        </span>
        <span className={`erp-status ${summary.isFinalStep ? 'erp-status-green' : 'erp-status-yellow'}`}>
          {summary.isFinalStep ? '최종 결재' : '다음 결재 있음'}
        </span>
        {delay?.overdue && <span className="erp-status erp-status-red">지연</span>}
      </div>
      <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-semibold text-[var(--muted-foreground)]`}>
        현재 결재자 <span className="font-black text-[var(--foreground)]">{summary.currentApproverName}</span>
        {delay?.overdue && delay.elapsedHours ? ` · ${delay.elapsedHours}시간 경과` : ''}
        {delay?.notificationCount ? ` · 알림 ${delay.notificationCount}회` : ''}
      </p>
      {status.includes('반려') && summary.rejectReason && (
        <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} rounded-[var(--radius-md)] bg-[var(--danger-light)] px-2 py-1 font-semibold text-[var(--danger)]`}>
          반려 사유: {summary.rejectReason}
        </p>
      )}
    </div>
  );
}

export function ApprovalRiskReviewDialog({
  action,
  items,
  staffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalTemplateMeta,
  reason,
  setReason,
  onClose,
  onConfirm,
}: {
  action: 'approve' | 'reject';
  items: ApprovalRecord[];
  staffs: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  reason: string;
  setReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const documentTypeCounts = items.reduce<Record<string, number>>((acc, item) => {
    const typeName = String(resolveApprovalTemplateMeta(item).name || item.type || '결재 문서');
    acc[typeName] = (acc[typeName] || 0) + 1;
    return acc;
  }, {});
  const finalApprovalCount = items.filter((item) =>
    buildApprovalWorkflowSummary({ item, staffs, resolveApprovalLineIds, resolveCurrentApproverId }).isFinalStep
  ).length;
  const title = action === 'approve' ? '일괄 승인 위험 리뷰' : '일괄 반려 위험 리뷰';

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[0_28px_90px_-42px_rgba(15,23,42,0.75)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-4 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-[var(--foreground)]">{title}</h3>
              <p className="mt-1 text-[12px] font-semibold text-[var(--muted-foreground)]">
                서버 처리 전 영향 범위를 확인합니다. 확정 후 선택 문서는 즉시 상태가 바뀝니다.
              </p>
            </div>
            <button type="button" onClick={onClose} className="icon-btn h-9 w-9 text-[var(--muted-foreground)]">
              <LucideIcon name="X" size={16} strokeWidth={2.4} />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-[11px] font-bold text-[var(--muted-foreground)]">대상 문서</p>
              <p className="mt-1 text-xl font-black text-[var(--foreground)]">{items.length}건</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-[11px] font-bold text-[var(--muted-foreground)]">문서 유형</p>
              <p className="mt-1 text-xl font-black text-[var(--foreground)]">{Object.keys(documentTypeCounts).length}종</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-[11px] font-bold text-[var(--muted-foreground)]">최종 결재 포함</p>
              <p className="mt-1 text-xl font-black text-[var(--foreground)]">{finalApprovalCount}건</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.entries(documentTypeCounts).map(([typeName, count]) => (
              <span key={typeName} className="erp-chip">
                {typeName} {count}건
              </span>
            ))}
          </div>

          {action === 'reject' && (
            <label className="mb-4 block space-y-1.5">
              <span className="text-[11px] font-bold text-[var(--muted-foreground)]">반려 사유</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="선택한 모든 문서에 남길 반려 사유를 입력해 주세요."
                className="h-24 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] p-3 text-[13px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
              />
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">비워 두면 기존 기본 반려 문구가 적용됩니다.</span>
            </label>
          )}

          <div className="space-y-2">
            {items.slice(0, 12).map((item) => {
              const itemId = String(item.id || '');
              const summary = buildApprovalWorkflowSummary({ item, staffs, resolveApprovalLineIds, resolveCurrentApproverId });
              const typeName = resolveApprovalTemplateMeta(item).name || String(item.type || '결재 문서');
              return (
                <div key={itemId} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black text-[var(--foreground)]">{String(item.title || '제목 없음')}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--muted-foreground)]">{typeName} · {String(item.sender_name || '기안자')}</p>
                    </div>
                    <span className={`erp-status ${summary.isFinalStep ? 'erp-status-green' : 'erp-status-yellow'}`}>
                      {summary.isFinalStep ? '최종 결재' : `${summary.currentStep}/${summary.totalSteps}단계`}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-[var(--muted-foreground)]">현재 결재자 {summary.currentApproverName}</p>
                </div>
              );
            })}
            {items.length > 12 && (
              <p className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-center text-[11px] font-bold text-[var(--muted-foreground)]">
                외 {items.length - 12}건
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 md:px-5">
          <button type="button" onClick={onClose} className="btn-premium-secondary min-h-[42px] flex-1">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[42px] flex-1 rounded-[var(--radius-md)] px-4 text-sm font-bold text-white ${action === 'approve' ? 'bg-[var(--accent)]' : 'bg-[var(--danger)]'}`}
          >
            {action === 'approve' ? '확인 후 승인' : '확인 후 반려'}
          </button>
        </div>
      </div>
    </div>
  );
}
