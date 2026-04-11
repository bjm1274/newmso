'use client';
import { useState, useMemo, useEffect } from 'react';
import type { InventoryItem } from '@/types';
import { formatWon } from '@/lib/date-formatter';
import { isExpirySoon } from '@/app/main/inventory-utils';
import ExpirationAlert from './유효기간알림';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type StatusFilter = '전체' | '재고부족' | '유통기한임박' | '정상';
type WorkflowItem = Record<string, unknown>;
type ApprovalRecord = {
  id?: string | null;
  title?: string;
  doc_number?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  live_inventory_workflow?: { items?: WorkflowItem[]; summary?: Record<string, unknown> };
  created_at?: string | null;
  meta_data?: Record<string, unknown>;
  [k: string]: unknown;
};

export type InventoryStatusViewProps = {
  // data
  filteredInventory: InventoryItem[];
  lowStockCount: number;
  expiryCount: number;
  outOfStockCount: number;
  urgentItems: InventoryItem[];
  totalQuantity: number;
  totalValue: number;
  // filters
  viewCompany: string; setViewCompany: (v: string) => void;
  selectedDept: string; setSelectedDept: (v: string) => void;
  searchKeyword: string; setSearchKeyword: (v: string) => void;
  statusFilter: StatusFilter; setStatusFilter: (v: StatusFilter) => void;
  companiesInInventory: string[];
  departmentsByViewCompany: string[];
  // actions
  loading: boolean;
  onRefresh: () => void;
  onStockIn: (item: InventoryItem) => void;
  onStockOut: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  // supply workflow (ops only)
  isOpsUser: boolean;
  pendingApprovals: ApprovalRecord[];
  completedApprovals: ApprovalRecord[];
  workflowActionKey: string | null;
  highlightedApprovalId: string | null;
  onSupplyIssue: (approval: ApprovalRecord, item: WorkflowItem) => void;
  onSupplyIssueCancel: (approval: ApprovalRecord, item: WorkflowItem) => void;
  onSupplyOrder: (approval: ApprovalRecord, item: WorkflowItem) => void;
  onSupplyOrderCancel: (approval: ApprovalRecord, item: WorkflowItem) => void;
  onOpenLinkedOrder: (approvalId: string, requestIndex: number) => void;
  // expiry center
  showExpiryCenter: boolean;
  setShowExpiryCenter: (v: boolean) => void;
  expiryThreshold: number;
  // navigation
  openView: (v: string) => void;
  // batch
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  batchSelectedIds: string[];
  toggleBatchItem: (id: string) => void;
  toggleBatchAll: (allIds: string[]) => void;
  onBatchStockIn: () => void;
  onBatchStockOut: () => void;
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function qty(item: InventoryItem): number {
  const ex = item as Record<string, unknown>;
  return Number(item.quantity ?? ex.stock ?? 0);
}
function minQty(item: InventoryItem): number {
  const ex = item as Record<string, unknown>;
  return Number(ex.min_quantity ?? ex.min_stock ?? ex.minimum_quantity ?? item.min_quantity ?? 0);
}
function name(item: InventoryItem): string {
  return String((item as Record<string, unknown>).item_name || item.name || '');
}
function dept(item: InventoryItem): string {
  return String((item as Record<string, unknown>).department || '');
}
const fmt = (v: number) => formatWon(v);

// ─────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-[var(--radius-md)] border ${color}`}>
      <span className="text-sm font-black tabular-nums">{value}</span>
      <span className="text-[9px] font-semibold opacity-60">{label}</span>
    </div>
  );
}

function StockBar({ current, min }: { current: number; min: number }) {
  if (min === 0) return null;
  const pct = Math.min(100, Math.round((current / Math.max(min * 2, 1)) * 100));
  const color = current <= min ? 'bg-red-500' : current <= min * 1.5 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--border)]">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────
export default function InventoryStatusView({
  filteredInventory, lowStockCount, expiryCount, outOfStockCount, urgentItems,
  totalQuantity, totalValue,
  viewCompany, setViewCompany, selectedDept, setSelectedDept,
  searchKeyword, setSearchKeyword, statusFilter, setStatusFilter,
  companiesInInventory, departmentsByViewCompany,
  loading, onRefresh,
  onStockIn, onStockOut, onReorder, onDelete,
  isOpsUser, pendingApprovals, completedApprovals,
  workflowActionKey, highlightedApprovalId,
  onSupplyIssue, onSupplyIssueCancel, onSupplyOrder, onSupplyOrderCancel, onOpenLinkedOrder,
  showExpiryCenter, setShowExpiryCenter, expiryThreshold,
  openView,
  batchMode, setBatchMode, batchSelectedIds, toggleBatchItem, toggleBatchAll,
  onBatchStockIn, onBatchStockOut,
}: InventoryStatusViewProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedApprovalId, setExpandedApprovalId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'expiry' | 'value'>('stock');
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // 카테고리 목록 동적 추출
  const categories = useMemo(() => {
    const set = new Set<string>();
    filteredInventory.forEach((i) => { const c = (i.category || '').trim(); if (c) set.add(c); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [filteredInventory]);

  // 카테고리 필터 적용 후 정렬
  const sorted = useMemo(() => {
    let list = categoryFilter === '전체' ? [...filteredInventory] : filteredInventory.filter((i) => (i.category || '').trim() === categoryFilter);
    if (sortBy === 'name') list.sort((a, b) => name(a).localeCompare(name(b), 'ko'));
    else if (sortBy === 'stock') list.sort((a, b) => {
      const aUrgent = qty(a) <= minQty(a);
      const bUrgent = qty(b) <= minQty(b);
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
      return qty(a) - qty(b);
    });
    else if (sortBy === 'expiry') list.sort((a, b) => {
      const ae = (a as Record<string, unknown>).expiry_date as string;
      const be = (b as Record<string, unknown>).expiry_date as string;
      if (!ae && !be) return 0;
      if (!ae) return 1;
      if (!be) return -1;
      return new Date(ae).getTime() - new Date(be).getTime();
    });
    else if (sortBy === 'value') list.sort((a, b) => {
      const av = Number((a as Record<string, unknown>).unit_price || 0) * qty(a);
      const bv = Number((b as Record<string, unknown>).unit_price || 0) * qty(b);
      return bv - av;
    });
    return list;
  }, [filteredInventory, sortBy]);

  // 페이지네이션 - 필터/정렬 변경 시 1페이지로 리셋
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  // 필터·정렬 변경 시 1페이지로 리셋
  useEffect(() => { setCurrentPage(1); }, [statusFilter, viewCompany, selectedDept, searchKeyword, sortBy, categoryFilter]);

  const hasAlert = urgentItems.length > 0 && !alertDismissed;
  const hasPending = isOpsUser && pendingApprovals.length > 0;
  const STATUS_FILTERS: StatusFilter[] = ['전체', '재고부족', '유통기한임박', '정상'];

  return (
    <div className="space-y-3">

      {/* ── 1. 컨트롤 바 ──────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] px-4 py-3 space-y-3">
        {/* 검색 */}
        <div className="relative w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--toss-gray-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="품목명, LOT, 시리얼, 분류 검색..."
            className="w-full pl-9 pr-8 py-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
          />
          {searchKeyword && (
            <button onClick={() => setSearchKeyword('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-sm leading-none">×</button>
          )}
        </div>

        {/* 필터 셀렉트 */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={viewCompany}
            onChange={(e) => { setViewCompany(e.target.value); setSelectedDept('전체'); }}
            className="flex-1 min-w-0 px-3 py-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          >
            <option value="전체">전체 회사</option>
            {companiesInInventory.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {viewCompany !== '전체' && departmentsByViewCompany.length > 0 && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            >
              <option value="전체">전체 부서</option>
              {departmentsByViewCompany.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          >
            <option value="전체">전체 분류</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <button
            onClick={onRefresh}
            aria-label="새로고침"
            className="p-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-all"
            title="새로고침"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        {/* 상태 필터 + 요약 stats */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => {
              const count = f === '재고부족' ? lowStockCount : f === '유통기한임박' ? expiryCount : f === '정상' ? (filteredInventory.length - lowStockCount - expiryCount) : filteredInventory.length;
              const activeColor = f === '재고부족' ? 'bg-red-500 text-white shadow-sm shadow-red-200'
                : f === '유통기한임박' ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                : f === '정상' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                : 'bg-[var(--accent)] text-white shadow-sm';
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-all ${
                    statusFilter === f ? activeColor : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
                  }`}
                >
                  {f === '유통기한임박' ? '기한임박' : f}
                  {(f !== '전체' || count > 0) && (
                    <span className={`text-[10px] font-black ${statusFilter === f ? 'opacity-80' : f === '재고부족' ? 'text-red-500' : f === '유통기한임박' ? 'text-amber-500' : ''}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <StatPill label="품목" value={filteredInventory.length} color="border-[var(--border)] text-[var(--foreground)]" />
            <StatPill label="총수량" value={totalQuantity.toLocaleString('ko-KR')} color="border-[var(--border)] text-[var(--foreground)]" />
            <StatPill label="평가금액" value={fmt(totalValue)} color="border-[var(--border)] text-[var(--foreground)]" />
            {outOfStockCount > 0 && <StatPill label="품절" value={outOfStockCount} color="border-red-200 text-red-600 bg-red-500/5" />}
          </div>
        </div>
      </div>

      {/* ── 2. 긴급 알림 배너 ─────────────────────────── */}
      {hasAlert && (
        <div className="bg-red-500/8 border border-red-200 rounded-[var(--radius-xl)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-700">긴급 처리 필요</span>
                <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full">{urgentItems.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {urgentItems.slice(0, 4).map((item) => {
                  const isLow = qty(item) <= minQty(item);
                  return (
                    <span key={item.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      isLow ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isLow ? 'bg-red-500' : 'bg-amber-500'}`} />
                      {name(item)}
                      <span className="opacity-60">{isLow ? `${qty(item)}개` : '기한임박'}</span>
                    </span>
                  );
                })}
                {urgentItems.length > 4 && (
                  <span className="text-[11px] text-red-500 font-semibold">+{urgentItems.length - 4}건</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setStatusFilter('재고부족'); openView('발주'); }}
                className="px-3 py-1.5 bg-red-500 text-white text-[11px] font-bold rounded-[var(--radius-md)] hover:bg-red-600 transition-all"
              >발주 처리</button>
              <button onClick={() => setAlertDismissed(true)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. 공급신청 워크플로우 (ops only) ─────────── */}
      {hasPending && (
        <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-[var(--radius-xl)] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--muted)]/30 transition-all"
            onClick={() => setExpandedApprovalId(expandedApprovalId === 'pending' ? null : 'pending')}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-sm font-bold text-[var(--foreground)]">승인된 물품신청 처리</span>
              <span className="px-2 py-0.5 bg-[var(--accent)] text-white text-[10px] font-black rounded-full">{pendingApprovals.length}</span>
            </div>
            <svg className={`w-4 h-4 text-[var(--toss-gray-3)] transition-transform ${expandedApprovalId === 'pending' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {expandedApprovalId === 'pending' && (
            <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
              {pendingApprovals.map((approval) => {
                const items = approval.live_inventory_workflow?.items || [];
                const summary = approval.live_inventory_workflow?.summary || {};
                return (
                  <div
                    key={approval.id}
                    className={`rounded-[var(--radius-lg)] border p-4 transition-all ${
                      highlightedApprovalId === String(approval.id)
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                        : 'border-[var(--border)] bg-[var(--muted)]/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-xs font-bold text-[var(--foreground)]">{approval.title}</p>
                        <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                          {approval.sender_name} · {approval.sender_company} · {approval.doc_number || String(approval.meta_data?.doc_number ?? '') || '-'}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded">불출 {Number(summary.issue_ready_count || 0)}</span>
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[10px] font-bold rounded">발주 {Number(summary.order_required_count || 0)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(items as WorkflowItem[]).map((wItem) => {
                        const key = `${approval.id}:${wItem.request_index}`;
                        const busy = workflowActionKey === `${key}:issue` || workflowActionKey === `${key}:order` || workflowActionKey === `${key}:order-cancel`;
                        const issued = wItem.status === 'issued';
                        const ordered = wItem.status === 'ordered';
                        return (
                          <div key={key} className="flex items-center gap-3 bg-[var(--card)] rounded-[var(--radius-md)] px-3 py-2.5 border border-[var(--border)]">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[var(--foreground)] truncate">{String(wItem.name ?? '')}</p>
                              <p className="text-[10px] text-[var(--toss-gray-3)]">{String(wItem.purpose ?? '') || '-'} / {String(wItem.dept ?? '') || '-'}</p>
                            </div>
                            <div className="text-center shrink-0">
                              <p className="text-[10px] text-[var(--toss-gray-3)]">요청</p>
                              <p className="text-xs font-bold text-[var(--foreground)]">{String(wItem.qty ?? '')}</p>
                            </div>
                            <div className="text-center shrink-0">
                              <p className="text-[10px] text-[var(--toss-gray-3)]">재고</p>
                              <p className={`text-xs font-bold ${Number(wItem.shortage_qty) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {String(wItem.available_qty ?? '')}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {!issued && !ordered && wItem.recommended_action === 'issue' && (
                                <button disabled={busy} onClick={() => onSupplyIssue(approval, wItem)}
                                  className="px-3 py-1.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-[var(--radius-md)] disabled:opacity-50">
                                  {busy ? '...' : '최종불출'}
                                </button>
                              )}
                              {!issued && !ordered && wItem.recommended_action === 'order' && (
                                <button disabled={busy} onClick={() => onSupplyOrder(approval, wItem)}
                                  className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-bold rounded-[var(--radius-md)] disabled:opacity-50">
                                  {busy ? '...' : '발주'}
                                </button>
                              )}
                              {issued && (
                                <>
                                  <span className="px-2 py-1.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded-[var(--radius-md)]">최종불출 완료</span>
                                  <button disabled={busy} onClick={() => onSupplyIssueCancel(approval, wItem)} className="px-2 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded-[var(--radius-md)] border border-[var(--border)] disabled:opacity-50">취소</button>
                                </>
                              )}
                              {ordered && (
                                <>
                                  <span className="px-2 py-1.5 bg-amber-500/10 text-amber-600 text-[10px] font-bold rounded-[var(--radius-md)]">발주처리</span>
                                  {!wItem.order_approval_requested
                                    ? <button disabled={busy} onClick={() => onSupplyOrderCancel(approval, wItem)} className="px-2 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded-[var(--radius-md)] border border-[var(--border)] disabled:opacity-50">취소</button>
                                    : <button onClick={() => onOpenLinkedOrder(String(approval.id ?? ''), wItem.request_index as number)} className="px-2 py-1.5 bg-[var(--foreground)] text-white text-[10px] font-bold rounded-[var(--radius-md)]">발주 보기</button>
                                  }
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 처리완료 히스토리 (접이식) */}
      {isOpsUser && completedApprovals.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--muted)]/30 transition-all"
            onClick={() => setShowCompleted((p) => !p)}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-4)]">처리 완료 히스토리</span>
              <span className="text-[10px] text-[var(--toss-gray-3)]">{completedApprovals.length}건</span>
            </div>
            <svg className={`w-3.5 h-3.5 text-[var(--toss-gray-3)] transition-transform ${showCompleted ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showCompleted && (
            <div className="border-t border-[var(--border)] px-5 py-4 space-y-2">
              {completedApprovals.slice(0, 8).map((approval) => {
                const items = approval.live_inventory_workflow?.items || [];
                return (
                  <div key={`h-${approval.id}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[var(--foreground)]">{approval.title}</p>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">{approval.sender_name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(items as WorkflowItem[]).map((wItem, idx) => (
                        <span key={idx} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                          wItem.status === 'issued' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                        }`}>
                          {String(wItem.name ?? '')} · {String(wItem.qty ?? '')}개
                          · {wItem.status === 'issued' ? '불출' : '발주'}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 4. 재고 테이블 ────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
        {/* 테이블 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--foreground)]">
              품목 목록 <span className="text-[var(--toss-gray-3)] font-normal">{filteredInventory.length}건</span>
            </span>
            <button
              type="button"
              onClick={() => { setBatchMode(!batchMode); if (batchMode) { toggleBatchAll([]); } }}
              className={`px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold transition-all ${batchMode ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
            >
              {batchMode ? '일괄 해제' : '일괄 입출고'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--toss-gray-3)] mr-1">정렬</span>
            {([['name', '이름'], ['stock', '재고순'], ['expiry', '기한순'], ['value', '금액순']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold transition-all ${
                  sortBy === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
                }`}
              >{l}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-1 h-10 rounded-full bg-[var(--border)] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-[var(--border)] rounded animate-pulse" />
                  <div className="h-2 w-1/5 bg-[var(--border)] rounded animate-pulse" />
                </div>
                <div className="h-4 w-10 bg-[var(--border)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-[var(--toss-gray-3)]">조건에 맞는 품목이 없습니다</p>
            <button onClick={() => { setSearchKeyword(''); setStatusFilter('전체'); setViewCompany('전체'); setSelectedDept('전체'); setCategoryFilter('전체'); }}
              className="mt-3 px-4 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/5 rounded-[var(--radius-md)] transition-all">
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">
                  {batchMode && (
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={batchSelectedIds.length === pagedItems.length && pagedItems.length > 0} onChange={() => toggleBatchAll(pagedItems.map((i) => i.id))} className="w-4 h-4 accent-[var(--accent)]" />
                    </th>
                  )}
                  <th className="w-1" />
                  <th className="px-4 py-2.5">품목</th>
                  <th className="px-4 py-2.5">회사 / 부서</th>
                  <th className="px-4 py-2.5 text-center">재고</th>
                  <th className="px-4 py-2.5 text-center">유효기간</th>
                  <th className="px-4 py-2.5 text-right">단가 / 총액</th>
                  <th className="px-4 py-2.5 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pagedItems.map((item) => {
                  const q = qty(item);
                  const mq = minQty(item);
                  const isLow = q <= mq;
                  const isExpiry = isExpirySoon(item, expiryThreshold);
                  const isOos = q === 0;
                  const itemEx = item as Record<string, unknown>;
                  const lot = itemEx.lot_number ? String(itemEx.lot_number) : null;
                  const sn = itemEx.serial_number ? String(itemEx.serial_number) : null;
                  const isUdi = Boolean(itemEx.is_udi);
                  const price = Number(itemEx.unit_price || 0);
                  const expiryDate = itemEx.expiry_date ? String(itemEx.expiry_date) : null;

                  const statusColor = isOos ? 'bg-red-500' : isLow ? 'bg-red-400' : isExpiry ? 'bg-amber-400' : 'bg-emerald-400';

                  return (
                    <tr key={item.id} className={`group hover:bg-[var(--muted)]/30 transition-colors ${batchMode && batchSelectedIds.includes(item.id) ? 'bg-[var(--accent)]/5' : ''}`}>
                      {/* 배치 체크박스 */}
                      {batchMode && (
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={batchSelectedIds.includes(item.id)} onChange={() => toggleBatchItem(item.id)} className="w-4 h-4 accent-[var(--accent)]" />
                        </td>
                      )}
                      {/* 상태 표시선 */}
                      <td className="pl-3 pr-0 py-3">
                        <div className={`w-1 h-10 rounded-full ${statusColor}`} />
                      </td>

                      {/* 품목명 */}
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">{name(item)}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span className="text-[9px] text-[var(--toss-gray-3)]">{item.category || '미분류'}</span>
                          {lot && <span className="text-[9px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-4)] px-1.5 py-0.5 rounded">LOT: {lot}</span>}
                          {sn && <span className="text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded">S/N: {sn}</span>}
                          {isUdi && <span className="text-[9px] font-bold bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded uppercase">UDI</span>}
                        </div>
                      </td>

                      {/* 회사/부서 */}
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-semibold text-[var(--accent)]">{item.company || '-'}</p>
                        <p className="text-[10px] text-[var(--toss-gray-3)]">{dept(item) || '부서 미지정'}</p>
                      </td>

                      {/* 재고 */}
                      <td className="px-4 py-3 text-center">
                        <p className={`text-sm font-black leading-none ${isOos ? 'text-red-500' : isLow ? 'text-red-500' : 'text-[var(--foreground)]'}`}>{q}</p>
                        <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">안전 {mq}</p>
                        <StockBar current={q} min={mq} />
                      </td>

                      {/* 유효기간 */}
                      <td className="px-4 py-3 text-center">
                        {expiryDate ? (
                          isExpiry ? (
                            <span className="inline-block text-[11px] font-bold text-amber-700 bg-amber-500/10 px-2 py-1 rounded-[var(--radius-md)]">
                              {expiryDate}
                            </span>
                          ) : (
                            <p className="text-[11px] font-semibold text-[var(--toss-gray-4)]">{expiryDate}</p>
                          )
                        ) : (
                          <span className="text-[10px] text-[var(--toss-gray-3)]">-</span>
                        )}
                      </td>

                      {/* 단가/총액 */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-4)]">{price > 0 ? fmt(price) : '-'}</p>
                        {price > 0 && <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{fmt(price * q)}</p>}
                      </td>

                      {/* 액션 버튼: 모바일=항상 표시, 데스크탑=hover 표시 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onStockIn(item)} className="px-2.5 py-1.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold rounded-[var(--radius-md)] hover:bg-[var(--accent)]/20 transition-all">입고</button>
                          <button onClick={() => onStockOut(item)} className="px-2.5 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded-[var(--radius-md)] hover:bg-[var(--border)] transition-all">출고</button>
                          {isLow && (
                            <button onClick={() => onReorder(item)} className="px-2.5 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-[var(--radius-md)] hover:bg-amber-600 transition-all">발주</button>
                          )}
                          <button onClick={() => onDelete(item)} className="px-2.5 py-1.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all">삭제</button>
                        </div>
                        {/* 상태 뱃지: 데스크탑에서만 hover시 숨김 */}
                        <div className="flex justify-end mt-1 md:mt-0 md:group-hover:hidden">
                          {isOos ? (
                            <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">품절</span>
                          ) : isLow ? (
                            <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">부족</span>
                          ) : isExpiry ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">임박</span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">정상</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 일괄 입출고 액션바 */}
        {batchMode && batchSelectedIds.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--accent)]/5">
            <span className="text-xs font-bold text-[var(--accent)]">{batchSelectedIds.length}건 선택됨</span>
            <div className="flex gap-2">
              <button onClick={onBatchStockIn} className="px-4 py-2 bg-[var(--accent)] text-white text-[11px] font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-all">선택 일괄 입고</button>
              <button onClick={onBatchStockOut} className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-bold rounded-[var(--radius-md)] hover:bg-[var(--border)] transition-all">선택 일괄 출고</button>
            </div>
          </div>
        )}

        {/* 페이지네이션 */}
        {sorted.length > PAGE_SIZE && (() => {
          // 페이지 번호 범위 계산 (최대 5개)
          const maxVisible = 5;
          let startPage = Math.max(1, safePage - Math.floor(maxVisible / 2));
          const endPage = Math.min(totalPages, startPage + maxVisible - 1);
          if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
          const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

          return (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
            <span className="text-[11px] text-[var(--toss-gray-3)]">
              {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, sorted.length)} / {sorted.length}건
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1.5 text-[10px] font-bold rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                이전
              </button>
              {pages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`hidden sm:inline-flex w-7 h-7 items-center justify-center text-[10px] font-bold rounded-[var(--radius-md)] transition-all ${
                    p === safePage ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
                  }`}
                >
                  {p}
                </button>
              ))}
              <span className="sm:hidden text-[11px] font-semibold text-[var(--foreground)] px-2">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1.5 text-[10px] font-bold rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                다음
              </button>
            </div>
          </div>
          );
        })()}
      </div>

      {/* ── 5. 유효기간 센터 (접이식) ─────────────────── */}
      {expiryCount > 0 && (
        <div className="bg-[var(--card)] border border-amber-200 rounded-[var(--radius-xl)] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-500/5 transition-all"
            onClick={() => setShowExpiryCenter(!showExpiryCenter)}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700">유효기간 관리 센터</span>
              <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-black rounded-full">{expiryCount}</span>
            </div>
            <svg className={`w-4 h-4 text-amber-500 transition-transform ${showExpiryCenter ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showExpiryCenter && (
            <div className="border-t border-amber-100 p-5">
              <ExpirationAlert />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
