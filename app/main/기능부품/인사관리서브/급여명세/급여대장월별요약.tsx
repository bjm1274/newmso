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
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <h3 className="text-sm font-black text-gray-800 mb-4">📊 월별 급여 요약</h3>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="p-2 border rounded-xl text-xs font-bold" />
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">로딩 중...</p>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span className="font-bold text-gray-500">정산 인원</span>
            <span className="font-black text-gray-800">{records.length}명</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-bold text-gray-500">과세 총액</span>
            <span className="font-black">{totalTaxable.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-bold text-gray-500">공제 합계</span>
            <span className="font-black text-orange-600">-{totalDeduction.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
            <span className="font-bold text-gray-600">실지급 총액</span>
            <span className="font-black text-blue-600">₩{totalNet.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
