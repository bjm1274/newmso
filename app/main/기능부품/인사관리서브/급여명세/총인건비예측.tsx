'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

export default function TotalLaborCostForecast({ staffs, selectedCo, user }: Props) {
  const [monthlyData, setMonthlyData] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  useEffect(() => {
    const fetch12Months = async () => {
      setLoading(true);
      try {
        const months: string[] = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const { data, error } = await supabase
          .from('payroll_records')
          .select('year_month, gross_pay, staff_id')
          .in('year_month', months);
        if (error) throw error;
        const records = data || [];
        const result = months.map(m => {
          const monthRecords = records.filter((r: any) => {
            if (r.year_month !== m) return false;
            if (selectedCo === '전체') return true;
            const staff = staffs.find((s: any) => String(s.id) === String(r.staff_id));
            return staff?.company === selectedCo;
          });
          const total = monthRecords.reduce((sum: number, r: any) => sum + (r.gross_pay || 0), 0);
          return { month: m, total };
        });
        setMonthlyData(result);
      } catch {
        setMonthlyData([]);
      } finally {
        setLoading(false);
      }
    };
    fetch12Months();
  }, [selectedCo]);

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const validData = monthlyData.filter(d => d.total > 0);
  const avg = validData.length > 0 ? validData.reduce((s, d) => s + d.total, 0) / validData.length : 0;

  const last3 = monthlyData.slice(-3).filter(d => d.total > 0);
  const forecastBase = last3.length > 0 ? last3.reduce((s, d) => s + d.total, 0) / last3.length : avg;

  const now = new Date();
  const forecasts = [1, 2, 3].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      total: forecastBase,
      isForecast: true,
    };
  });

  const allData = [...monthlyData, ...forecasts];
  const maxVal = Math.max(...allData.map(d => d.total), 1);

  const prevMonth = monthlyData[monthlyData.length - 2];
  const currMonth = monthlyData[monthlyData.length - 1];
  const changeRate = prevMonth && prevMonth.total > 0 && currMonth
    ? ((currMonth.total - prevMonth.total) / prevMonth.total * 100).toFixed(1)
    : null;

  const annualEstimate = forecastBase * 12;
  const headcount = filtered.length;
  const perPerson = headcount > 0 ? forecastBase / headcount : 0;

  return (
    <div className="p-4 md:p-4 space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">연간 총인건비 예측</h2>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">월 평균 인건비</p>
          <p className="text-sm font-bold text-[var(--foreground)] mt-1">{fmt(avg)}원</p>
        </div>
        <div className="p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">전월 대비 증감</p>
          <p className={`text-sm font-bold mt-1 ${changeRate === null ? 'text-[var(--toss-gray-3)]' : Number(changeRate) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
            {changeRate !== null ? `${Number(changeRate) >= 0 ? '+' : ''}${changeRate}%` : '-'}
          </p>
        </div>
        <div className="p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">연간 예상 총액</p>
          <p className="text-sm font-bold text-[var(--foreground)] mt-1">{fmt(annualEstimate)}원</p>
        </div>
        <div className="p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">1인당 평균 ({headcount}명)</p>
          <p className="text-sm font-bold text-[var(--foreground)] mt-1">{fmt(perPerson)}원</p>
        </div>
      </div>

      {/* 바 차트 */}
      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
        <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">월별 인건비 추이 (파란색: 예측)</h3>
          <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
            {allData.map((d, i) => {
              const height = maxVal > 0 ? Math.max((d.total / maxVal) * 100, 2) : 2;
              const isForecast = (d as any).isForecast;
              return (
                <div key={i} className="flex flex-col items-center gap-1 min-w-[40px]">
                  <span className="text-[8px] text-[var(--toss-gray-3)] font-bold">{fmt(d.total / 10000)}만</span>
                  <div
                    style={{ height: `${height}%` }}
                    className={`w-7 rounded-t-[4px] transition-all ${isForecast ? 'bg-[var(--accent)]/40 border border-[var(--accent)] border-dashed' : d.total > 0 ? 'bg-[var(--accent)]' : 'bg-[var(--toss-gray-2)]'}`}
                  />
                  <span className="text-[8px] text-[var(--toss-gray-3)] font-bold rotate-[-30deg] origin-top-right whitespace-nowrap">
                    {d.month.slice(5)}월{isForecast ? '(예)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
