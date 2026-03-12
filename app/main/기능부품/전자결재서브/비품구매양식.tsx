'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const defaultRow = () => ({ name: '', qty: 1, currentStock: null as number | null, dept: '', purpose: '', suggestions: [] as any[] });
const INVENTORY_COMPANY = 'SY INC.';
const INVENTORY_DEPARTMENT = '경영지원팀';

function getInventoryItemName(row: any) {
  return String(row?.item_name || row?.name || '').trim();
}

function getInventoryStock(row: any) {
  const raw = row?.quantity ?? row?.stock ?? 0;
  return Number(raw) || 0;
}

function getInventoryMinStock(row: any) {
  const raw = row?.min_quantity ?? row?.min_stock ?? 0;
  return Number(raw) || 0;
}

function isTargetInventory(row: any) {
  return String(row?.company || '').trim() === INVENTORY_COMPANY &&
    String(row?.department || '').trim() === INVENTORY_DEPARTMENT;
}

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

  const inventoryCatalog = useMemo(() => {
    const merged = new Map<string, { name: string; stock: number; min_stock: number }>();

    inventory
      .filter(isTargetInventory)
      .forEach((row) => {
        const name = getInventoryItemName(row);
        if (!name) return;
        const key = name.toLowerCase();
        const current = merged.get(key) || { name, stock: 0, min_stock: 0 };
        current.stock += getInventoryStock(row);
        current.min_stock = Math.max(current.min_stock, getInventoryMinStock(row));
        merged.set(key, current);
      });

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [inventory]);

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
    const keyword = val.trim().toLowerCase();
    const exactMatch = keyword
      ? inventoryCatalog.find((entry) => entry.name.toLowerCase() === keyword)
      : null;
    nl[idx].name = val;
    nl[idx].currentStock = exactMatch ? exactMatch.stock : null;
    nl[idx].suggestions = keyword
      ? inventoryCatalog
          .filter((entry) => {
            const name = entry.name.toLowerCase();
            return name.startsWith(keyword) || name.includes(keyword);
          })
          .slice(0, 8)
      : [];
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

  const updateItemField = (idx: number, key: 'qty' | 'dept' | 'purpose', value: any) => {
    setItems((prev) => prev.map((item, itemIdx) => (
      itemIdx === idx ? { ...item, [key]: value } : item
    )));
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, defaultRow()]);
  };

  const removeLastItemRow = () => {
    setItems((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-3xl overflow-hidden shadow-sm animate-in fade-in duration-300">
      <div className="p-4 md:p-6 bg-[var(--toss-blue-light)]/50 border-b border-[var(--toss-blue-light)] flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full animate-pulse"></span> 실시간 재고
          </p>
          <button
            type="button"
            data-testid="supplies-add-row-button"
            onClick={addItemRow}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--toss-gray-1)]"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--foreground)] pb-[1px] text-[11px] leading-none">+</span>
            품목 추가하기
          </button>
          <button
            type="button"
            data-testid="supplies-remove-row-button"
            onClick={removeLastItemRow}
            disabled={items.length <= 1}
            className="inline-flex items-center justify-center rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            품목 제거하기
          </button>
        </div>
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

      <div className="bg-gray-50/20 p-2 md:p-3">
        <div className="overflow-hidden rounded-[20px] border border-[var(--toss-border)] bg-white shadow-sm">
          <table className="w-full max-w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[8%]" />
              <col className="w-[38%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-[var(--toss-gray-1)]">
              <tr className="border-b border-[var(--toss-border)]">
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">물품명</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">수량</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">용도</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">수령부서</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-[var(--toss-border)] last:border-b-0">
                  <td className="px-2 py-1.5 align-middle">
                    <div className="relative">
                      <input
                        data-testid={`supplies-item-name-${idx}`}
                        value={item.name}
                        onChange={e => handleSearch(idx, e.target.value)}
                        onFocus={e => handleSearch(idx, e.target.value)}
                        className={`w-full h-10 rounded-[10px] border-none bg-[var(--toss-gray-1)] px-2.5 pr-20 text-xs font-bold text-[var(--foreground)] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/20 ${item.currentStock !== null ? 'pr-24' : ''}`}
                        placeholder="품목명 입력"
                      />
                      {item.currentStock !== null && (
                        <span className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.currentStock <= 5 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                          재고 {item.currentStock}
                        </span>
                      )}
                      {item.suggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-[16px] border border-[var(--toss-border)] bg-white shadow-xl">
                          {item.suggestions.map((s, si) => (
                            <div
                              key={si}
                              onClick={() => selectItem(idx, s)}
                              className="flex cursor-pointer items-center justify-between border-b p-3 text-[11px] font-bold transition-colors last:border-none hover:bg-[var(--toss-gray-1)]"
                            >
                              <span className="text-[var(--foreground)]">{s.name}</span>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${s.stock <= s.min_stock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                재고: {s.stock}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      data-testid={`supplies-item-qty-${idx}`}
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={e => updateItemField(idx, 'qty', Number(e.target.value))}
                      className="h-10 w-full rounded-[10px] border-none bg-[var(--toss-blue-light)]/50 px-2 text-center text-xs font-bold text-[var(--toss-blue)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      data-testid={`supplies-item-purpose-${idx}`}
                      value={item.purpose}
                      onChange={e => updateItemField(idx, 'purpose', e.target.value)}
                      className="h-10 w-full rounded-[10px] border-none bg-[var(--toss-gray-1)] px-2.5 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                      placeholder="용도 입력"
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <select
                      data-testid={`supplies-item-dept-${idx}`}
                      className="h-10 w-full max-w-[78px] rounded-[10px] border-none bg-[var(--toss-gray-1)] px-1.5 text-[10px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                      value={item.dept}
                      onChange={e => updateItemField(idx, 'dept', e.target.value)}
                    >
                      <option value="">부서 선택</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
