// 재고관리 워크센터 — 1. 재고 현황 (status)
//
// 레이아웃 원칙:
//  1) KPI + 필터 + 표가 항상 1순위 (스크롤 없이 바로 보임)
//  2) 승인 물품신청은 접이식 요약 배너 (기본 접힘) — 148건이 화면을 덮지 않음
//  3) 로딩 스켈레톤으로 "빈 화면 → 갑자기 패널" 깜빡임 완화

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FilterChips,
  KpiRow,
  type FilterChip,
  type KpiItem } from './stock-workcenter-common';
import {
  STATUS_SCOPE_LABEL,
  type StatusScope,
  type StockStatusRow } from './stock-types';
import { useStatusData, useEmptyMessage } from './stock-workcenter-data';
import { DeptUsageTop5, StockStatusTable, UrgentAlertList } from './StatusSubViews';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { useNavigation } from '@/app/main/contexts/NavigationContext';
import { useSupplyWorkflow } from '@/app/main/hooks/useSupplyWorkflow';
import { INVENTORY_SUPPORT_COMPANY, INVENTORY_SUPPORT_DEPARTMENT } from '@/app/main/inventory-utils';

type SortKey = '위치별' | '카테고리별' | '재고 적은 순' | '만료 임박 순';

const SCOPE_TONE: Record<StatusScope, FilterChip<StatusScope>['tone']> = {
  all: 'accent',
  my: 'muted',
  low: 'warn',
  zero: 'danger',
  expire: 'warn',
};

type WI = Record<string, unknown>;
type AR = {
  id?: string | null;
  title?: string;
  sender_name?: string | null;
  sender_company?: string | null;
  live_inventory_workflow?: { items?: WI[]; summary?: Record<string, unknown> };
  meta_data?: Record<string, unknown>;
  [k: string]: unknown;
};

export default function StatusWorkcenter() {
  const [scope, setScope] = useState<StatusScope>('all');
  const [sortBy, setSortBy] = useState<SortKey>('재고 적은 순');
  const [query, setQuery] = useState('');
  // 공급신청 패널: 기본 접힘 (하이라이트 시에만 자동 펼침)
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { user } = useAppData();
  const userCompany = typeof user?.company === 'string' ? user.company : undefined;
  const data = useStatusData(userCompany);
  const isInventoryOpsUser = useMemo(
    () =>
      (String(user?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
        String(user?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT) ||
      user?.permissions?.mso === true,
    [user],
  );

  const { refresh: refreshStatus } = data;
  const refreshFn = useCallback(async () => {
    refreshStatus();
  }, [refreshStatus]);
  const workflow = useSupplyWorkflow({
    user: user ?? undefined,
    isInventoryOpsUser,
    activeView: 'status',
    refreshCurrentInventory: refreshFn,
    fetchLogs: refreshFn,
  });

  const highlightRef = useRef<string | null>(null);
  const {
    setHighlightedSupplyApprovalId,
    fetchPendingSupplyApprovals,
    pendingSupplyApprovals,
  } = workflow;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const approvalId = params.get('open_inventory_approval');
    if (!approvalId) return;
    const found = pendingSupplyApprovals.some(
      (a: { id?: string | null }) => String(a.id ?? '') === approvalId,
    );
    if (!found) return;
    if (approvalId === highlightRef.current) return;
    highlightRef.current = approvalId;
    setSupplyOpen(true);
    setHighlightedSupplyApprovalId(approvalId);
    const t = window.setTimeout(() => {
      setHighlightedSupplyApprovalId((c: string | null) =>
        c === approvalId ? null : c,
      );
    }, 8000);
    return () => clearTimeout(t);
  }, [setHighlightedSupplyApprovalId, pendingSupplyApprovals]);

  useEffect(() => {
    void fetchPendingSupplyApprovals();
  }, [fetchPendingSupplyApprovals]);

  const inStockCount = useMemo(
    () => data.rows.filter((r) => r.stock > 0).length,
    [data.rows],
  );

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '전체 품목',
        value: data.loading ? '…' : data.total.toLocaleString(),
        unit: '종',
        sub: data.loading
          ? '불러오는 중'
          : `보유 ${inStockCount.toLocaleString()} · 합계 ${(data.totalQty ?? 0).toLocaleString()} EA`,
      },
      {
        label: '재고 있음',
        value: data.loading ? '…' : inStockCount.toLocaleString(),
        unit: '종',
        sub: '수량 > 0',
        tone: 'success',
      },
      {
        label: '재고 0',
        value: data.loading ? '…' : data.zeroCount.toLocaleString(),
        unit: '건',
        sub: '긴급 보충',
        tone: 'danger',
      },
      {
        label: '부족 · 만료',
        value: data.loading
          ? '…'
          : (data.lowCount + data.expireCount).toLocaleString(),
        unit: '건',
        sub: `부족 ${data.lowCount} · 만료 ${data.expireCount}`,
        tone: 'warn',
      },
    ],
    [
      data.total,
      data.totalQty,
      data.lowCount,
      data.zeroCount,
      data.expireCount,
      data.loading,
      inStockCount,
    ],
  );

  const myCount = useMemo(() => filterByScope(data.rows, 'my').length, [data.rows]);

  const scopeCount = useMemo<Record<StatusScope, number>>(
    () => ({
      all: data.total,
      my: myCount,
      low: data.lowCount,
      zero: data.zeroCount,
      expire: data.expireCount,
    }),
    [data, myCount],
  );

  const chips = useMemo<FilterChip<StatusScope>[]>(
    () =>
      (Object.keys(STATUS_SCOPE_LABEL) as StatusScope[]).map((k) => ({
        id: k,
        label: STATUS_SCOPE_LABEL[k],
        count: scopeCount[k],
        tone: SCOPE_TONE[k],
      })),
    [scopeCount],
  );

  const filtered = useMemo(() => {
    let rows = filterByScope(data.rows, scope);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.cat.toLowerCase().includes(q) ||
          r.loc.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data.rows, scope, query]);

  const sorted = useMemo(() => sortRows(filtered, sortBy), [filtered, sortBy]);
  const emptyMessage = useEmptyMessage(data.loading, data.error, sorted.length);

  const nav = useNavigation();
  const pendingApprovals = workflow.pendingSupplyApprovals as AR[];
  const completedApprovals = workflow.completedSupplyApprovals as AR[];
  const hasPending = isInventoryOpsUser && pendingApprovals.length > 0;
  const hasHistory = isInventoryOpsUser && completedApprovals.length > 0;

  // 공급 요약 카운트
  const supplySummary = useMemo(() => {
    let issue = 0;
    let order = 0;
    for (const a of pendingApprovals) {
      const s = a.live_inventory_workflow?.summary || {};
      issue += Number((s as Record<string, unknown>).issue_ready_count || 0);
      order += Number((s as Record<string, unknown>).order_required_count || 0);
    }
    return { issue, order, docs: pendingApprovals.length };
  }, [pendingApprovals]);

  return (
    <div className="flex flex-col gap-3" data-testid="inventory-status-workcenter">
      {workflow.dialog}

      {/* ── 1) KPI (항상 최상단) ── */}
      <KpiRow items={kpiItems} />

      {/* ── 2) 공급신청 요약 배너 (접힘 기본) ── */}
      {isInventoryOpsUser && (hasPending || hasHistory) && (
        <div className="flex flex-col gap-2">
          {hasPending && (
            <div
              data-testid="inventory-supply-approval-panel"
              className="app-card overflow-hidden border border-[var(--border)]"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--muted)]/40 transition-colors"
                onClick={() => setSupplyOpen((v) => !v)}
                aria-expanded={supplyOpen}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-[13px] font-bold text-[var(--foreground)]">
                  승인 물품신청 처리
                </span>
                <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black text-white">
                  {supplySummary.docs}
                </span>
                <span className="hidden sm:inline text-[11px] text-[var(--toss-gray-3)]">
                  불출 {supplySummary.issue} · 발주 {supplySummary.order}
                </span>
                <span className="ml-auto text-[11px] font-bold text-[var(--accent)]">
                  {supplyOpen ? '접기' : '펼치기'}
                </span>
              </button>
              {supplyOpen && (
                <div className="max-h-[min(42vh,420px)] overflow-y-auto border-t border-[var(--border)] px-3 py-3 space-y-2">
                  {pendingApprovals.map((approval) => (
                    <SupplyApprovalCard
                      key={String(approval.id ?? '')}
                      approval={approval}
                      workflow={workflow}
                      highlighted={
                        workflow.highlightedSupplyApprovalId ===
                        String(approval.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {hasHistory && (
            <div
              data-testid="inventory-supply-history-panel"
              className="app-card overflow-hidden"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]/40"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
              >
                처리 완료 히스토리
                <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                  {completedApprovals.length}건
                </span>
                <span className="ml-auto text-[10px] text-[var(--accent)]">
                  {historyOpen ? '접기' : '펼치기'}
                </span>
              </button>
              {historyOpen && (
                <div className="max-h-48 overflow-y-auto border-t border-[var(--border)] px-3 py-2 space-y-2">
                  {completedApprovals.slice(0, 12).map((approval) => (
                    <HistoryCard
                      key={`h-${String(approval.id ?? '')}`}
                      approval={approval}
                      workflow={workflow}
                      onOpenOrder={() => {
                        try {
                          window.localStorage.setItem('erp_inventory_view', 'io');
                        } catch {
                          /* */
                        }
                        nav.setSubView('io');
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 3) 메인 표 + 우측 패널 ── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
        <section className="app-card flex min-h-0 flex-col overflow-hidden">
          <header className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <FilterChips
              chips={chips}
              active={scope}
              onChange={setScope}
              ariaLabel="재고 범위 필터"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex min-w-[140px] flex-1 items-center sm:max-w-[220px]">
                <span className="sr-only">품목 검색</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="품목·위치·카테고리 검색"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px]">
                <span className="sr-only">정렬</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] font-bold text-[var(--foreground)]"
                >
                  <option>재고 적은 순</option>
                  <option>위치별</option>
                  <option>카테고리별</option>
                  <option>만료 임박 순</option>
                </select>
              </label>
              <span className="text-[10px] font-bold tabular-nums text-[var(--toss-gray-3)]">
                {data.loading ? '…' : `${sorted.length.toLocaleString()}건`}
              </span>
            </div>
          </header>

          <div className="max-h-[min(62vh,720px)] overflow-auto">
            {data.loading && sorted.length === 0 ? (
              <div className="space-y-2 p-4" aria-busy="true" aria-label="재고 로딩">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-9 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]"
                  />
                ))}
              </div>
            ) : (
              <StockStatusTable rows={sorted} emptyMessage={emptyMessage} />
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-3 xl:self-start">
          <UrgentAlertList rows={data.rows} />
          <DeptUsageTop5 items={data.deptUsageTop5} />
          <p className="px-1 text-[10px] leading-relaxed text-[var(--toss-gray-3)]">
            필터로 부족·재고 0·유효기간을 바로 좁히고, 검색으로 품명을 찾으세요.
            승인 물품신청은 위 배너에서 필요할 때만 펼칩니다.
          </p>
        </aside>
      </div>
    </div>
  );
}

// ── 공급신청 카드 (목록 밀도 높게) ──────────────────────────

function SupplyApprovalCard({
  approval,
  workflow,
  highlighted,
}: {
  approval: AR;
  workflow: ReturnType<typeof useSupplyWorkflow>;
  highlighted: boolean;
}) {
  const items = (approval.live_inventory_workflow?.items || []) as WI[];
  const summary = approval.live_inventory_workflow?.summary || {};

  return (
    <div
      data-testid={`inventory-supply-approval-${String(approval.id ?? '')}`}
      data-supply-approval-id={String(approval.id ?? '')}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={`rounded-[var(--radius-md)] border p-3 ${
        highlighted
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
          : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-[var(--foreground)]">
            {approval.title}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--toss-gray-3)]">
            {approval.sender_name} · {approval.sender_company}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
            불출 {Number((summary as Record<string, unknown>).issue_ready_count || 0)}
          </span>
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
            발주 {Number((summary as Record<string, unknown>).order_required_count || 0)}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((wItem) => {
          const requestIndex = Number(wItem.request_index ?? 0);
          const key = `${String(approval.id ?? '')}:${requestIndex}`;
          const busy =
            workflow.workflowActionKey === `${key}:issue` ||
            workflow.workflowActionKey === `${key}:order` ||
            workflow.workflowActionKey === `${key}:order-cancel`;
          const issued = wItem.status === 'issued';
          const ordered = wItem.status === 'ordered';
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--muted)]/30 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[var(--foreground)]">
                  {String(wItem.name ?? '')}
                </p>
                <p className="truncate text-[10px] text-[var(--toss-gray-3)]">
                  {String(wItem.qty ?? '')}개 · {String(wItem.dept ?? '-')}/{String(wItem.purpose ?? '-')}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!issued && !ordered && wItem.recommended_action === 'issue' && (
                  <button
                    type="button"
                    data-testid={`inventory-supply-issue-${String(approval.id ?? '')}-${requestIndex}`}
                    disabled={busy}
                    onClick={() =>
                      void workflow.handleSupplyIssue(
                        approval as Parameters<typeof workflow.handleSupplyIssue>[0],
                        wItem as Parameters<typeof workflow.handleSupplyIssue>[1],
                      )
                    }
                    className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    {busy ? '…' : '불출'}
                  </button>
                )}
                {!issued && !ordered && wItem.recommended_action === 'order' && (
                  <button
                    type="button"
                    data-testid={`inventory-supply-order-${String(approval.id ?? '')}-${requestIndex}`}
                    disabled={busy}
                    onClick={() =>
                      void workflow.handleSupplyOrder(
                        approval as Parameters<typeof workflow.handleSupplyOrder>[0],
                        wItem as Parameters<typeof workflow.handleSupplyOrder>[1],
                      )
                    }
                    className="rounded-[var(--radius-sm)] bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    {busy ? '…' : '발주'}
                  </button>
                )}
                {ordered && !Boolean(wItem.order_approval_requested) && (
                  <button
                    type="button"
                    data-testid={`inventory-supply-history-cancel-order-${String(approval.id ?? '')}-${requestIndex}`}
                    disabled={busy}
                    onClick={() =>
                      void workflow.handleSupplyOrderCancel(
                        approval as Parameters<typeof workflow.handleSupplyOrderCancel>[0],
                        wItem as Parameters<typeof workflow.handleSupplyOrderCancel>[1],
                      )
                    }
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] disabled:opacity-50"
                  >
                    취소
                  </button>
                )}
                {(issued || ordered) && (
                  <span className="px-1.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
                    {issued ? '완료' : '발주됨'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryCard({
  approval,
  workflow,
  onOpenOrder,
}: {
  approval: AR;
  workflow: ReturnType<typeof useSupplyWorkflow>;
  onOpenOrder: () => void;
}) {
  const items = (approval.live_inventory_workflow?.items || []) as WI[];
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20 p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold text-[var(--foreground)]">
        {approval.title}
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((wItem, idx) => {
          const requestIndex = Number(wItem.request_index ?? idx);
          const busy =
            workflow.workflowActionKey ===
            `${String(approval.id ?? '')}:${requestIndex}:order-cancel`;
          return (
            <div key={idx} className="flex flex-wrap items-center gap-1.5">
              <span
                data-testid={`inventory-supply-history-item-${String(approval.id ?? '')}-${requestIndex}`}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                  wItem.status === 'issued'
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-amber-500/10 text-amber-700'
                }`}
              >
                {String(wItem.name ?? '')} · {String(wItem.qty ?? '')}개 ·{' '}
                {wItem.status === 'issued' ? '불출' : '발주'}
              </span>
              {wItem.status === 'ordered' && Boolean(wItem.order_approval_requested) && (
                <button
                  type="button"
                  data-testid={`inventory-supply-history-open-order-${String(approval.id ?? '')}-${requestIndex}`}
                  onClick={onOpenOrder}
                  className="rounded bg-[var(--foreground)] px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  발주 보기
                </button>
              )}
              {wItem.status === 'ordered' && !Boolean(wItem.order_approval_requested) && (
                <button
                  type="button"
                  data-testid={`inventory-supply-history-cancel-order-${String(approval.id ?? '')}-${requestIndex}`}
                  disabled={busy}
                  onClick={() =>
                    void workflow.handleSupplyOrderCancel(
                      approval as Parameters<typeof workflow.handleSupplyOrderCancel>[0],
                      wItem as Parameters<typeof workflow.handleSupplyOrderCancel>[1],
                    )
                  }
                  className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] disabled:opacity-50"
                >
                  취소
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function filterByScope(rows: StockStatusRow[], scope: StatusScope): StockStatusRow[] {
  switch (scope) {
    case 'all':
      return rows;
    case 'my':
      return rows.filter((r) => r.loc !== '본사' && r.loc !== 'MSO 본사 창고');
    case 'low':
      return rows.filter((r) => r.status === '부족');
    case 'zero':
      return rows.filter((r) => r.status === '재고 0');
    case 'expire':
      return rows.filter((r) => r.status === '유효기간');
    default:
      return rows;
  }
}

function sortRows(rows: StockStatusRow[], sortBy: SortKey): StockStatusRow[] {
  const next = [...rows];
  switch (sortBy) {
    case '재고 적은 순':
      next.sort((a, b) => a.stock - b.stock);
      break;
    case '카테고리별':
      next.sort((a, b) => a.cat.localeCompare(b.cat));
      break;
    case '만료 임박 순':
      next.sort((a, b) => a.expire.localeCompare(b.expire));
      break;
    case '위치별':
    default:
      next.sort((a, b) => a.loc.localeCompare(b.loc));
  }
  return next;
}
