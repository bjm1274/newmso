/**
 * 급여 데이터 페처
 *
 * 월별 payroll_records 조회는 변경 빈도가 낮아 5분 TTL이 효과적.
 * 동일 month 호출은 dedup으로 1회로 합쳐짐.
 */

import { fetcher } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';

const PAYROLL_TTL = 300_000; // 5분

export type PayrollRecordRow = {
  staff_id: string;
  net_pay: number | null;
};

/**
 * 특정 year_month의 급여 명세 (staff_id, net_pay만).
 * 급여 이상치 감지·간단 비교 통계용.
 */
export async function fetchPayrollRecordsByMonth(yearMonth: string): Promise<PayrollRecordRow[]> {
  if (!yearMonth) return [];
  return fetcher(
    `payroll:records:by-month:${yearMonth}`,
    async () => {
      const { data, error } = await supabase
        .from('payroll_records')
        .select('staff_id, net_pay')
        .eq('year_month', yearMonth);
      if (error) throw error;
      return (data ?? []) as PayrollRecordRow[];
    },
    { ttl: PAYROLL_TTL },
  );
}
