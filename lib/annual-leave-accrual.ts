/**
 * 연차 자동발생 (근로기준법 제60조)
 *
 * - 입사 1년 미만: 입사 응당일 기준 1개월 단위로 끊어, 그 기간에 결근(absent)이 0이면 +1일 (월 만근).
 *   첫 1년간 최대 11일 (월차 k=1..11). 12개월째 = 만 1년 → 연차 부여로 전환.
 * - 만 N년(N>=1): 입사 응당일마다 연차 부여. 일수 = min(25, 15 + floor((N-1)/2)).
 *     1년=15, 3년=16, 5년=17 … 21년+=25.  (1년 미만 누적분과 별개로 신규 부여)
 *
 * 멱등성: leave_accruals(staff_id, kind, period_key) UNIQUE.
 *   → 매일 도는 크론이 같은 기간을 중복 부여하지 않는다.
 *
 * 만근 판정: attendances(work_date) 에 status IN ('absent','결근') 기록이 1건이라도 있으면 만근 불인정.
 *   (지각·조퇴·승인된 연차/휴가는 출근 간주 — resolveAttendanceStatus 규칙과 동일하게 결근만 차감)
 */

import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  leave_accruals as leaveAccrualsTable,
  attendances as attendancesTable,
  eq,
  and,
  gte,
  lt,
  inArray,
  isNotNull,
} from '@/lib/db';

const ABSENT_STATUSES = ['absent', '결근'] as const;

export type AccrualGrant = {
  staffId: string;
  staffName: string;
  kind: 'monthly' | 'annual';
  days: number;
  periodKey: string;
  note: string;
};

export type AccrualRunResult = {
  scanned: number;
  granted: AccrualGrant[];
  skipped: number;
  errors: string[];
};

// ─── 날짜 키(YYYY-MM-DD) 순수 계산 (타임존 비의존) ───────────────────────────────

type Ymd = { y: number; m: number; d: number };

function parseKey(key: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate(); // m: 1-based → Date(y, m, 0) = 그 달 마지막 날
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 입사 응당일 + months개월 (말일 클램프). */
export function addMonthsKey(hireKey: string, months: number): string | null {
  const p = parseKey(hireKey);
  if (!p) return null;
  const total = (p.y * 12 + (p.m - 1)) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p.d, daysInMonth(y, m));
  return toKey(y, m, d);
}

/** 입사 응당일 + years년 (2/29 → 2/28 클램프). */
export function addYearsKey(hireKey: string, years: number): string | null {
  const p = parseKey(hireKey);
  if (!p) return null;
  const y = p.y + years;
  const d = Math.min(p.d, daysInMonth(y, p.m));
  return toKey(y, p.m, d);
}

/** 만 근속년수(완료 연수). today < 1년이면 0. */
export function tenureYears(hireKey: string, todayKey: string): number {
  const h = parseKey(hireKey);
  const t = parseKey(todayKey);
  if (!h || !t) return 0;
  let years = t.y - h.y;
  if (t.m < h.m || (t.m === h.m && t.d < h.d)) years -= 1;
  return Math.max(0, years);
}

/** 만 N년차 연차 부여일수. N<1 → 0. */
export function annualLeaveDaysForTenure(years: number): number {
  if (years < 1) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

/**
 * 오늘(todayKey)이 입사 응당일이면 직전 1개월 구간 반환 (k=1..11).
 * 없으면 null.
 */
export function getDueMonthlyPeriod(
  hireKey: string,
  todayKey: string,
): { monthIndex: number; startKey: string; endKey: string } | null {
  for (let k = 1; k <= 11; k += 1) {
    if (addMonthsKey(hireKey, k) === todayKey) {
      const startKey = addMonthsKey(hireKey, k - 1);
      const endKey = addMonthsKey(hireKey, k);
      if (startKey && endKey) return { monthIndex: k, startKey, endKey };
    }
  }
  return null;
}

/** 오늘이 만 N년차 응당일이면 N(>=1) 반환, 아니면 null. */
export function getDueAnnualYear(hireKey: string, todayKey: string): number | null {
  // 합리적 상한 60년
  for (let n = 1; n <= 60; n += 1) {
    const anniv = addYearsKey(hireKey, n);
    if (!anniv) return null;
    if (anniv === todayKey) return n;
    if (anniv > todayKey) return null; // 정렬상 더 볼 필요 없음
  }
  return null;
}

// ─── DB ──────────────────────────────────────────────────────────────────────

type DrizzleDb = ReturnType<typeof getD1Drizzle>;

/** [startKey, endKey) 구간에 결근 기록이 없으면 true(만근). */
async function isFullAttendanceMonth(
  db: DrizzleDb,
  staffId: string,
  startKey: string,
  endKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: attendancesTable.id })
    .from(attendancesTable)
    .where(
      and(
        eq(attendancesTable.staff_id, staffId),
        gte(attendancesTable.work_date, startKey),
        lt(attendancesTable.work_date, endKey),
        inArray(attendancesTable.status, [...ABSENT_STATUSES]),
      ),
    )
    .limit(1);
  return rows.length === 0;
}

/** leave_accruals 멱등 INSERT. 이미 있으면 false(중복). */
async function tryInsertAccrual(
  db: DrizzleDb,
  row: {
    staffId: string;
    companyId: string | null;
    kind: 'monthly' | 'annual';
    periodKey: string;
    days: number;
    year: number;
    sourceDate: string;
    note: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(leaveAccrualsTable)
    .values({
      id: crypto.randomUUID(),
      staff_id: row.staffId,
      company_id: row.companyId,
      kind: row.kind,
      period_key: row.periodKey,
      days: row.days,
      year: row.year,
      source_date: row.sourceDate,
      note: row.note,
      created_at: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: leaveAccrualsTable.id });
  return inserted.length > 0;
}

type StaffRow = {
  id: string;
  name: string;
  company_id: string | null;
  status: string | null;
  annual_leave_total: number | null;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
};

function resolveHireKey(s: StaffRow): string | null {
  const raw = s.hire_date ?? s.join_date ?? s.joined_at ?? null;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

/**
 * 전체 재직 직원 대상 연차 자동발생 처리 (크론 진입점).
 * @param todayKey KST 기준 'YYYY-MM-DD' (미지정 시 오늘)
 */
export async function processAnnualLeaveAccrual(todayKey: string): Promise<AccrualRunResult> {
  const result: AccrualRunResult = { scanned: 0, granted: [], skipped: 0, errors: [] };
  const targetYear = Number(todayKey.slice(0, 4)) || new Date().getFullYear();

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-accrual] D1 binding not available');
  const db = getD1Drizzle(d1);

  const staffs = (await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      company_id: staffMembersTable.company_id,
      status: staffMembersTable.status,
      annual_leave_total: staffMembersTable.annual_leave_total,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      hire_date: staffMembersTable.hire_date,
    })
    .from(staffMembersTable)
    .where(isNotNull(staffMembersTable.id))) as StaffRow[];

  for (const s of staffs) {
    result.scanned += 1;
    // 재직자만
    if (s.status && s.status !== '재직') {
      result.skipped += 1;
      continue;
    }
    const hireKey = resolveHireKey(s);
    if (!hireKey || hireKey > todayKey) {
      result.skipped += 1;
      continue;
    }

    try {
      // 1) 만 N년차 응당일 → 연차 부여 (set)
      const dueYear = getDueAnnualYear(hireKey, todayKey);
      if (dueYear !== null) {
        const days = annualLeaveDaysForTenure(dueYear);
        const periodKey = `annual:${dueYear}`;
        const ok = await tryInsertAccrual(db, {
          staffId: s.id,
          companyId: s.company_id,
          kind: 'annual',
          periodKey,
          days,
          year: targetYear,
          sourceDate: todayKey,
          note: `만 ${dueYear}년차 연차 ${days}일 자동부여`,
        });
        if (ok) {
          // 신규 연차연도 → 총량을 해당 연차로 설정(replace)
          await db
            .update(staffMembersTable)
            .set({ annual_leave_total: days, annual_leave_used: 0 })
            .where(eq(staffMembersTable.id, s.id));
          await recalculateLeaveBalance(s.id, targetYear);
          result.granted.push({
            staffId: s.id,
            staffName: s.name,
            kind: 'annual',
            days,
            periodKey,
            note: `만 ${dueYear}년차 ${days}일`,
          });
        } else {
          result.skipped += 1;
        }
        continue; // 응당일엔 월차 발생 안 함
      }

      // 2) 1년 미만 월 만근 → +1일
      if (tenureYears(hireKey, todayKey) >= 1) {
        result.skipped += 1;
        continue;
      }
      const period = getDueMonthlyPeriod(hireKey, todayKey);
      if (!period) {
        result.skipped += 1;
        continue;
      }
      const fullAttendance = await isFullAttendanceMonth(db, s.id, period.startKey, period.endKey);
      if (!fullAttendance) {
        result.skipped += 1;
        continue; // 결근 있음 → 미부여
      }
      const periodKey = period.startKey.slice(0, 7); // 'YYYY-MM'
      const ok = await tryInsertAccrual(db, {
        staffId: s.id,
        companyId: s.company_id,
        kind: 'monthly',
        periodKey,
        days: 1,
        year: targetYear,
        sourceDate: todayKey,
        note: `${period.monthIndex}개월차 만근 +1일`,
      });
      if (!ok) {
        result.skipped += 1;
        continue;
      }
      const current = Number(s.annual_leave_total) || 0;
      await db
        .update(staffMembersTable)
        .set({ annual_leave_total: current + 1 })
        .where(eq(staffMembersTable.id, s.id));
      await recalculateLeaveBalance(s.id, targetYear);
      result.granted.push({
        staffId: s.id,
        staffName: s.name,
        kind: 'monthly',
        days: 1,
        periodKey,
        note: `${period.monthIndex}개월차 만근`,
      });
    } catch (err) {
      result.errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
