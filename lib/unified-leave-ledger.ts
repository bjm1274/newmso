/**
 * 통합 연차 원장 모듈.
 *
 * 모든 연차 집계는 leave_ledger를 SSOT로 사용합니다. leave_requests는 결재 workflow만 보관하고,
 * leave_requests의 '부여' 유형은 법정 자동 발생(auto_annual/auto_monthly)이 없을 때만 원장에 반영합니다.
 */

import {
  and,
  eq,
  or,
  sql,
  getD1Binding,
  getD1Drizzle,
  leave_balances as leaveBalancesTable,
  leave_ledger as leaveLedgerTable,
  leave_requests as leaveRequestsTable,
  staff_members as staffMembersTable,
} from '@/lib/db';
import { getLeaveUnit, isAnnualLeaveType } from '@/lib/leave-type';
import { formatKoreanDateKey } from '@/lib/seoul-time';

export const LEAVE_LEDGER_ENTRY_TYPE = {
  AUTO_MONTHLY: 'auto_monthly',
  AUTO_ANNUAL: 'auto_annual',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
  MANUAL_USED_ADJUSTMENT: 'manual_used_adjustment',
  MANUAL_EXPIRE_ADJUSTMENT: 'manual_expire_adjustment',
  MANUAL_COMPENSATE_ADJUSTMENT: 'manual_compensate_adjustment',
  USE: 'use',
  SUBSTITUTE: 'substitute',
  EXPIRE: 'expire',
  COMPENSATE: 'compensate',
} as const;

export type LeaveLedgerEntryType = (typeof LEAVE_LEDGER_ENTRY_TYPE)[keyof typeof LEAVE_LEDGER_ENTRY_TYPE];

type Ymd = { year: number; month: number; day: number };

export type LeaveCycle = {
  key: string;
  start: string;
  end: string;
  completedYears: number;
};

export type UnifiedLeaveLedgerEntry = {
  id: string;
  entryType: string;
  days: number;
  occurredOn: string;
  periodKey: string;
  sourceId: string | null;
  note: string | null;
};

export type UnifiedLeaveSummary = {
  staffId: string;
  hireDate: string;
  cycle: LeaveCycle;
  total: number;
  used: number;
  expired: number;
  compensated: number;
  remaining: number;
  entries: UnifiedLeaveLedgerEntry[];
};

export type ManualLeaveTarget = {
  total: number;
  used: number;
  expired?: number;
  compensated?: number;
  note?: string;
};

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateKey(value: string | null | undefined): string | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!matched) return null;
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

function parseDateKey(value: string): Ymd | null {
  const key = toDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addYearsToDateKey(value: string, years: number): string | null {
  const parsed = parseDateKey(value);
  if (!parsed) return null;
  const targetYear = parsed.year + years;
  const targetDay = Math.min(parsed.day, daysInMonth(targetYear, parsed.month));
  return `${targetYear}-${String(parsed.month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function completedLeaveYears(hireDate: string, asOfDate: string): number {
  const hire = parseDateKey(hireDate);
  const asOf = parseDateKey(asOfDate);
  if (!hire || !asOf) return 0;
  let years = asOf.year - hire.year;
  if (asOf.month < hire.month || (asOf.month === hire.month && asOf.day < hire.day)) years -= 1;
  return Math.max(0, years);
}

export function getLeaveCycle(hireDate: string, asOfDate: string): LeaveCycle | null {
  const hire = toDateKey(hireDate);
  const asOf = toDateKey(asOfDate);
  if (!hire || !asOf) return null;

  if (hire > asOf) {
    const end = addYearsToDateKey(hire, 1) ?? `${asOf.slice(0, 4)}-12-31`;
    return {
      key: `first-year:${hire}`,
      start: hire,
      end,
      completedYears: 0,
    };
  }

  const completedYears = completedLeaveYears(hire, asOf);
  const start = completedYears === 0 ? hire : addYearsToDateKey(hire, completedYears);
  const end = addYearsToDateKey(hire, completedYears + 1);
  if (!start || !end) return null;

  return {
    key: completedYears === 0 ? `first-year:${hire}` : `annual:${completedYears}:${start}`,
    start,
    end,
    completedYears,
  };
}

function isWithinCycle(dateKey: string, cycle: LeaveCycle): boolean {
  return dateKey >= cycle.start && dateKey < cycle.end;
}

function approved(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '승인' || normalized === 'approved';
}

function leaveDays(row: { leave_type: string | null; start_date: string | null; end_date: string | null; days: number | null }): number {
  if (getLeaveUnit(row.leave_type) === 0.5) return 0.5;
  const stored = Number(row.days);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const start = toDateKey(row.start_date);
  const end = toDateKey(row.end_date ?? row.start_date);
  if (!start || !end || end < start) return 1;
  const from = new Date(`${start}T00:00:00Z`).getTime();
  const to = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}

async function getStaffLeaveContext(staffId: string) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[unified-leave-ledger] D1 binding not available');
  const db = getD1Drizzle(d1);
  const searchKey = String(staffId ?? '').trim();
  const rows = await db
    .select({
      id: staffMembersTable.id,
      company_id: staffMembersTable.company_id,
      hire_date: staffMembersTable.hire_date,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      annual_leave_total: staffMembersTable.annual_leave_total,
      annual_leave_used: staffMembersTable.annual_leave_used,
    })
    .from(staffMembersTable)
    .where(
      or(
        eq(staffMembersTable.id, searchKey),
        eq(staffMembersTable.auth_user_id, searchKey),
        eq(staffMembersTable.employee_no, searchKey),
        eq(staffMembersTable.name, searchKey),
      )
    )
    .limit(1);
  const staff = rows[0];
  if (!staff) throw new Error(`직원 정보를 찾을 수 없습니다. (${staffId})`);
  const todayKey = formatKoreanDateKey(new Date());
  const hireDate = toDateKey(staff.hire_date ?? staff.join_date ?? staff.joined_at) || todayKey;
  return { db, staff, hireDate };
}

async function upsertLedgerEntry(
  db: ReturnType<typeof getD1Drizzle>,
  input: {
    staffId: string;
    companyId?: string | null;
    entryType: LeaveLedgerEntryType;
    days: number;
    occurredOn: string;
    periodKey: string;
    sourceId?: string | null;
    note?: string | null;
  },
) {
  await db
    .insert(leaveLedgerTable)
    .values({
      id: crypto.randomUUID(),
      staff_id: input.staffId,
      company_id: input.companyId ?? null,
      entry_type: input.entryType,
      days: roundDays(input.days),
      occurred_on: input.occurredOn,
      period_key: input.periodKey,
      source_id: input.sourceId ?? null,
      note: input.note ?? null,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [leaveLedgerTable.staff_id, leaveLedgerTable.entry_type, leaveLedgerTable.period_key],
      set: {
        company_id: input.companyId ?? null,
        days: roundDays(input.days),
        occurred_on: input.occurredOn,
        source_id: input.sourceId ?? null,
        note: input.note ?? null,
      },
    });
}

export async function recordAutomaticLeaveGrant(input: {
  staffId: string;
  companyId?: string | null;
  kind: 'monthly' | 'annual';
  days: number;
  periodKey: string;
  occurredOn: string;
  note: string;
}) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[unified-leave-ledger] D1 binding not available');
  const db = getD1Drizzle(d1);
  await upsertLedgerEntry(db, {
    ...input,
    entryType: input.kind === 'monthly'
      ? LEAVE_LEDGER_ENTRY_TYPE.AUTO_MONTHLY
      : LEAVE_LEDGER_ENTRY_TYPE.AUTO_ANNUAL,
  });
}

export async function recordSubstituteLeaveGrant(input: {
  staffId: string;
  companyId?: string | null;
  workDate: string;
  days: number;
  note: string;
}) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[unified-leave-ledger] D1 binding not available');
  const db = getD1Drizzle(d1);
  await upsertLedgerEntry(db, {
    staffId: input.staffId,
    companyId: input.companyId,
    entryType: LEAVE_LEDGER_ENTRY_TYPE.SUBSTITUTE,
    days: Math.abs(input.days),
    occurredOn: input.workDate,
    periodKey: `substitute:${input.workDate}`,
    sourceId: input.workDate,
    note: input.note,
  });
}

export async function getUnifiedAnnualLeaveSummary(
  staffId: string,
  asOfDate = formatKoreanDateKey(new Date()),
): Promise<UnifiedLeaveSummary> {
  const { db, staff, hireDate } = await getStaffLeaveContext(staffId);
  const cycle = getLeaveCycle(hireDate, asOfDate) ?? {
    key: `fallback:${asOfDate.slice(0, 4)}`,
    start: `${asOfDate.slice(0, 4)}-01-01`,
    end: `${asOfDate.slice(0, 4)}-12-31`,
    completedYears: 0,
  };

  const rows = await db
    .select({
      id: leaveLedgerTable.id,
      entry_type: leaveLedgerTable.entry_type,
      days: leaveLedgerTable.days,
      occurred_on: leaveLedgerTable.occurred_on,
      period_key: leaveLedgerTable.period_key,
      source_id: leaveLedgerTable.source_id,
      note: leaveLedgerTable.note,
    })
    .from(leaveLedgerTable)
    .where(eq(leaveLedgerTable.staff_id, staff.id));

  let entries = rows
    .map((row) => ({
      id: String(row.id),
      entryType: String(row.entry_type),
      days: Number(row.days) || 0,
      occurredOn: toDateKey(row.occurred_on) ?? '',
      periodKey: String(row.period_key),
      sourceId: row.source_id ?? null,
      note: row.note ?? null,
    }))
    .filter((row) => {
      if (!row.occurredOn) return false;
      if (
        row.entryType === LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT ||
        row.entryType === LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT ||
        row.entryType === LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT ||
        row.entryType === LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT ||
        row.entryType === 'initial_grant' ||
        row.periodKey.startsWith('auto-seed:')
      ) {
        return true;
      }
      return isWithinCycle(row.occurredOn, cycle);
    });

  // 법정 자동 발생은 processAnnualLeaveAccrual / 백필 스크립트만 기록한다.
  // 조회 경로에서 1년 미만 11일 시드 등 write side-effect를 두지 않는다.
  // (과거 auto-seed 잔존분은 집계에서 제외)

  entries = entries.filter((row) => !row.periodKey.startsWith('auto-seed:'));

  let total = 0;
  let used = 0;
  let expired = 0;
  let compensated = 0;
  let remainingRaw = 0;

  for (const entry of entries) {
    const days = Number(entry.days) || 0;
    remainingRaw += days;
    switch (entry.entryType) {
      case LEAVE_LEDGER_ENTRY_TYPE.USE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT:
        used += -days;
        break;
      case LEAVE_LEDGER_ENTRY_TYPE.EXPIRE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT:
        expired += -days;
        break;
      case LEAVE_LEDGER_ENTRY_TYPE.COMPENSATE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT:
        compensated += -days;
        break;
      default:
        total += days;
        break;
    }
  }

  const finalTotal = roundDays(total);
  const finalUsed = roundDays(Math.max(0, used));
  const finalRemaining = roundDays(Math.max(0, remainingRaw));

  // staff_members 및 leave_balances 레거시 테이블을 원장 수치로 완전 동기화 (Clean-up)
  void Promise.all([
    db
      .update(staffMembersTable)
      .set({
        annual_leave_total: finalTotal,
        annual_leave_used: finalUsed,
      })
      .where(eq(staffMembersTable.id, staff.id)),
    db
      .insert(leaveBalancesTable)
      .values({
        id: crypto.randomUUID(),
        staff_id: staff.id,
        year: Number(asOfDate.slice(0, 4)) || new Date().getFullYear(),
        total_days: finalTotal,
        used_days: finalUsed,
        remaining_days: finalRemaining,
        expired_days: roundDays(Math.max(0, expired)),
        compensated_days: roundDays(Math.max(0, compensated)),
        updated_at: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [sql`staff_id`, sql`year`],
        set: {
          total_days: finalTotal,
          used_days: finalUsed,
          remaining_days: finalRemaining,
          expired_days: roundDays(Math.max(0, expired)),
          compensated_days: roundDays(Math.max(0, compensated)),
          updated_at: new Date().toISOString(),
        },
      }),
  ]).catch((err) => console.error('[getUnifiedAnnualLeaveSummary] DB sync failed:', err));

  return {
    staffId,
    hireDate,
    cycle,
    total: finalTotal,
    used: finalUsed,
    expired: roundDays(Math.max(0, expired)),
    compensated: roundDays(Math.max(0, compensated)),
    remaining: finalRemaining,
    entries,
  };
}

async function currentAdjustmentDays(
  db: ReturnType<typeof getD1Drizzle>,
  staffId: string,
  entryType: LeaveLedgerEntryType,
  periodKey: string,
): Promise<number> {
  const rows = await db
    .select({ days: leaveLedgerTable.days })
    .from(leaveLedgerTable)
    .where(and(
      eq(leaveLedgerTable.staff_id, staffId),
      eq(leaveLedgerTable.entry_type, entryType),
      eq(leaveLedgerTable.period_key, periodKey),
    ))
    .limit(1);
  return Number(rows[0]?.days) || 0;
}

export async function setManualAnnualLeaveTarget(
  staffId: string,
  target: ManualLeaveTarget,
  asOfDate = formatKoreanDateKey(new Date()),
): Promise<UnifiedLeaveSummary> {
  for (const value of [target.total, target.used, target.expired ?? 0, target.compensated ?? 0]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('연차 수량은 0 이상이어야 합니다.');
  }
  if ((target.used + (target.expired ?? 0) + (target.compensated ?? 0)) > target.total + 1e-9) {
    throw new Error('사용/소멸/수당 합계가 총 연차를 초과할 수 없습니다.');
  }

  const { db, staff, hireDate } = await getStaffLeaveContext(staffId);
  const cycle = getLeaveCycle(hireDate, asOfDate) ?? {
    key: `fallback:${asOfDate.slice(0, 4)}`,
    start: `${asOfDate.slice(0, 4)}-01-01`,
    end: `${asOfDate.slice(0, 4)}-12-31`,
    completedYears: 0,
  };
  const before = await getUnifiedAnnualLeaveSummary(staffId, asOfDate);
  const prefix = `manual:${cycle.key}`;
  const occurredOn = asOfDate;

  const totalKey = `${prefix}:total`;
  const usedKey = `${prefix}:used`;
  const expiredKey = `${prefix}:expired`;
  const compensatedKey = `${prefix}:compensated`;
  const [currentTotal, currentUsed, currentExpired, currentCompensated] = await Promise.all([
    currentAdjustmentDays(db, staffId, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT, totalKey),
    currentAdjustmentDays(db, staffId, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT, usedKey),
    currentAdjustmentDays(db, staffId, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT, expiredKey),
    currentAdjustmentDays(db, staffId, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT, compensatedKey),
  ]);

  await Promise.all([
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT,
      days: currentTotal + (target.total - before.total),
      occurredOn,
      periodKey: totalKey,
      note: target.note ?? '관리자 수동 총 연차 변경',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT,
      days: currentUsed - (target.used - before.used),
      occurredOn,
      periodKey: usedKey,
      note: target.note ?? '관리자 수동 사용일수 변경',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT,
      days: currentExpired - ((target.expired ?? 0) - before.expired),
      occurredOn,
      periodKey: expiredKey,
      note: target.note ?? '관리자 수동 소멸일수 변경',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT,
      days: currentCompensated - ((target.compensated ?? 0) - before.compensated),
      occurredOn,
      periodKey: compensatedKey,
      note: target.note ?? '관리자 수동 수당일수 변경',
    }),
  ]);

  return getUnifiedAnnualLeaveSummary(staffId, asOfDate);
}

export async function syncApprovedLeaveRequestsToLedger(
  staffId: string,
  asOfDate = formatKoreanDateKey(new Date()),
): Promise<UnifiedLeaveSummary> {
  const { db, staff } = await getStaffLeaveContext(staffId);
  const rows = await db
    .select({
      id: leaveRequestsTable.id,
      company_id: leaveRequestsTable.company_id,
      leave_type: leaveRequestsTable.leave_type,
      start_date: leaveRequestsTable.start_date,
      end_date: leaveRequestsTable.end_date,
      days: leaveRequestsTable.days,
      status: leaveRequestsTable.status,
      created_at: leaveRequestsTable.created_at,
    })
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.staff_id, staff.id));

  for (const row of rows) {
    const periodKey = `request:${row.id}`;
    const leaveType = String(row.leave_type ?? '');
    const isGrant = leaveType.includes('부여') || leaveType.includes('신규');
    const isRetro = leaveType.includes('소급');
    const isApproved = approved(row.status);

    if (!isApproved || isRetro) {
      await db.delete(leaveLedgerTable).where(and(
        eq(leaveLedgerTable.staff_id, staff.id),
        eq(leaveLedgerTable.period_key, periodKey),
      ));
      continue;
    }

    const occurredOn = toDateKey(row.start_date) ?? toDateKey(row.created_at) ?? asOfDate;

    if (isGrant) {
      // 연차 수동 부여 승인: 법정 자동 발생과 별도로 +일수 반영 (0.5 단위 포함)
      const grantDays = Math.abs(leaveDays(row));
      if (grantDays > 0) {
        await upsertLedgerEntry(db, {
          staffId: staff.id,
          companyId: row.company_id ?? staff.company_id,
          entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT,
          days: grantDays,
          occurredOn,
          periodKey,
          sourceId: row.id,
          note: `연차 수동 부여 승인 (+${grantDays}일)`,
        });
      }
    } else if (isAnnualLeaveType(leaveType) || getLeaveUnit(leaveType) === 0.5) {
      // 일반 연차/반차 휴가 사용 승인 시: 마이너스(-) 일수로 차감
      await upsertLedgerEntry(db, {
        staffId: staff.id,
        companyId: row.company_id ?? staff.company_id,
        entryType: LEAVE_LEDGER_ENTRY_TYPE.USE,
        days: -Math.abs(leaveDays(row)),
        occurredOn,
        periodKey,
        sourceId: row.id,
        note: `휴가 사용 승인 (${leaveType})`,
      });
    }
  }

  return getUnifiedAnnualLeaveSummary(staffId, asOfDate);
}