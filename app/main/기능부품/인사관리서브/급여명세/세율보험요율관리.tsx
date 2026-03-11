'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANY_FILTER = '전체';

export default function TaxInsuranceRatesPanel({ companyName }: { companyName?: string }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    effective_year: new Date().getFullYear(),
    national_pension_rate: 0.045,
    health_insurance_rate: 0.03545,
    long_term_care_rate: 0.00459,
    employment_insurance_rate: 0.009,
  });
  const [saving, setSaving] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tax_insurance_rates')
      .select('*')
      .eq('company_name', companyName || COMPANY_FILTER)
      .order('effective_year', { ascending: false })
      .limit(20);
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, [companyName]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      effective_year: new Date().getFullYear(),
      national_pension_rate: 0.045,
      health_insurance_rate: 0.03545,
      long_term_care_rate: 0.00459,
      employment_insurance_rate: 0.009,
    });
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      effective_year: r.effective_year,
      national_pension_rate: Number(r.national_pension_rate) || 0.045,
      health_insurance_rate: Number(r.health_insurance_rate) || 0.03545,
      long_term_care_rate: Number(r.long_term_care_rate) || 0.00459,
      employment_insurance_rate: Number(r.employment_insurance_rate) || 0.009,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        effective_year: form.effective_year,
        company_name: companyName || COMPANY_FILTER,
        national_pension_rate: form.national_pension_rate,
        health_insurance_rate: form.health_insurance_rate,
        long_term_care_rate: form.long_term_care_rate,
        employment_insurance_rate: form.employment_insurance_rate,
      };
      const { error } = await supabase
        .from('tax_insurance_rates')
        .upsert(payload, { onConflict: 'effective_year,company_name' });
      if (error) throw error;
      alert(editing ? '요율이 수정되었습니다.' : '연도별 요율이 추가되었습니다.');
      setEditing(null);
      fetchList();
    } catch (e: any) {
      alert('저장 실패: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const toPercent = (v: number) => (v * 100).toFixed(2);

  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
      <div className="flex justify-between items-center pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">세율·보험요율 (연도별)</h3>
        <button onClick={openAdd} className="px-2.5 py-1.5 bg-[var(--toss-blue)] text-white text-xs font-medium rounded-[12px] hover:opacity-90">
          + 연도 추가
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--toss-gray-3)]">로딩 중...</p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {list.map((r) => (
              <div key={r.id} className="p-3 bg-[var(--page-bg)] rounded-[12px] border border-[var(--toss-border)] flex justify-between items-start gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{r.effective_year}년</p>
                  <div className="grid grid-cols-2 gap-1 text-[11px] mt-1.5 text-[var(--toss-gray-4)]">
                    <span>국민연금 {toPercent(Number(r.national_pension_rate))}%</span>
                    <span>건강 {toPercent(Number(r.health_insurance_rate))}%</span>
                    <span>장기요양 {toPercent(Number(r.long_term_care_rate))}%</span>
                    <span>고용 {toPercent(Number(r.employment_insurance_rate))}%</span>
                  </div>
                </div>
                <button onClick={() => openEdit(r)} className="text-xs font-medium text-[var(--toss-blue)] hover:opacity-80 shrink-0">수정</button>
              </div>
            ))}
            {list.length === 0 && !editing && null}
          </div>

          <div className="border-t border-[var(--toss-border)] pt-4 space-y-3">
            <p className="text-xs font-medium text-[var(--toss-gray-4)]">{editing ? `${editing.effective_year}년 수정` : '연도별 요율 추가/수정'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">적용 연도</label>
                <input type="number" min={2020} max={2030} value={form.effective_year} onChange={(e) => setForm({ ...form, effective_year: parseInt(e.target.value) || new Date().getFullYear() })} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">국민연금 (%)</label>
                <input type="number" step={0.001} min={0} max={20} value={(form.national_pension_rate * 100).toFixed(2)} onChange={(e) => setForm({ ...form, national_pension_rate: (parseFloat(e.target.value) || 0) / 100 })} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">건강보험 (%)</label>
                <input type="number" step={0.001} min={0} max={20} value={(form.health_insurance_rate * 100).toFixed(2)} onChange={(e) => setForm({ ...form, health_insurance_rate: (parseFloat(e.target.value) || 0) / 100 })} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">장기요양 (%)</label>
                <input type="number" step={0.001} min={0} max={20} value={(form.long_term_care_rate * 100).toFixed(2)} onChange={(e) => setForm({ ...form, long_term_care_rate: (parseFloat(e.target.value) || 0) / 100 })} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">고용보험 (%)</label>
                <input type="number" step={0.001} min={0} max={20} value={(form.employment_insurance_rate * 100).toFixed(2)} onChange={(e) => setForm({ ...form, employment_insurance_rate: (parseFloat(e.target.value) || 0) / 100 })} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-3 py-2 bg-[var(--toss-blue)] text-white text-xs font-medium rounded-[12px] hover:opacity-90 disabled:opacity-50">
                {saving ? '저장 중...' : editing ? '수정 저장' : '연도 추가'}
              </button>
              {editing && <button onClick={() => setEditing(null)} className="px-3 py-2 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-xs font-medium rounded-[12px] hover:opacity-90">취소</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
