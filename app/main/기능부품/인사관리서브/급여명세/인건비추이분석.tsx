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
    <div className="border border-gray-200 p-5 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-4">
        <h3 className="text-sm font-semibold text-gray-800">인건비 추이</h3>
      </div>
      <div className="space-y-2.5">
        {months.map((m) => (
          <div key={m.ym} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 w-14">{m.ym}</span>
            <div className="flex-1 h-5 bg-[#eef2f7] rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(m.total / maxVal) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-16 text-right">{(m.total / 10000).toFixed(0)}만</span>
          </div>
        ))}
      </div>
    </div>
  );
}
