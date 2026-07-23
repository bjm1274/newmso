/**
 * ?? ?? ?? ???.
 *
 * ?? ??? leave_ledger? ???????. ?????? ??? ? ?????,
 * leave_requests? ?? workflow? ???? ??? ?? ?? ? ??? ?????.
 */

import {
  and,
  eq,
  getD1Binding,
  getD1Drizzle,
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
  if (!hire || !asOf || hire > asOf) return null;

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
  return normalized === '??' || normalized === 'approved';
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
  const rows = await db
    .select({
      id: staffMembersTable.id,
      company_id: staffMembersTable.company_id,
      hire_date: staffMembersTable.hire_date,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
    })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, staffId))
    .limit(1);
  const staff = rows[0];
  if (!staff) throw new Error(`?? ??? ?? ? ????. (${staffId})`);
  const hireDate = toDateKey(staff.hire_date ?? staff.join_date ?? staff.joined_at);
  if (!hireDate) throw new Error(`???? ?? ??? ??? ? ????. (${staffId})`);
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
  const { db, hireDate } = await getStaffLeaveContext(staffId);
  const cycle = getLeaveCycle(hireDate, asOfDate);
  if (!cycle) throw new Error(`?? ??? ??? ? ????. (${staffId})`);

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
    .where(eq(leaveLedgerTable.staff_id, staffId));

  const entries = rows
    .map((row) => ({
      id: String(row.id),
      entryType: String(row.entry_type),
      days: Number(row.days) || 0,
      occurredOn: toDateKey(row.occurred_on) ?? '',
      periodKey: String(row.period_key),
      sourceId: row.source_id ?? null,
      note: row.note ?? null,
    }))
    .filter((row) => row.occurredOn && isWithinCycle(row.occurredOn, cycle));

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

  return {
    staffId,
    hireDate,
    cycle,
    total: roundDays(total),
    used: roundDays(Math.max(0, used)),
    expired: roundDays(Math.max(0, expired)),
    compensated: roundDays(Math.max(0, compensated)),
    remaining: roundDays(Math.max(0, remainingRaw)),
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
    if (!Number.isFinite(value) || value < 0) throw new Error('?? ?? 0 ??? ???? ???.');
  }
  if ((target.used + (target.expired ?? 0) + (target.compensated ?? 0)) > target.total + 1e-9) {
    throw new Error('???????? ??? ? ??? ??? ? ????.');
  }

  const { db, staff, hireDate } = await getStaffLeaveContext(staffId);
  const cycle = getLeaveCycle(hireDate, asOfDate);
  if (!cycle) throw new Error(`?? ??? ??? ? ????. (${staffId})`);
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
      note: target.note ?? '??? ?? ?? ?? ??',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT,
      days: currentUsed - (target.used - before.used),
      occurredOn,
      periodKey: usedKey,
      note: target.note ?? '??? ?? ?? ??? ??',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT,
      days: currentExpired - ((target.expired ?? 0) - before.expired),
      occurredOn,
      periodKey: expiredKey,
      note: target.note ?? '??? ?? ?? ?? ??',
    }),
    upsertLedgerEntry(db, {
      staffId,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT,
      days: currentCompensated - ((target.compensated ?? 0) - before.compensated),
      occurredOn,
      periodKey: compensatedKey,
      note: target.note ?? '??? ?? ?? ?? ??',
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
    .where(eq(leaveRequestsTable.staff_id, staffId));

  for (const row of rows) {
    const periodKey = `request:${row.id}`;
    const leaveType = String(row.leave_type ?? '');
    const countable = approved(row.status)
      && !leaveType.includes('??')
      && (isAnnualLeaveType(leaveType) || getLeaveUnit(leaveType) === 0.5);
    if (!countable) {
      await db.delete(leaveLedgerTable).where(and(
        eq(leaveLedgerTable.staff_id, staffId),
        eq(leaveLedgerTable.entry_type, LEAVE_LEDGER_ENTRY_TYPE.USE),
        eq(leaveLedgerTable.period_key, periodKey),
      ));
      continue;
    }

    const occurredOn = toDateKey(row.start_date) ?? toDateKey(row.created_at) ?? asOfDate;
    await upsertLedgerEntry(db, {
      staffId,
      companyId: row.company_id ?? staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.USE,
      days: -Math.abs(leaveDays(row)),
      occurredOn,
      periodKey,
      sourceId: row.id,
      note: `?? ?? ?? (${leaveType})`,
    });
  }

  return getUnifiedAnnualLeaveSummary(staffId, asOfDate);
}
