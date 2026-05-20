/**
 * leave_balances 테이블 재계산 유틸
 * 승인/취소/반려/수동부여 이벤트 발생 시 호출하여 정합성 유지
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  companies as companiesTable,
  leave_balances as leaveBalancesTable,
  eq,
  and,
} from '@/lib/db';

// ─── 입력 검증 스키마 ─────────────────────────────────────────────────────────

const RecalcInputSchema = z.object({
  staffId: z.string().uuid('staffId는 유효한 UUID여야 합니다'),
  year: z.number().int().min(2000).max(2100).optional(),
  expiredOverride: z.number().min(0).optional(),
  compensatedOverride: z.number().min(0).optional(),
});

export type RecalcOverrides = {
  expiredDays?: number;
  compensatedDays?: number;
};

// ─── DB 조회 결과 타입 ────────────────────────────────────────────────────────

type StaffRow = {
  id: string;
  annual_leave_total: number | null;
  annual_leave_used: number | null;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
  company_id: string | null;
};

type CompanyRow = {
  id: string;
  leave_policy: string | null;
  fiscal_year_start_month: number | null;
  unused_leave_compensation: boolean | null;
};

type LeaveBalanceRow = {
  expired_days: number | null;
  compensated_days: number | null;
};

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function resolveHireDate(staff: StaffRow): string | null {
  return staff.hire_date ?? staff.join_date ?? staff.joined_at ?? null;
}

/**
 * 회계연도 기준 만료일: 다음 회계연도 시작일 전날
 * 예) fiscal_year_start_month=1 → YYYY-12-31
 */
function fiscalYearExpiryDate(refYear: number, fiscalStartMonth: number): Date {
  // 다음 회계연도 시작일 전날
  const nextFiscalStart = new Date(refYear + 1, fiscalStartMonth - 1, 1);
  const expiry = new Date(nextFiscalStart.getTime() - 86_400_000);
  return expiry;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 특정 직원의 leave_balances를 재계산하여 UPSERT
 *
 * 호출 시점:
 * - 휴가 승인/반려/취소
 * - 연차 수동부여 후
 * - 연차 소멸 크론 처리 후
 *
 * JM2: 렌더링 중 절대 호출 금지 — 이벤트 핸들러에서만 호출할 것
 */
export async function recalculateLeaveBalance(
  staffId: string,
  year?: number,
  client: SupabaseClient = supabase,
  overrides?: RecalcOverrides,
): Promise<void> {
  // 입력 검증 (JM4)
  const parsed = RecalcInputSchema.safeParse({
    staffId,
    year,
    expiredOverride: overrides?.expiredDays,
    compensatedOverride: overrides?.compensatedDays,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join(', ');
    console.error('[recalculateLeaveBalance] 입력 오류:', msg);
    throw new Error(`recalculateLeaveBalance 입력 오류: ${msg}`);
  }

  const targetYear = parsed.data.year ?? new Date().getFullYear();

  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[annual-leave-balance] D1 binding not available (recalculateLeaveBalance)');
    const db = getD1Drizzle(d1);

    // 1. 직원 정보 조회
    const staffRows = await db
      .select({
        id: staffMembersTable.id,
        annual_leave_total: staffMembersTable.annual_leave_total,
        annual_leave_used: staffMembersTable.annual_leave_used,
        join_date: staffMembersTable.join_date,
        joined_at: staffMembersTable.joined_at,
        hire_date: staffMembersTable.hire_date,
        company_id: staffMembersTable.company_id,
      })
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
      company_id: staffRow.company_id ?? null,
    };

    // 2. 회사 정책 조회
    let leavePolicy: 'entry_date' | 'fiscal_year' = 'entry_date';
    let fiscalStartMonth = 1;
    if (staff.company_id) {
      const companyRows = await db
        .select({
          id: companiesTable.id,
          leave_policy: companiesTable.leave_policy,
          fiscal_year_start_month: companiesTable.fiscal_year_start_month,
          unused_leave_compensation: companiesTable.unused_leave_compensation,
        })
        .from(companiesTable)
        .where(eq(companiesTable.id, staff.company_id))
        .limit(1);
      const companyRow = companyRows[0] ?? null;
      if (companyRow?.leave_policy === '회계연도') {
        leavePolicy = 'fiscal_year';
        fiscalStartMonth = companyRow.fiscal_year_start_month ?? 1;
      }
    }

    // 3. 사용일수 동기화 (syncAnnualLeaveUsedForStaff 내부에서 d1 분기 처리)
    let usedDays: number;
    try {
      usedDays = await syncAnnualLeaveUsedForStaff(staffId, client);
    } catch (syncErr) {
      console.error('[recalculateLeaveBalance] syncAnnualLeaveUsedForStaff 실패:', syncErr);
      usedDays = Number(staff.annual_leave_used) || 0;
    }

    // 4-5. 발생일수·만료일 계산
    const totalDays = Number(staff.annual_leave_total) || 0;
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

    // 6. 기존 leave_balances 조회 (staff_id + year — D1은 unique index 없으므로 limit(1))
    const existingRows = await db
      .select({
        id: leaveBalancesTable.id,
        expired_days: leaveBalancesTable.expired_days,
        compensated_days: leaveBalancesTable.compensated_days,
      })
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

    // 7. 잔여일수 계산
    const remainingDays = Math.max(0, totalDays - usedDays - expiredDays - compensatedDays);

    // 8. D1 upsert: 기존 행 있으면 UPDATE, 없으면 INSERT
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
          updated_at: new Date().toISOString(),
        })
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
        updated_at: new Date().toISOString(),
      });
    }
    return;
  }

  // ── Supabase 경로 (dual-write 모드 유지) ─────────────────────────────────

  // 1. 직원 정보 조회
  const { data: staffData, error: staffError } = await client
    .from('staff_members')
    .select('id, annual_leave_total, annual_leave_used, join_date, joined_at, hire_date, company_id')
    .eq('id', staffId)
    .single();

  if (staffError || !staffData) {
    console.error('[recalculateLeaveBalance] 직원 조회 실패:', staffError);
    throw new Error(`직원 정보를 조회할 수 없습니다. (id: ${staffId})`);
  }

  const staff = staffData as StaffRow;

  // 2. 회사 정책 조회
  let leavePolicy: 'entry_date' | 'fiscal_year' = 'entry_date';
  let fiscalStartMonth = 1;

  if (staff.company_id) {
    const { data: companyData } = await client
      .from('companies')
      .select('id, leave_policy, fiscal_year_start_month, unused_leave_compensation')
      .eq('id', staff.company_id)
      .single();

    const company = companyData as CompanyRow | null;
    if (company?.leave_policy === '회계연도') {
      leavePolicy = 'fiscal_year';
      fiscalStartMonth = company.fiscal_year_start_month ?? 1;
    }
  }

  // 3. 사용일수 동기화 (최신 상태 확보)
  let usedDays: number;
  try {
    usedDays = await syncAnnualLeaveUsedForStaff(staffId, client);
  } catch (syncErr) {
    console.error('[recalculateLeaveBalance] syncAnnualLeaveUsedForStaff 실패:', syncErr);
    // sync 실패 시 기존 값으로 폴백
    usedDays = Number(staff.annual_leave_used) || 0;
  }

  // 4. 발생일수 결정
  const totalDays = Number(staff.annual_leave_total) || 0;

  // 5. 만료일 계산
  let expiryDate: Date;
  const hireDate = resolveHireDate(staff);

  if (leavePolicy === 'fiscal_year') {
    expiryDate = fiscalYearExpiryDate(targetYear, fiscalStartMonth);
  } else {
    expiryDate = hireDate
      ? calculateAnnualLeaveExpiryDate(hireDate, new Date())
      : new Date(targetYear, 11, 31); // 입사일 없으면 12/31
  }

  const expiryDateStr = formatKoreanDateKey(expiryDate);

  // 6. 기존 소멸/수당지급 일수 조회 (이미 처리된 것은 유지)
  //    overrides가 있으면 그 값으로 덮어쓰기 (관리자 수동 입력 경로)
  const { data: existingBalance } = await client
    .from('leave_balances')
    .select('expired_days, compensated_days')
    .eq('staff_id', staffId)
    .eq('year', targetYear)
    .maybeSingle();

  const existing = existingBalance as LeaveBalanceRow | null;
  const expiredDays =
    overrides?.expiredDays !== undefined
      ? Number(overrides.expiredDays)
      : Number(existing?.expired_days) || 0;
  const compensatedDays =
    overrides?.compensatedDays !== undefined
      ? Number(overrides.compensatedDays)
      : Number(existing?.compensated_days) || 0;

  // 7. 잔여일수 계산 (소멸 + 수당지급 차감)
  const remainingDays = Math.max(0, totalDays - usedDays - expiredDays - compensatedDays);

  // 8. UPSERT
  const { error: upsertError } = await client
    .from('leave_balances')
    .upsert(
      {
        staff_id: staffId,
        year: targetYear,
        total_days: totalDays,
        used_days: usedDays,
        remaining_days: remainingDays,
        expiry_date: expiryDateStr,
        expired_days: expiredDays,
        compensated_days: compensatedDays,
      },
      {
        onConflict: 'staff_id,year',
        ignoreDuplicates: false,
      },
    );

  if (upsertError) {
    console.error('[recalculateLeaveBalance] leave_balances UPSERT 실패:', upsertError);
    // staff_members.annual_leave_used는 이미 sync됐지만 leave_balances 불일치 — 로깅
    throw new Error(
      `leave_balances 갱신 실패. staff_members.annual_leave_used(${usedDays})와 불일치 상태일 수 있습니다. 관리자에게 문의하세요.`,
    );
  }
}
