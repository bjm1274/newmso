'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const defaultRow = () => ({ name: '', qty: 1, currentStock: null as number | null, dept: '', purpose: '', suggestions: [] as any[] });

export default function SuppliesForm({ setExtraData, initialItems }: any) {
  // MSO 삭제된 부서 목록
  const departments = ["병동팀", "수술팀", "외래팀", "검사팀", "총무팀", "원무팀", "진료부", "관리팀", "영양팀"];
  const [items, setItems] = useState(() => {
    if (Array.isArray(initialItems) && initialItems.length > 0) {
      return initialItems.map((r: any) => ({
        name: r.name ?? '',
        qty: Number(r.qty) || 1,
        currentStock: r.currentStock ?? null,
        dept: r.dept ?? '',
        purpose: r.purpose ?? '',
        suggestions: []
      }));
    }
    return [defaultRow()];
  });
  const [bulkDept, setBulkDept] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);

  useEffect(() => {
    const fetchInventory = async () => {
      const { data } = await supabase.from('inventory').select('*');
      if (data) setInventory(data);
    };
    fetchInventory();
  }, []);

  useEffect(() => {
    setExtraData({ items });
  }, [items, setExtraData]);

  const handleSearch = (idx: number, val: string) => {
    const nl = [...items];
    nl[idx].name = val;
    nl[idx].currentStock = null;
    nl[idx].suggestions = val ? inventory.filter(i => i.name.includes(val)) : [];
    setItems(nl);
  };

  const selectItem = (idx: number, s: any) => {
    const nl = [...items];
    nl[idx] = {
      ...nl[idx],
      name: s.name,
      currentStock: s.stock,
      suggestions: []
    };
    setItems(nl);
  };

  const applyBulkDept = () => {
    if (!bulkDept) return;
    setItems(prev => prev.map(i => ({ ...i, dept: bulkDept })));
  };

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-3xl overflow-hidden shadow-sm animate-in fade-in duration-300">
      <div className="p-4 md:p-6 bg-[var(--toss-blue-light)]/50 border-b border-[var(--toss-blue-light)] flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full animate-pulse"></span> 실시간 재고 연동 모드 활성화
        </p>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          <span>수령부서 일괄 적용</span>
          <select
            value={bulkDept}
            onChange={e => setBulkDept(e.target.value)}
            className="px-3 py-1.5 border-none rounded-[12px] bg-white shadow-sm text-[11px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
          >
            <option value="">선택...</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyBulkDept}
            disabled={!bulkDept}
            className="px-4 py-1.5 rounded-[12px] bg-black text-white text-[11px] font-semibold disabled:opacity-40 transition-opacity"
          >
            전체 적용
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4 bg-gray-50/30">
        {items.map((item, idx) => (
          <div key={idx} className="bg-white border border-[var(--toss-border)] rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--toss-gray-1)] pb-3">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">Item {idx + 1}</span>
              {items.length > 1 && (
                <button
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="text-[11px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded-md"
                >
                  삭제
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative col-span-1 md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-1">품목명 (재고 검색)</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid={`supplies-item-name-${idx}`}
                    value={item.name}
                    onChange={e => handleSearch(idx, e.target.value)}
                    className="flex-1 p-3.5 bg-[var(--toss-gray-1)] text-xs font-bold outline-none rounded-[12px] border-none focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/20 transition-all"
                    placeholder="품목명 입력"
                  />
                  {item.currentStock !== null && (
                    <span className={`shrink-0 px-3 py-1.5 rounded-[10px] text-[11px] font-bold ${item.currentStock <= 5 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                      현재고: {item.currentStock}
                    </span>
                  )}
                </div>
                {item.suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white border border-[var(--toss-border)] shadow-xl z-[100] mt-1 rounded-[16px] overflow-hidden">
                    {item.suggestions.map((s, si) => (
                      <div
                        key={si}
                        onClick={() => selectItem(idx, s)}
                        className="p-3 text-[11px] font-bold hover:bg-[var(--toss-gray-1)] cursor-pointer border-b last:border-none flex justify-between items-center transition-colors"
                      >
                        <span className="text-[var(--foreground)]">{s.name}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${s.stock <= s.min_stock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          재고: {s.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-1">신청수량</label>
                <input
                  data-testid={`supplies-item-qty-${idx}`}
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={e => {
                    const nl = [...items];
                    nl[idx].qty = Number(e.target.value);
                    setItems(nl);
                  }}
                  className="w-full p-3.5 bg-[var(--toss-blue-light)]/50 text-xs font-bold text-[var(--toss-blue)] outline-none rounded-[12px] border-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-1">수령부서</label>
                <select
                  data-testid={`supplies-item-dept-${idx}`}
                  className="w-full p-3.5 bg-[var(--toss-gray-1)] border-none text-[11px] font-bold rounded-[12px] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 text-[var(--foreground)]"
                  value={item.dept}
                  onChange={e => {
                    const nl = [...items];
                    nl[idx].dept = e.target.value;
                    setItems(nl);
                  }}
                >
                  <option value="">부서 선택</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="col-span-1 md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-1">용도</label>
                <input
                  data-testid={`supplies-item-purpose-${idx}`}
                  value={item.purpose}
                  onChange={e => {
                    const nl = [...items];
                    nl[idx].purpose = e.target.value;
                    setItems(nl);
                  }}
                  className="w-full p-3.5 bg-[var(--toss-gray-1)] text-xs font-semibold rounded-[12px] border-none outline-none focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/20 transition-all"
                  placeholder="상세 용도 입력"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-white border-t border-[var(--toss-border)] text-center">
        <button
          data-testid="supplies-add-row-button"
          onClick={() => setItems([...items, { name: '', qty: 1, currentStock: null, dept: '', purpose: '', suggestions: [] }])}
          className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-[var(--toss-gray-1)] text-[var(--foreground)] text-[11px] font-bold rounded-full hover:bg-[var(--toss-gray-2)] transition-colors"
        >
          <span className="text-sm border border-[var(--foreground)] rounded-full w-4 h-4 flex items-center justify-center leading-none pb-[1px]">+</span>
          품목 추가하기
        </button>
      </div>
    </div>
  );
}
