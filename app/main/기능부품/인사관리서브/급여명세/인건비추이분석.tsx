'use client';
import { useState, useEffect, useMemo } from 'react';
import { filterNonInterimPayrollRecords } from '@/lib/payroll-records';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/app/main/contexts/AppDataContext';

export default function LaborCostTrend({ selectedCo }: Record<string, unknown>) {
  const [months, setMonths] = useState<{ ym: string; total: number; count: number }[]>([]);
  const { data: appData } = useAppData();

  // staffs[]를 AppDataContext에서 가져와 month별 fetch에서 중복 staff_members 조회 12회 제거.
  // staff 변경 시 자동 재계산.
  const staffCompanyMap = useMemo(
    () => Object.fromEntries(appData.staffs.map((s) => [String(s.id), s.company])),
    [appData.staffs],
  );

  useEffect(() => {
    (async () => {
      const base = new Date();
      const list: { ym: string; total: number; count: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const ym = d.toISOString().slice(0, 7);
        const { data } = await supabase
          .from('payroll_records')
          .select('staff_id, net_pay, record_type')
          .eq('year_month', ym);
        let rows = filterNonInterimPayrollRecords((data || []) as any[]);
        if (selectedCo && selectedCo !== '전체') {
          rows = rows.filter((r: any) => staffCompanyMap[String(r.staff_id)] === selectedCo);
        }
        list.push({
          ym,
          total: rows.reduce((s: number, r: any) => s + (r.net_pay || 0), 0),
          count: rows.length,
        });
      }
      setMonths(list.reverse());
    })();
  }, [selectedCo, staffCompanyMap]);

  const maxVal = Math.max(...months.map((m) => m.total), 1);

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">인건비 추이</h3>
      </div>
      <div className="space-y-2.5">
        {months.map((m) => (
          <div key={m.ym} className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--toss-gray-3)] w-14">{m.ym}</span>
            <div className="flex-1 h-5 bg-[var(--tab-bg)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${(m.total / maxVal) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-[var(--foreground)] w-16 text-right">{(m.total / 10000).toFixed(0)}만</span>
          </div>
        ))}
      </div>
    </div>
  );
}
