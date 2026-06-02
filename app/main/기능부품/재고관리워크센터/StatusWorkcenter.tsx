// 재고관리 워크센터 — 1. 재고 현황 (status) ★
//
// 4장 통합: 재고현황 · 내 부서 재고 · 재고 알림 · 유효기간 알림
// 구조: 4 KPI 행 + 메인(표 + 필터 칩) + 우측 노트(긴급 알림 + 부서별 사용량)
//
// 데이터 소스 (실데이터):
//  - inventory: 품목·재고 수량·최소·유효기간·위치
//  - inventory_logs: 부서별 사용량 TOP 5 (사용/소모/출고 로그)
// 표시: useStatusData 훅 (stock-workcenter-data.ts)

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FilterChips,
  KpiRow,
  WorkcenterNotes,
  type FilterChip,
  type KpiItem,
} from './stock-workcenter-common';
import {
  STATUS_SCOPE_LABEL,
  type StatusScope,
  type StockStatusRow,
} from './stock-types';
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

// ─────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────

export default function StatusWorkcenter() {
  const [scope, setScope] = useState<StatusScope>('all');
  const [sortBy, setSortBy] = useState<SortKey>('위치별');

  const data = useStatusData();

  // supply approval 패널 (MSO 재고 운영자 전용)
  const { user } = useAppData();
  const isInventoryOpsUser = useMemo(
    () =>
      (String(user?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
        String(user?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT) ||
      user?.permissions?.mso === true,
    [user],
  );
  const refreshFn = useCallback(async () => {}, []);
  const fetchLogsFn = useCallback(async () => {}, []);
  const workflow = useSupplyWorkflow({
    user: user ?? undefined,
    isInventoryOpsUser,
    activeView: 'status',
    refreshCurrentInventory: refreshFn,
    fetchLogs: fetchLogsFn,
  });

  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const highlightRef = useRef<string | null>(null);

  const { setHighlightedSupplyApprovalId, fetchPendingSupplyApprovals, pendingSupplyApprovals } = workflow;

  // URL param open_inventory_approval 처리 — pendingApprovals 로드 후 하이라이트 설정
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const approvalId = params.get('open_inventory_approval');
    if (!approvalId) return;
    const found = pendingSupplyApprovals.some((a: { id?: string | null }) => String(a.id ?? '') === approvalId);
    if (!found) return;
    if (approvalId === highlightRef.current) return;
    highlightRef.current = approvalId;
    setHighlightTarget(approvalId);
    setHighlightedSupplyApprovalId(approvalId);
    const t = window.setTimeout(() => {
      setHighlightedSupplyApprovalId((c: string | null) =>
        c === approvalId ? null : c,
      );
      setHighlightTarget(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [setHighlightedSupplyApprovalId, pendingSupplyApprovals]);

  useEffect(() => {
    void fetchPendingSupplyApprovals();
  }, [fetchPendingSupplyApprovals]);

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '전체 품목',
        value: data.total.toLocaleString(),
        unit: '종',
        sub: data.loading ? '불러오는 중…' : `등록된 inventory 기준`,
      },
      {
        label: '부족 품목',
        value: data.lowCount.toLocaleString(),
        unit: '건',
        sub: '최소재고 미만',
        tone: 'warn',
      },
      {
        label: '재고 0',
        value: data.zeroCount.toLocaleString(),
        unit: '건',
        sub: '긴급 보충 필요',
        tone: 'danger',
      },
      {
        label: '유효기간 임박',
        value: data.expireCount.toLocaleString(),
        unit: '건',
        sub: '90일 이내 만료',
        tone: 'warn',
      },
    ],
    [data.total, data.lowCount, data.zeroCount, data.expireCount, data.loading],
  );

  // 'my' 칩 카운트는 filterByScope('my')와 동일 휴리스틱으로 산출해야
  // 칩 숫자와 실제 필터 결과가 일치한다. (data.myCount는 userCompany
  // 인자가 전달되지 않아 항상 0이므로 사용하지 않음)
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

  const filtered = useMemo(() => filterByScope(data.rows, scope), [data.rows, scope]);
  const sorted = useMemo(() => sortRows(filtered, sortBy), [filtered, sortBy]);
  const emptyMessage = useEmptyMessage(data.loading, data.error, sorted.length);

  // supply approval types
  type WI = Record<string, unknown>;
  type AR = { id?: string | null; title?: string; sender_name?: string | null; sender_company?: string | null; live_inventory_workflow?: { items?: WI[]; summary?: Record<string, unknown> }; meta_data?: Record<string, unknown>; [k: string]: unknown };

  const nav = useNavigation();
  const pendingApprovals = workflow.pendingSupplyApprovals as AR[];
  const completedApprovals = workflow.completedSupplyApprovals as AR[];
  const hasPending = isInventoryOpsUser && pendingApprovals.length > 0;
  const hasHistory = isInventoryOpsUser && completedApprovals.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {workflow.dialog}

      {/* ── 공급신청 워크플로우 (ops only) ── */}
      {hasPending && (
        <div data-testid="inventory-supply-approval-panel" className="app-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-sm font-bold text-[var(--foreground)]">승인된 물품신청 처리</span>
            <span className="px-2 py-0.5 bg-[var(--accent)] text-white text-[10px] font-black rounded-full">{pendingApprovals.length}</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {pendingApprovals.map((approval) => {
              const items = (approval.live_inventory_workflow?.items || []) as WI[];
              const summary = approval.live_inventory_workflow?.summary || {};
              return (
                <div
                  key={String(approval.id ?? '')}
                  data-testid={`inventory-supply-approval-${String(approval.id ?? '')}`}
                  data-supply-approval-id={String(approval.id ?? '')}
                  data-highlighted={workflow.highlightedSupplyApprovalId === String(approval.id) ? 'true' : 'false'}
                  className={`rounded-[var(--radius-lg)] border p-4 transition-all ${
                    workflow.highlightedSupplyApprovalId === String(approval.id)
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                      : 'border-[var(--border)] bg-[var(--muted)]/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-xs font-bold text-[var(--foreground)]">{approval.title}</p>
                      <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                        {approval.sender_name} · {approval.sender_company}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded">불출 {Number((summary as Record<string,unknown>).issue_ready_count || 0)}</span>
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[10px] font-bold rounded">발주 {Number((summary as Record<string,unknown>).order_required_count || 0)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {items.map((wItem) => {
                      const requestIndex = Number(wItem.request_index ?? 0);
                      const key = `${String(approval.id ?? '')}:${requestIndex}`;
                      const busy = workflow.workflowActionKey === `${key}:issue` || workflow.workflowActionKey === `${key}:order` || workflow.workflowActionKey === `${key}:order-cancel`;
                      const issued = wItem.status === 'issued';
                      const ordered = wItem.status === 'ordered';
                      return (
                        <div key={key} className="flex items-center gap-3 bg-[var(--card)] rounded-[var(--radius-md)] px-3 py-2.5 border border-[var(--border)]">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--foreground)] truncate">{String(wItem.name ?? '')}</p>
                            <p className="text-[10px] text-[var(--toss-gray-3)]">{String(wItem.purpose ?? '') || '-'} / {String(wItem.dept ?? '') || '-'}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {!issued && !ordered && wItem.recommended_action === 'issue' && (
                              <button
                                data-testid={`inventory-supply-issue-${String(approval.id ?? '')}-${requestIndex}`}
                                disabled={busy}
                                onClick={() => void workflow.handleSupplyIssue(approval as Parameters<typeof workflow.handleSupplyIssue>[0], wItem as Parameters<typeof workflow.handleSupplyIssue>[1])}
                                className="px-3 py-1.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-[var(--radius-md)] disabled:opacity-50"
                              >
                                {busy ? '...' : '최종불출'}
                              </button>
                            )}
                            {!issued && !ordered && wItem.recommended_action === 'order' && (
                              <button
                                data-testid={`inventory-supply-order-${String(approval.id ?? '')}-${requestIndex}`}
                                disabled={busy}
                                onClick={() => void workflow.handleSupplyOrder(approval as Parameters<typeof workflow.handleSupplyOrder>[0], wItem as Parameters<typeof workflow.handleSupplyOrder>[1])}
                                className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-bold rounded-[var(--radius-md)] disabled:opacity-50"
                              >
                                {busy ? '...' : '발주'}
                              </button>
                            )}
                            {ordered && !Boolean(wItem.order_approval_requested) && (
                              <button
                                data-testid={`inventory-supply-history-cancel-order-${String(approval.id ?? '')}-${requestIndex}`}
                                disabled={busy}
                                onClick={() => void workflow.handleSupplyOrderCancel(approval as Parameters<typeof workflow.handleSupplyOrderCancel>[0], wItem as Parameters<typeof workflow.handleSupplyOrderCancel>[1])}
                                className="px-2 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded-[var(--radius-md)] border border-[var(--border)] disabled:opacity-50"
                              >취소</button>
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
        </div>
      )}

      {/* ── 처리완료 히스토리 ── */}
      {hasHistory && (
        <div data-testid="inventory-supply-history-panel" className="app-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
            <span className="text-xs font-bold text-[var(--toss-gray-4)]">처리 완료 히스토리</span>
            <span className="text-[10px] text-[var(--toss-gray-3)]">{completedApprovals.length}건</span>
          </div>
          <div className="px-5 py-4 space-y-2">
            {completedApprovals.slice(0, 8).map((approval) => {
              const items = (approval.live_inventory_workflow?.items || []) as WI[];
              return (
                <div key={`h-${String(approval.id ?? '')}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                  <p className="text-xs font-semibold text-[var(--foreground)] mb-2">{approval.title}</p>
                  <div className="flex flex-col gap-2">
                    {items.map((wItem, idx) => {
                      const requestIndex = Number(wItem.request_index ?? idx);
                      const busy = workflow.workflowActionKey === `${String(approval.id ?? '')}:${requestIndex}:order-cancel`;
                      return (
                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                          <span
                            data-testid={`inventory-supply-history-item-${String(approval.id ?? '')}-${requestIndex}`}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                              wItem.status === 'issued' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                            }`}
                          >
                            {String(wItem.name ?? '')} · {String(wItem.qty ?? '')}개
                            · {wItem.status === 'issued' ? '불출 완료' : '발주 처리'}
                          </span>
                          {wItem.status === 'ordered' && Boolean(wItem.order_approval_requested) && (
                            <button
                              data-testid={`inventory-supply-history-open-order-${String(approval.id ?? '')}-${requestIndex}`}
                              onClick={() => {
                                // localStorage를 io로 업데이트 후 서브뷰 이동
                                try { window.localStorage.setItem('erp_inventory_view', 'io'); } catch { /* */ }
                                nav.setSubView('io');
                              }}
                              className="px-2 py-1 bg-[var(--foreground)] text-white text-[10px] font-bold rounded"
                            >
                              발주 보기
                            </button>
                          )}
                          {wItem.status === 'ordered' && !Boolean(wItem.order_approval_requested) && (
                            <button
                              data-testid={`inventory-supply-history-cancel-order-${String(approval.id ?? '')}-${requestIndex}`}
                              disabled={busy}
                              onClick={() => void workflow.handleSupplyOrderCancel(approval as Parameters<typeof workflow.handleSupplyOrderCancel>[0], wItem as Parameters<typeof workflow.handleSupplyOrderCancel>[1])}
                              className="px-2 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded border border-[var(--border)] disabled:opacity-50"
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
            })}
          </div>
        </div>
      )}

      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── 메인: 표 ── */}
        <section className="app-card flex flex-col overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-2.5">
            <FilterChips
              chips={chips}
              active={scope}
              onChange={setScope}
              ariaLabel="재고 범위 필터"
            />
            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="sr-only">정렬</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)]"
              >
                <option>위치별</option>
                <option>카테고리별</option>
                <option>재고 적은 순</option>
                <option>만료 임박 순</option>
              </select>
            </label>
          </header>

          <StockStatusTable rows={sorted} emptyMessage={emptyMessage} />
        </section>

        {/* ── 우측: 긴급 알림 + 부서별 사용량 ── */}
        <aside className="flex flex-col gap-3">
          <UrgentAlertList rows={data.rows} />
          <DeptUsageTop5 items={data.deptUsageTop5} />
        </aside>
      </div>

      <WorkcenterNotes
        kicker="§ 재고 현황"
        title="4장 통합 — 전체·내 부서·재고 알림·유효기간을 하나로"
        points={[
          '필터 칩으로 즉시 컨텍스트 전환 (전체/내 부서/부족/재고 0/유효기간).',
          '재고 0 / 만료 임박 / 부족은 항상 danger·warn 톤으로 즉시 식별.',
          '우측 긴급 알림에서 자동 발주·사용 우선 등 인라인 액션 제공.',
          '부서별 사용량 TOP 5는 inventory_logs 최근 30일 기준.',
        ]}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────
// 필터·정렬 로직 (메모이즈 — JM2)
// ─────────────────────────────────────────────────

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
