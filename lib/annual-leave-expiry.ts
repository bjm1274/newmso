/**
 * 미사용 연차 자동 소멸 처리
 * 근로기준법 제61조 - 촉진 절차 완료 후 미사용 연차 보상 의무 소멸
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateAnnualLeaveExpiryDate } from './annual-leave-promotion';
import { formatKoreanDateKey } from '@/lib/seoul-time';

export type ExpiryResult = {
  staffId: string;
  staffName: string;
  expiredDays: number;
  expiryDate: string;
};

/**
 * 만료일이 지난 개별 직원의 연차 소멸 처리
 */
export async function processStaffLeaveExpiry(
  supabase: SupabaseClient,
  staffId: string,
  staffName: string,
  remainingDays: number,
  expiryDate: Date,
): Promise<ExpiryResult | null> {
  if (remainingDays <= 0) return null;

  const expiryDateStr = formatKoreanDateKey(expiryDate);
  const now = new Date();
  if (now < expiryDate) return null; // 아직 만료 안 됨

  // leave_balances 업데이트 (소멸 처리)
  await supabase
    .from('leave_balances')
    .update({
      expired_days: remainingDays,
      expired_at: now.toISOString(),
    })
    .eq('staff_id', staffId)
    .eq('expiry_date', expiryDateStr);

  // 소멸 확정 로그 기록 (step=3)
  await supabase.from('annual_leave_promotion_logs').insert({
    staff_id: staffId,
    target_year: expiryDate.getFullYear(),
    step: 3, // 소멸 확정
    remain_days: remainingDays,
    meta: {
      action: 'expired',
      expiry_date: expiryDateStr,
      processed_at: now.toISOString(),
    },
  });

  // 소멸 알림 발송
  await supabase.from('notifications').insert({
    user_id: staffId,
    type: '연차소멸',
    title: '미사용 연차 소멸 안내',
    body: `${remainingDays}일의 미사용 연차가 소멸 처리되었습니다. (만료일: ${expiryDateStr})`,
    read_at: null,
  });

  return {
    staffId,
    staffName,
    expiredDays: remainingDays,
    expiryDate: expiryDateStr,
  };
}

/**
 * 미사용 연차 금전 보상 기록
 * companies.unused_leave_compensation=TRUE 인 회사의 직원에 대해
 * 소멸 잔여일수 × 통상임금/일을 staff_members.annual_leave_pay에 기록
 */
export async function recordUnusedLeaveCompensation(
  supabase: SupabaseClient,
  staffId: string,
  expiredDays: number,
): Promise<void> {
  if (expiredDays <= 0) return;

  // 통상임금/일 = 기본급 / 근무일수(월 평균 21.75일)
  const { data: staffData } = await supabase
    .from('staff_members')
    .select('base_salary, company_id')
    .eq('id', staffId)
    .single();

  if (!staffData) return;

  const baseSalary = Number((staffData as Record<string, unknown>).base_salary) || 0;
  const companyId = (staffData as Record<string, unknown>).company_id as string | null;
  if (!companyId) return;

  // 회사 설정 확인
  const { data: companyData } = await supabase
    .from('companies')
    .select('unused_leave_compensation')
    .eq('id', companyId)
    .single();

  const compensation = (companyData as Record<string, unknown> | null)?.unused_leave_compensation;
  if (!compensation) return;

  const dailyWage = Math.round(baseSalary / 21.75);
  const compensationAmount = dailyWage * expiredDays;

  await supabase
    .from('staff_members')
    .update({ annual_leave_pay: compensationAmount })
    .eq('id', staffId);
}

/**
 * 전체 직원 대상 일괄 소멸 처리 (크론용)
 */
export async function batchProcessExpiredLeaves(
  supabase: SupabaseClient,
): Promise<{ processed: number; results: ExpiryResult[] }> {
  const today = new Date();
  const results: ExpiryResult[] = [];

  // 소멸 대상: leave_balances에서 expiry_date가 지났고 expired_at이 null인 레코드
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('staff_id, remaining_days, expiry_date, staff_members(name, hire_date, join_date, joined_at)')
    .is('expired_at', null)
    .lte('expiry_date', formatKoreanDateKey(today))
    .gt('remaining_days', 0);

  if (!balances || balances.length === 0) {
    return { processed: 0, results };
  }

  for (const balance of balances) {
    const staffId = String(balance.staff_id);
    const staffData = (balance as unknown as Record<string, unknown>).staff_members as Record<string, unknown> | null;
    const staffName = String(staffData?.name || '');
    const remaining = Number(balance.remaining_days) || 0;
    const expiryDate = new Date(`${balance.expiry_date}T00:00:00`);

    const result = await processStaffLeaveExpiry(
      supabase,
      staffId,
      staffName,
      remaining,
      expiryDate,
    );
    if (result) results.push(result);
  }

  return { processed: results.length, results };
}
