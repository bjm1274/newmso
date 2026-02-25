'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const ASSET_TYPES = ['노트북', 'PC', '모니터', '키보드', '마우스', '회의실키', '기타'];

export default function AssetLoanManager({ staffs = [], selectedCo }: any) {
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ staffId: '', assetType: '노트북', assetName: '', loanedAt: new Date().toISOString().slice(0, 10) });

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('asset_loans').select('*, staff_members(name, company)').order('loaned_at', { ascending: false });
      let rows = data || [];
      if (selectedCo && selectedCo !== '전체') rows = rows.filter((r: any) => r.staff_members?.company === selectedCo);
      setList(rows);
    })();
  }, [selectedCo]);

  const handleAdd = async () => {
    if (!form.staffId || !form.loanedAt) return alert('직원과 대여일을 선택하세요.');
    await supabase.from('asset_loans').insert({
      staff_id: form.staffId,
      asset_type: form.assetType,
      asset_name: form.assetName || form.assetType,
      loaned_at: form.loanedAt,
    });
    setForm({ staffId: '', assetType: '노트북', assetName: '', loanedAt: new Date().toISOString().slice(0, 10) });
    setAdding(false);
    const { data } = await supabase.from('asset_loans').select('*, staff_members(name)').order('loaned_at', { ascending: false }).limit(1).single();
    if (data) setList((prev) => [data, ...prev]);
  };

  const handleReturn = async (id: string) => {
    await supabase.from('asset_loans').update({ returned_at: new Date().toISOString().slice(0, 10) }).eq('id', id);
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, returned_at: new Date().toISOString().slice(0, 10) } : r)));
  };

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-[var(--toss-border)] shadow-xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">비품/장비 대여 관리</h3>
          <p className="text-[11px] text-[var(--toss-blue)] font-bold uppercase tracking-widest">입퇴사 시 장비 지급·반납 추적</p>
        </div>
        <button onClick={() => setAdding(true)} className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-semibold rounded-[16px]">+ 대여 등록</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--toss-border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
              <th className="p-4 text-left">직원</th>
              <th className="p-4 text-left">장비</th>
              <th className="p-4 text-left">대여일</th>
              <th className="p-4 text-left">반납일</th>
              <th className="p-4 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="p-4">{r.staff_members?.name}</td>
                <td className="p-4">{r.asset_type} {r.asset_name ? `(${r.asset_name})` : ''}</td>
                <td className="p-4">{r.loaned_at}</td>
                <td className="p-4">{r.returned_at ? r.returned_at : <span className="text-orange-600 font-bold">미반납</span>}</td>
                <td className="p-4 text-right">
                  {!r.returned_at && (
                    <button onClick={() => handleReturn(r.id)} className="px-3 py-1 bg-green-100 text-green-700 text-[11px] font-semibold rounded-[12px]">반납</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAdding(false)}>
          <div className="bg-white p-8 rounded-[12px] max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">장비 대여 등록</h4>
            <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} className="w-full p-3 border rounded-[16px]">
              <option value="">직원 선택</option>
              {filtered.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} className="w-full p-3 border rounded-[16px]">
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input type="text" value={form.assetName} onChange={(e) => setForm({ ...form, assetName: e.target.value })} placeholder="장비명 (선택)" className="w-full p-3 border rounded-[16px]" />
            <input type="date" value={form.loanedAt} onChange={(e) => setForm({ ...form, loanedAt: e.target.value })} className="w-full p-3 border rounded-[16px]" />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-3 bg-[var(--toss-blue)] text-white font-semibold rounded-[16px]">등록</button>
              <button onClick={() => setAdding(false)} className="flex-1 py-3 bg-[var(--toss-gray-2)] font-semibold rounded-[16px]">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
