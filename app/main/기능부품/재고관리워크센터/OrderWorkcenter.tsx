'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  FilterChips,
  KpiRow,
  StockChip,
  WorkcenterNotes,
  type FilterChip,
  type KpiItem } from './stock-workcenter-common';
import type { PurchaseOrderRow } from './stock-types';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { useIOData, useEmptyMessage } from './stock-workcenter-data';

const LegacyPurchaseOrderManagement = dynamic(
  () => import('../재고관리서브/발주관리'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

function PurchaseOrderOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="발주 관리"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-base font-bold">발주 관리</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">
          <LegacyPurchaseOrderManagement user={{}} inventory={[]} suppliers={[]} />
        </div>
      </div>
    </div>
  );
}

export default function OrderWorkcenter() {
  const [showPurchase, setShowPurchase] = useState(false);
  const { user } = useAppData();
  const userCompany = typeof user?.company === 'string' ? user.company : undefined;
  const data = useIOData(userCompany);

  const kicker = "§ 구매/발주";
  const title = "공급망 발주 관리";
  const points = [
    '발주 목록: 발주서 작성 및 물품 보충 현황 관리.',
    '자동 발주: 안전재고 미달 품목에 대해 1클릭 자동 생성 가능.',
    '결재 연동: 결재 완료 후 발주가 확정 상태로 전이됩니다.',
  ];

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '발주 대기',
        value: data.pendingOrders.toLocaleString(),
        unit: '건',
        sub: '결재 대기 중인 발주',
        tone: 'warn' },
      {
        label: '배송 중',
        value: data.shippingOrders.toLocaleString(),
        unit: '건',
        sub: '배송 중인 발주',
        tone: 'accent' },
      {
        label: '이번 달 발주액',
        value: data.monthAmount.toLocaleString(),
        unit: 'M원',
        sub: '총 발주 금액(현재 월)',
        tone: 'success' },
    ],
    [data.pendingOrders, data.shippingOrders, data.monthAmount],
  );

  return (
    <div className="flex flex-col gap-4">
      {showPurchase && <PurchaseOrderOverlay onClose={() => setShowPurchase(false)} />}
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section role="region" aria-label="발주 관리 내역">
          <OrderPanel
            rows={data.orders}
            loading={data.loading}
            error={data.error}
            onNewOrder={() => setShowPurchase(true)}
          />
        </section>

        <WorkcenterNotes
          kicker={kicker}
          title={title}
          points={points}
        />
      </div>
    </div>
  );
}

type OrderScope = 'all' | 'wait' | 'confirm' | 'ship' | 'done';

function OrderPanel({
  rows,
  loading,
  error,
  onNewOrder }: {
  rows: PurchaseOrderRow[];
  loading: boolean;
  error: string | null;
  onNewOrder: () => void;
}) {
  const [scope, setScope] = useState<OrderScope>('all');
  const filtered = useMemo(() => filterOrders(rows, scope), [rows, scope]);

  const counts = useMemo(() => {
    const c = { all: rows.length, wait: 0, confirm: 0, ship: 0, done: 0 };
    for (const r of rows) {
      if (r.status === '발주 대기') c.wait++;
      else if (r.status === '확정') c.confirm++;
      else if (r.status === '배송 중') c.ship++;
      else if (r.status === '납품 완료') c.done++;
    }
    return c;
  }, [rows]);

  const chips = useMemo<FilterChip<OrderScope>[]>(
    () => [
      { id: 'all', label: '전체', count: counts.all, tone: 'accent' },
      { id: 'wait', label: '대기', count: counts.wait, tone: 'warn' },
      { id: 'confirm', label: '확정', count: counts.confirm, tone: 'success' },
      { id: 'ship', label: '배송 중', count: counts.ship, tone: 'muted' },
      { id: 'done', label: '완료', count: counts.done, tone: 'muted' },
    ],
    [counts],
  );

  const emptyMessage = useEmptyMessage(loading, error, filtered.length);

  return (
    <section className="app-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <FilterChips
          chips={chips}
          active={scope}
          onChange={setScope}
          ariaLabel="발주 상태 필터"
        />
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
          onClick={onNewOrder}
        >
          + 새 발주
        </button>
      </header>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table compact w-full text-[12px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">발주번호</th>
                <th scope="col" className="text-left">거래처</th>
                <th scope="col" className="text-center">품목 수</th>
                <th scope="col" className="text-right">금액</th>
                <th scope="col" className="text-left">발주일</th>
                <th scope="col" className="text-left">납기일</th>
                <th scope="col" className="text-left">상태</th>
                <th scope="col" className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="font-bold tabular-nums text-[var(--accent)] text-[11px]">
                    {o.id.slice(0, 8)}
                  </td>
                  <td className="font-bold">{o.vendor}</td>
                  <td className="text-center tabular-nums">{o.items}</td>
                  <td className="text-right font-extrabold tabular-nums">
                    {o.amt.toLocaleString()}
                    <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                      원
                    </span>
                  </td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{o.placed}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{o.due}</td>
                  <td>
                    <StockChip tone={o.tone}>{o.status}</StockChip>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
                      onClick={onNewOrder}
                      title="발주 상세 보기"
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function filterOrders(rows: PurchaseOrderRow[], scope: OrderScope): PurchaseOrderRow[] {
  const map: Record<OrderScope, PurchaseOrderRow['status'] | null> = {
    all: null,
    wait: '발주 대기',
    confirm: '확정',
    ship: '배송 중',
    done: '납품 완료' };
  const target = map[scope];
  return target ? rows.filter((r) => r.status === target) : rows;
}
