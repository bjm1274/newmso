'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatWon } from '@/lib/date-formatter';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type UserLike = {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  company_id?: string | null;
};

type InventoryRow = {
  id?: string;
  item_name?: string | null;
  name?: string | null;
  category?: string | null;
  company?: string | null;
  company_id?: string | null;
  department?: string | null;
  quantity?: number | string | null;
  stock?: number | string | null;
  min_quantity?: number | string | null;
  min_stock?: number | string | null;
  unit_price?: number | string | null;
  price?: number | string | null;
  location?: string | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  supplier_name?: string | null;
};

type ClosingSnapshot = {
  id: string;
  closing_month: string;
  snapshot_date?: string | null;
  company?: string | null;
  company_id?: string | null;
  status?: string | null;
  item_count?: number | string | null;
  total_quantity?: number | string | null;
  total_value?: number | string | null;
  summary?: Record<string, unknown> | null;
  items?: SnapshotItem[];
  created_by_name?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
};

type SnapshotItem = {
  item_id: string | null;
  item_name: string;
  category: string;
  company: string;
  company_id: string | null;
  department: string;
  location: string;
  lot_number: string;
  expiry_date: string;
  supplier_name: string;
  quantity: number;
  min_quantity: number;
  unit_price: number;
  stock_value: number;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: string | null | undefined, fallback: string) {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

function currentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeDateInput(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonthInput();
}

function daysUntil(dateText: string) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function downloadCsv(filename: string, rows: SnapshotItem[]) {
  if (rows.length === 0) return;
  const headers = ['품목명', '카테고리', '법인', '부서', '위치', 'LOT', '유효기간', '업체', '수량', '최소재고', '단가', '재고금액'];
  const escapeCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csvRows = rows.map((row) => [
    row.item_name,
    row.category,
    row.company,
    row.department,
    row.location,
    row.lot_number,
    row.expiry_date,
    row.supplier_name,
    row.quantity,
    row.min_quantity,
    row.unit_price,
    Math.round(row.stock_value),
  ]);
  const csv = [headers.join(','), ...csvRows.map((row) => row.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildSnapshotItems(inventory: InventoryRow[], selectedCo: string): SnapshotItem[] {
  return inventory
    .filter((row) => !selectedCo || selectedCo === '전체' || row.company === selectedCo)
    .map((row) => {
      const quantity = toNumber(row.quantity ?? row.stock);
      const minQuantity = toNumber(row.min_quantity ?? row.min_stock);
      const unitPrice = toNumber(row.unit_price ?? row.price);
      return {
        item_id: row.id || null,
        item_name: text(row.item_name ?? row.name, '품목명 미지정'),
        category: text(row.category, '미분류'),
        company: text(row.company, '법인 미지정'),
        company_id: row.company_id || null,
        department: text(row.department, '부서 미지정'),
        location: text(row.location, '위치 미지정'),
        lot_number: text(row.lot_number, ''),
        expiry_date: text(row.expiry_date, ''),
    supplier_name: text(row.supplier_name, '업체 미지정'),
        quantity,
        min_quantity: minQuantity,
        unit_price: unitPrice,
        stock_value: quantity * unitPrice,
      };
    });
}

function summarize(items: SnapshotItem[]) {
  const totalQuantity = items.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = items.reduce((sum, row) => sum + row.stock_value, 0);
  const lowStockCount = items.filter((row) => row.min_quantity > 0 && row.quantity <= row.min_quantity).length;
  const expiringSoonCount = items.filter((row) => {
    const remainDays = daysUntil(row.expiry_date);
    return remainDays !== null && remainDays <= 30;
  }).length;
  const locationCount = new Set(items.map((row) => `${row.company}:${row.department}:${row.location}`)).size;
  const pricedItemCount = items.filter((row) => row.unit_price > 0).length;

  return {
    totalQuantity,
    totalValue,
    itemCount: items.length,
    lowStockCount,
    expiringSoonCount,
    locationCount,
    pricedItemCount,
  };
}

export default function InventoryClosingManagement({
  user,
  selectedCo,
  inventory,
}: {
  user?: UserLike;
  selectedCo: string;
  inventory: InventoryRow[];
}) {
  const [closingMonth, setClosingMonth] = useState(currentMonthInput());
  const [snapshots, setSnapshots] = useState<ClosingSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const snapshotItems = useMemo(
    () => buildSnapshotItems(inventory, selectedCo),
    [inventory, selectedCo],
  );
  const currentSummary = useMemo(() => summarize(snapshotItems), [snapshotItems]);
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || snapshots[0] || null;
  const selectedItems = Array.isArray(selectedSnapshot?.items) ? selectedSnapshot.items : [];
  const previousSnapshot = selectedSnapshot
    ? snapshots.find((snapshot) => snapshot.id !== selectedSnapshot.id && String(snapshot.closing_month || '') < String(selectedSnapshot.closing_month || ''))
    : null;
  const valueDelta = selectedSnapshot && previousSnapshot
    ? toNumber(selectedSnapshot.total_value) - toNumber(previousSnapshot.total_value)
    : null;

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      let query = supabase
        .from('inventory_closing_snapshots')
        .select('*')
        .order('closing_month', { ascending: false })
        .order('closed_at', { ascending: false })
        .limit(24);

      if (selectedCo && selectedCo !== '전체') query = query.eq('company', selectedCo);

      const { data, error } = await query;
      if (error) throw error;
      const nextSnapshots = (data || []) as ClosingSnapshot[];
      setSnapshots(nextSnapshots);
      setSelectedSnapshotId((current) => current || nextSnapshots[0]?.id || null);
    } catch (error) {
      console.error('재고 월마감 조회 실패:', error);
      setUnavailable(true);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCo]);

  useEffect(() => {
    void fetchSnapshots();
  }, [fetchSnapshots]);

  const createClosingSnapshot = async () => {
    const normalizedMonth = normalizeDateInput(closingMonth);
    if (snapshotItems.length === 0) {
      toast('마감할 재고 데이터가 없습니다.', 'warning');
      return;
    }
    if (!confirm(`${normalizedMonth} 재고 월마감 스냅샷을 생성하시겠습니까?\n생성 후에도 별도 버전으로 보관됩니다.`)) return;

    setSaving(true);
    try {
      const isAllCompanyScope = (!selectedCo || selectedCo === '전체') && user?.company === 'SY INC.';
      const closingCompany = isAllCompanyScope
        ? '전체'
        : selectedCo && selectedCo !== '전체'
          ? selectedCo
          : user?.company || snapshotItems[0]?.company || '전체';
      const payload = {
        closing_month: normalizedMonth,
        snapshot_date: `${normalizedMonth}-01`,
        company: closingCompany,
        company_id: closingCompany === user?.company ? user?.company_id || null : null,
        status: 'locked',
        item_count: currentSummary.itemCount,
        total_quantity: currentSummary.totalQuantity,
        total_value: currentSummary.totalValue,
        summary: currentSummary,
        items: snapshotItems,
        created_by_id: user?.id || null,
        created_by_name: user?.name || null,
        closed_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('inventory_closing_snapshots')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;

      toast('재고 월마감 스냅샷이 생성되었습니다.', 'success');
      setSnapshots((prev) => [data as ClosingSnapshot, ...prev]);
      setSelectedSnapshotId((data as ClosingSnapshot).id);
    } catch (error) {
      console.error('재고 월마감 생성 실패:', error);
      toast('재고 월마감 생성에 실패했습니다. 마이그레이션 적용 여부를 확인해 주세요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4" data-testid="inventory-closing-view">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-black text-[var(--foreground)]">재고 월마감</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="month"
            value={closingMonth}
            onChange={(event) => setClosingMonth(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
          />
          <button
            type="button"
            onClick={createClosingSnapshot}
            disabled={saving || unavailable || snapshotItems.length === 0}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-black text-white disabled:opacity-40"
          >
            {saving ? '마감 중...' : '현재 재고 월마감'}
          </button>
        </div>
      </div>

      {unavailable && (
        <div className="rounded-[var(--radius-md)] border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-700">
          재고 월마감 저장소가 준비되지 않았습니다.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="현재 품목" value={`${currentSummary.itemCount.toLocaleString('ko-KR')}개`} color="text-[var(--accent)]" />
        <MetricCard label="현재 수량" value={`${currentSummary.totalQuantity.toLocaleString('ko-KR')}개`} color="text-blue-600" />
        <MetricCard label="현재 평가액" value={formatWon(Math.round(currentSummary.totalValue))} color="text-[var(--success)]" />
        <MetricCard label="위험 품목" value={`${(currentSummary.lowStockCount + currentSummary.expiringSoonCount).toLocaleString('ko-KR')}개`} color="text-rose-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-[var(--foreground)]">마감 이력</h3>
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
              {snapshots.length.toLocaleString('ko-KR')}건
            </span>
          </div>
          {loading ? (
            <EmptyState text="마감 이력을 불러오는 중..." />
          ) : snapshots.length === 0 ? (
            <EmptyState text="아직 생성된 월마감이 없습니다." />
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => (
                <button
                  key={snapshot.id}
                  type="button"
                  onClick={() => setSelectedSnapshotId(snapshot.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                    selectedSnapshot?.id === snapshot.id
                      ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                      : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-[var(--foreground)]">{snapshot.closing_month}</p>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                      {snapshot.status === 'locked' ? '잠금' : snapshot.status || '저장'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-[var(--toss-gray-3)]">
                    {snapshot.company || '전체'} · {Number(snapshot.item_count || 0).toLocaleString('ko-KR')}품목
                  </p>
                  <p className="mt-2 text-xs font-black text-[var(--accent)]">
                    {formatWon(Math.round(toNumber(snapshot.total_value)))}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          {!selectedSnapshot ? (
            <EmptyState text="왼쪽에서 월마감 스냅샷을 선택해 주세요." />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-black text-[var(--foreground)]">{selectedSnapshot.closing_month} 마감 상세</h3>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                    마감자 {selectedSnapshot.created_by_name || '미지정'} · {selectedSnapshot.closed_at ? new Date(selectedSnapshot.closed_at).toLocaleString('ko-KR') : '마감일 미지정'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`inventory-closing-${selectedSnapshot.closing_month}.csv`, selectedItems)}
                  disabled={selectedItems.length === 0}
                  className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-xs font-black text-[var(--toss-gray-4)] disabled:opacity-40"
                >
                  CSV 내보내기
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="마감 품목" value={`${Number(selectedSnapshot.item_count || 0).toLocaleString('ko-KR')}개`} color="text-[var(--accent)]" />
                <MetricCard label="마감 수량" value={`${toNumber(selectedSnapshot.total_quantity).toLocaleString('ko-KR')}개`} color="text-blue-600" />
                <MetricCard label="마감 평가액" value={formatWon(Math.round(toNumber(selectedSnapshot.total_value)))} color="text-[var(--success)]" />
                <MetricCard
                  label="전월 대비"
                  value={valueDelta === null ? '비교없음' : `${valueDelta >= 0 ? '+' : ''}${formatWon(Math.round(valueDelta))}`}
                  color={valueDelta !== null && valueDelta < 0 ? 'text-rose-600' : 'text-blue-600'}
                />
              </div>

              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--muted)] text-[var(--toss-gray-3)]">
                    <tr>
                      <th className="px-3 py-2">품목</th>
                      <th className="px-3 py-2">위치/LOT</th>
                      <th className="px-3 py-2 text-right">수량</th>
                      <th className="px-3 py-2 text-right">단가</th>
                      <th className="px-3 py-2 text-right">재고금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.slice(0, 80).map((item, index) => (
                      <tr key={`${item.item_id || item.item_name}-${index}`} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 min-w-[180px]">
                          <p className="font-black text-[var(--foreground)]">{item.item_name}</p>
                          <p className="text-[10px] text-[var(--toss-gray-3)]">{item.category} · {item.company}</p>
                        </td>
                        <td className="px-3 py-2 min-w-[160px] text-[var(--toss-gray-3)]">
                          <p>{item.location}</p>
                          <p className="text-[10px]">{item.lot_number || 'LOT 미등록'}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.quantity.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatWon(Math.round(item.unit_price))}</td>
                        <td className="px-3 py-2 text-right font-black tabular-nums text-[var(--accent)]">{formatWon(Math.round(item.stock_value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedItems.length > 80 && (
                <p className="text-center text-xs font-bold text-[var(--toss-gray-3)]">상위 80개 표시 중 (전체 {selectedItems.length}개)</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
      <p className={`text-lg font-black ${color}`}>{value}</p>
      <p className="mt-0.5 text-[9px] font-bold text-[var(--toss-gray-3)]">{label}</p>
    </div>
  );
}

function EmptyState({ text: label }: { text: string }) {
  return <div className="py-8 text-center text-xs font-bold text-[var(--toss-gray-3)]">{label}</div>;
}
