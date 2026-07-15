/**
 * 미사용 연차 자동 소멸 처리
 * 근로기준법 제61조 - 촉진 절차 완료 후 미사용 연차 보상 의무 소멸
 */

import { calculateAnnualLeaveExpiryDate } from './annual-leave-promotion';
import { hasCompletedBothPromotions } from './annual-leave-promotion-dispatch';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { mirrorNotificationsToD1, type NotificationRow } from './notification-utils';
import {
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
  gt } from './db';

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
  staffId: string,
  staffName: string,
  remainingDays: number,
  expiryDate: Date,
): Promise<ExpiryResult | null> {
  if (remainingDays <= 0) return null;

  const expiryDateStr = formatKoreanDateKey(expiryDate);
  const now = new Date();
  if (now < expiryDate) return null; // 아직 만료 안 됨

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (processStaffLeaveExpiry)');
  const db = getD1Drizzle(d1);

  // leave_balances 업데이트 (소멸 처리) — remaining_days 도 0 으로 맞춤
  await db
    .update(leaveBalancesTable)
    .set({
      expired_days: remainingDays,
      remaining_days: 0,
      expired_at: now.toISOString() })
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
    processed_at: now.toISOString() };
  await db.insert(annualLeavePromotionLogsTable).values({
    id: crypto.randomUUID(),
    staff_id: staffId,
    target_year: expiryDate.getFullYear(),
    step: 3,
    remain_days: remainingDays,
    meta: JSON.stringify(promotionMeta),
    created_at: now.toISOString() });

  // 소멸 알림 발송 (D1 직접 insert — mirrorNotificationsToD1 내부에서 처리)
  const expiryNotificationRow: NotificationRow = {
    user_id: staffId,
    type: '연차소멸',
    title: '미사용 연차 소멸 안내',
    body: `${remainingDays}일의 미사용 연차가 소멸 처리되었습니다. (만료일: ${expiryDateStr})`,
    read_at: null };
  await mirrorNotificationsToD1([expiryNotificationRow]);

  return {
    staffId,
    staffName,
    expiredDays: remainingDays,
    expiryDate: expiryDateStr };
}

/**
 * 미사용 연차 금전 보상 기록
 * companies.unused_leave_compensation=TRUE 인 회사의 직원에 대해
 * 소멸 잔여일수 × 통상임금/일을 staff_members.annual_leave_pay에 기록
 */
export async function recordUnusedLeaveCompensation(
  staffId: string,
  expiredDays: number,
): Promise<void> {
  if (expiredDays <= 0) return;

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

  // 통상임금/일 = 기본급 / 근무일수(월 평균 21.75일)
  const dailyWage = Math.round(baseSalary / 21.75);
  const compensationAmount = dailyWage * expiredDays;

  await db
    .update(staffMembersTable)
    .set({ annual_leave_pay: compensationAmount })
    .where(eq(staffMembersTable.id, staffId));
}

/**
 * 전체 직원 대상 일괄 소멸 처리 (크론용)
 */
export async function batchProcessExpiredLeaves(): Promise<{
  processed: number;
  results: ExpiryResult[];
  skippedNoPromotion: Array<{ staffId: string; staffName: string; expiryDate: string; remainingDays: number }>;
}> {
  const today = new Date();
  const todayStr = formatKoreanDateKey(today);
  const results: ExpiryResult[] = [];
  const skippedNoPromotion: Array<{ staffId: string; staffName: string; expiryDate: string; remainingDays: number }> = [];

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (batchProcessExpiredLeaves)');
  const db = getD1Drizzle(d1);

  // leave_balances JOIN staff_members: expiry_date <= today, expired_at IS NULL, remaining_days > 0
  const balances = await db
    .select({
      staff_id: leaveBalancesTable.staff_id,
      remaining_days: leaveBalancesTable.remaining_days,
      expiry_date: leaveBalancesTable.expiry_date,
      staff_name: staffMembersTable.name })
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
    return { processed: 0, results, skippedNoPromotion };
  }

  for (const balance of balances) {
    const staffId = String(balance.staff_id);
    const staffName = String(balance.staff_name ?? '');
    const remaining = Number(balance.remaining_days) || 0;
    const expiryDateKey = String(balance.expiry_date).slice(0, 10);
    const expiryDate = new Date(`${balance.expiry_date}T00:00:00`);

    // 적법 요건: 1차·2차 촉진을 모두 이행한 경우에만 보상의무 소멸(자동소멸) 가능 (근로기준법 제61조).
    // 촉진 미이행 시 소멸시키지 않고 건너뛴다 — 미사용 연차 보상의무가 살아있기 때문.
    let promotionsDone = false;
    try {
      promotionsDone = await hasCompletedBothPromotions(staffId, expiryDateKey);
    } catch (err) {
      console.error('[annual-leave-expiry] 촉진 이행 확인 실패:', staffId, err);
    }
    if (!promotionsDone) {
      skippedNoPromotion.push({ staffId, staffName, expiryDate: expiryDateKey, remainingDays: remaining });
      continue;
    }

    const result = await processStaffLeaveExpiry(staffId, staffName, remaining, expiryDate);
    if (result) results.push(result);
  }

  return { processed: results.length, results, skippedNoPromotion };
}
