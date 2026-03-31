'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const PENSION_TYPES = ['DC (확정기여형)', 'DB (확정급여형)', '미가입'];
const DC_RATE = 0.0833; // 월 임금의 1/12 (연 8.33%)

type StaffPension = {
  id: string;
  staff_id: string;
  staff_name: string;
  pension_type: string;
  joined_date: string;
  account_number: string;
  fund_name: string;
  monthly_contribution: number;
  total_accumulated: number;
  memo: string;
};

export default function RetirementPensionManager({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [pensions, setPensions] = useState<StaffPension[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ staff_id: '', pension_type: PENSION_TYPES[0], joined_date: '', account_number: '', fund_name: '', monthly_contribution: 0, total_accumulated: 0, memo: '' });
  const [filterType, setFilterType] = useState('전체');

  const filteredStaffs = staffs.filter(s => selectedCo === '전체' || s.company === selectedCo);

  const fetchPensions = useCallback(async () => {
    const { data } = await supabase.from('retirement_pensions').select('*');
    setPensions(data || []);
  }, []);

  useEffect(() => { fetchPensions(); }, [fetchPensions]);

  const enriched = filteredStaffs.map(s => {
    const pension = pensions.find(p => String(p.staff_id) === String(s.id));
    const base = s.base_salary || s.base || 3000000;
    const autoDC = Math.round(base * DC_RATE);
    const yearsWorked = s.join_date ? Math.floor((Date.now() - new Date(s.join_date).getTime()) / (1000 * 60 * 60 * 24 * 365)) : 0;
    return { ...s, pension, autoDC, yearsWorked };
  });

  const filtered = enriched.filter(s => {
    if (filterType === '전체') return true;
    const type = s.pension?.pension_type || '미가입';
    return type === filterType;
  });

  const totalDC = enriched.filter(s => s.pension?.pension_type?.startsWith('DC')).reduce((sum, s) => sum + (s.pension?.monthly_contribution || s.autoDC), 0);
  const totalDB = enriched.filter(s => s.pension?.pension_type?.startsWith('DB')).reduce((sum, s) => sum + (s.pension?.monthly_contribution || 0), 0);
  const unregistered = enriched.filter(s => !s.pension || s.pension.pension_type === '미가입').length;

  const openAdd = () => {
    setEditId(null);
    setForm({ staff_id: filteredStaffs[0]?.id || '', pension_type: PENSION_TYPES[0], joined_date: '', account_number: '', fund_name: '', monthly_contribution: 0, total_accumulated: 0, memo: '' });
    setShowModal(true);
  };

  const openEdit = (s: any) => {
    if (!s.pension) { openAdd(); setForm(f => ({ ...f, staff_id: s.id })); return; }
    setEditId(s.pension.id);
    setForm({ staff_id: s.pension.staff_id, pension_type: s.pension.pension_type, joined_date: s.pension.joined_date || '', account_number: s.pension.account_number || '', fund_name: s.pension.fund_name || '', monthly_contribution: s.pension.monthly_contribution || 0, total_accumulated: s.pension.total_accumulated || 0, memo: s.pension.memo || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.staff_id) return toast('직원을 선택하세요.', 'warning');
    setSaving(true);
    try {
      const staff = filteredStaffs.find(s => String(s.id) === String(form.staff_id));
      const payload = { ...form, staff_name: staff?.name || '' };
      if (editId) {
        await supabase.from('retirement_pensions').update(payload).eq('id', editId);
      } else {
        await supabase.from('retirement_pensions').insert([payload]);
      }
      setShowModal(false);
      fetchPensions();
    } catch { toast('저장 실패', 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="p-4 md:p-4 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">퇴직연금 (DC/DB) 관리</h2>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90">+ 등록</button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'DC형 월 기여금', value: totalDC.toLocaleString() + '원', color: 'text-blue-600' },
          { label: 'DB형 월 납입금', value: totalDB.toLocaleString() + '원', color: 'text-purple-600' },
          { label: '미가입 직원', value: unregistered + '명', color: 'text-red-500' },
          { label: 'DC 기여율', value: `${(DC_RATE * 100).toFixed(2)}%`, color: 'text-green-600' },
        ].map(c => (
          <div key={c.label} className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] text-center">
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        {['전체', ...PENSION_TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${filterType === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{t}</button>
        ))}
      </div>

      {/* 목록 */}
      <div className="space-y-2">
        {filtered.map(s => {
          const type = s.pension?.pension_type || '미가입';
          const contribution = s.pension?.monthly_contribution || (type.startsWith('DC') ? s.autoDC : 0);
          return (
            <div key={s.id} className={`flex items-center justify-between p-4 bg-[var(--card)] border rounded-[var(--radius-lg)] shadow-sm ${!s.pension || type === '미가입' ? 'border-orange-500/20' : 'border-[var(--border)]'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-12 rounded-full ${type.startsWith('DC') ? 'bg-blue-400' : type.startsWith('DB') ? 'bg-purple-400' : 'bg-gray-300'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[var(--foreground)]">{s.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${type.startsWith('DC') ? 'bg-blue-500/20 text-blue-700' : type.startsWith('DB') ? 'bg-purple-500/20 text-purple-700' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>{type}</span>
                  </div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">{s.position} · {s.yearsWorked}년 근속</p>
                  {s.pension?.fund_name && <p className="text-[10px] text-[var(--toss-gray-3)]">{s.pension.fund_name}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--accent)]">{contribution.toLocaleString()}원/월</p>
                {s.pension?.total_accumulated ? <p className="text-[10px] text-[var(--toss-gray-3)]">적립: {s.pension.total_accumulated.toLocaleString()}원</p> : null}
                {type.startsWith('DC') && <p className="text-[9px] text-[var(--toss-gray-3)]">기준: 월급의 {(DC_RATE * 100).toFixed(2)}%</p>}
                <button onClick={() => openEdit(s)} className="mt-1 px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-600 font-bold rounded-md hover:bg-blue-500/20">
                  {s.pension ? '편집' : '등록'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">퇴직연금 정보 {editId ? '편집' : '등록'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">직원</label>
                <select value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none">
                  {filteredStaffs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">연금 유형</label>
                <select value={form.pension_type} onChange={e => setForm(f => ({ ...f, pension_type: e.target.value }))} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none">
                  {PENSION_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {[
                { label: '가입일', key: 'joined_date', type: 'date' },
                { label: '계좌번호', key: 'account_number', type: 'text', placeholder: '운용사 계좌번호' },
                { label: '운용사/펀드명', key: 'fund_name', type: 'text', placeholder: '예: 삼성생명 DC플랜' },
                { label: '월 기여금 (원)', key: 'monthly_contribution', type: 'number', placeholder: '0' },
                { label: '누적 적립금 (원)', key: 'total_accumulated', type: 'number', placeholder: '0' },
                { label: '메모', key: 'memo', type: 'text', placeholder: '' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                    placeholder={placeholder} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
