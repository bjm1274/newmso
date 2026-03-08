'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

const TAX_FREE_LIMITS: Record<string, { label: string; limit: number }> = {
  meal: { label: '식대', limit: 200000 },
  car: { label: '자가운전보조금', limit: 200000 },
  research: { label: '연구활동비', limit: 200000 },
  childcare: { label: '출산·보육수당', limit: 100000 },
  night: { label: '야간근로수당(생산직)', limit: 240000 },
  overseas: { label: '국외근로소득(비파견)', limit: 1000000 },
};

export default function TaxFreeLimitChecker({ staffs, selectedCo, user }: Props) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyExceeded, setOnlyExceeded] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      try {
        const staffIds = filtered.map((s: any) => s.id);
        if (staffIds.length === 0) { setRecords([]); setLoading(false); return; }
        const { data, error } = await supabase
          .from('payroll_records')
          .select('*')
          .eq('year_month', yearMonth)
          .in('staff_id', staffIds);
        if (error) throw error;
        setRecords(data || []);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [yearMonth, selectedCo]);

  const getAmounts = (record: any) => {
    const meta = record?.meta_data || {};
    return {
      meal: meta.meal_allowance || meta.식대 || 0,
      car: meta.car_allowance || meta.자가운전보조금 || 0,
      research: meta.research_allowance || meta.연구활동비 || 0,
      childcare: meta.childcare_allowance || meta.보육수당 || 0,
      night: meta.night_allowance || meta.야간근로수당 || 0,
      overseas: meta.overseas_income || meta.국외근로소득 || 0,
    };
  };

  const rows = filtered.map((staff: any) => {
    const record = records.find((r: any) => String(r.staff_id) === String(staff.id));
    const amounts = record ? getAmounts(record) : { meal: 0, car: 0, research: 0, childcare: 0, night: 0, overseas: 0 };
    const exceeded = Object.entries(TAX_FREE_LIMITS).some(([key, { limit }]) => (amounts as any)[key] > limit);
    return { staff, amounts, exceeded };
  });

  const displayRows = onlyExceeded ? rows.filter(r => r.exceeded) : rows;

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">비과세 한도 초과 경고</h2>
        <p className="text-xs text-[var(--toss-gray-3)] mt-1">2024년 기준 비과세 한도를 초과한 항목을 직원별로 표시합니다.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div>
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">급여 연월</label>
          <input
            type="month"
            value={yearMonth}
            onChange={e => setYearMonth(e.target.value)}
            className="p-2 rounded-[8px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={onlyExceeded}
            onChange={e => setOnlyExceeded(e.target.checked)}
            className="accent-[var(--toss-blue)]"
          />
          <span className="text-xs font-bold text-[var(--toss-gray-4)]">초과자만 보기</span>
        </label>
      </div>

      {/* 비과세 한도 안내 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(TAX_FREE_LIMITS).map(([key, { label, limit }]) => (
          <div key={key} className="p-2.5 bg-[var(--toss-gray-1)] rounded-[8px]">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">{label}</p>
            <p className="text-xs font-bold text-[var(--foreground)]">월 {fmt(limit)}원</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--toss-gray-1)]">
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)] border border-[var(--toss-border)]">직원명</th>
                {Object.values(TAX_FREE_LIMITS).map(({ label }) => (
                  <th key={label} className="p-2 text-center font-bold text-[var(--toss-gray-4)] border border-[var(--toss-border)] whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[var(--toss-gray-3)]">데이터가 없습니다.</td>
                </tr>
              ) : displayRows.map(({ staff, amounts }) => (
                <tr key={staff.id} className="hover:bg-[var(--toss-gray-1)]/50">
                  <td className="p-2 font-bold border border-[var(--toss-border)]">{staff.name}</td>
                  {Object.entries(TAX_FREE_LIMITS).map(([key, { limit }]) => {
                    const val = (amounts as any)[key] || 0;
                    const over = val > limit;
                    return (
                      <td key={key} className={`p-2 text-right border border-[var(--toss-border)] ${over ? 'bg-red-50 text-red-600 font-bold' : 'text-[var(--foreground)]'}`}>
                        <div>{fmt(val)}</div>
                        {over && <div className="text-[9px] text-red-500">초과 {fmt(val - limit)}원</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
