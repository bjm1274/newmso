'use client';

import { useMemo, useState, useEffect } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { InventoryModeSegment } from '../재고관리서브/InventoryComponents';
import {
  KpiRow,
  StockChip,
  WorkcenterNotes,
  type KpiItem } from './stock-workcenter-common';
import type { StockMoveRow } from './stock-types';
import { useIOData, useEmptyMessage } from './stock-workcenter-data';

export default function InoutWorkcenter() {
  const [showInoutRegister, setShowInoutRegister] = useState(false);
  const { user } = useAppData();
  const userCompany = typeof user?.company === 'string' ? user.company : undefined;
  const data = useIOData(userCompany);

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '오늘 입출고',
        value: data.todayInout.toLocaleString(),
        unit: '건',
        sub: data.loading ? '불러오는 중…' : '오늘 입출고 건수 집계' },
      {
        label: '발주 대기',
        value: data.pendingOrders.toLocaleString(),
        unit: '건',
        sub: '대기 중인 발주',
        tone: 'warn' },
      {
        label: '배송 중',
        value: data.shippingOrders.toLocaleString(),
        unit: '건',
        sub: '도착 대기 품목',
        tone: 'accent' }
    ],
    [data.todayInout, data.pendingOrders, data.shippingOrders, data.loading],
  );

  return (
    <div className="flex flex-col gap-4">
      {showInoutRegister && (
        <InoutRegistrationOverlay
          onClose={() => setShowInoutRegister(false)}
          onSuccess={() => {
            setShowInoutRegister(false);
            data.refresh();
          }}
        />
      )}
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section role="region" aria-label="입출고 이력">
          <InoutPanel
            rows={data.moves}
            loading={data.loading}
            error={data.error}
            onManualRegister={() => setShowInoutRegister(true)}
          />
        </section>

        <WorkcenterNotes
          kicker="§ 입출고 관리"
          title="재고 이동 및 로그 현황"
          points={[
            '입출고 기록: 오늘 발생한 모든 실시간 입고/출고/이관/반품 로그.',
            '수동 등록: 바코드/스캔이 아닌 수동으로 물품 이동 내역 기록.',
            '안전 규정: 모든 재고 변동은 감사 로그에 기록되며 변경 이력은 임의 삭제가 불가합니다.',
          ]}
        />
      </div>
    </div>
  );
}

type MoveKindFilter = '전체' | '입고' | '출고' | '이관' | '반품';

function InoutPanel({
  rows,
  loading,
  error,
  onManualRegister }: {
  rows: StockMoveRow[];
  loading: boolean;
  error: string | null;
  onManualRegister: () => void;
}) {
  const [kindFilter, setKindFilter] = useState<MoveKindFilter>('전체');
  const filtered = useMemo(
    () => (kindFilter === '전체' ? rows : rows.filter((m) => m.kind === kindFilter)),
    [rows, kindFilter],
  );
  const emptyMessage = useEmptyMessage(loading, error, filtered.length);

  const todayLabel = new Date().toLocaleDateString('ko-KR');

  return (
    <section className="app-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[13px] font-bold">오늘 입출고 기록 ({todayLabel})</h3>
        <div className="flex items-center gap-2">
          <label className="text-[11px]">
            <span className="sr-only">유형</span>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as MoveKindFilter)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold"
            >
              <option>전체</option>
              <option>입고</option>
              <option>출고</option>
              <option>이관</option>
              <option>반품</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--accent)] bg-transparent px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent-selected-subtle)] transition-all"
            onClick={onManualRegister}
          >
            + 수동 등록
          </button>
        </div>
      </header>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {filtered.map((m, i) => (
            <li
              key={`${m.time}-${m.item}-${i}`}
              className="grid grid-cols-[56px_64px_1fr_72px_64px] items-center gap-2 px-4 py-2 text-[12px]"
            >
              <span className="font-bold tabular-nums text-[var(--toss-gray-4)]">{m.time}</span>
              <StockChip tone={m.tone}>{m.kind}</StockChip>
              <div className="min-w-0">
                <div className="font-bold truncate">{m.item}</div>
                <div className="text-[10.5px] text-[var(--toss-gray-4)] truncate">
                  {m.from} → {m.to}
                </div>
              </div>
              <span className="text-right font-extrabold tabular-nums">
                {m.qty}
                <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                  {m.unit}
                </span>
              </span>
              <span className="text-right text-[11px] text-[var(--toss-gray-4)] truncate">
                {m.who}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type InoutMode = '입고' | '출고' | '조정' | '반품';

function InoutRegistrationOverlay({
  onClose,
  onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAppData();
  const [mode, setMode] = useState<InoutMode>('입고');
  const [loading, setLoading] = useState(false);
  const [inventoryList, setInventoryList] = useState<Record<string, any>[]>([]);

  // Form states
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');

  useEffect(() => {
    const fetchInventory = async () => {
      const { data } = await db.from('inventory').select('*').order('name');
      if (data) setInventoryList(data);
    };
    void fetchInventory();
  }, []);

  const matchedItem = useMemo(() => {
    return inventoryList.find(
      (item) =>
        String(item.name || item.item_name || '').trim().toLowerCase() ===
        itemName.trim().toLowerCase(),
    );
  }, [itemName, inventoryList]);

  const handleRegister = async () => {
    if (!itemName.trim()) {
      toast('품목명을 입력해주세요.', 'warning');
      return;
    }
    if (!matchedItem) {
      toast(
        '시스템에 등록되지 않은 품목입니다. [기준 정보] 탭에서 신규 등록을 먼저 진행해주세요.',
        'warning',
      );
      return;
    }
    if (qty <= 0) {
      toast('수량은 1개 이상이어야 합니다.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const { postStockMovement } = await import('@/lib/inventory-stock-client');
      const currentStock = Number(matchedItem.quantity ?? matchedItem.stock ?? 0) || 0;
      const locNote =
        mode === '입고'
          ? fromLoc
            ? `from:${fromLoc}`
            : ''
          : mode === '출고' || mode === '반품'
            ? toLoc
              ? `to:${toLoc}`
              : ''
            : '';
      const noteParts = [notes.trim(), locNote].filter(Boolean);

      const payload =
        mode === '조정'
          ? {
              itemId: String(matchedItem.id),
              mode: 'absolute' as const,
              absoluteQty: qty,
              type: '조정' as const,
              notes: noteParts.join(' · ') || '수동 조정',
              company: matchedItem.company ?? user?.company ?? null,
              department: matchedItem.department ?? user?.department ?? null,
              location: matchedItem.location ?? matchedItem.loc ?? null,
            }
          : {
              itemId: String(matchedItem.id),
              mode: 'delta' as const,
              delta: mode === '입고' ? qty : -qty,
              type: (mode === '반품' ? '반품' : mode === '입고' ? '입고' : '출고') as
                | '입고'
                | '출고'
                | '반품',
              notes: noteParts.join(' · ') || `${mode} 등록`,
              company: matchedItem.company ?? user?.company ?? null,
              department: matchedItem.department ?? user?.department ?? null,
              location: matchedItem.location ?? matchedItem.loc ?? null,
            };

      const result = await postStockMovement(payload);
      if (!result.ok) {
        const { formatStockApiError } = await import('@/lib/inventory-stock-client');
        if (result.code === 'INSUFFICIENT_STOCK') {
          toast(`출고 가능 재고가 부족합니다. (현재: ${currentStock}개)`, 'warning');
        } else {
          toast(formatStockApiError(result.error, result.code), 'error');
        }
        return;
      }

      toast(
        `${matchedItem.name || matchedItem.item_name} ${mode} 완료 (재고 ${result.data?.prev_qty ?? currentStock} → ${result.data?.next_qty ?? '—'})`,
        'success',
      );
      onSuccess();
    } catch (err) {
      console.error(err);
      toast('데이터 저장에 실패했습니다. 네트워크·권한을 확인해주세요.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="수동 입출고 등록"
    >
      <div className="relative w-full max-w-md bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-md overflow-hidden animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="text-[14.5px] font-bold text-[var(--foreground)]">수동 입출고 등록</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-1 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* 세그먼트 컨트롤 */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
              처리 유형
            </span>
            <InventoryModeSegment
              modes={['입고', '출고', '조정', '반품'] as const}
              activeMode={mode}
              onChange={(m) => setMode(m)}
            />
          </div>

          {/* 품목 선택 */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
              품목명
            </label>
            <input
              type="text"
              list="inout-register-item-list"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full h-10 px-3 text-[13px] font-bold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] outline-none focus:border-[var(--accent)]"
              placeholder="품목명을 입력하거나 선택하세요"
            />
            <datalist id="inout-register-item-list">
              {inventoryList.map((item) => (
                <option key={item.id} value={item.name || item.item_name} />
              ))}
            </datalist>
            {matchedItem && (
              <p className="text-[11px] font-semibold text-[var(--accent)]">
                보유 재고: {matchedItem.stock ?? 0} {matchedItem.unit || 'EA'} (위치:{' '}
                {matchedItem.loc || '-'})
              </p>
            )}
          </div>

          {/* 수량 */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
              {mode === '조정' ? '최종 조정 재고 수량' : `${mode} 수량`}
            </label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 0))}
              className="w-full h-10 px-3 text-[13px] font-bold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* 모드별 동적 필드 */}
          {mode === '입고' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                출발 위치 (공급처 등)
              </label>
              <input
                type="text"
                value={fromLoc}
                onChange={(e) => setFromLoc(e.target.value)}
                className="w-full h-10 px-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] outline-none focus:border-[var(--accent)]"
                placeholder="예: 메디스 상사"
              />
            </div>
          )}

          {(mode === '출고' || mode === '반품') && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                도착 위치 (배정처 등)
              </label>
              <input
                type="text"
                value={toLoc}
                onChange={(e) => setToLoc(e.target.value)}
                className="w-full h-10 px-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] outline-none focus:border-[var(--accent)]"
                placeholder="예: 3층 외래수술실"
              />
            </div>
          )}

          {/* 비고 */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
              {mode} 사유 및 비고
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 px-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] outline-none focus:border-[var(--accent)]"
              placeholder={`${mode} 사유 기록`}
            />
          </div>

          {/* 등록 버튼 */}
          <button
            type="button"
            disabled={loading}
            onClick={handleRegister}
            className="w-full h-11 mt-2 text-sm font-bold text-white rounded-[var(--radius-lg)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '처리 중…' : `✅ ${mode} 등록하기`}
          </button>
        </div>
      </div>
    </div>
  );
}
