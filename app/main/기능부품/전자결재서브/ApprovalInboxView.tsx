'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { StaffMember } from '@/types';
import { LucideIcon } from '../조직도서브/조직도측면창';
import { ALL_DOCUMENT_FILTER } from './approval-constants';
import {
  ApprovalProgressSummary,
  ApprovalRiskReviewDialog,
  buildApprovalWorkflowSummary,
} from './ApprovalRiskReviewDialog';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type TemplateDesign = Record<string, any>;

type ApprovalInboxViewProps = {
  viewMode: string;
  listForView: ApprovalRecord[];
  approvalDocumentFilter: string;
  setApprovalDocumentFilter: Dispatch<SetStateAction<string>>;
  documentTypeOptions: string[];
  approvalKeyword: string;
  setApprovalKeyword: Dispatch<SetStateAction<string>>;
  approvalDateMode: 'month' | 'week' | 'range';
  setApprovalDateMode: Dispatch<SetStateAction<'month' | 'week' | 'range'>>;
  approvalMonth: string;
  setApprovalMonth: Dispatch<SetStateAction<string>>;
  approvalWeekDate: string;
  setApprovalWeekDate: Dispatch<SetStateAction<string>>;
  approvalDateFrom: string;
  setApprovalDateFrom: Dispatch<SetStateAction<string>>;
  approvalDateTo: string;
  setApprovalDateTo: Dispatch<SetStateAction<string>>;
  setApprovalDateTouched: Dispatch<SetStateAction<boolean>>;
  defaultApprovalMonth: string;
  defaultApprovalWeekDate: string;
  effectiveApprovalDateRange: { from: string; to: string };
  hasApprovalFilterOverrides: boolean;
  dateRangeInvalid: boolean;
  approvalStatusFilter: '전체' | '대기' | '승인' | '반려';
  setApprovalStatusFilter: Dispatch<SetStateAction<'전체' | '대기' | '승인' | '반려'>>;
  bulkTargetList: ApprovalRecord[];
  allBulkSelected: boolean;
  selectedApprovalIds: string[];
  toggleSelectAll: () => void;
  toggleSelectOne: (id: string) => void;
  handleBulkApprove: (options?: { skipConfirm?: boolean }) => void | Promise<void>;
  handleBulkReject: (options?: { reason?: string; skipPrompt?: boolean }) => void | Promise<void>;
  setSelectedApprovalId: Dispatch<SetStateAction<string | null>>;
  approvalDirectoryStaffs: StaffMember[];
  /** 표시용 lookup (활성/회사 필터 없음). 미전달 시 approvalDirectoryStaffs로 폴백. */
  approvalLookupStaffs?: StaffMember[];
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  resolveApprovalTemplateMeta: (item: ApprovalRecord) => TemplateMeta;
  resolveApprovalTemplateDesign: (item: ApprovalRecord) => TemplateDesign;
  resolveApprovalDelegateSnapshot: (item: ApprovalRecord) => { delegatedToName?: string; delegatedFromName?: string };
  resolveApprovalDelaySnapshot: (item: ApprovalRecord) => {
    overdue: boolean;
    notificationCount: number;
    elapsedHours?: number;
    thresholdHours?: number;
  };
  resolveApprovalLockSnapshot: (item: ApprovalRecord) => { revision?: number };
  isApprovalEditLockedItem: (item: ApprovalRecord) => boolean;
  canUserRecallItem: (item: ApprovalRecord) => boolean;
  canUserApproveItem: (item: ApprovalRecord) => boolean;
  handleApproveAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRejectAction: (item: ApprovalRecord) => void | Promise<void>;
  handleRecallAction: (item: ApprovalRecord) => void | Promise<void>;
};

export default function ApprovalInboxView({
  viewMode,
  listForView,
  approvalDocumentFilter,
  setApprovalDocumentFilter,
  documentTypeOptions,
  approvalKeyword,
  setApprovalKeyword,
  approvalDateMode,
  setApprovalDateMode,
  approvalMonth,
  setApprovalMonth,
  approvalWeekDate,
  setApprovalWeekDate,
  approvalDateFrom,
  setApprovalDateFrom,
  approvalDateTo,
  setApprovalDateTo,
  setApprovalDateTouched,
  dateRangeInvalid,
  approvalStatusFilter,
  setApprovalStatusFilter,
  bulkTargetList,
  allBulkSelected,
  selectedApprovalIds,
  toggleSelectAll,
  toggleSelectOne,
  handleBulkApprove,
  handleBulkReject,
  setSelectedApprovalId,
  resolveApprovalTemplateMeta,
  canUserRecallItem,
  canUserApproveItem,
  handleApproveAction,
  handleRejectAction,
  handleRecallAction,
  approvalDirectoryStaffs,
  approvalLookupStaffs,
  resolveApprovalLineIds,
  resolveCurrentApproverId,
  resolveApprovalDelaySnapshot,
}: ApprovalInboxViewProps) {
  // 표시용 lookup은 풀(staffs 풀 + 외부 결재자) — 결재선 선택과 분리해 UUID 노출 차단.
  const lookupStaffsForDisplay = approvalLookupStaffs ?? approvalDirectoryStaffs;
  const [bulkReviewAction, setBulkReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const documentFilterOptions = [ALL_DOCUMENT_FILTER, ...documentTypeOptions];
  const selectedBulkItems = useMemo(
    () => bulkTargetList.filter((item) => selectedApprovalIds.includes(String(item.id || ''))),
    [bulkTargetList, selectedApprovalIds]
  );
  const approvalSummary = listForView.reduce<{ pending: number; approved: number; rejected: number }>(
    (acc, item) => {
      const status = String(item.status || '');
      if (status.includes('승인')) acc.approved += 1;
      else if (status.includes('반려')) acc.rejected += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 },
  );

  const formatDraftDate = (value: unknown) => {
    const raw = String(value || '');
    if (!raw) return '-';
    const datePart = raw.slice(0, 10);
    const [, month, day] = datePart.split('-');
    return month && day ? `${month}.${day}` : datePart;
  };

  const statusTone = (statusValue: unknown) => {
    const status = String(statusValue || '대기').trim();
    if (status.includes('승인')) {
      return { label: '승인', className: 'erp-status erp-status-green' };
    }
    if (status.includes('반려')) {
      return { label: '반려', className: 'erp-status erp-status-red' };
    }
    return { label: '대기', className: 'erp-status erp-status-yellow' };
  };

  const closeBulkReview = () => {
    setBulkReviewAction(null);
    setBulkRejectReason('');
  };

  const confirmBulkReview = async () => {
    if (bulkReviewAction === 'approve') {
      await handleBulkApprove({ skipConfirm: true });
    } else if (bulkReviewAction === 'reject') {
      await handleBulkReject({ reason: bulkRejectReason, skipPrompt: true });
    }
    closeBulkReview();
  };

  return (
    <div className="space-y-4">
      {bulkReviewAction && selectedBulkItems.length > 0 && (
        <ApprovalRiskReviewDialog
          action={bulkReviewAction}
          items={selectedBulkItems}
          staffs={approvalDirectoryStaffs}
          resolveApprovalLineIds={resolveApprovalLineIds}
          resolveCurrentApproverId={resolveCurrentApproverId}
          resolveApprovalTemplateMeta={resolveApprovalTemplateMeta}
          reason={bulkRejectReason}
          setReason={setBulkRejectReason}
          onClose={closeBulkReview}
          onConfirm={confirmBulkReview}
        />
      )}

      <section className="app-card p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-[var(--foreground)]">{viewMode}</h2>
            </div>
            <span className="erp-chip erp-chip-active">{listForView.length}건</span>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(140px,180px)_minmax(140px,180px)_minmax(140px,180px)_1fr]">
            <select
              data-testid="approval-document-filter"
              value={approvalDocumentFilter}
              onChange={(event) => setApprovalDocumentFilter(event.target.value)}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
            >
              {documentFilterOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={approvalStatusFilter}
              onChange={(event) => setApprovalStatusFilter(event.target.value as '전체' | '대기' | '승인' | '반려')}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
            >
              {['전체', '대기', '승인', '반려'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              data-testid="approval-date-mode"
              value={approvalDateMode}
              onChange={(event) => {
                setApprovalDateMode(event.target.value as 'month' | 'week' | 'range');
                setApprovalDateTouched(true);
              }}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
            >
              <option value="week">주간별</option>
              <option value="month">월별</option>
              <option value="range">기간</option>
            </select>

            <input
              data-testid="approval-keyword-filter"
              value={approvalKeyword}
              onChange={(event) => setApprovalKeyword(event.target.value)}
              placeholder="제목, 내용, 기안자 검색"
              className="h-10 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] focus:border-[var(--accent)]/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {approvalDateMode === 'month' && (
              <input
                data-testid="approval-month-filter"
                type="month"
                value={approvalMonth}
                onChange={(event) => {
                  setApprovalMonth(event.target.value);
                  setApprovalDateTouched(true);
                }}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
              />
            )}
            {approvalDateMode === 'week' && (
              <input
                type="date"
                value={approvalWeekDate}
                onChange={(event) => {
                  setApprovalWeekDate(event.target.value);
                  setApprovalDateTouched(true);
                }}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
              />
            )}
            {approvalDateMode === 'range' && (
              <>
                <input
                  data-testid="approval-date-from"
                  type="date"
                  value={approvalDateFrom}
                  onChange={(event) => {
                    setApprovalDateFrom(event.target.value);
                    setApprovalDateTouched(true);
                  }}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
                />
                <span className="text-[12px] font-bold text-[var(--toss-gray-3)]">~</span>
                <input
                  data-testid="approval-date-to"
                  type="date"
                  value={approvalDateTo}
                  onChange={(event) => {
                    setApprovalDateTo(event.target.value);
                    setApprovalDateTouched(true);
                  }}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
                />
              </>
            )}
          </div>
        </div>
      </section>

      <div className="erp-stat-grid">
        {[
          { label: '대기중', value: `${approvalSummary.pending}건`, icon: 'Clock3', tone: 'text-[var(--warning)] bg-[var(--warning-light)]' },
          { label: '이번 달 승인', value: `${approvalSummary.approved}건`, icon: 'Check', tone: 'text-[var(--success)] bg-[var(--success-light)]' },
          { label: '반려', value: `${approvalSummary.rejected}건`, icon: 'X', tone: 'text-[var(--danger)] bg-[var(--danger-light)]' },
        ].map((item) => (
          <article key={item.label} className="erp-stat-card">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12px] font-medium text-[var(--toss-gray-4)]">{item.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] ${item.tone}`}>
                <LucideIcon name={item.icon} size={16} />
              </span>
            </div>
            <p className="mt-3 text-[24px] font-black leading-none text-[var(--foreground)]">{item.value}</p>
          </article>
        ))}
      </div>

      {(viewMode === '기안함' || viewMode === '참조 문서함') && approvalStatusFilter === '대기' && listForView.length > 0 && (
        <p className="text-xs text-[var(--toss-gray-3)]">결재 대기 문서입니다.</p>
      )}

      {dateRangeInvalid && (
        <p className="text-[11px] font-semibold text-[var(--danger)]">종료일은 시작일보다 빠를 수 없습니다.</p>
      )}

      {viewMode === '결재함' && bulkTargetList.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm animate-in fade-in duration-200">
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={allBulkSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
            />
            <span className="text-sm font-bold text-[var(--foreground)]">전체 선택</span>
          </label>
          {selectedApprovalIds.length > 0 && (
            <span className="text-xs font-bold text-[var(--accent)] bg-[var(--toss-blue-light)] px-3 py-1 rounded-[var(--radius-md)]">
              {selectedApprovalIds.length}건 선택됨
            </span>
          )}
          <div className="flex gap-2 ml-auto shrink-0">
            <button
              type="button"
              disabled={selectedApprovalIds.length === 0}
              onClick={() => setBulkReviewAction('approve')}
              className="h-9 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              일괄 승인
            </button>
            <button
              type="button"
              disabled={selectedApprovalIds.length === 0}
              onClick={() => setBulkReviewAction('reject')}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--danger)]/20 bg-[var(--danger-light)] px-4 text-xs font-bold text-[var(--danger)] shadow-sm transition-all hover:bg-[var(--danger-light)]/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              일괄 반려
            </button>
          </div>
        </div>
      )}

      {listForView.length === 0 ? null : (
        <section className="erp-table-card">
          <div className="overflow-x-auto">
            <table className="erp-table min-w-[860px]">
              <thead>
                <tr>
                  {viewMode === '결재함' && <th className="w-10" />}
                  <th>문서 제목</th>
                  <th>기안자</th>
                  <th>문서 유형</th>
                  <th>기안일</th>
                  <th>상태</th>
                  <th className="text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {listForView.map((item) => {
                  const itemId = String(item.id || '');
                  const isBulkTarget = viewMode === '결재함' && canUserApproveItem(item);
                  const isChecked = selectedApprovalIds.includes(itemId);
                  const templateMeta = resolveApprovalTemplateMeta(item);
                  const status = statusTone(item.status);
                  const workflowSummary = buildApprovalWorkflowSummary({
                    item,
                    staffs: lookupStaffsForDisplay,
                    resolveApprovalLineIds,
                    resolveCurrentApproverId,
                  });

                  return (
                    <tr
                      key={itemId}
                      data-testid={`approval-card-${itemId}`}
                      className="cursor-pointer"
                      onClick={() => setSelectedApprovalId(itemId)}
                    >
                      {viewMode === '결재함' && (
                        <td>
                          {isBulkTarget ? (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleSelectOne(itemId)}
                              className="h-4 w-4 accent-[var(--accent)]"
                              aria-label={`${String(item.title || '결재 문서')} 선택`}
                            />
                          ) : null}
                        </td>
                      )}
                      <td>
                        <div className="min-w-[220px]">
                          <p className="font-bold text-[var(--foreground)]">{String(item.title || '제목 없음')}</p>
                          <ApprovalProgressSummary
                            item={item}
                            staffs={lookupStaffsForDisplay}
                            resolveApprovalLineIds={resolveApprovalLineIds}
                            resolveCurrentApproverId={resolveCurrentApproverId}
                            resolveApprovalDelaySnapshot={resolveApprovalDelaySnapshot}
                            compact
                          />
                        </div>
                      </td>
                      <td>{String(item.sender_name || '사용자')}</td>
                      <td><span className="erp-status erp-status-blue">{templateMeta.name || String(item.type || '결재')}</span></td>
                      <td>{formatDraftDate(item.created_at)}</td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span className={status.className}>{status.label}</span>
                          {String(item.status || '').includes('대기') && (
                            <span className="text-[10px] font-bold text-[var(--muted-foreground)]">
                              {workflowSummary.currentApproverName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
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
                              setSelectedApprovalId(itemId);
                            }}
                            className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                          >
                            상세
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
