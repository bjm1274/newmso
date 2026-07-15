/**
 * leave_balances 테이블 재계산 유틸
 * 승인/취소/반려/수동부여 이벤트 발생 시 호출하여 정합성 유지
 *
 * SSOT:
 * - 발생: leave_accruals (1년 미만=월차 합, 1년+=최신 annual:N 일수)
 * - 사용: leave_requests 당해 연도 승인 연차 (staff_members 미갱신)
 * - 잔액: leave_balances 만 UPSERT (직원 명단 테이블 미수정)
 */

import { z } from 'zod';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  companies as companiesTable,
  leave_balances as leaveBalancesTable,
  leave_accruals as leaveAccrualsTable,
  eq,
  and } from '@/lib/db';

const RecalcInputSchema = z.object({
  staffId: z.string().min(1, 'staffId가 필요합니다'),
  year: z.number().int().min(2000).max(2100).optional(),
  expiredOverride: z.number().min(0).optional(),
  compensatedOverride: z.number().min(0).optional() });

export type RecalcOverrides = {
  expiredDays?: number;
  compensatedDays?: number;
};

type StaffRow = {
  id: string;
  annual_leave_total: number | null;
  annual_leave_used: number | null;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
  company_id: string | null;
};

function resolveHireDate(staff: StaffRow): string | null {
  return staff.hire_date ?? staff.join_date ?? staff.joined_at ?? null;
}

function fiscalYearExpiryDate(refYear: number, fiscalStartMonth: number): Date {
  const nextFiscalStart = new Date(refYear + 1, fiscalStartMonth - 1, 1);
  return new Date(nextFiscalStart.getTime() - 86_400_000);
}

/**
 * leave_accruals 기준 발생 일수 (당해 잔액 SSOT)
 * - 1년 이상: 최신 annual:N 일수만 (과거 annual 합산 금지 → 15+15=30 버그 방지)
 * - 1년 미만: monthly 원장 합
 * - 원장 없고 staff.total 만 있으면 fallback
 */
export async function resolveGrantedDaysFromAccruals(
  staffId: string,
  fallbackTotal: number,
): Promise<{ totalDays: number; source: 'annual' | 'monthly' | 'staff_fallback' | 'zero' }> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-balance] D1 binding not available');
  const db = getD1Drizzle(d1);

  const rows = await db
    .select({
      kind: leaveAccrualsTable.kind,
      period_key: leaveAccrualsTable.period_key,
      days: leaveAccrualsTable.days,
    })
    .from(leaveAccrualsTable)
    .where(eq(leaveAccrualsTable.staff_id, staffId));

  const annualRows = rows.filter((r) => r.kind === 'annual');
  if (annualRows.length > 0) {
    // period_key = 'annual:1' | 'annual:2' … → 가장 큰 N(최신 연차 부여)만 사용
    let best = annualRows[0];
    let bestN = -1;
    for (const r of annualRows) {
      const n = Number(String(r.period_key ?? '').replace(/^annual:/i, '')) || 0;
      if (n >= bestN) {
        bestN = n;
        best = r;
      }
    }
    const days = Number(best.days) || 0;
    if (days > 0) {
      return { totalDays: days, source: 'annual' };
    }
  }

  const monthlySum = rows
    .filter((r) => r.kind === 'monthly')
    .reduce((s, r) => s + (Number(r.days) || 0), 0);
  if (monthlySum > 0) {
    return { totalDays: monthlySum, source: 'monthly' };
  }

  if (fallbackTotal > 0) {
    return { totalDays: fallbackTotal, source: 'staff_fallback' };
  }
  return { totalDays: 0, source: 'zero' };
}

/**
 * 특정 직원의 leave_balances를 재계산하여 UPSERT
 * staff_members 의 total/used 는 읽기 fallback 만 사용하고 쓰지 않음.
 */
export async function recalculateLeaveBalance(
  staffId: string,
  year?: number,
  overrides?: RecalcOverrides,
): Promise<void> {
  const parsed = RecalcInputSchema.safeParse({
    staffId,
    year,
    expiredOverride: overrides?.expiredDays,
    compensatedOverride: overrides?.compensatedDays });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join(', ');
    console.error('[recalculateLeaveBalance] 입력 오류:', msg);
    throw new Error(`recalculateLeaveBalance 입력 오류: ${msg}`);
  }

  const targetYear = parsed.data.year ?? new Date().getFullYear();

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-balance] D1 binding not available (recalculateLeaveBalance)');
  const db = getD1Drizzle(d1);

  const staffRows = await db
    .select({
      id: staffMembersTable.id,
      annual_leave_total: staffMembersTable.annual_leave_total,
      annual_leave_used: staffMembersTable.annual_leave_used,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      hire_date: staffMembersTable.hire_date,
      company_id: staffMembersTable.company_id })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, staffId))
    .limit(1);
  const staffRow = staffRows[0] ?? null;
  if (!staffRow) {
    throw new Error(`직원 정보를 조회할 수 없습니다. (id: ${staffId})`);
  }
  const staff: StaffRow = {
    id: String(staffRow.id),
    annual_leave_total: staffRow.annual_leave_total ?? null,
    annual_leave_used: staffRow.annual_leave_used ?? null,
    join_date: staffRow.join_date ?? null,
    joined_at: staffRow.joined_at ?? null,
    hire_date: staffRow.hire_date ?? null,
    company_id: staffRow.company_id ?? null };

  let leavePolicy: 'entry_date' | 'fiscal_year' = 'entry_date';
  let fiscalStartMonth = 1;
  if (staff.company_id) {
    const companyRows = await db
      .select({
        id: companiesTable.id,
        leave_policy: companiesTable.leave_policy,
        fiscal_year_start_month: companiesTable.fiscal_year_start_month,
        unused_leave_compensation: companiesTable.unused_leave_compensation })
      .from(companiesTable)
      .where(eq(companiesTable.id, staff.company_id))
      .limit(1);
    const companyRow = companyRows[0] ?? null;
    if (companyRow?.leave_policy === '회계연도') {
      leavePolicy = 'fiscal_year';
      fiscalStartMonth = companyRow.fiscal_year_start_month ?? 1;
    }
  }

  // 사용: 당해 연도 승인 연차만 (leave_balances.year 스코프). 전 기간 합산 시 잔여 과소 표시됨.
  let usedDays: number;
  try {
    usedDays = await syncAnnualLeaveUsedForStaff(staffId, {
      writeStaffMembers: false,
      year: targetYear,
    });
  } catch (syncErr) {
    console.error('[recalculateLeaveBalance] syncAnnualLeaveUsedForStaff 실패:', syncErr);
    // staff.annual_leave_used 는 다년도 누적이라 폴백 금지 — 실패 시 0 후 재시도 유도
    usedDays = 0;
  }

  // 발생: 원장 우선
  const granted = await resolveGrantedDaysFromAccruals(
    staffId,
    Number(staff.annual_leave_total) || 0,
  );
  const totalDays = granted.totalDays;

  let expiryDate: Date;
  const hireDate = resolveHireDate(staff);
  if (leavePolicy === 'fiscal_year') {
    expiryDate = fiscalYearExpiryDate(targetYear, fiscalStartMonth);
  } else {
    expiryDate = hireDate
      ? calculateAnnualLeaveExpiryDate(hireDate, new Date())
      : new Date(targetYear, 11, 31);
  }
  const expiryDateStr = formatKoreanDateKey(expiryDate);

  const existingRows = await db
    .select({
      id: leaveBalancesTable.id,
      expired_days: leaveBalancesTable.expired_days,
      compensated_days: leaveBalancesTable.compensated_days })
    .from(leaveBalancesTable)
    .where(
      and(
        eq(leaveBalancesTable.staff_id, staffId),
        eq(leaveBalancesTable.year, targetYear),
      ),
    )
    .limit(1);
  const existingRow = existingRows[0] ?? null;

  const expiredDays =
    overrides?.expiredDays !== undefined
      ? Number(overrides.expiredDays)
      : Number(existingRow?.expired_days) || 0;
  const compensatedDays =
    overrides?.compensatedDays !== undefined
      ? Number(overrides.compensatedDays)
      : Number(existingRow?.compensated_days) || 0;

  const remainingDays = Math.max(0, totalDays - usedDays - expiredDays - compensatedDays);

  if (existingRow?.id) {
    await db
      .update(leaveBalancesTable)
      .set({
        total_days: totalDays,
        used_days: usedDays,
        remaining_days: remainingDays,
        expiry_date: expiryDateStr,
        expired_days: expiredDays,
        compensated_days: compensatedDays,
        updated_at: new Date().toISOString() })
      .where(eq(leaveBalancesTable.id, existingRow.id));
  } else {
    await db.insert(leaveBalancesTable).values({
      id: crypto.randomUUID(),
      staff_id: staffId,
      year: targetYear,
      total_days: totalDays,
      used_days: usedDays,
      remaining_days: remainingDays,
      expiry_date: expiryDateStr,
      expired_days: expiredDays,
      compensated_days: compensatedDays,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString() });
  }
}
