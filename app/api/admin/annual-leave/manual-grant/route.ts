import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import {
  isApprovedLeaveStatus,
  isAnnualLeaveType,
  getLeaveUnit,
  calculateLeaveDays } from '@/lib/annual-leave-ledger';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { sql } from 'drizzle-orm';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  companies as companiesTable,
  leave_requests as leaveRequestsTable,
  leave_balances as leaveBalancesTable,
  leave_accruals as leaveAccrualsTable,
  eq,
  and,
  inArray } from '@/lib/db';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

type ManualGrantPayload = {
  staffId?: string;
  total?: number;
  used?: number;
  expired?: number;
  compensated?: number;
  updates?: Array<{
    staffId?: string;
    total?: number;
    used?: number;
    expired?: number;
    compensated?: number;
  }>;
};

type StaffRow = {
  id: string;
  employee_no: string;
  name: string;
  company: string;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
  company_id: string | null;
};

type CompanyRow = {
  id: string;
  leave_policy: string | null;
  fiscal_year_start_month: number | null;
};

type LeaveRequestRow = {
  staff_id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

function normalizeLeaveValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeOptionalLeaveValue(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeUpdates(payload: ManualGrantPayload | null) {
  const rawUpdates = Array.isArray(payload?.updates)
    ? payload.updates
    : payload?.staffId
      ? [{
          staffId: payload.staffId,
          total: payload.total,
          used: payload.used,
          expired: payload.expired,
          compensated: payload.compensated }]
      : [];

  const normalized = rawUpdates
    .map((update) => {
      const staffId = typeof update?.staffId === 'string' ? update.staffId.trim() : '';
      const total = normalizeLeaveValue(update?.total);
      const used = normalizeLeaveValue(update?.used);
      const expired = normalizeOptionalLeaveValue(update?.expired);
      const compensated = normalizeOptionalLeaveValue(update?.compensated);

      if (!staffId || total === null || used === null || expired === null || compensated === null) {
        return null;
      }

      return { staffId, total, used, expired, compensated } satisfies ManualGrantUpdate;
    })
    .filter((update): update is ManualGrantUpdate => update !== null);

  return Array.from(
    normalized.reduce((map, update) => map.set(update.staffId, update), new Map<string, ManualGrantUpdate>()).values(),
  );
}

// 회계연도 만료일: 다음 회계연도 시작일 전날
function fiscalYearExpiryDate(refYear: number, fiscalStartMonth: number): Date {
  const nextFiscalStart = new Date(refYear + 1, fiscalStartMonth - 1, 1);
  return new Date(nextFiscalStart.getTime() - 86_400_000);
}

// syncAnnualLeaveUsedForStaff와 동일한 사용일수 산정 로직 (DB 조회 없이 메모리 계산)
function computeUsedDays(rows: LeaveRequestRow[]): number {
  return rows.reduce((sum, row) => {
    if (!isApprovedLeaveStatus(row?.status)) return sum;
    const unit = getLeaveUnit(row?.leave_type);
    if (unit === 0.5) return sum + 0.5;
    if (!isAnnualLeaveType(row?.leave_type)) return sum;
    return sum + calculateLeaveDays(row?.start_date, row?.end_date);
  }, 0);
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as ManualGrantPayload | null;
    const updates = normalizeUpdates(payload);

    if (updates.length === 0) {
      return NextResponse.json({ error: '수정할 연차 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    // 사용 + 소멸 + 수당지급 합이 총량을 넘으면 거부 (JM3: 사전 검증)
    const invalid = updates.find((u) => u.used + u.expired + u.compensated > u.total + 0.001);
    if (invalid) {
      return NextResponse.json(
        {
          error: `사용(${invalid.used}) + 소멸(${invalid.expired}) + 수당지급(${invalid.compensated}) 합계가 총 연차(${invalid.total})를 초과합니다. (staffId: ${invalid.staffId})` },
        { status: 400 },
      );
    }

    const staffIds = updates.map((u) => u.staffId);
    const targetYear = new Date().getFullYear();

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[manual-grant] D1 binding not available');
    const db = getD1Drizzle(d1);

    // 1. 대상 직원 일괄 조회
    const staffDataRows = await db
      .select({
        id: staffMembersTable.id,
        employee_no: staffMembersTable.employee_no,
        name: staffMembersTable.name,
        company: staffMembersTable.company,
        join_date: staffMembersTable.join_date,
        joined_at: staffMembersTable.joined_at,
        hire_date: staffMembersTable.hire_date,
        company_id: staffMembersTable.company_id })
      .from(staffMembersTable)
      .where(inArray(staffMembersTable.id, staffIds));

    const staffRows = staffDataRows as StaffRow[];
    const staffMap = new Map(staffRows.map((s) => [s.id, s]));
    const missingIds = staffIds.filter((id) => !staffMap.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `존재하지 않는 직원 ID가 포함되어 있습니다: ${missingIds.join(', ')}` },
        { status: 400 },
      );
    }

    // 2. 회사 정책 일괄 조회
    const companyIds = Array.from(
      new Set(staffRows.map((s) => s.company_id).filter((v): v is string => !!v)),
    );
    const companyMap = new Map<string, CompanyRow>();
    if (companyIds.length > 0) {
      const companyDataRows = await db
        .select({
          id: companiesTable.id,
          leave_policy: companiesTable.leave_policy,
          fiscal_year_start_month: companiesTable.fiscal_year_start_month })
        .from(companiesTable)
        .where(inArray(companiesTable.id, companyIds));
      companyDataRows.forEach((c) =>
        companyMap.set(c.id, {
          id: c.id,
          leave_policy: c.leave_policy ?? null,
          fiscal_year_start_month: c.fiscal_year_start_month ?? null }),
      );
    }

    // 3. 휴가신청 내역 일괄 조회
    const leaveDataRows = await db
      .select({
        staff_id: leaveRequestsTable.staff_id,
        leave_type: leaveRequestsTable.leave_type,
        start_date: leaveRequestsTable.start_date,
        end_date: leaveRequestsTable.end_date,
        status: leaveRequestsTable.status })
      .from(leaveRequestsTable)
      .where(inArray(leaveRequestsTable.staff_id, staffIds));

    const leaveByStaff = new Map<string, LeaveRequestRow[]>();
    leaveDataRows.forEach((row) => {
      const staffId = row.staff_id ?? '';
      if (!staffId) return;
      const leaveRow: LeaveRequestRow = {
        staff_id: staffId,
        leave_type: row.leave_type ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
        status: row.status ?? null };
      const list = leaveByStaff.get(staffId);
      if (list) list.push(leaveRow);
      else leaveByStaff.set(staffId, [leaveRow]);
    });

    // 4. leave_balances 기존 행 조회 (staff_id+year — id PK 필요)
    const existingBalanceRows = await db
      .select({
        id: leaveBalancesTable.id,
        staff_id: leaveBalancesTable.staff_id,
        year: leaveBalancesTable.year })
      .from(leaveBalancesTable)
      .where(
        and(
          inArray(leaveBalancesTable.staff_id, staffIds),
          eq(leaveBalancesTable.year, targetYear),
        ),
      );
    const existingBalanceMap = new Map(
      existingBalanceRows.map((r) => [r.staff_id, r]),
    );

    // 5. staff_members / leave_balances 갱신
    for (const update of updates) {
      const staff = staffMap.get(update.staffId)!;
      const usedDays = update.used;
      const totalDays = update.total;

      const company = staff.company_id ? companyMap.get(staff.company_id) : undefined;
      let expiryDate: Date;
      if (company?.leave_policy === '회계연도') {
        expiryDate = fiscalYearExpiryDate(targetYear, company.fiscal_year_start_month ?? 1);
      } else {
        const hireDate = staff.hire_date ?? staff.join_date ?? staff.joined_at ?? null;
        expiryDate = hireDate
          ? calculateAnnualLeaveExpiryDate(hireDate, new Date())
          : new Date(targetYear, 11, 31);
      }
      const expiryDateStr = formatKoreanDateKey(expiryDate);
      const remainingDays = Math.max(0, totalDays - usedDays - update.expired - update.compensated);

      // staff_members UPDATE
      await db
        .update(staffMembersTable)
        .set({
          annual_leave_total: totalDays,
          annual_leave_used: usedDays })
        .where(eq(staffMembersTable.id, update.staffId));

      // leave_accruals 원장 테이블에도 manual 수동 부여 레코드 저장 (recalculateLeaveBalance 영구 반영)
      await db
        .insert(leaveAccrualsTable)
        .values({
          id: crypto.randomUUID(),
          staff_id: update.staffId,
          company_id: staff.company_id || null,
          kind: 'manual',
          period_key: `manual:${targetYear}`,
          days: totalDays,
          year: targetYear,
          source_date: formatKoreanDateKey(new Date()),
          note: `수동 부여/조정 (${totalDays}일)`,
          created_at: new Date().toISOString()
        })
        .onConflictDoUpdate({
          target: [sql`staff_id`, sql`kind`, sql`period_key`],
          set: {
            days: totalDays,
            note: `수동 부여/조정 (${totalDays}일)`
          }
        });

      // 기존 annual 원장이 존재하면 해당 days도 같이 맞추어 전역 정합성 보장
      await db
        .update(leaveAccrualsTable)
        .set({ days: totalDays })
        .where(
          and(
            eq(leaveAccrualsTable.staff_id, update.staffId),
            eq(leaveAccrualsTable.kind, 'annual')
          )
        );

      // leave_balances upsert (SELECT 후 UPDATE or INSERT)
      const existingBalance = existingBalanceMap.get(update.staffId);
      if (existingBalance?.id) {
        await db
          .update(leaveBalancesTable)
          .set({
            total_days: totalDays,
            used_days: usedDays,
            remaining_days: remainingDays,
            expiry_date: expiryDateStr,
            expired_days: update.expired,
            compensated_days: update.compensated,
            updated_at: new Date().toISOString() })
          .where(eq(leaveBalancesTable.id, existingBalance.id));
      } else {
        await db.insert(leaveBalancesTable).values({
          id: crypto.randomUUID(),
          staff_id: update.staffId,
          year: targetYear,
          total_days: totalDays,
          used_days: usedDays,
          remaining_days: remainingDays,
          expiry_date: expiryDateStr,
          expired_days: update.expired,
          compensated_days: update.compensated,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString() });
      }

      // 수동 부여/조정값을 SSOT 유틸에 오버라이드로 등록하여 자동 재계산 시에도 안전 보존
      try {
        await recalculateLeaveBalance(update.staffId, targetYear, {
          totalDays,
          usedDays,
          expiredDays: update.expired,
          compensatedDays: update.compensated
        });
      } catch (recalcErr) {
        console.error('[manual-grant] recalculateLeaveBalance 경고:', recalcErr);
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      message:
        updates.length === 1
          ? '연차 수동 부여 내역이 저장되었습니다.'
          : `${updates.length}명의 연차 수동 부여 내역이 저장되었습니다.` });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '연차 수동 부여 저장 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
