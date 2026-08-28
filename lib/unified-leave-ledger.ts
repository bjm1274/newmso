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
  getD1Binding,
  getD1Drizzle,
  leave_balances as leaveBalancesTable,
  leave_ledger as leaveLedgerTable,
  leave_requests as leaveRequestsTable,
  staff_members as staffMembersTable,
} from '@/lib/db';
import { getLeaveUnit, isAnnualLeaveType } from '@/lib/leave-type';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { processSingleStaffAccrual } from '@/lib/annual-leave-accrual';
// 주기 계산·원장 집계는 클라이언트도 같은 함수를 써야 해서 lib/leave-cycle.ts 로
// 내렸다. 이 파일은 DB 접근이 필요한 부분만 담당하고, 순수 계산은 재수출한다.
import {
  LEAVE_LEDGER_ENTRY_TYPE,
  aggregateLedgerEntries,
  addYearsToDateKey,
  completedLeaveYears,
  getLeaveCycle,
  toDateKey,
  type LedgerCycleTotals,
  type LeaveCycle,
  type LeaveLedgerEntryType,
  type UnifiedLeaveLedgerEntry,
} from '@/lib/leave-cycle';

export {
  LEAVE_LEDGER_ENTRY_TYPE,
  aggregateLedgerEntries,
  addYearsToDateKey,
  completedLeaveYears,
  getLeaveCycle,
};
export type {
  LedgerCycleTotals,
  LeaveCycle,
  LeaveLedgerEntryType,
  UnifiedLeaveLedgerEntry,
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
  // 식별자는 id / auth_user_id 만 받는다.
  //
  // 예전에는 employee_no 와 name 까지 OR 로 묶고 정렬 없이 .limit(1) 을 했다.
  // 라우트의 IDOR 게이트는 "세션 사용자 id == 요청 staffId" 로 판정하는데,
  // 여기서 이름·사번까지 받아주면 게이트가 검사한 값과 실제로 조회되는 직원이
  // 달라질 수 있었다(동명이인·사번 충돌 시 어느 행이 나올지 정렬 미지정이라
  // 보장도 없다). 이름/사번으로 직원을 찾는 일은 회사 스코프를 명시한
  // 별도 조회 경로가 담당해야 한다.
  const rows = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      company_id: staffMembersTable.company_id,
      status: staffMembersTable.status,
      hire_date: staffMembersTable.hire_date,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      permissions: staffMembersTable.permissions,
      annual_leave_total: staffMembersTable.annual_leave_total,
      annual_leave_used: staffMembersTable.annual_leave_used,
    })
    .from(staffMembersTable)
    .where(
      or(
        eq(staffMembersTable.id, searchKey),
        eq(staffMembersTable.auth_user_id, searchKey),
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

/**
 * 특정 주기의 원장 잔여를 읽는다. **쓰기 부작용이 없다.**
 *
 * getUnifiedAnnualLeaveSummary 는 조회하면서 staff_members·leave_balances 를
 * 현재 주기 수치로 덮어쓰므로, 지난 주기를 확인하려고 그걸 호출하면
 * 현재 미러가 과거 값으로 오염된다. 소멸 배치는 이 함수를 쓴다.
 */
export async function getLeaveCycleBalance(
  staffId: string,
  cycle: LeaveCycle,
): Promise<LedgerCycleTotals> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[unified-leave-ledger] D1 binding not available');
  const db = getD1Drizzle(d1);
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
  return aggregateLedgerEntries(rows, cycle);
}

/**
 * 미사용 연차 소멸을 원장에 기록한다.
 *
 * 예전에는 소멸 처리가 leave_balances 만 갱신하고 원장에는 아무것도 남기지
 * 않았다 — 저장소 전체에 expire 를 쓰는 코드가 0건이었다. 그런데 요약 조회는
 * 원장을 재집계해 leave_balances 를 덮어쓰므로, **원장에 없는 소멸은 다음 조회
 * 때 0 이 되고 잔여연차가 되살아났다.** 법정 소멸과 미사용 수당 정산의 근거가
 * 함께 무너진다.
 *
 * period_key 는 주기 단위라 (staff_id, entry_type, period_key) 유니크 인덱스가
 * 재실행을 흡수한다 — 같은 주기를 두 번 소멸시켜도 행이 늘지 않는다.
 */
export async function recordLeaveExpiry(input: {
  staffId: string;
  companyId?: string | null;
  days: number;
  occurredOn: string;
  cycleKey: string;
  note?: string | null;
}) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[unified-leave-ledger] D1 binding not available');
  const db = getD1Drizzle(d1);
  await upsertLedgerEntry(db, {
    staffId: input.staffId,
    companyId: input.companyId,
    entryType: LEAVE_LEDGER_ENTRY_TYPE.EXPIRE,
    // 소멸은 잔여를 깎으므로 음수로 적는다 (집계가 부호로 구분한다).
    days: -Math.abs(input.days),
    occurredOn: input.occurredOn,
    periodKey: `expire:${input.cycleKey}`,
    sourceId: input.cycleKey,
    note: input.note ?? null,
  });
}

/**
 * leave_balances 미러를 원장 수치로 맞춘다.
 *
 * 예전에는 `onConflictDoUpdate({ target: [staff_id, year] })` 로 upsert 했는데,
 * leave_balances 에는 (staff_id, year) 유니크 제약이 없다. D1 은
 * "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint" 로
 * 거부하므로 **이 동기화는 한 번도 성공한 적이 없다.** 실패는 catch 로 삼켜져
 * 로그에만 남았고, 그래서 expiry_date 를 비롯한 미러 컬럼이 계속 비어 있었다.
 *
 * 제약을 새로 만들려면 기존 중복 행 정리가 선행돼야 해서(운영 DB 마이그레이션),
 * 여기서는 조회 후 갱신/삽입으로 처리한다. 동시 호출이 겹치면 행이 둘 생길 수
 * 있는데, 제약이 없는 지금은 upsert 였어도 마찬가지다. 근본 해결은
 * (staff_id, year) 유니크 인덱스 추가다.
 */
async function syncLeaveBalanceMirror(
  db: ReturnType<typeof getD1Drizzle>,
  input: {
    staffId: string;
    year: number;
    total: number;
    used: number;
    remaining: number;
    expired: number;
    compensated: number;
    expiryDate: string;
  },
) {
  const values = {
    total_days: input.total,
    used_days: input.used,
    remaining_days: input.remaining,
    expired_days: input.expired,
    compensated_days: input.compensated,
    expiry_date: input.expiryDate,
    updated_at: new Date().toISOString(),
  };

  const existing = await db
    .select({ id: leaveBalancesTable.id })
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.staff_id, input.staffId), eq(leaveBalancesTable.year, input.year)))
    .limit(1);

  if (existing[0]) {
    await db.update(leaveBalancesTable).set(values).where(eq(leaveBalancesTable.id, existing[0].id));
    return;
  }

  await db.insert(leaveBalancesTable).values({
    id: crypto.randomUUID(),
    staff_id: input.staffId,
    year: input.year,
    ...values,
  });
}

export async function getUnifiedAnnualLeaveSummary(
  staffId: string,
  asOfDate = formatKoreanDateKey(new Date()),
): Promise<UnifiedLeaveSummary> {
  const { db, staff, hireDate } = await getStaffLeaveContext(staffId);

  // 직원의 당일 기준 법정 연차/월차 자동발생 미부여분을 온디맨드로 평가 및 안전하게 원장 반영 (멱등성 보장)
  try {
    await processSingleStaffAccrual(db, staff, asOfDate);
  } catch (err) {
    console.warn(`[getUnifiedAnnualLeaveSummary] 온디맨드 연차 자동발생 평가 실패 (${staff.id}):`, err);
  }

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

  const { entries, total, used, expired, compensated, remaining: finalRemaining } =
    aggregateLedgerEntries(rows, cycle);
  const finalTotal = total;
  const finalUsed = used;

  // staff_members 및 leave_balances 레거시 테이블을 원장 수치로 완전 동기화 (Clean-up)
  void Promise.all([
    db
      .update(staffMembersTable)
      .set({
        annual_leave_total: finalTotal,
        annual_leave_used: finalUsed,
      })
      .where(eq(staffMembersTable.id, staff.id)),
    syncLeaveBalanceMirror(db, {
      staffId: staff.id,
      year: Number(asOfDate.slice(0, 4)) || new Date().getFullYear(),
      total: finalTotal,
      used: finalUsed,
      remaining: finalRemaining,
      expired,
      compensated,
      // 주기 만료일을 함께 채운다. 예전에는 신규 직원 등록에서만 넣어서
      // 2년차 이후 행은 expiry_date 가 NULL 이었다.
      expiryDate: cycle.end,
    }),
  ]).catch((err) => console.error('[getUnifiedAnnualLeaveSummary] DB sync failed:', err));

  return {
    // 호출부가 auth_user_id 를 넘겼어도 resolve 된 id 를 돌려준다.
    staffId: staff.id,
    hireDate,
    cycle,
    total: finalTotal,
    used: finalUsed,
    expired,
    compensated,
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

  // 원장 기록에는 **resolve 된 staff.id** 만 쓴다.
  //
  // 예전에는 인자로 받은 staffId 를 그대로 staff_id 컬럼에 적었다. 호출부가
  // auth_user_id 를 넘기면 원장에는 그 값으로 행이 생기고, 조회는 staff.id 로
  // 하므로 방금 넣은 수동조정이 요약에 잡히지 않았다(FK 가 걸려 있으면 조용한
  // 오염 대신 명시적 실패가 된다). 조회 기준과 기록 기준을 하나로 맞춘다.
  const { db, staff, hireDate } = await getStaffLeaveContext(staffId);
  const cycle = getLeaveCycle(hireDate, asOfDate) ?? {
    key: `fallback:${asOfDate.slice(0, 4)}`,
    start: `${asOfDate.slice(0, 4)}-01-01`,
    end: `${asOfDate.slice(0, 4)}-12-31`,
    completedYears: 0,
  };
  const before = await getUnifiedAnnualLeaveSummary(staff.id, asOfDate);
  const prefix = `manual:${cycle.key}`;
  const occurredOn = asOfDate;

  const totalKey = `${prefix}:total`;
  const usedKey = `${prefix}:used`;
  const expiredKey = `${prefix}:expired`;
  const compensatedKey = `${prefix}:compensated`;
  const [currentTotal, currentUsed, currentExpired, currentCompensated] = await Promise.all([
    currentAdjustmentDays(db, staff.id, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT, totalKey),
    currentAdjustmentDays(db, staff.id, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT, usedKey),
    currentAdjustmentDays(db, staff.id, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT, expiredKey),
    currentAdjustmentDays(db, staff.id, LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT, compensatedKey),
  ]);

  await Promise.all([
    upsertLedgerEntry(db, {
      staffId: staff.id,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT,
      days: currentTotal + (target.total - before.total),
      occurredOn,
      periodKey: totalKey,
      note: target.note ?? '관리자 수동 총 연차 변경',
    }),
    upsertLedgerEntry(db, {
      staffId: staff.id,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT,
      days: currentUsed - (target.used - before.used),
      occurredOn,
      periodKey: usedKey,
      note: target.note ?? '관리자 수동 사용일수 변경',
    }),
    upsertLedgerEntry(db, {
      staffId: staff.id,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT,
      days: currentExpired - ((target.expired ?? 0) - before.expired),
      occurredOn,
      periodKey: expiredKey,
      note: target.note ?? '관리자 수동 소멸일수 변경',
    }),
    upsertLedgerEntry(db, {
      staffId: staff.id,
      companyId: staff.company_id,
      entryType: LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT,
      days: currentCompensated - ((target.compensated ?? 0) - before.compensated),
      occurredOn,
      periodKey: compensatedKey,
      note: target.note ?? '관리자 수동 수당일수 변경',
    }),
  ]);

  return getUnifiedAnnualLeaveSummary(staff.id, asOfDate);
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