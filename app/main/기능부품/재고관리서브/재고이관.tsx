'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryTransfer({ user, inventory = [], fetchInventory }: { user: any; inventory: any[]; fetchInventory: () => void }) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ item_id: '', quantity: 1, from_company: '', from_dept: '', to_company: '', to_dept: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');

  const companies = Array.from(new Set(inventory.map(i => i.company).filter(Boolean))).sort();
  const depts = Array.from(new Set(inventory.map(i => i.department).filter(Boolean))).sort();

  const selectedItem = inventory.find(i => String(i.id) === String(form.item_id));
  const maxQty = selectedItem?.quantity ?? selectedItem?.stock ?? 0;

  const fetchTransfers = useCallback(async () => {
    const { data } = await supabase.from('inventory_transfers').select('*').order('created_at', { ascending: false }).limit(100);
    setTransfers(data || []);
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  const handleTransfer = async () => {
    if (!form.item_id) return alert('물품을 선택하세요.');
    if (!form.to_company) return alert('이관 대상 법인을 선택하세요.');
    if (form.quantity <= 0) return alert('이관 수량을 입력하세요.');
    if (form.quantity > maxQty) return alert(`재고 부족: 현재 재고 ${maxQty}개`);
    if (form.from_company === form.to_company && form.from_dept === form.to_dept) return alert('출발지와 목적지가 동일합니다.');

    setSaving(true);
    try {
      // 재고 차감
      const newQty = maxQty - form.quantity;
      await supabase.from('inventory').update({ quantity: newQty, stock: newQty }).eq('id', form.item_id);

      // 이관 이력 기록
      await supabase.from('inventory_transfers').insert([{
        item_id: form.item_id,
        item_name: selectedItem?.item_name || selectedItem?.name,
        quantity: form.quantity,
        from_company: form.from_company || selectedItem?.company,
        from_department: form.from_dept || selectedItem?.department,
        to_company: form.to_company,
        to_department: form.to_dept,
        reason: form.reason,
        transferred_by: user?.name,
        transferred_by_id: user?.id,
        status: '완료',
      }]);

      // 입고 로그
      await supabase.from('inventory_logs').insert([{
        item_id: form.item_id,
        inventory_id: form.item_id,
        type: '이관',
        change_type: '이관출고',
        quantity: form.quantity,
        prev_quantity: maxQty,
        next_quantity: newQty,
        actor_name: user?.name,
        company: form.from_company || selectedItem?.company,
        notes: `→ ${form.to_company} ${form.to_dept || ''} (사유: ${form.reason || '없음'})`,
      }]);

      setShowModal(false);
      fetchInventory();
      fetchTransfers();
      alert('이관이 완료되었습니다.');
    } catch { alert('이관 처리 실패'); } finally { setSaving(false); }
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">부서간 재고 이관</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">법인·부서 간 재고를 이관하고 이력을 관리합니다.</p>
        </div>
        <button onClick={() => { setForm({ item_id: '', quantity: 1, from_company: '', from_dept: '', to_company: '', to_dept: '', reason: '' }); setShowModal(true); }}
          className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-sm font-bold shadow-sm hover:opacity-90">+ 이관 요청</button>
      </div>

      <div className="flex gap-1 bg-[var(--toss-gray-1)] rounded-[12px] p-1 w-fit">
        {[{ key: 'request', label: '이관 신청' }, { key: 'history', label: '이관 이력' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all ${activeTab === t.key ? 'bg-[var(--toss-card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'request' && (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-[var(--foreground)]">이관 신청서 작성</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 물품 *</label>
              <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                <option value="">물품 선택</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.item_name || i.name} (재고: {i.quantity ?? i.stock ?? 0}개)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 수량 *</label>
              <input type="number" value={form.quantity} min={1} max={maxQty} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
              {selectedItem && <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">현재 재고: {maxQty}개</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">출발 법인</label>
              <select value={form.from_company} onChange={e => setForm(f => ({ ...f, from_company: e.target.value }))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                <option value="">현재 위치</option>
                {companies.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 대상 법인 *</label>
              <select value={form.to_company} onChange={e => setForm(f => ({ ...f, to_company: e.target.value }))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                <option value="">선택</option>
                {companies.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 대상 부서</label>
              <input value={form.to_dept} onChange={e => setForm(f => ({ ...f, to_dept: e.target.value }))} placeholder="예: 원무팀"
                className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 사유</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="예: 부서 재배치"
                className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
            </div>
          </div>
          <button onClick={handleTransfer} disabled={saving} className="px-6 py-2.5 bg-[var(--toss-blue)] text-white rounded-[12px] text-sm font-bold disabled:opacity-50 hover:opacity-90">
            {saving ? '처리 중...' : '이관 실행'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-2">
          {transfers.length === 0 ? (
            <div className="text-center py-16 text-[var(--toss-gray-3)] font-bold text-sm">이관 이력이 없습니다.</div>
          ) : transfers.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{t.item_name}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">
                  {t.from_company} {t.from_department} → {t.to_company} {t.to_department} · {t.quantity}개 · {t.transferred_by}
                </p>
                {t.reason && <p className="text-[10px] text-[var(--toss-gray-3)]">사유: {t.reason}</p>}
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700">{t.status || '완료'}</span>
                <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{t.created_at?.slice(0, 10)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
