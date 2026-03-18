'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const EMPTY_FORM = {
  name: '', contact_name: '', phone: '', email: '', address: '',
  business_number: '', category: '', contract_start: '', contract_end: '',
  payment_terms: '', notes: ''
};

export default function SupplierManagement({ user }: { user: any }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const openAdd = () => { setEditTarget(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (s: any) => {
    setEditTarget(s);
    setForm({
      name: s.name || '', contact_name: s.contact_name || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', business_number: s.business_number || '',
      category: s.category || '', contract_start: s.contract_start || '',
      contract_end: s.contract_end || '', payment_terms: s.payment_terms || '', notes: s.notes || ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('거래처명을 입력하세요.');
    setSaving(true);
    try {
      if (editTarget) {
        await supabase.from('suppliers').update(form).eq('id', editTarget.id);
      } else {
        await supabase.from('suppliers').insert([{ ...form, created_by: user?.id }]);
      }
      setShowModal(false);
      fetchSuppliers();
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`[${name}] 거래처를 삭제하시겠습니까?`)) return;
    await supabase.from('suppliers').delete().eq('id', id);
    fetchSuppliers();
  };

  const filtered = suppliers.filter(s =>
    !search || s.name?.includes(search) || s.contact_name?.includes(search) ||
    s.phone?.includes(search) || s.category?.includes(search)
  );

  const today = new Date().toISOString().split('T')[0];
  const isExpired = (s: any) => s.contract_end && s.contract_end < today;
  const isNearExpiry = (s: any) => {
    if (!s.contract_end || isExpired(s)) return false;
    const diff = (new Date(s.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  };

  const F = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: keyof typeof EMPTY_FORM; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
        placeholder={placeholder}
        data-testid={`supplier-field-${String(k).replace(/_/g, '-')}`}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-medium bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
      />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="supplier-management-view">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="거래처명·담당자·연락처 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="supplier-search-input"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
          />
          <button onClick={fetchSuppliers} className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-xs font-semibold hover:bg-[var(--border)]">🔄</button>
        </div>
        <button
          onClick={openAdd}
          data-testid="supplier-add-button"
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-semibold shadow-sm hover:opacity-90 transition-all"
        >
          + 거래처 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '전체 거래처', value: suppliers.length, color: 'text-[var(--accent)]' },
          { label: '계약 만료 임박', value: suppliers.filter(isNearExpiry).length, color: 'text-orange-500' },
          { label: '계약 만료', value: suppliers.filter(isExpired).length, color: 'text-red-500' },
          { label: '분류 수', value: new Set(suppliers.map(s => s.category).filter(Boolean)).size, color: 'text-emerald-600' },
        ].map((c, i) => (
          <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-center shadow-sm">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase mb-0.5">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 목록 */}
      <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-[var(--muted)]/60 border-b border-[var(--border)]">
                {['거래처명', '분류', '담당자/연락처', '결제조건', '계약기간', '상태', '관리'].map(h => (
                  <th key={h} className="px-4 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--toss-gray-3)] font-bold text-sm">데이터 로드 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--toss-gray-3)] font-bold text-sm">등록된 거래처가 없습니다.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-[var(--toss-blue-light)]/30 transition-colors group" data-testid={`supplier-row-${s.id}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{s.name}</p>
                    {s.business_number && <p className="text-[10px] text-[var(--toss-gray-3)]">사업자: {s.business_number}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-[var(--radius-md)] text-[10px] font-semibold">{s.category || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-[var(--foreground)]">{s.contact_name || '-'}</p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">{s.phone || s.email || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--toss-gray-4)]">{s.payment_terms || '-'}</td>
                  <td className="px-4 py-3 text-[11px]">
                    {s.contract_start && <p className="text-[var(--toss-gray-4)]">{s.contract_start}</p>}
                    {s.contract_end && <p className={isExpired(s) ? 'text-red-500 font-bold' : isNearExpiry(s) ? 'text-orange-500 font-bold' : 'text-[var(--toss-gray-4)]'}>~ {s.contract_end}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {isExpired(s) ? (
                      <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-[var(--radius-md)] text-[10px] font-bold">계약만료</span>
                    ) : isNearExpiry(s) ? (
                      <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-[var(--radius-md)] text-[10px] font-bold">만료임박</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-[var(--radius-md)] text-[10px] font-bold">정상</span>
                    )}
                  </td>
                  <td className="px-4 py-3 space-x-1">
                    <button data-testid={`supplier-edit-${s.id}`} onClick={() => openEdit(s)} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[10px] font-semibold rounded-md">수정</button>
                    <button data-testid={`supplier-delete-${s.id}`} onClick={() => handleDelete(s.id, s.name)} className="px-2 py-1 bg-red-50 text-red-500 text-[10px] font-semibold rounded-md">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="supplier-modal">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <h3 className="text-base font-bold text-[var(--foreground)]">{editTarget ? '거래처 수정' : '거래처 등록'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-[var(--toss-gray-3)]">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><F label="거래처명 *" k="name" placeholder="(주)예시거래처" /></div>
                <F label="분류" k="category" placeholder="의료기기 / 소모품 / 의약품" />
                <F label="사업자번호" k="business_number" placeholder="000-00-00000" />
                <F label="담당자" k="contact_name" />
                <F label="연락처" k="phone" type="tel" placeholder="010-0000-0000" />
                <div className="col-span-2"><F label="이메일" k="email" type="email" /></div>
                <div className="col-span-2"><F label="주소" k="address" /></div>
                <F label="계약 시작일" k="contract_start" type="date" />
                <F label="계약 만료일" k="contract_end" type="date" />
                <div className="col-span-2"><F label="결제 조건" k="payment_terms" placeholder="예: 월말 정산 30일" /></div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">메모</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    data-testid="supplier-field-notes"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} data-testid="supplier-save-button" className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
