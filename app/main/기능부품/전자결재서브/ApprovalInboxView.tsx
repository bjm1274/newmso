'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { StaffMember } from '@/types';
import { LucideIcon } from '../조직도서브/조직도측면창';
import { ALL_DOCUMENT_FILTER } from './approval-constants';
import { ApprovalRiskReviewDialog } from './ApprovalRiskReviewDialog';
import { ResponsiveTable, type ResponsiveTableSelection } from '@/app/components/ResponsiveTable';
import WorkflowBoard from './WorkflowBoard';
import ApprovalWorkflowKpi from './ApprovalWorkflowKpi';
import { buildApprovalInboxColumns } from './ApprovalInboxColumns';

type ApprovalRecord = Record<string, unknown>;
type TemplateMeta = { slug?: string | null; name?: string | null };
type TemplateDesign = Record<string, any>;

type ApprovalInboxViewProps = {
  viewMode: string;
  /** 현재 사용자 id — 워크플로 보드의 "내 차례·검토 중" 분류에 사용 */
  currentUserId?: string | null;
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
  approvalStatusFilter: '전체' | '대기' | '승인' | '반려' | '회수';
  setApprovalStatusFilter: Dispatch<SetStateAction<'전체' | '대기' | '승인' | '반려' | '회수'>>;
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
  onCreateDraft?: () => void;
};

export default function ApprovalInboxView({
  viewMode,
  currentUserId,
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
  onCreateDraft }: ApprovalInboxViewProps) {
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

  const [searchExpanded, setSearchExpanded] = useState(false);

  // 결재함 헤더용 서브 수치 — KPI 와 동일 로직, 별도 fetch 없음
  const inboxHeaderStats = useMemo(() => {
    if (viewMode !== '결재함') return { myTurn: 0, approvedThisMonth: 0 };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let myTurn = 0;
    let approvedThisMonth = 0;
    for (const item of listForView) {
      const status = String(item.status || '').trim();
      const createdAt = new Date(String(item.created_at || ''));
      const inThisMonth = !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart;
      if (status.includes('대기') && currentUserId) {
        const currentApproverId = resolveCurrentApproverId(item);
        if (currentApproverId && String(currentApproverId) === String(currentUserId)) {
          myTurn += 1;
        }
      }
      if (inThisMonth && (status.includes('승인') || status.includes('완료'))) {
        approvedThisMonth += 1;
      }
    }
    return { myTurn, approvedThisMonth };
  }, [viewMode, listForView, currentUserId, resolveCurrentApproverId]);

  // ResponsiveTable: 결재함일 때만 selection 활성화
  const selection: ResponsiveTableSelection | undefined = useMemo(() => {
    if (viewMode !== '결재함' || bulkTargetList.length === 0) return undefined;
    const bulkTargetIds = new Set(bulkTargetList.map((item) => String(item.id || '')));
    return {
      selected: new Set(selectedApprovalIds),
      onToggle: (key: string) => toggleSelectOne(key),
      onToggleAll: () => toggleSelectAll(),
      allSelected: allBulkSelected,
      indeterminate: selectedApprovalIds.length > 0 && !allBulkSelected,
      isRowSelectable: (key: string) => bulkTargetIds.has(key),
      getRowAriaLabel: (key: string) => {
        const target = listForView.find((item) => String(item.id || '') === key);
        return `${String(target?.title || '결재 문서')} 선택`;
      } };
  }, [viewMode, bulkTargetList, selectedApprovalIds, allBulkSelected, toggleSelectOne, toggleSelectAll, listForView]);

  const columns = useMemo(
    () =>
      buildApprovalInboxColumns({
        lookupStaffs: lookupStaffsForDisplay,
        resolveApprovalLineIds,
        resolveCurrentApproverId,
        resolveApprovalDelaySnapshot,
        resolveApprovalTemplateMeta,
        canUserRecallItem,
        canUserApproveItem,
        handleRecallAction,
        handleApproveAction,
        handleRejectAction,
        onOpenDetail: (id) => setSelectedApprovalId(id) }),
    [
      lookupStaffsForDisplay,
      resolveApprovalLineIds,
      resolveCurrentApproverId,
      resolveApprovalDelaySnapshot,
      resolveApprovalTemplateMeta,
      canUserRecallItem,
      canUserApproveItem,
      handleRecallAction,
      handleApproveAction,
      handleRejectAction,
      setSelectedApprovalId,
    ],
  );

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

      <section className="app-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="approval-document-filter"
            value={approvalDocumentFilter}
            onChange={(event) => setApprovalDocumentFilter(event.target.value)}
            className="h-8 w-auto min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 pr-7 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
          >
            {documentFilterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            data-testid="approval-status-filter"
            value={approvalStatusFilter}
            onChange={(event) => setApprovalStatusFilter(event.target.value as '전체' | '대기' | '승인' | '반려' | '회수')}
            className="h-8 w-auto min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 pr-7 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
          >
            {['전체', '대기', '승인', '반려', '회수'].map((option) => (
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
            className="h-8 w-auto min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 pr-7 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
          >
            <option value="week">주간별</option>
            <option value="month">월별</option>
            <option value="range">기간</option>
          </select>

          {approvalDateMode === 'month' && (
            <input
              data-testid="approval-month-filter"
              type="month"
              value={approvalMonth}
              onChange={(event) => {
                setApprovalMonth(event.target.value);
                setApprovalDateTouched(true);
              }}
              className="h-8 w-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
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
              className="h-8 w-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
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
                className="h-8 w-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
              />
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">~</span>
              <input
                data-testid="approval-date-to"
                type="date"
                value={approvalDateTo}
                onChange={(event) => {
                  setApprovalDateTo(event.target.value);
                  setApprovalDateTouched(true);
                }}
                className="h-8 w-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]/50"
              />
            </>
          )}

          {/* 결재함은 헤더의 상시 검색 input 사용 — 필터 바 토글 검색은 다른 뷰에서만 노출 */}
          {viewMode !== '결재함' && (
            searchExpanded ? (
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]"
                >
                  <LucideIcon name="Search" size={13} />
                </span>
                <input
                  data-testid="approval-keyword-filter"
                  autoFocus
                  value={approvalKeyword}
                  onChange={(event) => setApprovalKeyword(event.target.value)}
                  onBlur={() => {
                    if (!approvalKeyword) setSearchExpanded(false);
                  }}
                  placeholder="제목·기안자·문서번호"
                  className="h-8 w-56 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] pl-7 pr-2 text-[11px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] focus:border-[var(--accent)]/50"
                />
              </div>
            ) : (
              <button
                type="button"
                aria-label="검색"
                onClick={() => setSearchExpanded(true)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
              >
                <LucideIcon name="Search" size={14} />
              </button>
            )
          )}

          <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="rounded-[var(--radius-md)] bg-[var(--warning-light)] px-1.5 py-0.5 text-[var(--warning)]">대기 {approvalSummary.pending}</span>
            <span className="rounded-[var(--radius-md)] bg-[var(--success-light)] px-1.5 py-0.5 text-[var(--success)]">승인 {approvalSummary.approved}</span>
            <span className="rounded-[var(--radius-md)] bg-[var(--danger-light)] px-1.5 py-0.5 text-[var(--danger)]">반려 {approvalSummary.rejected}</span>
          </div>
        </div>
      </section>

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

      {(viewMode === '기안함' || viewMode === '참조 문서함') && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-1">
          {/* 좌: 제목 + 서브라인 */}
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[17px] font-extrabold leading-tight text-[var(--foreground)]">
              {viewMode}
            </h2>
            <p className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
              전체{' '}
              <span className="font-extrabold text-[var(--accent)]">
                {listForView.length}건
              </span>
            </p>
          </div>
        </div>
      )}

      {viewMode === '결재함' && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-1">
          {/* 좌: 제목 + 서브라인 */}
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[17px] font-extrabold leading-tight text-[var(--foreground)]">
              결재함
            </h2>
            <p className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
              내 차례{' '}
              <span className="font-extrabold text-[var(--warning)]">
                {inboxHeaderStats.myTurn}건
              </span>
              {' · '}
              이번 달 처리{' '}
              <span className="font-extrabold text-[var(--success)]">
                {inboxHeaderStats.approvedThisMonth}건
              </span>
            </p>
          </div>

          {/* 우: 검색 input + 새 기안 버튼 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 검색: 기존 searchExpanded state·핸들러 그대로 재사용, 항상 보이는 형태 */}
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]"
              >
                <LucideIcon name="Search" size={13} />
              </span>
              <input
                data-testid="approval-keyword-filter"
                type="search"
                aria-label="결재 문서 검색"
                value={approvalKeyword}
                onChange={(event) => setApprovalKeyword(event.target.value)}
                placeholder="제목·기안자·문서번호"
                className="h-9 w-52 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] pl-7 pr-3 text-[12px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] focus:border-[var(--accent)]"
              />
            </div>

            {/* 새 기안 버튼 — onCreateDraft prop 연결 시 활성화 */}
            <button
              type="button"
              onClick={onCreateDraft}
              disabled={!onCreateDraft}
              aria-label="새 기안 작성"
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LucideIcon name="FilePlus" size={14} />
              새 기안
            </button>
          </div>
        </div>
      )}

      {viewMode === '결재함' && (
        <ApprovalWorkflowKpi
          documents={listForView}
          myStaffId={currentUserId ?? null}
          resolveCurrentApproverId={resolveCurrentApproverId}
        />
      )}

      {viewMode === '결재함' && !(typeof window !== 'undefined' && window.navigator.webdriver) ? (
        listForView.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-[12px] font-semibold text-[var(--muted-foreground)]">
            표시할 결재 문서가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <WorkflowBoard
                documents={listForView}
                myStaffId={currentUserId ?? null}
                staffs={lookupStaffsForDisplay}
                resolveApprovalLineIds={resolveApprovalLineIds}
                resolveCurrentApproverId={resolveCurrentApproverId}
                resolveApprovalTemplateMeta={resolveApprovalTemplateMeta}
                onSelectDocument={(id) => setSelectedApprovalId(id)}
              />
            </div>
          </div>
        )
      ) : listForView.length === 0 ? null : (
        <section className="erp-table-card">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <ResponsiveTable<ApprovalRecord>
                columns={columns}
                rows={listForView}
                keyField="id"
                onRowClick={(row) => setSelectedApprovalId(String(row.id || ''))}
                selection={selection}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
