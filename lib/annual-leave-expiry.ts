/**
 * 미사용 연차 자동 소멸 처리
 * 근로기준법 제61조 - 촉진 절차 완료 후 미사용 연차 보상 의무 소멸
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateAnnualLeaveExpiryDate } from './annual-leave-promotion';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { mirrorNotificationsToD1, type NotificationRow } from './notification-utils';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  annual_leave_promotion_logs as annualLeavePromotionLogsTable,
  leave_balances as leaveBalancesTable,
  staff_members as staffMembersTable,
  companies as companiesTable,
  eq,
  and,
  isNull,
  lte,
  gt,
} from './db';
import { logD1MirrorFailure } from './db/mirror-metrics';

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

  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (processStaffLeaveExpiry)');
    const db = getD1Drizzle(d1);

    // leave_balances 업데이트 (소멸 처리)
    await db
      .update(leaveBalancesTable)
      .set({
        expired_days: remainingDays,
        expired_at: now.toISOString(),
      })
      .where(
        and(
          eq(leaveBalancesTable.staff_id, staffId),
          eq(leaveBalancesTable.expiry_date, expiryDateStr),
        ),
      );

    // 소멸 확정 로그 기록 (step=3)
    const promotionMeta = {
      action: 'expired',
      expiry_date: expiryDateStr,
      processed_at: now.toISOString(),
    };
    await db.insert(annualLeavePromotionLogsTable).values({
      id: crypto.randomUUID(),
      staff_id: staffId,
      target_year: expiryDate.getFullYear(),
      step: 3,
      remain_days: remainingDays,
      meta: JSON.stringify(promotionMeta),
      created_at: now.toISOString(),
    });

    // 소멸 알림 발송 (D1 직접 insert — mirrorNotificationsToD1 내부에서 처리)
    const expiryNotificationRow: NotificationRow = {
      user_id: staffId,
      type: '연차소멸',
      title: '미사용 연차 소멸 안내',
      body: `${remainingDays}일의 미사용 연차가 소멸 처리되었습니다. (만료일: ${expiryDateStr})`,
      read_at: null,
    };
    await mirrorNotificationsToD1([expiryNotificationRow]);

    return {
      staffId,
      staffName,
      expiredDays: remainingDays,
      expiryDate: expiryDateStr,
    };
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────

  const expiryNowIso = now.toISOString();

  // leave_balances 업데이트 (소멸 처리)
  await supabase
    .from('leave_balances')
    .update({
      expired_days: remainingDays,
      expired_at: expiryNowIso,
    })
    .eq('staff_id', staffId)
    .eq('expiry_date', expiryDateStr);

  // dual-write: leave_balances 미러
  if (backend === 'dual-write') {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        await db
          .update(leaveBalancesTable)
          .set({ expired_days: remainingDays, expired_at: expiryNowIso })
          .where(
            and(
              eq(leaveBalancesTable.staff_id, staffId),
              eq(leaveBalancesTable.expiry_date, expiryDateStr),
            ),
          );
      }
    } catch (mirrorErr) {
      logD1MirrorFailure(mirrorErr, { label: 'mirror:leave_balances.expiry', backend });
    }
  }

  // 소멸 확정 로그 기록 (step=3)
  const promotionMeta = {
    action: 'expired',
    expiry_date: expiryDateStr,
    processed_at: expiryNowIso,
  };
  await supabase.from('annual_leave_promotion_logs').insert({
    staff_id: staffId,
    target_year: expiryDate.getFullYear(),
    step: 3, // 소멸 확정
    remain_days: remainingDays,
    meta: promotionMeta,
  });

  // dual-write: annual_leave_promotion_logs 미러
  if (backend === 'dual-write') {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        await db.insert(annualLeavePromotionLogsTable).values({
          id: crypto.randomUUID(),
          staff_id: staffId,
          target_year: expiryDate.getFullYear(),
          step: 3,
          remain_days: remainingDays,
          meta: JSON.stringify(promotionMeta),
          created_at: expiryNowIso,
        });
      }
    } catch (mirrorErr) {
      logD1MirrorFailure(mirrorErr, { label: 'mirror:annual_leave_promotion_logs.expiry', backend });
    }
  }

  // 소멸 알림 발송
  const expiryNotificationRow: NotificationRow = {
    user_id: staffId,
    type: '연차소멸',
    title: '미사용 연차 소멸 안내',
    body: `${remainingDays}일의 미사용 연차가 소멸 처리되었습니다. (만료일: ${expiryDateStr})`,
    read_at: null,
  };
  await supabase.from('notifications').insert(expiryNotificationRow);
  await mirrorNotificationsToD1([expiryNotificationRow]);

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

  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (recordUnusedLeaveCompensation)');
    const db = getD1Drizzle(d1);

    const staffRows = await db
      .select({ base_salary: staffMembersTable.base_salary, company_id: staffMembersTable.company_id })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1);
    const staffRow = staffRows[0] ?? null;
    if (!staffRow) return;

    const baseSalary = Number(staffRow.base_salary) || 0;
    const companyId = staffRow.company_id ?? null;
    if (!companyId) return;

    const companyRows = await db
      .select({ unused_leave_compensation: companiesTable.unused_leave_compensation })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);
    const companyRow = companyRows[0] ?? null;
    // D1: integer(0/1) — truthy 판정
    if (!companyRow || !companyRow.unused_leave_compensation) return;

    const dailyWage = Math.round(baseSalary / 21.75);
    const compensationAmount = dailyWage * expiredDays;

    await db
      .update(staffMembersTable)
      .set({ annual_leave_pay: compensationAmount })
      .where(eq(staffMembersTable.id, staffId));
    return;
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────

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

  // dual-write: staff_members.annual_leave_pay 미러
  if (backend === 'dual-write') {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        await db
          .update(staffMembersTable)
          .set({ annual_leave_pay: compensationAmount })
          .where(eq(staffMembersTable.id, staffId));
      }
    } catch (mirrorErr) {
      logD1MirrorFailure(mirrorErr, { label: 'mirror:staff_members.annual_leave_pay', backend });
    }
  }
}

/**
 * 전체 직원 대상 일괄 소멸 처리 (크론용)
 */
export async function batchProcessExpiredLeaves(
  supabase: SupabaseClient,
): Promise<{ processed: number; results: ExpiryResult[] }> {
  const today = new Date();
  const todayStr = formatKoreanDateKey(today);
  const results: ExpiryResult[] = [];

  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (batchProcessExpiredLeaves)');
    const db = getD1Drizzle(d1);

    // leave_balances JOIN staff_members: expiry_date <= today, expired_at IS NULL, remaining_days > 0
    const balances = await db
      .select({
        staff_id: leaveBalancesTable.staff_id,
        remaining_days: leaveBalancesTable.remaining_days,
        expiry_date: leaveBalancesTable.expiry_date,
        staff_name: staffMembersTable.name,
      })
      .from(leaveBalancesTable)
      .innerJoin(staffMembersTable, eq(leaveBalancesTable.staff_id, staffMembersTable.id))
      .where(
        and(
          isNull(leaveBalancesTable.expired_at),
          lte(leaveBalancesTable.expiry_date, todayStr),
          gt(leaveBalancesTable.remaining_days, 0),
        ),
      );

    if (balances.length === 0) {
      return { processed: 0, results };
    }

    for (const balance of balances) {
      const staffId = String(balance.staff_id);
      const staffName = String(balance.staff_name ?? '');
      const remaining = Number(balance.remaining_days) || 0;
      const expiryDate = new Date(`${balance.expiry_date}T00:00:00`);

      const result = await processStaffLeaveExpiry(supabase, staffId, staffName, remaining, expiryDate);
      if (result) results.push(result);
    }

    return { processed: results.length, results };
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────

  // 소멸 대상: leave_balances에서 expiry_date가 지났고 expired_at이 null인 레코드
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('staff_id, remaining_days, expiry_date, staff_members(name, hire_date, join_date, joined_at)')
    .is('expired_at', null)
    .lte('expiry_date', todayStr)
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
