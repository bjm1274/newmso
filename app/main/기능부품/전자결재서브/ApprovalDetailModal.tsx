'use client';

import type { StaffMember } from '@/types';
import { isApprovalLocked } from '@/lib/approval-workflow';
import { alphaColor } from '../전자결재-utils';
import ApprovalLineTimeline from './ApprovalLineTimeline';
import { resolveRejectReason } from './ApprovalRiskReviewDialog';
import {
  ApprovalAttachmentsPanel,
  SupplyRequestItemsPanel,
  LeaveRequestInfoPanel,
  ResignationRequestInfoPanel,
  ReportInfoPanel,
  RosterRequestInfoPanel,
  EmployeeEvaluationPanel } from './ApprovalMetaPanels';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type TemplateDesign = Record<string, any>;

type ApprovalDetailModalProps = {
  item: ApprovalRecord | null | undefined;
  approvalDirectoryStaffs: StaffMember[];
  /** 표시용 lookup (활성/회사 필터 없음). 미전달 시 approvalDirectoryStaffs로 폴백. */
  approvalLookupStaffs?: StaffMember[];
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
  approvalLookupStaffs,
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
  handleRecallAction }: ApprovalDetailModalProps) {
  const timelineStaffs = approvalLookupStaffs ?? approvalDirectoryStaffs;
  if (!item) return null;

  const detailType = item.type as string | null | undefined;
  const detailTitle = item.title as string | null | undefined;
  const detailStatus = item.status as string | null | undefined;
  const detailMetaData = item.meta_data as Record<string, unknown> | null | undefined;
  const detailLocked = isApprovalLocked(detailMetaData);
  const detailDelegateSnapshot = resolveApprovalDelegateSnapshot(item);
  const detailDelaySnapshot = resolveApprovalDelaySnapshot(item);
  const detailLockSnapshot = resolveApprovalLockSnapshot(item);
  const templateMeta = resolveApprovalTemplateMeta(item);
  const templateDesign = resolveApprovalTemplateDesign(item);
  const detailDocNumber = String(item?.doc_number || detailMetaData?.doc_number || '').trim();
  const detailSenderName = String(item.sender_name || detailMetaData?.sender_name || '').trim();
  const detailCreatedAt = String(item.created_at || '').trim();
  const detailIsUrgent = Boolean(item.urgent || detailMetaData?.urgent || false);
  const detailCreatedAtFormatted = detailCreatedAt
    ? (() => {
        const d = new Date(detailCreatedAt);
        return Number.isNaN(d.getTime())
          ? detailCreatedAt
          : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      })()
    : '';
  const detailPreviewHtml = buildApprovalPrintHtml(item);
  const operationalAlertVisible =
    detailLocked
    || Boolean(detailDelegateSnapshot.delegatedToName)
    || detailDelaySnapshot.overdue
    || detailDelaySnapshot.notificationCount > 0
    || Boolean(detailLockSnapshot.lockedAt);

  return (
    <div
      data-testid="approval-detail-modal"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
    >
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#edf2f7] md:h-[94dvh] md:max-w-5xl md:rounded-[28px] md:border md:border-white/70 md:shadow-[0_36px_120px_-48px_rgba(15,23,42,0.85)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200/80 bg-white/90 px-4 pt-3 pb-3 md:px-6 md:pt-4 md:pb-4">
          {/* 메타 row: 상태 chip + 유형 chip + 긴급 chip + 문서번호 + 닫기 */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 상태 chip */}
              {detailStatus && (
                <span
                  className="inline-flex px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-bold"
                  style={{
                    backgroundColor:
                      detailStatus.includes('승인') || detailStatus.includes('완료')
                        ? 'var(--success-light)'
                        : detailStatus.includes('반려')
                        ? 'var(--danger-light)'
                        : detailStatus === '대기'
                        ? 'var(--warning-light)'
                        : 'var(--muted)',
                    color:
                      detailStatus.includes('승인') || detailStatus.includes('완료')
                        ? 'var(--success)'
                        : detailStatus.includes('반려')
                        ? 'var(--danger)'
                        : detailStatus === '대기'
                        ? 'var(--warning)'
                        : 'var(--toss-gray-4)' }}
                >
                  {detailStatus}
                </span>
              )}
              {/* 유형 chip */}
              <span
                className="inline-flex px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-semibold"
                style={{ backgroundColor: alphaColor(templateDesign.primaryColor, 0.1), color: templateDesign.primaryColor || '#155eef' }}
              >
                {templateMeta.name || detailType}
              </span>
              {/* 긴급 chip */}
              {detailIsUrgent && (
                <span className="inline-flex px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-bold bg-[var(--danger-light)] text-[var(--danger)]">
                  긴급
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* 문서번호 */}
              {detailDocNumber && (
                <span className="text-[10px] font-mono text-[var(--toss-gray-3)] select-all">
                  {detailDocNumber}
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="모달 닫기"
                className="p-2 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          {/* 제목: 18px / 800 */}
          {detailTitle && (
            <h2 className="text-[18px] font-[800] text-[var(--foreground)] leading-snug">
              {detailTitle}
            </h2>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
          {/* 메타 grid 3-col: 기안자 / 기안일 / 문서번호 */}
          {(detailSenderName || detailCreatedAtFormatted || detailDocNumber) && (
            <div className="mx-auto mb-3 w-full max-w-[860px] grid grid-cols-3 gap-px rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
              <div className="bg-[var(--muted)] px-3 py-2.5">
                <p className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-0.5">기안자</p>
                <p className="text-[12px] font-bold text-[var(--foreground)] truncate">
                  {detailSenderName || '—'}
                </p>
              </div>
              <div className="bg-[var(--muted)] px-3 py-2.5">
                <p className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-0.5">기안일</p>
                <p className="text-[12px] font-bold text-[var(--foreground)] truncate">
                  {detailCreatedAtFormatted || '—'}
                </p>
              </div>
              <div className="bg-[var(--muted)] px-3 py-2.5">
                <p className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-0.5">문서번호</p>
                <p className="text-[12px] font-mono font-bold text-[var(--foreground)] truncate select-all">
                  {detailDocNumber || '—'}
                </p>
              </div>
            </div>
          )}
          <div className="mx-auto mb-3 w-full max-w-[860px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-black text-[var(--foreground)]">결재선</h3>
              {String(detailStatus || '').includes('반려') && resolveRejectReason(item) && (
                <span className="rounded-[var(--radius-sm,4px)] bg-[var(--danger-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
                  반려 사유: {resolveRejectReason(item)}
                </span>
              )}
            </div>
            <ApprovalLineTimeline
              item={item}
              staffs={timelineStaffs}
              resolveApprovalLineIds={resolveApprovalLineIds}
              resolveCurrentApproverId={resolveCurrentApproverId}
            />
          </div>
          
          {/* 샌드박스 아이프레임 바깥 영역에 메타 데이터 패널들 배치 */}
          <div className="mx-auto mb-3 w-full max-w-[860px] space-y-3">
            <SupplyRequestItemsPanel metaData={detailMetaData} />
            <LeaveRequestInfoPanel metaData={detailMetaData} />
            <ResignationRequestInfoPanel metaData={detailMetaData} />
            <ReportInfoPanel metaData={detailMetaData} />
            <RosterRequestInfoPanel metaData={detailMetaData} />
            <EmployeeEvaluationPanel metaData={detailMetaData} />
            <ApprovalAttachmentsPanel metaData={detailMetaData} />
          </div>

          <div className="mx-auto mb-4 w-full max-w-[860px] overflow-hidden rounded-[var(--radius-lg)] border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.65)]">
            <iframe
              data-testid="approval-detail-preview"
              title={`${detailTitle || templateMeta.name || '결재 문서'}${detailDocNumber ? ` (${detailDocNumber})` : ''} 미리보기`}
              srcDoc={detailPreviewHtml}
              // 보안: 결재 문서 미리보기는 정적 HTML만 렌더. 스크립트·폼·팝업 차단(XSS 방어).
              sandbox=""
              className="block w-full border-0 bg-white"
              style={{ height: 'min(1120px, calc(100dvh - 290px))' }}
            />
          </div>
          {operationalAlertVisible && (
            <div className="mx-auto mb-3 w-full max-w-[860px] rounded-[var(--radius-md)] border border-[var(--border)] bg-white/90 px-3 py-2 space-y-1.5">
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
                    <span className="text-[var(--toss-gray-3)]">{new Date(detailDelegateSnapshot.delegatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
                  )}
                </div>
              )}
              {(detailDelaySnapshot.overdue || detailDelaySnapshot.notificationCount > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--toss-gray-4)]">
                  <span className="font-semibold text-rose-600 shrink-0">지연</span>
                  <span>기준 {detailDelaySnapshot.thresholdHours}시간{detailDelaySnapshot.elapsedHours > 0 ? ` · 경과 ${detailDelaySnapshot.elapsedHours}시간` : ''}</span>
                  {detailDelaySnapshot.notificationCount > 0 && (
                    <span className="text-[var(--toss-gray-3)]">알림 {detailDelaySnapshot.notificationCount}회{detailDelaySnapshot.lastNotifiedAt ? ` · ${new Date(detailDelaySnapshot.lastNotifiedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                  )}
                </div>
              )}
              {detailLockSnapshot.lockedAt && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--toss-gray-4)]">
                  <span className="font-semibold text-[var(--foreground)] shrink-0">개정 {detailLockSnapshot.revision ?? 1}</span>
                  {detailLockSnapshot.lockedByName && <span>{detailLockSnapshot.lockedByName}</span>}
                  <span className="text-[var(--toss-gray-3)]">{new Date(detailLockSnapshot.lockedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {(detailStatus === '대기' || (detailStatus && detailStatus.includes('반려'))) && (
          <div className="border-t border-[var(--border)] safe-area-pb px-4 py-3 md:px-4 md:py-3 space-y-2">
            {canUserApproveItem(item) && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => { await handleApproveAction(item); onClose(); }}
                  className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={async () => { await handleRejectAction(item); onClose(); }}
                  className="flex-1 py-3 bg-[var(--danger-light)] border border-[var(--danger)]/20 text-[var(--danger)] rounded-[var(--radius-lg)] text-sm font-bold hover:bg-[var(--danger)]/20 transition-all"
                >
                  반려
                </button>
              </div>
            )}
            
            {canUserRecallItem(item) && (
              <button
                type="button"
                data-testid="approval-detail-recall"
                onClick={async () => { await handleRecallAction(item); onClose(); }}
                className="w-full py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-[var(--radius-lg)] text-sm font-bold hover:bg-amber-100 transition-all"
              >
                회수 후 수정
              </button>
            )}

            {!canUserApproveItem(item) && !canUserRecallItem(item) && (
              <p className="text-[11px] text-[var(--toss-gray-3)] text-center">결재자 계정에서만 승인·반려할 수 있습니다.</p>
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
