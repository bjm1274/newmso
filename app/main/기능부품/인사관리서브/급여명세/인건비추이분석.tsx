'use client';
import { useState, useEffect } from 'react';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { filterNonInterimPayrollRecords } from '@/lib/payroll-records';
import { db } from '@/lib/db-client';

interface Props {
  selectedCo: string;
}

export default function LaborCostTrend({ selectedCo }: Props) {
  const [months, setMonths] = useState<{ ym: string; total: number; count: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const base = new Date();
        const monthStrings: string[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
          monthStrings.push(getKoreanMonthString(d));
        }

        // 12개월 데이터를 단일 쿼리로 가져옴 (N+1 waterfall 방지)
        const { data: records, error } = await db
          .from('payroll_records')
          .select('staff_id, net_pay, record_type, year_month')
          .in('year_month', monthStrings);
        if (error) throw error;

        // 중간정산 필터링 적용 (record_type = 'interim' 제외)
        let filteredRecords = filterNonInterimPayrollRecords((records || []) as any[]);

        // 회사 필터 적용
        if (selectedCo && selectedCo !== '전체') {
          const staffIds = [...new Set(filteredRecords.map((r: any) => r.staff_id))];
          if (staffIds.length > 0) {
            const { data: staffData } = await db
              .from('staff_members')
              .select('id, company')
              .in('id', staffIds);
            const staffCompanyMap = Object.fromEntries(
              (staffData || []).map((s: any) => [String(s.id), s.company])
            );
            filteredRecords = filteredRecords.filter(
              (r: any) => staffCompanyMap[String(r.staff_id)] === selectedCo
            );
          } else {
            filteredRecords = [];
          }
        }

        const list = monthStrings.map((ym) => {
          const monthRows = filteredRecords.filter((r) => r.year_month === ym);
          return {
            ym,
            total: monthRows.reduce((sum, r) => sum + (r.net_pay || 0), 0),
            count: monthRows.length };
        });

        setMonths(list);
      } catch (error) {
        console.error('Error fetching labor cost trend:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedCo]);

  const maxVal = Math.max(...months.map((m) => m.total), 1);

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">인건비 추이</h3>
      </div>
      {loading ? (
        <div className="text-center py-6 text-xs text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
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
      )}
    </div>
  );
}
