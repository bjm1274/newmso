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

import { isGroupAccount } from '@/types';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  leave_ledger as leaveLedgerTable,
  attendances as attendancesTable,
  eq,
  and,
  gte,
  lt,
  inArray,
  isNotNull } from '@/lib/db';

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
    sourceDate: string;
    note: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(leaveLedgerTable)
    .values({
      id: crypto.randomUUID(),
      staff_id: row.staffId,
      company_id: row.companyId,
      entry_type: row.kind === 'monthly' ? 'auto_monthly' : 'auto_annual',
      period_key: row.periodKey,
      days: row.days,
      occurred_on: row.sourceDate,
      source_id: row.periodKey,
      note: row.note,
      created_at: new Date().toISOString() })
    .onConflictDoNothing()
    .returning({ id: leaveLedgerTable.id });
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

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-accrual] D1 binding not available');
  const db = getD1Drizzle(d1);

  const staffs = (await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      company_id: staffMembersTable.company_id,
      status: staffMembersTable.status,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      hire_date: staffMembersTable.hire_date })
    .from(staffMembersTable)
    .where(isNotNull(staffMembersTable.id))) as StaffRow[];

  for (const s of staffs) {
    result.scanned += 1;
    // 단체 계정(공용 아이디)은 연차 자동 발생 대상에서 제외
    if (isGroupAccount(s)) {
      result.skipped += 1;
      continue;
    }
    // 재직자만 (공백·null 은 재직으로 간주, '퇴사'/'inactive' 등만 제외)
    const statusNorm = String(s.status ?? '').trim();
    if (
      statusNorm &&
      statusNorm !== '재직' &&
      statusNorm.toLowerCase() !== 'active' &&
      statusNorm !== '재직중'
    ) {
      result.skipped += 1;
      continue;
    }
    const hireKey = resolveHireKey(s);
    if (!hireKey || hireKey > todayKey) {
      result.skipped += 1;
      continue;
    }

    try {
      // 1) 만 N년차 연차 부여 (멱등성 소급 적용 포함)
      const maxYears = tenureYears(hireKey, todayKey);
      let annualGranted = false;
      if (maxYears >= 1) {
        // 이미 부여된 연차 목록 조회
        const existingAccruals = await db
          .select({ period_key: leaveLedgerTable.period_key })
          .from(leaveLedgerTable)
          .where(
            and(
              eq(leaveLedgerTable.staff_id, s.id),
              eq(leaveLedgerTable.entry_type, 'auto_annual')
            )
          );
        const existingAnnualKeys = new Set(existingAccruals.map((a) => a.period_key));

        for (let n = 1; n <= maxYears; n += 1) {
          const periodKey = `annual:${n}`;
          if (!existingAnnualKeys.has(periodKey)) {
            const days = annualLeaveDaysForTenure(n);
            const ok = await tryInsertAccrual(db, {
              staffId: s.id,
              companyId: s.company_id,
              kind: 'annual',
              periodKey,
              days,
              sourceDate: addYearsKey(hireKey, n) ?? todayKey,
              note: `만 ${n}년차 연차 ${days}일 자동부여` });
            if (ok) {
              result.granted.push({
                staffId: s.id,
                staffName: s.name,
                kind: 'annual',
                days,
                periodKey,
                note: `만 ${n}년차 ${days}일` });
              annualGranted = true;
            }
          }
        }
      }

      // 2) 1년 미만 월 만근 → +1일 (경과한 모든 월 구간을 소급 부여)
      // 기존에는 입사 응당일 당일에만 부여해서, cron 이 그 하루를 거르면(배포 공백/CRON_SECRET 미설정 등)
      // 해당 월 +1일이 영구 누락됐다. 이제 경과한 모든 월 구간 중 미부여분을 매 실행마다 메꾼다(멱등).
      //
      // 예전에는 만 1년이 지나면 위에서 무조건 `continue` 해 이 블록에 아예 들어오지
      // 못했다(아래 `tenureYears >= 1` 가드는 그래서 죽은 코드였다). 그 결과
      // 입사 1년째 마지막 달에 크론이 멈춰 있었으면 그 달의 월차 +1일이
      // **영구히 복구 불가**가 됐다. 이제 1년을 넘겨도 미부여분을 메꾼다.
      //
      // 다만 무제한은 아니다. 만근 판정은 "결근 기록이 없으면 만근"이라서,
      // 시스템 도입 이전에 입사해 첫 해 근태 기록이 통째로 없는 직원까지 대상에
      // 넣으면 없던 11일이 새로 생긴다. 크론 공백을 메우는 데 필요한 만큼만
      // (만 2년 미만) 소급한다.
      const MONTHLY_BACKFILL_TENURE_LIMIT = 2;
      if (maxYears >= MONTHLY_BACKFILL_TENURE_LIMIT) {
        if (!annualGranted) result.skipped += 1;
        continue;
      }

      // 이미 부여된 월차 period_key 집합 (멱등 + 소급 판정)
      const existingMonthly = await db
        .select({ period_key: leaveLedgerTable.period_key })
        .from(leaveLedgerTable)
        .where(
          and(
            eq(leaveLedgerTable.staff_id, s.id),
            eq(leaveLedgerTable.entry_type, 'auto_monthly'),
          ),
        );
      const existingMonthlyKeys = new Set(existingMonthly.map((a) => a.period_key));

      let monthlyGranted = 0;
      for (let k = 1; k <= 11; k += 1) {
        const startKey = addMonthsKey(hireKey, k - 1);
        const endKey = addMonthsKey(hireKey, k);
        if (!startKey || !endKey) continue;
        if (endKey > todayKey) break; // 아직 끝나지 않은 월 구간 → 이후 구간도 모두 미완료
        const periodKey = startKey.slice(0, 7); // 'YYYY-MM'
        if (existingMonthlyKeys.has(periodKey)) continue; // 이미 부여됨
        const fullAttendance = await isFullAttendanceMonth(db, s.id, startKey, endKey);
        if (!fullAttendance) continue; // 결근 있음 → 미부여
        const ok = await tryInsertAccrual(db, {
          staffId: s.id,
          companyId: s.company_id,
          kind: 'monthly',
          periodKey,
          days: 1,
          sourceDate: endKey,
          note: `${k}개월차 만근 +1일` });
        if (!ok) continue;
        monthlyGranted += 1;
        result.granted.push({
          staffId: s.id,
          staffName: s.name,
          kind: 'monthly',
          days: 1,
          periodKey,
          note: `${k}개월차 만근` });
      }
      if (monthlyGranted === 0 && !annualGranted) {
        result.skipped += 1;
      }
    } catch (err) {
      result.errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
