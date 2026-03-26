'use client';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_INCOME_TAX_BRACKET, hasOfficialMonthlyIncomeTaxTable } from '@/lib/use-tax-insurance-rates';

const COMPANY_FILTER = '전체';

function formatPercent(value: number) {
  return `${(value * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function stringifyBracket(value: any) {
  if (!Array.isArray(value) || value.length === 0) return '';
  return JSON.stringify(value, null, 2);
}

export default function TaxInsuranceRatesPanel({ companyName }: { companyName?: string }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    effective_year: new Date().getFullYear(),
    national_pension_rate: 0.0475,
    health_insurance_rate: 0.03545,
    long_term_care_rate: 0.00459,
    employment_insurance_rate: 0.009,
    income_tax_bracket_text: '',
    official_confirmed: false,
  });

  const scopedCompany = companyName || COMPANY_FILTER;

  const loadList = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tax_insurance_rates')
      .select('*')
      .eq('company_name', scopedCompany)
      .order('effective_year', { ascending: false })
      .limit(20);
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadList();
  }, [scopedCompany]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      effective_year: new Date().getFullYear(),
      national_pension_rate: 0.0475,
      health_insurance_rate: 0.03545,
      long_term_care_rate: 0.00459,
      employment_insurance_rate: 0.009,
      income_tax_bracket_text: '',
      official_confirmed: false,
    });
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      effective_year: Number(row.effective_year) || new Date().getFullYear(),
      national_pension_rate: Number(row.national_pension_rate) || 0.0475,
      health_insurance_rate: Number(row.health_insurance_rate) || 0.03545,
      long_term_care_rate: Number(row.long_term_care_rate) || 0.00459,
      employment_insurance_rate: Number(row.employment_insurance_rate) || 0.009,
      income_tax_bracket_text: stringifyBracket(row.income_tax_bracket),
      official_confirmed: Array.isArray(row.income_tax_bracket) && row.income_tax_bracket.length > 0 && row.income_tax_bracket.every((entry: any) => entry?.official === true),
    });
  };

  const bracketConfigured = useMemo(() => {
    try {
      if (!form.income_tax_bracket_text.trim()) return false;
      const parsed = JSON.parse(form.income_tax_bracket_text);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }, [form.income_tax_bracket_text]);

  const exactBracketConfigured = useMemo(() => {
    try {
      if (!form.income_tax_bracket_text.trim()) return false;
      const parsed = JSON.parse(form.income_tax_bracket_text);
      if (!Array.isArray(parsed)) return false;
      return hasOfficialMonthlyIncomeTaxTable(
        parsed.map((entry) => ({
          ...entry,
          official: form.official_confirmed,
        }))
      );
    } catch {
      return false;
    }
  }, [form.income_tax_bracket_text, form.official_confirmed]);

  const handleSave = async () => {
    let parsedBracket: any[] = [];
    if (form.income_tax_bracket_text.trim()) {
      try {
        const parsed = JSON.parse(form.income_tax_bracket_text);
        if (!Array.isArray(parsed)) {
          toast('소득세 세율표는 JSON 배열 형식이어야 합니다.');
          return;
        }
        parsedBracket = parsed.map((entry) => ({ ...entry, official: form.official_confirmed }));
      } catch (error: unknown) {
        toast(`소득세 세율표 JSON이 올바르지 않습니다: ${(error as Error)?.message || error}`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        effective_year: form.effective_year,
        company_name: scopedCompany,
        national_pension_rate: form.national_pension_rate,
        health_insurance_rate: form.health_insurance_rate,
        long_term_care_rate: form.long_term_care_rate,
        employment_insurance_rate: form.employment_insurance_rate,
        income_tax_bracket: parsedBracket,
      };
      const { error } = await supabase
        .from('tax_insurance_rates')
        .upsert(payload, { onConflict: 'effective_year,company_name' });
      if (error) throw error;
      toast(editing ? '세율/보험요율을 수정했습니다.' : '세율/보험요율을 저장했습니다.', 'success');
      resetForm();
      await loadList();
    } catch (error: unknown) {
      toast(`저장 실패: ${(error as Error)?.message || error}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">세율·보험요율 관리</h3>
          <p className="mt-1 text-xs text-[var(--toss-gray-4)]">
            급여 확정 전 해당 연도의 보험요율과 소득세 세율표를 먼저 설정하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
        >
          + 연도 추가
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--toss-gray-4)]">불러오는 중...</p>
      ) : (
        <>
          <div className="mb-4 space-y-2">
            {list.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{row.effective_year}년</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[var(--toss-gray-4)]">
                    <span>국민연금 {formatPercent(Number(row.national_pension_rate || 0))}</span>
                    <span>건강보험 {formatPercent(Number(row.health_insurance_rate || 0))}</span>
                    <span>장기요양 {formatPercent(Number(row.long_term_care_rate || 0))}</span>
                    <span>고용보험 {formatPercent(Number(row.employment_insurance_rate || 0))}</span>
                  </div>
                  <p className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                    소득세 세율표 {Array.isArray(row.income_tax_bracket) && row.income_tax_bracket.length > 0 ? '설정됨' : '미설정'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="shrink-0 text-xs font-medium text-[var(--accent)] hover:opacity-80"
                >
                  수정
                </button>
              </div>
            ))}
            {list.length === 0 && (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--page-bg)] px-3 py-4 text-xs text-[var(--toss-gray-4)]">
                등록된 세율/보험요율이 없습니다. 새 연도를 추가해 주세요.
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-medium text-[var(--toss-gray-4)]">
              {editing ? `${editing.effective_year}년 설정 수정` : '연도별 설정 추가'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-[var(--toss-gray-4)]">적용 연도</span>
                <input
                  type="number"
                  min={2020}
                  max={2035}
                  value={form.effective_year}
                  onChange={(e) => setForm((prev) => ({ ...prev, effective_year: parseInt(e.target.value, 10) || new Date().getFullYear() }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-[var(--toss-gray-4)]">국민연금 (%)</span>
                <input
                  type="number"
                  step={0.001}
                  min={0}
                  max={20}
                  value={(form.national_pension_rate * 100).toFixed(3)}
                  onChange={(e) => setForm((prev) => ({ ...prev, national_pension_rate: (parseFloat(e.target.value) || 0) / 100 }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-[var(--toss-gray-4)]">건강보험 (%)</span>
                <input
                  type="number"
                  step={0.001}
                  min={0}
                  max={20}
                  value={(form.health_insurance_rate * 100).toFixed(3)}
                  onChange={(e) => setForm((prev) => ({ ...prev, health_insurance_rate: (parseFloat(e.target.value) || 0) / 100 }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-[var(--toss-gray-4)]">장기요양 (%)</span>
                <input
                  type="number"
                  step={0.001}
                  min={0}
                  max={20}
                  value={(form.long_term_care_rate * 100).toFixed(3)}
                  onChange={(e) => setForm((prev) => ({ ...prev, long_term_care_rate: (parseFloat(e.target.value) || 0) / 100 }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-[var(--toss-gray-4)]">고용보험 (%)</span>
                <input
                  type="number"
                  step={0.001}
                  min={0}
                  max={20}
                  value={(form.employment_insurance_rate * 100).toFixed(3)}
                  onChange={(e) => setForm((prev) => ({ ...prev, employment_insurance_rate: (parseFloat(e.target.value) || 0) / 100 }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-[var(--toss-gray-4)]">소득세 세율표(JSON 배열)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        income_tax_bracket_text: JSON.stringify(
                          DEFAULT_INCOME_TAX_BRACKET.map((entry) => ({ ...entry, official: false })),
                          null,
                          2
                        ),
                        official_confirmed: false,
                      }))
                    }
                    className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--toss-gray-4)] hover:opacity-90"
                  >
                    기본 누진세율 불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, income_tax_bracket_text: '', official_confirmed: false }))}
                    className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--toss-gray-4)] hover:opacity-90"
                  >
                    비우기
                  </button>
                </div>
              </div>
              <textarea
                rows={10}
                value={form.income_tax_bracket_text}
                onChange={(e) => setForm((prev) => ({ ...prev, income_tax_bracket_text: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-xs leading-5 text-[var(--foreground)]"
                placeholder='[{"min":0,"max":14000000,"rate":0.06,"deduction":0}]'
              />
              <div className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
                <p>월 원천징수표 확인 상태: {exactBracketConfigured ? '확인 완료' : '미확인'}</p>
                <p>현재 상태: {bracketConfigured ? '세율표 입력됨' : '세율표 미입력'}</p>
                <label className="flex items-center gap-2 text-[11px] text-[var(--toss-gray-4)]">
                  <input
                    type="checkbox"
                    checked={form.official_confirmed}
                    onChange={(e) => setForm((prev) => ({ ...prev, official_confirmed: e.target.checked }))}
                  />
                  회사에서 사용할 세율표를 확인했고 이 값으로 급여 확정을 허용합니다.
                </label>
                <p>주의: 기본 누진세율은 참고용입니다. 확인 체크가 있어야 급여 확정 버튼이 다시 활성화됩니다.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? '저장 중...' : editing ? '수정 저장' : '연도 저장'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-xs font-medium text-[var(--toss-gray-4)] hover:opacity-90"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
