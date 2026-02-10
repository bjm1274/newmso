'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function LaborCostTrend({ selectedCo }: any) {
  const [months, setMonths] = useState<{ ym: string; total: number; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const base = new Date();
      const list: { ym: string; total: number; count: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const ym = d.toISOString().slice(0, 7);
        const { data } = await supabase.from('payroll_records').select('net_pay').eq('year_month', ym).not('record_type', 'eq', 'interim');
        let rows = data || [];
        if (selectedCo && selectedCo !== '전체') {
          const { data: r2 } = await supabase.from('payroll_records').select('*, staff_members(company)').eq('year_month', ym);
          rows = (r2 || []).filter((r: any) => r.staff_members?.company === selectedCo);
        }
        list.push({
          ym,
          total: rows.reduce((s: number, r: any) => s + (r.net_pay || 0), 0),
          count: rows.length,
        });
      }
      setMonths(list.reverse());
    })();
  }, [selectedCo]);

  const maxVal = Math.max(...months.map((m) => m.total), 1);

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-violet-600 uppercase tracking-widest mb-4">인건비 추이 분석</h3>
      <div className="space-y-3">
        {months.map((m) => (
          <div key={m.ym} className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-500 w-16">{m.ym}</span>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(m.total / maxVal) * 100}%` }} />
            </div>
            <span className="text-[10px] font-black w-24 text-right">{(m.total / 10000).toFixed(0)}만</span>
          </div>
        ))}
      </div>
    </div>
  );
}
