'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

export default function GrossNetComparison({ staffs, selectedCo, user }: Props) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  useEffect(() => {
    const fetchData = async () => {
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
    fetchData();
  }, [yearMonth, selectedCo]);

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const rows = filtered.map((staff: any) => {
    const rec = records.find((r: any) => String(r.staff_id) === String(staff.id));
    const gross = rec?.gross_pay || 0;
    const deduction = rec?.total_deduction || 0;
    const net = rec?.net_pay || gross - deduction;
    const deductionRate = gross > 0 ? ((deduction / gross) * 100).toFixed(1) : '0.0';
    const meta = rec?.meta_data || {};
    const breakdown = {
      pension: meta.pension || meta.국민연금 || Math.round(gross * 0.045),
      health: meta.health_insurance || meta.건강보험 || Math.round(gross * 0.03545),
      ltcare: meta.long_term_care || meta.장기요양 || Math.round(gross * 0.00453),
      employment: meta.employment_insurance || meta.고용보험 || Math.round(gross * 0.009),
      incomeTax: meta.income_tax || meta.소득세 || 0,
      localTax: meta.local_income_tax || meta.지방소득세 || 0,
    };
    return { staff, gross, deduction, net, deductionRate, breakdown };
  });

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalRate = totalGross > 0 ? ((totalDeduction / totalGross) * 100).toFixed(1) : '0.0';

  // 실수령액 구간 분포
  const buckets: Record<string, number> = {};
  rows.forEach(r => {
    if (r.net === 0) return;
    const bucket = `${Math.floor(r.net / 1000000)}백만`;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  });
  const maxBucket = Math.max(...Object.values(buckets), 1);

  const handleCsvDownload = () => {
    const header = ['직원명', '총지급액', '총공제액', '실수령액', '공제율'];
    const body = rows.map(r => [r.staff.name, r.gross, r.deduction, r.net, `${r.deductionRate}%`]);
    const csv = [header, ...body].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `세전세후비교_${yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">세전/세후 비교 분석</h2>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="month"
            value={yearMonth}
            onChange={e => setYearMonth(e.target.value)}
            className="p-2 rounded-[8px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold"
          />
          <button onClick={handleCsvDownload} className="px-4 py-2 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-[8px] hover:opacity-90">CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[12px] border border-[var(--toss-border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--toss-gray-1)]">
                  <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">직원명</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">총지급액</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">국민연금</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">건강보험</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">장기요양</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">고용보험</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">소득세</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">총공제액</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">실수령액</th>
                  <th className="p-2 text-right font-bold text-[var(--toss-gray-4)]">공제율</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={10} className="p-6 text-center text-[var(--toss-gray-3)]">데이터가 없습니다.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.staff.id} className="border-t border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]/50">
                    <td className="p-2 font-bold">{r.staff.name}</td>
                    <td className="p-2 text-right">{fmt(r.gross)}</td>
                    <td className="p-2 text-right text-[var(--toss-gray-4)]">{fmt(r.breakdown.pension)}</td>
                    <td className="p-2 text-right text-[var(--toss-gray-4)]">{fmt(r.breakdown.health)}</td>
                    <td className="p-2 text-right text-[var(--toss-gray-4)]">{fmt(r.breakdown.ltcare)}</td>
                    <td className="p-2 text-right text-[var(--toss-gray-4)]">{fmt(r.breakdown.employment)}</td>
                    <td className="p-2 text-right text-[var(--toss-gray-4)]">{fmt(r.breakdown.incomeTax)}</td>
                    <td className="p-2 text-right text-red-600 font-bold">{fmt(r.deduction)}</td>
                    <td className="p-2 text-right text-[var(--toss-blue)] font-bold">{fmt(r.net)}</td>
                    <td className="p-2 text-right">{r.deductionRate}%</td>
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr className="border-t-2 border-[var(--toss-blue)] bg-[var(--toss-blue)]/5 font-bold">
                    <td className="p-2 font-bold text-[var(--toss-blue)]">전체 합계</td>
                    <td className="p-2 text-right">{fmt(totalGross)}</td>
                    <td className="p-2" colSpan={4} />
                    <td className="p-2" />
                    <td className="p-2 text-right text-red-600">{fmt(totalDeduction)}</td>
                    <td className="p-2 text-right text-[var(--toss-blue)]">{fmt(totalNet)}</td>
                    <td className="p-2 text-right">{totalRate}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 실수령액 구간 분포 차트 */}
          {Object.keys(buckets).length > 0 && (
            <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] p-4">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">실수령액 구간별 직원 수</h3>
              <div className="space-y-2">
                {Object.entries(buckets).sort().map(([label, count]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--toss-gray-4)] w-16 shrink-0">{label}원대</span>
                    <div className="flex-1 bg-[var(--toss-gray-1)] rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-[var(--toss-blue)] rounded-full transition-all"
                        style={{ width: `${(count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[var(--toss-gray-4)] w-8 text-right">{count}명</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
