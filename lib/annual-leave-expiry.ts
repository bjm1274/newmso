/**
 * 미사용 연차 자동 소멸 처리
 * 근로기준법 제61조 - 촉진 절차 완료 후 미사용 연차 보상 의무 소멸
 */

import { hasCompletedBothPromotions } from './annual-leave-promotion-dispatch';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { mirrorNotificationsToD1, type NotificationRow } from './notification-utils';
import {
  getLeaveCycle,
  getLeaveCycleBalance,
  recordLeaveExpiry } from './unified-leave-ledger';
import {
  getD1Binding,
  getD1Drizzle,
  annual_leave_promotion_logs as annualLeavePromotionLogsTable,
  leave_balances as leaveBalancesTable,
  staff_members as staffMembersTable,
  companies as companiesTable,
  eq,
  and,
  notInArray } from './db';

/** YYYY-MM-DD 에 일수를 더한 날짜 키 */
function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

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
  cycleKey?: string,
): Promise<ExpiryResult | null> {
  if (remainingDays <= 0) return null;

  const expiryDateStr = formatKoreanDateKey(expiryDate);
  const now = new Date();
  if (now < expiryDate) return null; // 아직 만료 안 됨

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-expiry] D1 binding not available (processStaffLeaveExpiry)');
  const db = getD1Drizzle(d1);

  // 원장(SSOT)에 소멸을 먼저 기록한다.
  //
  // 예전에는 leave_balances 만 갱신했다. 그런데 요약 조회가 원장을 재집계해
  // leave_balances 를 통째로 덮어쓰므로, **원장에 없는 소멸은 다음 조회 때
  // 사라지고 잔여연차가 되살아났다.** 순서도 중요하다 — 원장 기록이 실패하면
  // 미러만 0 이 된 채 다음 조회에서 되살아나므로, 원장이 먼저다.
  const companyRows = await db
    .select({ company_id: staffMembersTable.company_id })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, staffId))
    .limit(1);

  await recordLeaveExpiry({
    staffId,
    companyId: companyRows[0]?.company_id ?? null,
    days: remainingDays,
    // 만료일은 다음 주기의 첫날(입사기념일)이다. 그 날짜로 적으면 집계 범위가
    // `주기시작 <= 날짜 < 주기끝` 이라 소멸 항목이 **자기 주기 밖으로 빠져나가**
    // 잔여가 줄지 않고, 소멸이 매일 다시 집행된다. 주기 마지막 날로 적는다.
    occurredOn: shiftDateKey(expiryDateStr, -1),
    cycleKey: cycleKey || expiryDateStr,
    note: `미사용 연차 소멸 (만료일 ${expiryDateStr})` });

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

  // 소멸 대상은 **직원의 입사일 주기**로 판정한다.
  //
  // 예전에는 `leave_balances.expiry_date <= today` 로 골랐다. 그런데 이 컬럼을
  // 채우는 코드가 신규 직원 등록뿐이라 2년차 이후 주기의 행은 NULL 이었고,
  // 그 조건에 영원히 걸리지 않았다 — 즉 소멸이 실질적으로 집행되지 않았다.
  // 입사일에서 주기를 계산하면 미러 컬럼의 상태와 무관하게 대상을 잡을 수 있다.
  const staffRows = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      hire_date: staffMembersTable.hire_date,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at })
    .from(staffMembersTable)
    .where(notInArray(staffMembersTable.status, ['퇴사', '퇴직']));

  for (const staff of staffRows) {
    const staffId = String(staff.id);
    const staffName = String(staff.name ?? '');
    const hireDate = String(staff.hire_date || staff.join_date || staff.joined_at || '').slice(0, 10);
    if (!hireDate) continue;

    const currentCycle = getLeaveCycle(hireDate, todayStr);
    // 첫 주기(입사 1년 미만)에는 소멸시킬 직전 주기가 없다.
    if (!currentCycle || currentCycle.completedYears === 0) continue;

    // 직전 주기 = 지금 주기가 시작하기 하루 전이 속한 주기.
    const dayBeforeCurrent = shiftDateKey(currentCycle.start, -1);
    const previousCycle = getLeaveCycle(hireDate, dayBeforeCurrent);
    if (!previousCycle) continue;

    const expiryDateKey = previousCycle.end; // = currentCycle.start (다음 입사기념일)
    if (todayStr < expiryDateKey) continue;

    let remaining = 0;
    try {
      remaining = (await getLeaveCycleBalance(staffId, previousCycle)).remaining;
    } catch (err) {
      console.error('[annual-leave-expiry] 직전 주기 잔여 조회 실패:', staffId, err);
      continue;
    }
    // 이미 소멸 처리된 주기는 원장에 음수 항목이 있어 잔여가 0 이 된다 — 자연 멱등.
    if (remaining <= 0) continue;

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

    const result = await processStaffLeaveExpiry(
      staffId,
      staffName,
      remaining,
      new Date(`${expiryDateKey}T00:00:00`),
      previousCycle.key,
    );
    if (result) results.push(result);
  }

  return { processed: results.length, results, skippedNoPromotion };
}
