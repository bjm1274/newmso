'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayrollMonthlySummary({ selectedCo }: any) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('payroll_records')
        .select('*, staff_members(name, company, department, position)')
        .eq('year_month', yearMonth);
      let list = data || [];
      if (selectedCo && selectedCo !== '전체') {
        list = list.filter((r: any) => r.staff_members?.company === selectedCo);
      }
      setRecords(list);
      setLoading(false);
    };
    fetchRecords();
  }, [yearMonth, selectedCo]);

  const totalNet = records.reduce((s, r) => s + (Number(r.net_pay) || 0), 0);
  const totalTaxable = records.reduce((s, r) => s + (Number(r.total_taxable) || 0), 0);
  const totalDeduction = records.reduce((s, r) => s + (Number(r.total_deduction) || 0), 0);

  return (
    <div className="bg-[var(--toss-card)] rounded-lg border border-[var(--toss-border)] p-4 shadow-sm">
      <div className="pb-3 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">월별 급여 요약</h3>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium w-full" />
      </div>
      {loading ? (
        <p className="text-xs text-[var(--toss-gray-3)]">로딩 중...</p>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-medium text-[var(--toss-gray-3)]">정산 인원</span>
            <span className="font-semibold text-[var(--foreground)]">{records.length}명</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-medium text-[var(--toss-gray-3)]">과세 총액</span>
            <span className="font-medium text-[var(--foreground)]">{totalTaxable.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-medium text-[var(--toss-gray-3)]">공제 합계</span>
            <span className="font-medium text-red-600">-{totalDeduction.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-[var(--toss-border)]">
            <span className="font-medium text-[var(--toss-gray-4)]">실지급 총액</span>
            <span className="font-semibold text-[var(--toss-blue)]">₩{totalNet.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
