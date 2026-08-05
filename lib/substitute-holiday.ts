/**
 * 공휴일 근무 → 대체휴무 자동지급
 *
 * 공휴일(한국 법정공휴일 + company_holidays)에 실제 근무한 직원에게 대체휴무 1일을 자동 적립.
 * - 정책 게이트: system_settings(leave_policy_rules_v1).companies[회사].grantCompDayForHolidayWork === true 인 회사만.
 * - 적립 방식: leave_ledger 에 entry_type='substitute' 원장 1행. 잔여 연차 집계가 이 원장을 읽는다.
 * - 멱등성: leave_ledger (staff_id, entry_type, period_key='substitute:{근무일}') 유니크.
 *
 * 헤더 주석이 예전에는 "leave_accruals(kind='substitute')" 와
 * "staff_members.annual_leave_total += 1 후 recalculateLeaveBalance" 를 설명했다.
 * 둘 다 원장 일원화 때 없어진 동작이라, 주석만 보고 고치면 존재하지 않는 경로를
 * 찾게 된다. 실제 동작으로 맞춘다.
 */

import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { recordSubstituteLeaveGrant } from '@/lib/unified-leave-ledger';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  leave_ledger as leaveLedgerTable,
  attendances as attendancesTable,
  company_holidays as companyHolidaysTable,
  system_settings as systemSettingsTable,
  eq,
  and,
  gte,
  lte } from '@/lib/db';

const LEAVE_POLICY_SETTINGS_KEY = 'leave_policy_rules_v1';
const WORKED_STATUSES = new Set(['present', 'late', 'early_leave', '정상', '지각', '조퇴']);

export type SubstituteGrant = {
  staffId: string;
  staffName: string;
  workDate: string;
  holidayName: string;
};

export type SubstituteRunResult = {
  scanned: number;
  granted: SubstituteGrant[];
  skipped: number;
  errors: string[];
};

type DrizzleDb = ReturnType<typeof getD1Drizzle>;

/** 회사별 grantCompDayForHolidayWork 활성 여부 맵 로드 (system_settings). */
async function loadHolidayCompPolicy(db: DrizzleDb): Promise<{ has: (company: string | null) => boolean }> {
  const rows = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, LEAVE_POLICY_SETTINGS_KEY))
    .limit(1);

  let companies: Record<string, { grantCompDayForHolidayWork?: boolean }> = {};
  try {
    const raw = rows[0]?.value;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.companies) {
      companies = parsed.companies as Record<string, { grantCompDayForHolidayWork?: boolean }>;
    }
  } catch {
    /* 파싱 실패 → 전부 비활성 */
  }

  const all = companies['전체']?.grantCompDayForHolidayWork === true;
  return {
    has: (company) => {
      const key = String(company || '').trim();
      if (key && key in companies) return companies[key].grantCompDayForHolidayWork === true;
      return all;
    } };
}

/** 기간 내 회사별 공휴일(company_holidays) 집합 로드. key = `${company_name}|${date}`, 전체는 company='전체'. */
async function loadCompanyHolidays(db: DrizzleDb, startKey: string, endKey: string) {
  const rows = await db
    .select({ company_name: companyHolidaysTable.company_name, holiday_date: companyHolidaysTable.holiday_date, name: companyHolidaysTable.name })
    .from(companyHolidaysTable)
    .where(and(gte(companyHolidaysTable.holiday_date, startKey), lte(companyHolidaysTable.holiday_date, endKey)));
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(`${String(r.company_name || '전체')}|${String(r.holiday_date).slice(0, 10)}`, String(r.name || '회사 지정 휴일'));
  }
  return map;
}

type AttendanceRow = {
  id: string;
  staff_id: string;
  company_name: string | null;
  work_date: string;
  check_in_time: string | null;
  status: string | null;
};

function isWorked(row: AttendanceRow): boolean {
  if (row.check_in_time) return true;
  return WORKED_STATUSES.has(String(row.status || '').trim());
}

/**
 * [startKey, endKey] 기간 공휴일 근무에 대해 대체휴무 부여 (크론 진입점).
 * 기본은 어제 하루지만, 누락 대비 lookback 윈도우 권장.
 */
export async function processSubstituteHolidayGrants(
  startKey: string,
  endKey: string,
): Promise<SubstituteRunResult> {
  const result: SubstituteRunResult = { scanned: 0, granted: [], skipped: 0, errors: [] };

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[substitute-holiday] D1 binding not available');
  const db = getD1Drizzle(d1);

  const policy = await loadHolidayCompPolicy(db);
  const companyHolidays = await loadCompanyHolidays(db, startKey, endKey);

  const rows = (await db
    .select({
      id: attendancesTable.id,
      staff_id: attendancesTable.staff_id,
      company_name: attendancesTable.company_name,
      work_date: attendancesTable.work_date,
      check_in_time: attendancesTable.check_in_time,
      status: attendancesTable.status })
    .from(attendancesTable)
    .where(and(gte(attendancesTable.work_date, startKey), lte(attendancesTable.work_date, endKey)))) as AttendanceRow[];

  for (const row of rows) {
    result.scanned += 1;
    const workDate = String(row.work_date).slice(0, 10);
    const company = row.company_name;

    // 정책 비활성 회사 제외
    if (!policy.has(company)) {
      result.skipped += 1;
      continue;
    }
    // 실제 근무 여부
    if (!isWorked(row)) {
      result.skipped += 1;
      continue;
    }
    // 공휴일 여부 (법정 + 회사지정[전체/해당회사])
    const companyHolidayName =
      companyHolidays.get(`전체|${workDate}`) ||
      (company ? companyHolidays.get(`${company}|${workDate}`) : undefined);
    const holidayName = isKoreanPublicHoliday(workDate)
      ? '공휴일'
      : companyHolidayName || null;
    if (!holidayName) {
      result.skipped += 1;
      continue;
    }

    try {
      // 회사를 원장에 남긴다.
      //
      // 예전에는 `company_id: null` 로 고정 INSERT 했다. 원장의 회사 컬럼이 비면
      // 회사 단위 집계·정산에서 대체휴무만 어느 회사에도 속하지 않는 행으로
      // 남는다. 근태 행의 직원에서 회사를 해석해 채운다.
      const staffRows = await db
        .select({ name: staffMembersTable.name, company_id: staffMembersTable.company_id })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, row.staff_id))
        .limit(1);
      const staff = staffRows[0];
      if (!staff) {
        result.skipped += 1;
        continue;
      }

      // 이미 부여된 근무일은 건너뛴다(멱등). 기록 자체는 원장 모듈의
      // recordSubstituteLeaveGrant 한 곳으로 모아 upsert 규칙이 갈라지지 않게 한다.
      const existing = await db
        .select({ id: leaveLedgerTable.id })
        .from(leaveLedgerTable)
        .where(and(
          eq(leaveLedgerTable.staff_id, row.staff_id),
          eq(leaveLedgerTable.entry_type, 'substitute'),
          eq(leaveLedgerTable.period_key, `substitute:${workDate}`),
        ))
        .limit(1);
      if (existing.length > 0) {
        result.skipped += 1;
        continue;
      }

      await recordSubstituteLeaveGrant({
        staffId: row.staff_id,
        companyId: staff.company_id ?? null,
        workDate,
        days: 1,
        note: `${holidayName} 근무 대체휴무 +1일`,
      });

      result.granted.push({
        staffId: row.staff_id,
        staffName: String(staff.name || ''),
        workDate,
        holidayName });
    } catch (err) {
      result.errors.push(`${row.staff_id}@${workDate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
