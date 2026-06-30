/**
 * 공휴일 근무 → 대체휴무 자동지급
 *
 * 공휴일(한국 법정공휴일 + company_holidays)에 실제 근무한 직원에게 대체휴무 1일을 자동 적립.
 * - 정책 게이트: system_settings(leave_policy_rules_v1).companies[회사].grantCompDayForHolidayWork === true 인 회사만.
 * - 멱등성: leave_accruals(kind='substitute', period_key=근무일 'YYYY-MM-DD').
 * - 적립 방식: staff_members.annual_leave_total += 1 후 recalculateLeaveBalance (연차 잔여에 합산).
 *
 * 주의: 본 시스템은 대체휴무 전용 잔액 컬럼이 없어 연차 총량에 합산한다(운영상 통용). 별도 구분이
 *       필요하면 leave_accruals.kind='substitute' 원장으로 집계/표시 가능.
 */

import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  leave_accruals as leaveAccrualsTable,
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
      const inserted = await db
        .insert(leaveAccrualsTable)
        .values({
          id: crypto.randomUUID(),
          staff_id: row.staff_id,
          company_id: null,
          kind: 'substitute',
          period_key: workDate,
          days: 1,
          year: Number(workDate.slice(0, 4)) || new Date().getFullYear(),
          source_date: workDate,
          note: `${holidayName} 근무 대체휴무 +1일`,
          created_at: new Date().toISOString() })
        .onConflictDoNothing()
        .returning({ id: leaveAccrualsTable.id });

      if (inserted.length === 0) {
        result.skipped += 1;
        continue;
      }

      // 직원 연차 총량 +1 후 잔액 재계산
      const staffRows = await db
        .select({ name: staffMembersTable.name, annual_leave_total: staffMembersTable.annual_leave_total })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, row.staff_id))
        .limit(1);
      const staff = staffRows[0];
      if (!staff) {
        result.skipped += 1;
        continue;
      }
      const current = Number(staff.annual_leave_total) || 0;
      await db
        .update(staffMembersTable)
        .set({ annual_leave_total: current + 1 })
        .where(eq(staffMembersTable.id, row.staff_id));
      await recalculateLeaveBalance(row.staff_id, Number(workDate.slice(0, 4)) || new Date().getFullYear());

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
