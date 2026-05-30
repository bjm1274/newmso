'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import type { InventoryItem } from '@/types';
import { formatWon } from '@/lib/date-formatter';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import ExpirationAlert from './유효기간알림';
import { InventorySummaryStrip, InventoryStepSummary } from './InventoryDesignPanels';
import { MenuIcon } from '../조직도서브/조직도측면창';
import InventoryStatusGrid from './재고현황뷰Grid';

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

function InventoryMetricCard({
  label,
  value,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  icon: string;
  tone?: 'blue' | 'red' | 'green';
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-red-50 text-red-500'
      : tone === 'green'
        ? 'bg-emerald-50 text-emerald-500'
        : 'bg-blue-50 text-[var(--accent)]';

  return (
    <div className="erp-stat-card flex items-start justify-between gap-4">
      <div className="space-y-4">
        <p className="text-[12px] font-semibold text-[var(--zinc-500)]">{label}</p>
        <p className="text-[26px] font-black leading-none tracking-normal text-[var(--foreground)]">{value}</p>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${toneClass}`}>
        <MenuIcon name={icon} className="h-4 w-4" />
      </span>
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
  onStockIn, onStockOut,
  onReorder, onDelete,
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

  // ── 품목 수정 모달 ──
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = useCallback((item: InventoryItem) => {
    const ex = item as Record<string, unknown>;
    setEditItem(item);
    setEditForm({
      item_name: String(ex.item_name || ex.name || ''),
      category: String(ex.category || ''),
      unit: String(ex.unit || 'EA'),
      quantity: String(ex.quantity ?? ex.stock ?? '0'),
      unit_price: String(ex.unit_price || '0'),
      min_quantity: String(ex.min_quantity ?? ex.min_stock ?? '0'),
      company: String(ex.company || ''),
      department: String(ex.department || ''),
      spec: String(ex.spec || ''),
      lot_number: String(ex.lot_number || ''),
      expiry_date: String(ex.expiry_date || ''),
      insurance_code: String(ex.insurance_code || ''),
      location: String(ex.location || ''),
    });
  }, []);

  const saveEditItem = useCallback(async () => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      // inventory 테이블에 unit 컬럼이 없어 무음 실패할 수 있으므로
      // withMissingColumnsFallback로 'unit'을 안전하게 드롭(재고이관.tsx와 동일 패턴).
      const { error } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const payload: Record<string, unknown> = {
            item_name: editForm.item_name.trim() || undefined,
            name: editForm.item_name.trim() || undefined,
            category: editForm.category.trim() || null,
            unit: editForm.unit.trim() || 'EA',
            quantity: Math.max(0, Number(editForm.quantity) || 0),
            stock: Math.max(0, Number(editForm.quantity) || 0),
            unit_price: Number(editForm.unit_price) || 0,
            min_quantity: Number(editForm.min_quantity) || 0,
            min_stock: Number(editForm.min_quantity) || 0,
            company: editForm.company.trim() || null,
            department: editForm.department.trim() || null,
            spec: editForm.spec.trim() || null,
            lot_number: editForm.lot_number.trim() || null,
            expiry_date: editForm.expiry_date.trim() || null,
            insurance_code: editForm.insurance_code.trim() || null,
            location: editForm.location.trim() || null,
          };
          if (omittedColumns.has('unit')) delete payload.unit;
          return supabase.from('inventory').update(payload).eq('id', editItem.id);
        },
        ['unit'],
      );

      if (error) {
        toast(`수정 실패: ${error.message}`, 'error');
      } else {
        toast('품목 정보가 수정되었습니다.', 'success');
        setEditItem(null);
        onRefresh();
      }
    } catch (err: any) {
      toast(`수정 실패: ${err.message}`, 'error');
    } finally {
      setEditSaving(false);
    }
  }, [editItem, editForm, onRefresh]);
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
    const list = categoryFilter === '전체' ? [...filteredInventory] : filteredInventory.filter((i) => (i.category || '').trim() === categoryFilter);
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
  }, [categoryFilter, filteredInventory, sortBy]);

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
  const selectedItems = useMemo(
    () => filteredInventory.filter((item) => batchSelectedIds.includes(item.id)),
    [batchSelectedIds, filteredInventory],
  );
  const selectedQuantity = selectedItems.reduce((sum, item) => sum + qty(item), 0);
  const selectedLowStockCount = selectedItems.filter((item) => qty(item) <= minQty(item)).length;

  return (
    <div className="space-y-3">
      <div className="erp-panel p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-5 text-[12px] font-bold text-white shadow-sm"
          >
            <MenuIcon name="inventory-status" className="h-4 w-4" />
            전체 현황
          </button>
          <button
            type="button"
            onClick={() => openView('내부서재고')}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-4 text-[12px] font-bold text-[var(--zinc-600)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--foreground)]"
          >
            <MenuIcon name="inventory" className="h-4 w-4" />
            부서별 재고
          </button>
        </div>
      </div>

      <InventorySummaryStrip
        items={[
          { label: '조회 결과', value: `${sorted.length.toLocaleString('ko-KR')}건`, detail: `${viewCompany} / ${selectedDept}`, tone: 'info' },
          { label: '선택 대상', value: `${batchSelectedIds.length.toLocaleString('ko-KR')}건`, detail: batchMode ? `선택 재고 합계 ${selectedQuantity.toLocaleString('ko-KR')}` : '일괄 입출고를 켜면 대상 요약이 표시됩니다.', tone: batchSelectedIds.length > 0 ? 'success' : 'default' },
          { label: '변경 주의', value: `${selectedLowStockCount.toLocaleString('ko-KR')}건`, detail: '선택 대상 중 최소재고 이하 품목', tone: selectedLowStockCount > 0 ? 'warning' : 'default' },
          { label: '긴급 처리', value: `${urgentItems.length.toLocaleString('ko-KR')}건`, detail: hasAlert ? '상단 알림 확인 필요' : '현재 숨김 또는 처리 완료', tone: urgentItems.length > 0 ? 'danger' : 'success' },
        ]}
      />

      <InventoryStepSummary
        steps={[
          { label: '필터로 대상 좁히기', detail: `${statusFilter} 기준으로 ${sorted.length.toLocaleString('ko-KR')}건을 보고 있습니다.`, state: 'done' },
          { label: '품목 선택', detail: batchMode ? `${batchSelectedIds.length.toLocaleString('ko-KR')}건 선택됨` : '일괄 입출고 버튼으로 선택 모드를 시작합니다.', state: batchMode ? 'active' : 'pending' },
          { label: '결과 반영', detail: '입고/출고 실행 후 재고와 이력이 함께 갱신됩니다.', state: batchSelectedIds.length > 0 ? 'active' : 'pending' },
        ]}
      />

      <div className="erp-stat-grid">
        <InventoryMetricCard label="총 품목" value={`${filteredInventory.length.toLocaleString('ko-KR')}개`} icon="inventory" />
        <InventoryMetricCard label="부족 품목" value={`${lowStockCount.toLocaleString('ko-KR')}개`} icon="alert" tone="red" />
        <InventoryMetricCard label="이번 달 입고" value="0건" icon="send" tone="green" />
        <InventoryMetricCard label="이번 달 출고" value="0건" icon="download" />
      </div>

      {/* ── 1. 컨트롤 바 ──────────────────────────────── */}
      <div className="hidden">
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
        <div className="hidden">
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
        <div className="hidden">
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
        <div className="hidden">
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
      <div className="erp-table-card">
        {/* 테이블 헤더 */}
        <div className="hidden">
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
          <div className="px-2 py-2">
            <InventoryStatusGrid
              items={pagedItems}
              expiryThreshold={expiryThreshold}
              batchMode={batchMode}
              batchSelectedIds={batchSelectedIds}
              toggleBatchItem={toggleBatchItem}
              toggleBatchAll={toggleBatchAll}
              onOpenDetail={openEditModal}
              onReorder={onReorder}
              onStockIn={onStockIn}
              onStockOut={onStockOut}
              onDelete={onDelete}
            />
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
        <div className="hidden">
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

      {/* ── 품목 수정 모달 ── */}
      {editItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setEditItem(null)}>
          <div
            className="mx-4 w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <h3 className="text-sm font-bold text-[var(--foreground)]">품목 정보 수정</h3>
              <button onClick={() => setEditItem(null)} className="text-lg text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <div className="custom-scrollbar max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['item_name', '물품명', 'text'],
                  ['category', '품목구분', 'text'],
                  ['quantity', '현재 수량', 'number'],
                  ['unit', '단위 (EA/BOX)', 'text'],
                  ['unit_price', '단가', 'number'],
                  ['min_quantity', '안전재고', 'number'],
                  ['company', '회사', 'text'],
                  ['department', '부서', 'text'],
                  ['spec', '규격', 'text'],
                  ['lot_number', 'LOT번호', 'text'],
                  ['expiry_date', '유효기간', 'date'],
                  ['insurance_code', '보험코드', 'text'],
                  ['location', '위치', 'text'],
                ] as [string, string, string][]).map(([key, label, type]) => (
                  <label key={key} className={`flex flex-col gap-1 ${key === 'item_name' ? 'col-span-2' : ''}`}>
                    <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</span>
                    <input
                      type={type}
                      value={editForm[key] || ''}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-2.5 text-xs font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button
                onClick={() => setEditItem(null)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                onClick={saveEditItem}
                disabled={editSaving}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                {editSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
