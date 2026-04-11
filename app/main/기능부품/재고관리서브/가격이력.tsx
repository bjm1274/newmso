'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type PriceRecord = {
  id: string;
  inventory_item_id: string;
  supplier_id: string | null;
  unit_price: number;
  quantity: number;
  source_type: string;
  recorded_at: string;
  recorded_by: string;
};

type Props = {
  user: Record<string, unknown>;
  inventory?: Array<{ id: string; name: string; category?: string }>;
};

export default function PriceHistory({ user, inventory = [] }: Props) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search.trim()) return inventory.slice(0, 50);
    const lower = search.toLowerCase();
    return inventory.filter((item) => item.name.toLowerCase().includes(lower)).slice(0, 50);
  }, [inventory, search]);

  const fetchHistory = useCallback(async (itemId: string) => {
    if (!itemId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('inventory_price_history')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('recorded_at', { ascending: true })
        .limit(200);
      setRecords((data as PriceRecord[]) || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedItemId) void fetchHistory(selectedItemId);
  }, [selectedItemId, fetchHistory]);

  const chartData = useMemo(() => {
    return records.map((r) => ({
      date: new Date(r.recorded_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      price: r.unit_price,
      source: r.source_type,
    }));
  }, [records]);

  const priceChange = useMemo(() => {
    if (records.length < 2) return null;
    const first = records[0].unit_price;
    const last = records[records.length - 1].unit_price;
    const diff = last - first;
    const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : '0';
    return { diff, pct, isUp: diff > 0 };
  }, [records]);

  const selectedItem = inventory.find((i) => i.id === selectedItemId);

  return (
    <div className="space-y-4">
      {/* 품목 선택 */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">품목 가격 이력 추적</h3>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
              품목 검색
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품목명으로 검색..."
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
              품목 선택
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none"
            >
              <option value="">품목을 선택하세요</option>
              {filteredItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.category ? `(${item.category})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 가격 차트 */}
      {selectedItemId && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent)]/20 border-t-[var(--accent)]" />
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-16 text-center">
              <div className="mb-2 text-3xl">📈</div>
              <p className="text-sm font-bold text-[var(--foreground)]">{selectedItem?.name || '선택 품목'}의 가격 이력이 없습니다</p>
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">물품 등록 또는 발주 시 가격 이력이 자동 기록됩니다.</p>
            </div>
          ) : (
            <>
              {/* 가격 요약 */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">현재 단가</p>
                  <p className="mt-1 text-lg font-black text-[var(--foreground)]">
                    {records[records.length - 1].unit_price.toLocaleString()}원
                  </p>
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">최초 단가</p>
                  <p className="mt-1 text-lg font-black text-[var(--foreground)]">
                    {records[0].unit_price.toLocaleString()}원
                  </p>
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">기록 수</p>
                  <p className="mt-1 text-lg font-black text-[var(--foreground)]">{records.length}건</p>
                </div>
                {priceChange && (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">변동률</p>
                    <p className={`mt-1 text-lg font-black ${priceChange.isUp ? 'text-red-500' : 'text-emerald-600'}`}>
                      {priceChange.isUp ? '+' : ''}{priceChange.pct}%
                    </p>
                  </div>
                )}
              </div>

              {/* 차트 */}
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <h4 className="mb-3 text-xs font-bold text-[var(--foreground)]">
                  {selectedItem?.name || ''} 단가 추이
                </h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="단가(원)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 이력 테이블 */}
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <h4 className="text-xs font-bold text-[var(--foreground)]">상세 이력</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                        <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">일자</th>
                        <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">단가</th>
                        <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">수량</th>
                        <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">출처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...records].reverse().slice(0, 50).map((r) => (
                        <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2.5 text-[var(--foreground)]">
                            {new Date(r.recorded_at).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-[var(--foreground)]">
                            {r.unit_price.toLocaleString()}원
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--foreground)]">{r.quantity}</td>
                          <td className="px-4 py-2.5">
                            <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                              {r.source_type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
