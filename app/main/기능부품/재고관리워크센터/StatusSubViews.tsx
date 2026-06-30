// 재고관리 워크센터 — Status 보조 뷰
//
// StatusWorkcenter에서 분리한 표 + 우측 패널(긴급 알림, 부서별 사용량).
// JM 500줄 규율 준수를 위한 sub-component.

'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { db } from '@/lib/db-client';
import { StockChip } from './stock-workcenter-common';
import type { StockStatusRow } from './stock-types';

// ─────────────────────────────────────────────────
// 레거시 발주관리 (dynamic import — 코드 스플릿)
// ─────────────────────────────────────────────────

const PurchaseOrderManagement = dynamic(
  () => import('../재고관리서브/발주관리'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

/** 발주관리 모달 래퍼 */
function PurchaseOrderOverlay({ onClose }: { onClose: () => void }) {
  const { user } = useAppData();
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const fetchInventory = useCallback(async () => {
    const { data: inv } = await db
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });
    if (inv) setInventory(inv);
  }, []);

  const fetchSuppliers = useCallback(async () => {
    const { data: sups } = await db
      .from('suppliers')
      .select('*')
      .order('name');
    if (sups) setSuppliers(sups);
  }, []);

  useEffect(() => {
    void fetchInventory();
    void fetchSuppliers();
  }, [fetchInventory, fetchSuppliers]);

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
          <PurchaseOrderManagement
            user={user}
            inventory={inventory}
            suppliers={suppliers}
            fetchInventory={fetchInventory}
            fetchSuppliers={fetchSuppliers}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 표
// ─────────────────────────────────────────────────

import { InventoryRecordCard } from '../재고관리서브/InventoryComponents';

export function StockStatusTable({
  rows,
  emptyMessage }: {
  rows: StockStatusRow[];
  emptyMessage?: string | null;
}) {
  const [showPurchase, setShowPurchase] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  if (emptyMessage) {
    return (
      <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        {emptyMessage}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        조건에 맞는 품목이 없습니다.
      </div>
    );
  }
  return (
    <>
      {showPurchase && <PurchaseOrderOverlay onClose={() => setShowPurchase(false)} />}
      
      {isMobile ? (
        <div className="flex flex-col gap-3.5 px-1 py-2">
          {rows.map((r, i) => (
            <InventoryRecordCard
              key={`${r.name}-${r.loc}-${i}`}
              row={r}
              onAction={() => setShowPurchase(true)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table compact w-full text-[12px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">품목</th>
                <th scope="col" className="text-left">카테고리</th>
                <th scope="col" className="text-left">위치</th>
                <th scope="col" className="text-center">재고</th>
                <th scope="col" className="text-center">최소</th>
                <th scope="col" className="text-left">유효기간</th>
                <th scope="col" className="text-left">상태</th>
                <th scope="col" className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${r.loc}-${i}`}>
                  <td className="font-bold">{r.name}</td>
                  <td className="text-[var(--toss-gray-4)]">{r.cat}</td>
                  <td className="text-[var(--toss-gray-4)]">{r.loc}</td>
                  <td
                    className="text-center font-extrabold tabular-nums"
                    style={{
                      color:
                        r.stock === 0
                          ? 'var(--danger)'
                          : r.stock < r.min
                            ? 'var(--warning)'
                            : 'var(--foreground)' }}
                  >
                    {r.stock}
                    <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                      {r.unit}
                    </span>
                  </td>
                  <td className="text-center text-[var(--toss-gray-4)] tabular-nums">{r.min}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{r.expire}</td>
                  <td>
                    <StockChip tone={r.tone}>{r.status}</StockChip>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="rounded-[var(--radius-sm)] border border-[var(--accent)] bg-transparent px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent-selected-subtle)]"
                      onClick={() => setShowPurchase(true)}
                    >
                      발주
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────
// 우측: 긴급 알림 보드 (실데이터에서 추출)
// ─────────────────────────────────────────────────

export function UrgentAlertList({ rows }: { rows: StockStatusRow[] }) {
  const [showPurchase, setShowPurchase] = useState(false);

  // 재고 0 → 부족 → 유효기간 순 우선
  const sorted = [...rows]
    .filter((r) => r.status !== '정상')
    .sort((a, b) => {
      const order: Record<StockStatusRow['status'], number> = {
        '재고 0': 0,
        '유효기간': 1,
        '부족': 2,
        '정상': 3 };
      return order[a.status] - order[b.status];
    })
    .slice(0, 5);

  return (
    <>
      {showPurchase && <PurchaseOrderOverlay onClose={() => setShowPurchase(false)} />}
      <section className="app-card flex flex-col gap-2 p-3" aria-label="긴급 알림">
        <header className="flex items-center justify-between">
          <h3 className="text-[12px] font-bold text-[var(--foreground)]">긴급 알림</h3>
          <button
            type="button"
            className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            disabled
            title="준비 중"
          >
            설정
          </button>
        </header>
        {sorted.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
            긴급 알림 대상이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sorted.map((a, i) => (
              <li
                key={`${a.name}-${i}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5"
                style={{
                  background:
                    a.tone === 'danger' ? 'var(--danger-light)' : 'var(--warning-light)' }}
              >
                <StockChip tone={a.tone}>{a.status}</StockChip>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold leading-tight text-[var(--foreground)] truncate">
                    {a.name}
                  </div>
                  <div className="text-[10.5px] text-[var(--toss-gray-4)] truncate">
                    {a.loc} · {a.cat}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[var(--accent-hover)]"
                  onClick={() => setShowPurchase(true)}
                >
                  {a.status === '재고 0' ? '자동 발주' : a.status === '유효기간' ? '발주' : '발주'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────
// 우측: 부서별 사용량 TOP 5
// ─────────────────────────────────────────────────

export function DeptUsageTop5({ items }: { items: Array<{ dept: string; value: number }> }) {
  const max = Math.max(1, ...items.map((d) => d.value));
  return (
    <section className="app-card flex flex-col gap-2 p-3" aria-label="부서별 사용량 TOP 5">
      <header className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-[var(--foreground)]">부서별 사용량 TOP 5</h3>
        <span className="text-[10px] text-[var(--toss-gray-4)]">최근 30일</span>
      </header>
      {items.length === 0 ? (
        <p className="px-2 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          사용 이력이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((d) => {
            const pct = Math.round((d.value / max) * 100);
            return (
              <li key={d.dept} className="grid grid-cols-[80px_1fr_56px] items-center gap-2">
                <span className="text-[11px] font-bold text-[var(--foreground)] truncate">
                  {d.dept}
                </span>
                <div
                  className="h-2 rounded-full"
                  style={{ background: 'var(--muted)' }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${d.dept} 사용량 비율`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, #3B82F6, #2563EB)' }}
                  />
                </div>
                <span className="text-right text-[11px] font-extrabold tabular-nums">
                  {d.value}
                  <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                    건
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
