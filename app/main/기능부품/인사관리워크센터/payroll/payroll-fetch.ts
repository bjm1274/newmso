'use client';

/**
 * 급여 워크센터 — Supabase fetch
 *
 * - 입력: yearMonth, selectedCo
 * - 출력: PayrollWorkcenterData (정규화된 records + staffs)
 *
 * JM2: Promise.allSettled 병렬, AbortController로 race 차단
 * JM3: 모든 fetch는 try/catch, 실패 시 빈 결과 + errors[]
 * JM4: any 금지, 정규화 함수로 row 타입 명시
 * JM5: 금액은 Math.floor로 정수 보장
 */

import { db } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import { isGroupAccount, type StaffMember } from '@/types';
import { filterNonInterimPayrollRecords } from '@/lib/payroll-records';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import {
  getPayrollPolicy,
  calculateTenureYears,
  type PayrollPolicy } from './payroll-policy';
import { calculateDcRetirementBenefitFromMonthlyWage } from '@/lib/severance-pay';

// ─── 정규화된 payroll record ─────────────────────────
export interface PayrollRecordNormalized {
  staff_id: string;
  year_month: string;
  status: string;
  record_type: string | null;
  base_salary: number;
  meal_allowance: number;
  night_duty_allowance: number;
  vehicle_allowance: number;
  childcare_allowance: number;
  research_allowance: number;
  other_taxfree: number;
  extra_allowance: number;
  overtime_pay: number;
  bonus: number;
  total_taxable: number;
  total_taxfree: number;
  total_deduction: number;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_tax: number;
  net_pay: number;
}

const PAYROLL_RECORD_OPTIONAL_COLUMNS = [
  'record_type',
  'base_salary',
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  'extra_allowance',
  'overtime_pay',
  'bonus',
  'total_taxable',
  'total_taxfree',
  'total_deduction',
  'national_pension',
  'health_insurance',
  'long_term_care',
  'employment_insurance',
  'income_tax',
  'local_tax',
  'net_pay',
] as const;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function normalizeRecord(row: Record<string, unknown>): PayrollRecordNormalized {
  return {
    staff_id: str(row.staff_id),
    year_month: str(row.year_month),
    status: str(row.status),
    record_type: row.record_type == null ? null : str(row.record_type),
    base_salary: num(row.base_salary),
    meal_allowance: num(row.meal_allowance),
    night_duty_allowance: num(row.night_duty_allowance),
    vehicle_allowance: num(row.vehicle_allowance),
    childcare_allowance: num(row.childcare_allowance),
    research_allowance: num(row.research_allowance),
    other_taxfree: num(row.other_taxfree),
    extra_allowance: num(row.extra_allowance),
    overtime_pay: num(row.overtime_pay),
    bonus: num(row.bonus),
    total_taxable: num(row.total_taxable),
    total_taxfree: num(row.total_taxfree),
    total_deduction: num(row.total_deduction),
    national_pension: num(row.national_pension),
    health_insurance: num(row.health_insurance),
    long_term_care: num(row.long_term_care),
    employment_insurance: num(row.employment_insurance),
    income_tax: num(row.income_tax),
    local_tax: num(row.local_tax),
    net_pay: num(row.net_pay) };
}

// ─── 통합 출력 ───────────────────────────────────────
export interface PayrollWorkcenterData {
  policy: PayrollPolicy;
  staffs: StaffMember[];
  records: PayrollRecordNormalized[];
  recordsPrev: PayrollRecordNormalized[];
  yearMonth: string;
  yearMonthPrev: string;
  selectedCo: string;
  errors: { source: string; message: string }[];
  isLocked: boolean;
  payrollDay?: number;
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface FetchPayrollOptions {
  yearMonth: string;
  selectedCo: string;
  signal?: AbortSignal;
}

export async function fetchPayrollWorkcenterData({
  yearMonth,
  selectedCo,
  signal }: FetchPayrollOptions): Promise<PayrollWorkcenterData> {
  const policy = getPayrollPolicy();
  const errors: { source: string; message: string }[] = [];
  const yearMonthPrev = shiftYearMonth(yearMonth, -1);

  // Check lock status
  let isLocked = false;
  try {
    const { data: lockRows } = await db
      .from('payroll_locks')
      .select('company_name')
      .eq('year_month', yearMonth);
    if (Array.isArray(lockRows) && lockRows.length > 0) {
      if (selectedCo === '전체') {
        isLocked = true;
      } else {
        isLocked = lockRows.some(row => row.company_name === '전체' || row.company_name === selectedCo);
      }
    }
  } catch (e) {
    console.warn('[payroll] lock check failed:', e);
  }

  let payrollDay = 15;
  try {
    const { data: coRows } = await db
      .from('companies')
      .select('name, payment_day')
      .neq('name', '전체');
    
    if (Array.isArray(coRows) && coRows.length > 0) {
      if (selectedCo && selectedCo !== '전체') {
        const match = coRows.find((c) => c.name === selectedCo);
        if (match && match.payment_day != null) {
          payrollDay = Number(match.payment_day);
        }
      } else {
        const firstCo = coRows.find((c) => c.payment_day != null);
        if (firstCo) {
          payrollDay = Number(firstCo.payment_day);
        }
      }
    } else {
      const scope = selectedCo && selectedCo !== '전체' ? [selectedCo, '전체'] : ['전체'];
      const { data: policyRows } = await db
        .from('company_payroll_policies')
        .select('company_name, rule_value')
        .eq('rule_label', '급여일')
        .in('company_name', scope);
      
      if (Array.isArray(policyRows) && policyRows.length > 0) {
        const chosen = policyRows.find((r) => r.company_name === selectedCo) || policyRows.find((r) => r.company_name === '전체');
        if (chosen && chosen.rule_value) {
          const match = String(chosen.rule_value).match(/\d+/);
          if (match) {
            const parsedDay = parseInt(match[0], 10);
            if (parsedDay >= 1 && parsedDay <= 31) {
              payrollDay = parsedDay;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[payroll] fetch payroll day failed:', e);
  }

  let staffs: StaffMember[] = [];
  try {
    const { data, error } = await db
      .from('staff_members')
      .select(
        'id, name, company, department, position, status, hire_date, resign_date, join_date, joined_at, resigned_at, birth_date, salary, employee_no, permissions, base_salary, meal_allowance, night_duty_allowance, vehicle_allowance, childcare_allowance, research_allowance, other_taxfree, overtime_allowance, night_work_allowance, holiday_work_allowance, annual_leave_pay, position_allowance, bank_name, bank_account, agreed_overtime_allowance, agreed_night_allowance, working_hours_per_week, working_days_per_week, shift_id',
      );
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    staffs = rows
      .filter((row): row is NonNullable<typeof row> => row != null && typeof row === 'object')
      .map((raw) => {
        const row = raw as unknown as Record<string, unknown>;
        const dbHireDate = row.hire_date == null ? null : str(row.hire_date);
        const dbJoinDate = row.join_date == null ? null : str(row.join_date);
        const dbJoinedAt = row.joined_at == null ? null : str(row.joined_at);
        const resolvedHireDate = dbHireDate || dbJoinedAt || dbJoinDate;

        const dbResignDate = row.resign_date == null ? null : str(row.resign_date);
        const dbResignedAt = row.resigned_at == null ? null : str(row.resigned_at);
        const resolvedResignDate = dbResignDate || dbResignedAt;

        const permissions = (row.permissions ?? null) as Record<string, any>;
        const allowances = (permissions?.payroll_allowances ?? {}) as Record<string, any>;

        return {
          id: str(row.id),
          name: str(row.name),
          company: str(row.company),
          department: row.department == null ? null : str(row.department),
          position: row.position == null ? null : str(row.position),
          status: row.status == null ? null : str(row.status),
          hire_date: resolvedHireDate,
          resign_date: resolvedResignDate,
          join_date: dbJoinDate,
          joined_at: dbJoinedAt,
          resigned_at: dbResignedAt,
          birth_date: row.birth_date == null ? null : str(row.birth_date),
          salary: row.salary == null || Number(row.salary) === 0 ? (row.base_salary == null ? null : Number(row.base_salary)) : Number(row.salary),
          employee_no: row.employee_no == null ? null : str(row.employee_no),
          permissions: (row.permissions ?? null) as StaffMember['permissions'],
          base_salary: row.base_salary == null ? 0 : num(row.base_salary),
          meal_allowance: num(row.meal_allowance || allowances.meal_allowance),
          night_duty_allowance: num(row.night_duty_allowance || allowances.night_duty_allowance),
          vehicle_allowance: num(row.vehicle_allowance || allowances.vehicle_allowance),
          childcare_allowance: num(row.childcare_allowance || allowances.childcare_allowance),
          research_allowance: num(row.research_allowance || allowances.research_allowance),
          other_taxfree: num(row.other_taxfree || allowances.other_taxfree),
          overtime_allowance: num(row.overtime_allowance || allowances.overtime_allowance),
          night_work_allowance: num(row.night_work_allowance || allowances.night_work_allowance),
          holiday_work_allowance: num(row.holiday_work_allowance || allowances.holiday_work_allowance),
          annual_leave_pay: num(row.annual_leave_pay || allowances.annual_leave_pay),
          position_allowance: num(row.position_allowance || allowances.position_allowance),
          bank_name: row.bank_name != null ? str(row.bank_name) : (permissions?.bank_name != null ? str(permissions.bank_name) : null),
          bank_account: row.bank_account != null ? str(row.bank_account) : (permissions?.bank_account != null ? str(permissions.bank_account) : null),
          agreed_overtime_allowance: num(row.agreed_overtime_allowance || allowances.agreed_overtime_allowance),
          agreed_night_allowance: num(row.agreed_night_allowance || allowances.agreed_night_allowance),
          working_hours_per_week: row.working_hours_per_week == null ? 40 : Number(row.working_hours_per_week),
          working_days_per_week: row.working_days_per_week == null ? 5 : Number(row.working_days_per_week),
          shift_id: row.shift_id == null ? null : str(row.shift_id) };
      })
      .filter((s) => {
        if (isGroupAccount(s)) return false;
        if (selectedCo && selectedCo !== '전체' && s.company !== selectedCo) return false;
        if (isActiveStaff(s)) return true;
        // R-1: 중도퇴사자도 정산월에 재직했다면 최종 월급·중간정산 대상에 포함한다.
        const resignYm = s.resign_date ? String(s.resign_date).slice(0, 7) : '';
        if (s.resign_date && s.resign_date.endsWith('-01')) {
          // 퇴사일이 1일인 경우 실제 근로종료일은 이전 달 말이므로 퇴사월에는 제외
          return resignYm > yearMonth;
        }
        return resignYm !== '' && resignYm >= yearMonth;
      });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '직원 마스터 조회 실패';
    console.warn('[payroll] staff_members:', msg);
    errors.push({ source: '직원 마스터', message: msg });
  }
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const [curRes, prevRes] = await Promise.allSettled([
    withMissingColumnsFallback(
      (omitted) =>
        db
          .from('payroll_records')
          .select(
            [
              'staff_id',
              'year_month',
              'status',
              ...PAYROLL_RECORD_OPTIONAL_COLUMNS.filter((c) => !omitted.has(c)),
            ].join(', '),
          )
          .eq('year_month', yearMonth),
      [...PAYROLL_RECORD_OPTIONAL_COLUMNS],
    ),
    withMissingColumnsFallback(
      (omitted) =>
        db
          .from('payroll_records')
          .select(
            [
              'staff_id',
              'year_month',
              'status',
              ...PAYROLL_RECORD_OPTIONAL_COLUMNS.filter((c) => !omitted.has(c)),
            ].join(', '),
          )
          .eq('year_month', yearMonthPrev),
      [...PAYROLL_RECORD_OPTIONAL_COLUMNS],
    ),
  ]);

  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const records = extractRecords(curRes, errors, `payroll_records ${yearMonth}`);
  const recordsPrev = extractRecords(prevRes, errors, `payroll_records ${yearMonthPrev}`);

  return {
    policy,
    staffs,
    records,
    recordsPrev,
    yearMonth,
    yearMonthPrev,
    selectedCo,
    errors,
    isLocked,
    payrollDay };
}

function extractRecords(
  res: PromiseSettledResult<{ data: unknown; error: unknown } | null>,
  errors: { source: string; message: string }[],
  source: string,
): PayrollRecordNormalized[] {
  if (res.status === 'rejected') {
    const msg = res.reason instanceof Error ? res.reason.message : '조회 실패';
    console.warn(`[payroll] ${source}:`, msg);
    errors.push({ source, message: msg });
    return [];
  }
  const payload = res.value;
  if (!payload) return [];
  if (payload.error) {
    const msg = payload.error instanceof Error ? payload.error.message : String(payload.error);
    console.warn(`[payroll] ${source}:`, msg);
    errors.push({ source, message: msg });
    return [];
  }
  const list = Array.isArray(payload.data) ? payload.data : [];
  const normalized = list
    .filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
    .map(normalizeRecord);
  return filterNonInterimPayrollRecords(normalized);
}

// ─── 퇴직자 fetch ────────────────────────────────────
export interface RetirementComputed {
  staff_id: string;
  name: string;
  resignDate: string | null;
  tenureLabel: string;
  estimatedPay: number;
}

export async function fetchRecentRetirees(
  selectedCo: string,
  signal?: AbortSignal,
): Promise<RetirementComputed[]> {
  try {
    const { data, error } = await db
      .from('staff_members')
      .select('id, name, company, department, hire_date, resign_date, join_date, joined_at, resigned_at, salary, base_salary, meal_allowance, status');
    if (error) throw new Error(error.message);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const rows = Array.isArray(data) ? data : [];
    return rows
      .filter((row): row is NonNullable<typeof row> => row != null && typeof row === 'object')
      .map((raw) => raw as unknown as Record<string, unknown>)
      .filter((row) => {
        const hasResign = row.resign_date != null || row.resigned_at != null;
        if (!hasResign) return false;
        if (selectedCo && selectedCo !== '전체') {
          return row.company === selectedCo;
        }
        return true;
      })
      .map((row) => {
        const hire = str(row.hire_date || row.joined_at || row.join_date || '');
        const resign = str(row.resign_date || row.resigned_at || '');
        const tenure = hire && resign ? calculateTenureYears(hire, new Date(resign)) : null;
        const tenureLabel =
          tenure === null
            ? '-'
            : tenure < 1
              ? `${Math.floor(tenure * 12)}개월`
              : `${tenure.toFixed(1)}년`;
        // F-1: 중간정산과 동일한 DC 퇴직금 공식으로 통일.
        // 월평균임금 = 기본급 + 식대, 재직일수/365, 1년 미만은 0.
        const monthlyAvgWage = num(row.base_salary) + num(row.meal_allowance);
        const workDays =
          hire && resign
            ? Math.max(0, Math.floor((new Date(resign).getTime() - new Date(hire).getTime()) / 86_400_000))
            : 0;
        const estimatedPay =
          workDays > 0 ? calculateDcRetirementBenefitFromMonthlyWage(monthlyAvgWage, workDays) : 0;
        return {
          staff_id: str(row.id),
          name: str(row.name),
          resignDate: resign,
          tenureLabel,
          estimatedPay };
      })
      .sort((a, b) => (b.resignDate ?? '').localeCompare(a.resignDate ?? ''))
      .slice(0, 20);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '퇴직자 조회 실패';
    console.warn('[payroll] retirees:', msg);
    return [];
  }
}
