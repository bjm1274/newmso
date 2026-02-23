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
    <div className="border-t-2 border-b border-[var(--toss-border)] overflow-hidden bg-white rounded-none">
      <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full animate-pulse"></span> 실시간 재고 연동 모드 활성화
        </p>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          <span>수령부서 일괄 적용</span>
          <select
            value={bulkDept}
            onChange={e => setBulkDept(e.target.value)}
            className="px-2 py-1 border border-[var(--toss-border)] rounded-[12px] bg-white text-[11px] font-bold"
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
            className="px-3 py-1 rounded-[12px] bg-gray-900 text-white text-[11px] font-semibold disabled:opacity-40"
          >
            전체 적용
          </button>
        </div>
      </div>
      <table className="w-full text-left border-collapse">
        <thead className="bg-[var(--toss-gray-1)] text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)]">
          <tr>
            <th className="p-4">품목명 (재고 검색)</th>
            <th className="p-4 w-24 text-center">현재고</th>
            <th className="p-4 w-24 text-center">신청수량</th>
            <th className="p-4 w-32 text-center">수령부서</th>
            <th className="p-4">용도</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-[var(--toss-border)] last:border-none relative">
              <td className="p-2 relative">
                <input 
                  value={item.name} 
                  onChange={e => handleSearch(idx, e.target.value)} 
                  className="w-full p-3 bg-[var(--toss-gray-1)] text-xs font-bold outline-none rounded-none border-none focus:bg-white transition-all" 
                  placeholder="품목명 입력" 
                />
                {item.suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white border shadow-2xl z-[100] mt-1 border-[var(--toss-border)] rounded-none">
                    {item.suggestions.map((s, si) => (
                      <div 
                        key={si} 
                        onClick={() => selectItem(idx, s)} 
                        className="p-3 text-[11px] font-bold hover:bg-blue-50 cursor-pointer border-b last:border-none flex justify-between items-center"
                      >
                        <span>{s.name}</span>
                        <span className={`px-2 py-0.5 text-[11px] font-semibold rounded ${s.stock <= s.min_stock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          재고: {s.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td className={`p-2 text-center text-xs font-semibold ${item.currentStock !== null && item.currentStock <= 5 ? 'text-red-600 animate-pulse' : 'text-[var(--toss-blue)]'}`}>
                {item.currentStock ?? '-'}
              </td>
              <td className="p-2">
                <input 
                  type="number" 
                  min="1"
                  value={item.qty}
                  onChange={e => {
                    const nl = [...items]; 
                    nl[idx].qty = Number(e.target.value); 
                    setItems(nl);
                  }} 
                  className="w-full p-3 bg-blue-50 text-xs font-semibold text-center text-[var(--toss-blue)] outline-none rounded-none border-none" 
                />
              </td>
              <td className="p-2">
                <select 
                  className="w-full p-3 bg-white border border-[var(--toss-border)] text-[11px] font-bold rounded-none outline-none" 
                  onChange={e => {
                    const nl = [...items]; 
                    nl[idx].dept = e.target.value; 
                    setItems(nl);
                  }}
                >
                  <option value="">부서 선택</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </td>
              <td className="p-2">
                <input 
                  onChange={e => {
                    const nl = [...items]; 
                    nl[idx].purpose = e.target.value; 
                    setItems(nl);
                  }} 
                  className="w-full p-3 bg-[var(--toss-gray-1)] text-xs font-medium rounded-none border-none outline-none" 
                  placeholder="용도 입력" 
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button 
        onClick={() => setItems([...items, { name: '', qty: 1, currentStock: null, dept: '', purpose: '', suggestions: [] }])} 
        className="m-4 text-[11px] font-semibold text-blue-500 hover:underline flex items-center gap-1"
      >
        + 품목 추가하기
      </button>
    </div>
  );
}
