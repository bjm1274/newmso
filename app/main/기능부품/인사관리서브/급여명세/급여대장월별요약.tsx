'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayrollMonthlySummary({ selectedCo }: Record<string, unknown>) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      // FK join 대신 payroll_records만 조회 (PostgREST 관계 캐시 오류 방지)
      const { data: prData, error } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('year_month', yearMonth);
      if (error) {
        console.warn('payroll_records 조회 실패:', error.message);
        setRecords([]);
        setLoading(false);
        return;
      }
      let list = prData || [];
      // selectedCo 필터링: staff_id 기준으로 staff_members 별도 조회
      if (selectedCo && selectedCo !== '전체' && list.length > 0) {
        const staffIds = [...new Set(list.map((r: any) => r.staff_id))];
        const { data: staffData } = await supabase
          .from('staff_members')
          .select('id, company')
          .in('id', staffIds);
        const staffCompanyMap = Object.fromEntries((staffData || []).map((s: any) => [String(s.id), s.company]));
        list = list.filter((r: any) => staffCompanyMap[String(r.staff_id)] === selectedCo);
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
    <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] p-4 shadow-sm">
      <div className="pb-3 border-b border-[var(--border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">월별 급여 요약</h3>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium w-full" />
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
          <div className="flex justify-between text-sm pt-2 border-t border-[var(--border)]">
            <span className="font-medium text-[var(--toss-gray-4)]">실지급 총액</span>
            <span className="font-semibold text-[var(--accent)]">₩{totalNet.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
