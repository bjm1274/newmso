'use client';

import type { StaffMember } from '@/types';
import {
  formatApprovalHistoryActionLabel,
  getApprovalEditHistory,
  isApprovalLocked,
} from '@/lib/approval-workflow';
import { alphaColor, normalizeApprovalCcUsers } from '../전자결재-utils';
import {
  ApprovalAttachmentsPanel,
  LeaveRequestInfoPanel,
  ReportInfoPanel,
  SupplyRequestItemsPanel,
} from './ApprovalMetaPanels';
import { ApprovalProgressSummary } from './ApprovalRiskReviewDialog';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type TemplateDesign = Record<string, any>;

type ApprovalDetailModalProps = {
  item: ApprovalRecord | null | undefined;
  approvalDirectoryStaffs: StaffMember[];
  onClose: () => void;
  buildApprovalPrintHtml: (item: ApprovalRecord, options?: { autoPrint?: boolean }) => string;
  openApprovalPrintView: (item: ApprovalRecord) => void;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  resolveApprovalTemplateDesign: (item: ApprovalRecord) => TemplateDesign;
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalDelegateSnapshot: (item: ApprovalRecord) => {
    delegatedFromName?: string;
    delegatedToName?: string;
    delegatedAt?: string;
  };
  resolveApprovalDelaySnapshot: (item: ApprovalRecord) => {
    thresholdHours: number;
    elapsedHours: number;
    overdue: boolean;
    notificationCount: number;
    lastNotifiedAt?: string;
  };
  resolveApprovalLockSnapshot: (item: ApprovalRecord) => {
    lockedAt?: string;
    lockedByName?: string;
    revision?: number;
  };
  canUserApproveItem: (item: ApprovalRecord) => boolean;
  canUserRecallItem: (item: ApprovalRecord) => boolean;
  handleApproveAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRejectAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRecallAction: (item: ApprovalRecord) => void | Promise<void>;
};

export default function ApprovalDetailModal({
  item,
  approvalDirectoryStaffs,
  onClose,
  buildApprovalPrintHtml,
  openApprovalPrintView,
  resolveApprovalTemplateMeta,
  resolveApprovalTemplateDesign,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalDelegateSnapshot,
  resolveApprovalDelaySnapshot,
  resolveApprovalLockSnapshot,
  canUserApproveItem,
  canUserRecallItem,
  handleApproveAction,
  handleRejectAction,
  handleRecallAction,
}: ApprovalDetailModalProps) {
  if (!item) return null;

  const detailType = item.type as string | null | undefined;
  const detailTitle = item.title as string | null | undefined;
  const detailSenderName = item.sender_name as string | null | undefined;
  const detailCreatedAt = item.created_at as string;
  const detailContent = item.content as string | null | undefined;
  const detailStatus = item.status as string | null | undefined;
  const detailMetaData = item.meta_data as Record<string, unknown> | null | undefined;
  const detailCcUsers = normalizeApprovalCcUsers(detailMetaData?.cc_users, approvalDirectoryStaffs);
  const detailHistory = getApprovalEditHistory(detailMetaData);
  const detailLocked = isApprovalLocked(detailMetaData);
  const detailDelegateSnapshot = resolveApprovalDelegateSnapshot(item);
  const detailDelaySnapshot = resolveApprovalDelaySnapshot(item);
  const detailLockSnapshot = resolveApprovalLockSnapshot(item);
  const templateMeta = resolveApprovalTemplateMeta(item);
  const templateDesign = resolveApprovalTemplateDesign(item);
  const detailDocNumber = String(item?.doc_number || detailMetaData?.doc_number || '').trim();
  const detailPreviewHtml = buildApprovalPrintHtml(item);

  return (
    <div
      data-testid="approval-detail-modal"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#edf2f7] md:h-[94dvh] md:max-w-5xl md:rounded-[28px] md:border md:border-white/70 md:shadow-[0_36px_120px_-48px_rgba(15,23,42,0.85)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0">
            <span
              className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold"
              style={{ backgroundColor: alphaColor(templateDesign.primaryColor, 0.1), color: templateDesign.primaryColor || '#155eef' }}
            >
              {templateMeta.name || detailType}
            </span>
            <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{(templateDesign.subtitle as string | null | undefined) || '전자결재 승인 문서'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
          <div className="mx-auto mb-4 w-full max-w-[860px] overflow-hidden rounded-[var(--radius-lg)] border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.65)]">
            <iframe
              data-testid="approval-detail-preview"
              title={`${detailTitle || templateMeta.name || '결재 문서'}${detailDocNumber ? ` (${detailDocNumber})` : ''} 미리보기`}
              srcDoc={detailPreviewHtml}
              className="block w-full border-0 bg-white"
              style={{ height: 'min(1120px, calc(100dvh - 290px))' }}
            />
          </div>
          <div className="mx-auto w-full max-w-[860px] rounded-[var(--radius-lg)] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_48px_-38px_rgba(15,23,42,0.6)] md:p-5">
            <h3 className="font-bold text-[var(--foreground)] text-[15px] mb-0.5">{detailTitle || '(제목 없음)'}</h3>
            <p className="text-[10px] text-[var(--toss-gray-3)] mb-2.5">기안자 {detailSenderName} · {new Date(detailCreatedAt).toLocaleString('ko-KR')}</p>
            <div className="mb-2.5 rounded-[var(--radius-lg)] border border-[var(--accent)]/15 bg-[var(--accent-selected-subtle)] p-3">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-black text-[var(--accent)]">권한</span>
                <p className="text-[11px] font-semibold leading-relaxed text-[var(--muted-foreground)]">
                  이 상세 화면은 기안자, 결재선 참여자, 참조자에게 허용된 범위의 문서 정보만 보여줍니다. 승인·반려는 현재 결재자에게만 노출됩니다.
                </p>
              </div>
              <ApprovalProgressSummary
                item={item}
                staffs={approvalDirectoryStaffs}
                resolveApprovalLineIds={resolveApprovalLineIds}
                resolveCurrentApproverId={resolveCurrentApproverId}
                resolveApprovalDelaySnapshot={resolveApprovalDelaySnapshot}
              />
            </div>
            {detailCcUsers.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-yellow-500/20 bg-yellow-500/10 px-2 py-1.5">
                <span className="text-[10px] font-bold text-yellow-700 shrink-0">참조자</span>
                {detailCcUsers.map((ccUser) => (
                  <span
                    key={ccUser.id}
                    className="inline-flex items-center rounded-[var(--radius-md)] border border-yellow-500/20 bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 dark:text-yellow-300"
                  >
                    {ccUser.name}{ccUser.position ? ` ${ccUser.position}` : ''}
                  </span>
                ))}
              </div>
            )}
            {(detailLocked || detailHistory.length > 0 || detailDelegateSnapshot.delegatedToName || detailDelaySnapshot.overdue || detailDelaySnapshot.notificationCount > 0 || detailLockSnapshot.lockedAt) && (
              <div className="mb-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/60 px-2.5 py-2 space-y-1.5">
                {detailLocked && (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                    <span className="rounded bg-[var(--muted)] px-1.5 py-0.5">수정 잠금</span>
                    <span className="text-[var(--toss-gray-3)]">최종 처리된 문서</span>
                  </div>
                )}
                {detailDelegateSnapshot.delegatedToName && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--toss-gray-4)]">
                    <span className="font-semibold text-[var(--foreground)] shrink-0">대결</span>
                    <span>
                      {detailDelegateSnapshot.delegatedFromName
                        ? `${detailDelegateSnapshot.delegatedFromName} → ${detailDelegateSnapshot.delegatedToName}`
                        : detailDelegateSnapshot.delegatedToName}
                    </span>
                    {detailDelegateSnapshot.delegatedAt && (
                      <span className="text-[var(--toss-gray-3)]">{new Date(detailDelegateSnapshot.delegatedAt).toLocaleDateString('ko-KR')}</span>
                    )}
                  </div>
                )}
                {(detailDelaySnapshot.overdue || detailDelaySnapshot.notificationCount > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--toss-gray-4)]">
                    <span className="font-semibold text-rose-600 shrink-0">지연</span>
                    <span>기준 {detailDelaySnapshot.thresholdHours}시간{detailDelaySnapshot.elapsedHours > 0 ? ` · 경과 ${detailDelaySnapshot.elapsedHours}시간` : ''}</span>
                    {detailDelaySnapshot.notificationCount > 0 && (
                      <span className="text-[var(--toss-gray-3)]">알림 {detailDelaySnapshot.notificationCount}회{detailDelaySnapshot.lastNotifiedAt ? ` · ${new Date(detailDelaySnapshot.lastNotifiedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                    )}
                  </div>
                )}
                {detailLockSnapshot.lockedAt && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--toss-gray-4)]">
                    <span className="font-semibold text-[var(--foreground)] shrink-0">개정 {detailLockSnapshot.revision ?? 1}</span>
                    {detailLockSnapshot.lockedByName && <span>{detailLockSnapshot.lockedByName}</span>}
                    <span className="text-[var(--toss-gray-3)]">{new Date(detailLockSnapshot.lockedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {detailHistory.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[var(--foreground)] mb-1">문서 이력</p>
                    <div className="space-y-0.5">
                      {detailHistory.slice().reverse().map((entry, index) => (
                        <div key={`${entry.at}-${entry.action}-${index}`} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[10px] text-[var(--toss-gray-4)] py-0.5">
                          <span className="font-semibold text-[var(--foreground)] shrink-0">{formatApprovalHistoryActionLabel(entry.action)}</span>
                          <span className="shrink-0">{entry.actor_name || entry.actor_id || '시스템'}</span>
                          <span className="text-[var(--toss-gray-3)]">{new Date(entry.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {entry.note && <span className="text-[var(--toss-gray-3)] w-full pl-0">{entry.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-sm text-[var(--toss-gray-4)] whitespace-pre-wrap border-t border-[var(--border)] pt-4">{detailContent || '-'}</div>
            <ReportInfoPanel metaData={detailMetaData} />
            <LeaveRequestInfoPanel metaData={detailMetaData} />
            <SupplyRequestItemsPanel metaData={detailMetaData} />
            <ApprovalAttachmentsPanel metaData={detailMetaData} />
          </div>
        </div>
        {detailStatus === '대기' && (
          <div className="p-4 md:p-4 border-t border-[var(--border)] safe-area-pb">
            {canUserApproveItem(item) ? (
              <div className="flex gap-3">
                <button type="button" onClick={async () => { await handleApproveAction(item); onClose(); }} className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] text-sm font-bold">승인</button>
                <button type="button" onClick={async () => { await handleRejectAction(item); onClose(); }} className="flex-1 py-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-[var(--radius-lg)] text-sm font-bold hover:bg-red-500/20 transition-all">반려</button>
              </div>
            ) : canUserRecallItem(item) ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  data-testid="approval-detail-recall"
                  onClick={async () => { await handleRecallAction(item); }}
                  className="flex-1 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-[var(--radius-lg)] text-sm font-bold hover:bg-amber-100 transition-all"
                >
                  회수 후 수정
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--toss-gray-3)] text-center py-2">결재자 계정에서만 승인·반려할 수 있습니다.</p>
            )}
          </div>
        )}
        <div className="border-t border-slate-200/80 bg-white/92 px-4 py-3 md:px-6 md:py-4 safe-area-pb">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
              상세 미리보기는 출력용 문서 형식입니다. 필요할 때만 문서출력을 눌러 주세요.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
              >
                닫기
              </button>
              <button
                type="button"
                data-testid="approval-detail-print"
                onClick={() => openApprovalPrintView(item)}
                className="rounded-[var(--radius-lg)] border border-[var(--accent)]/15 bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-95"
              >
                문서출력
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
