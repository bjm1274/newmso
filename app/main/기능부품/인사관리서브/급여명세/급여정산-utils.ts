// 급여정산 순수 헬퍼/상수 (순수 추출 — 동작 보존, 금액 계산 로직 불변)
import type { StaffMember } from '@/types';
import { db } from '@/lib/db-client';
import {
  calculateHourlyRateFromMonthlySalary,
  resolveWeeklyWorkingHours } from '@/lib/payroll-working-hours';
import type {
  SettlementEntry,
  TaxableAllowanceBreakdown,
  SalaryAmountField,
  SalaryChangeHistoryRow,
  SalaryChangeProrationSegment,
  SalaryChangeProrationSummary } from './급여정산-types';

export const PAYROLL_RECORD_OPTIONAL_COLUMNS = [
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
] as const;

export const PAYROLL_RECORD_LOAD_OPTIONAL_COLUMNS = [
  ...PAYROLL_RECORD_OPTIONAL_COLUMNS,
  'attendance_deduction',
  'attendance_deduction_detail',
  'deduction_detail',
  'advance_pay',
  'status',
  'record_type',
] as const;

export const EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN: TaxableAllowanceBreakdown = {
  position_allowance: 0,
  overtime_allowance: 0,
  night_work_allowance: 0,
  holiday_work_allowance: 0,
  annual_leave_pay: 0,
  manual_extra_allowance: 0 };

export const PAYROLL_TIME_STEP_MINUTES = 10;
export const HOLD_TO_UNIT_INPUT_MS = 450;
const PAYROLL_DAY_MS = 24 * 60 * 60 * 1000;

const SALARY_CHANGE_FIELD_BY_TYPE: Record<string, SalaryAmountField> = {
  base_salary: 'base_salary',
  meal: 'meal_allowance',
  meal_allowance: 'meal_allowance',
  night_duty_allowance: 'night_duty_allowance',
  vehicle: 'vehicle_allowance',
  vehicle_allowance: 'vehicle_allowance',
  childcare: 'childcare_allowance',
  childcare_allowance: 'childcare_allowance',
  research: 'research_allowance',
  research_allowance: 'research_allowance',
  other: 'other_taxfree',
  other_taxfree: 'other_taxfree',
  position_allowance: 'position_allowance',
  overtime_allowance: 'overtime_allowance',
  night_work_allowance: 'night_work_allowance',
  holiday_work_allowance: 'holiday_work_allowance',
  annual_leave_pay: 'annual_leave_pay' };

const SALARY_CHANGE_FIELD_LABELS: Record<SalaryAmountField, string> = {
  base_salary: '기본급',
  meal_allowance: '식대',
  night_duty_allowance: '야간/당직수당',
  vehicle_allowance: '자가운전보조금',
  childcare_allowance: '보육수당',
  research_allowance: '연구활동비',
  other_taxfree: '기타 비과세',
  position_allowance: '직책수당',
  overtime_allowance: '연장근로수당',
  night_work_allowance: '야간근로수당',
  holiday_work_allowance: '휴일근로수당',
  annual_leave_pay: '연차휴가수당',
  manual_extra_allowance: '기타 과세수당' };

export function parsePayrollWonInput(value: unknown) {
  const numeric = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

export function getRegularHourlyRate(staff: StaffMember, data: Partial<SettlementEntry>) {
  const baseSalary = parsePayrollWonInput(data.base_salary);
  const mealAllowance = parsePayrollWonInput(data.meal_allowance);
  const nightDutyAllowance = parsePayrollWonInput(data.night_duty_allowance);
  const vehicleAllowance = parsePayrollWonInput(data.vehicle_allowance);
  const childcareAllowance = parsePayrollWonInput(data.childcare_allowance);
  const researchAllowance = parsePayrollWonInput(data.research_allowance);
  const otherTaxfree = parsePayrollWonInput(data.other_taxfree);

  const breakdown = data.taxable_allowance_breakdown || EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN;
  const positionAllowance = parsePayrollWonInput(breakdown.position_allowance);
  const manualExtra = parsePayrollWonInput(breakdown.manual_extra_allowance);

  // 약정연장/약정야간수당은 통상임금에 산입되므로, 마스터의 비율에 기반해 비례 배분 추출
  const masterAgreedOvertime = Number(staff.agreed_overtime_allowance || 0);
  const masterTotalOvertime = Number(staff.overtime_allowance || 0) + masterAgreedOvertime;
  const resolvedOvertime = parsePayrollWonInput(breakdown.overtime_allowance);
  const resolvedAgreedOvertime = masterTotalOvertime > 0
    ? Math.round((resolvedOvertime * masterAgreedOvertime) / masterTotalOvertime)
    : masterAgreedOvertime;

  const masterAgreedNight = Number(staff.agreed_night_allowance || 0);
  const masterTotalNight = Number(staff.night_work_allowance || 0) + masterAgreedNight;
  const resolvedNight = parsePayrollWonInput(breakdown.night_work_allowance);
  const resolvedAgreedNight = masterTotalNight > 0
    ? Math.round((resolvedNight * masterAgreedNight) / masterTotalNight)
    : masterAgreedNight;

  const fixedMonthlyPay =
    baseSalary +
    mealAllowance +
    nightDutyAllowance +
    vehicleAllowance +
    childcareAllowance +
    researchAllowance +
    otherTaxfree +
    positionAllowance +
    manualExtra +
    resolvedAgreedOvertime +
    resolvedAgreedNight;

  // 격일제 판별: 급여상세.tsx line 325와 동일한 식 (C-09)
  // 격일제(1일근무1일휴무)는 분모 계산 방식이 달라 통상시급이 달라진다.
  // lib/payroll-working-hours.ts:81의 분모 * 1.5 공식 자체는 이번 수정 범위 밖.
  const isAlternateDayShift = !!(staff?.isAlternateDayShift || staff?.shift_type === '1일근무1일휴무');

  return calculateHourlyRateFromMonthlySalary(
    fixedMonthlyPay,
    resolveWeeklyWorkingHours(staff, 40),
    'ceil',
    isAlternateDayShift,
  );
}

export function getTaxableAllowanceBreakdownTotal(value?: Partial<TaxableAllowanceBreakdown> | null) {
  if (!value) return 0;
  return (
    Number(value.position_allowance || 0) +
    Number(value.overtime_allowance || 0) +
    Number(value.night_work_allowance || 0) +
    Number(value.holiday_work_allowance || 0) +
    Number(value.annual_leave_pay || 0) +
    Number(value.manual_extra_allowance || 0)
  );
}

export function getStaffTaxableAllowanceBreakdown(staff: StaffMember): TaxableAllowanceBreakdown {
  return {
    position_allowance: Number(staff.position_allowance || 0),
    overtime_allowance: Number(staff.overtime_allowance || 0) + Number(staff.agreed_overtime_allowance || 0),
    night_work_allowance: Number(staff.night_work_allowance || 0) + Number(staff.agreed_night_allowance || 0),
    holiday_work_allowance: Number(staff.holiday_work_allowance || 0),
    annual_leave_pay: Number(staff.annual_leave_pay || 0),
    manual_extra_allowance: 0 };
}

export function normalizeTaxableAllowanceBreakdown(value: unknown): TaxableAllowanceBreakdown {
  const source = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
  return {
    position_allowance: Number(source.position_allowance || 0),
    overtime_allowance: Number(source.overtime_allowance || 0),
    night_work_allowance: Number(source.night_work_allowance || 0),
    holiday_work_allowance: Number(source.holiday_work_allowance || 0),
    annual_leave_pay: Number(source.annual_leave_pay || 0),
    manual_extra_allowance: Number(source.manual_extra_allowance || 0) };
}

function parsePayrollDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const rawText = String(value ?? '').trim();
  const text = rawText.slice(0, 10);
  const compactText = rawText.replace(/[^0-9]/g, '');
  const match =
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text) ||
    (/^\d{8}$/.test(compactText) ? /^(\d{4})(\d{2})(\d{2})$/.exec(compactText) : null);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatPayrollDateKey(date: Date | null) {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getPayrollMonthBounds(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month - 1, lastDay),
    lastDay };
}

function shiftPayrollDate(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function maxPayrollDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minPayrollDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function getInclusivePayrollDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / PAYROLL_DAY_MS) + 1;
}

function getSalaryChangeField(changeType: unknown): SalaryAmountField | null {
  return SALARY_CHANGE_FIELD_BY_TYPE[String(changeType || '').trim()] || null;
}

function normalizeNonNegativePayrollAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function getSalaryChangesForField(
  changes: SalaryChangeHistoryRow[] | undefined,
  field: SalaryAmountField,
  yearMonth: string,
) {
  const bounds = getPayrollMonthBounds(yearMonth);
  if (!bounds) return [];

  return (changes || [])
    .map((change) => ({
      change,
      field: getSalaryChangeField(change.change_type),
      effectiveDate: parsePayrollDate(change.effective_date) }))
    .filter(
      (entry): entry is {
        change: SalaryChangeHistoryRow;
        field: SalaryAmountField;
        effectiveDate: Date;
      } => {
        if (entry.field !== field || !entry.effectiveDate) return false;
        return (
          entry.effectiveDate.getTime() >= bounds.start.getTime() &&
          entry.effectiveDate.getTime() <= bounds.end.getTime()
        );
      },
    )
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
}

function calculateSalaryAmountWithChanges({
  fallback,
  field,
  yearMonth,
  salaryChanges,
  staff }: {
  fallback: unknown;
  field: SalaryAmountField;
  yearMonth: string;
  salaryChanges?: SalaryChangeHistoryRow[];
  staff?: StaffMember;
}) {
  const bounds = getPayrollMonthBounds(yearMonth);
  const defaultAmount = Math.round(normalizeNonNegativePayrollAmount(fallback));
  if (!bounds) return { amount: defaultAmount, summary: null as SalaryChangeProrationSummary | null };

  // check mid-month hire or resignation
  const hireDateStr = staff?.hire_date || staff?.join_date || staff?.joined_at;
  const resignDateStr = staff?.resign_date || staff?.resigned_at;
  const hireDate = hireDateStr ? parsePayrollDate(hireDateStr) : null;
  const resignDate = resignDateStr ? parsePayrollDate(resignDateStr) : null;

  let effectiveStart = bounds.start;
  let effectiveEnd = bounds.end;
  let isMidMonthEmployed = false;

  if (hireDate) {
    const hireYear = hireDate.getFullYear();
    const hireMonth = hireDate.getMonth() + 1;
    if (hireYear === bounds.start.getFullYear() && hireMonth === (bounds.start.getMonth() + 1)) {
      if (hireDate.getTime() > bounds.start.getTime()) {
        effectiveStart = maxPayrollDate(effectiveStart, hireDate);
        isMidMonthEmployed = true;
      }
    }
  }

  if (resignDate) {
    const lastEmployedDate = shiftPayrollDate(resignDate, -1);
    const resignYear = lastEmployedDate.getFullYear();
    const resignMonth = lastEmployedDate.getMonth() + 1;
    if (resignYear === bounds.end.getFullYear() && resignMonth === (bounds.end.getMonth() + 1)) {
      if (lastEmployedDate.getTime() < bounds.end.getTime()) {
        effectiveEnd = minPayrollDate(effectiveEnd, lastEmployedDate);
        isMidMonthEmployed = true;
      }
    }
  }

  const orderedChanges = getSalaryChangesForField(salaryChanges, field, yearMonth);
  if (orderedChanges.length === 0) {
    if (isMidMonthEmployed) {
      const employedDays = getInclusivePayrollDays(effectiveStart, effectiveEnd);
      const proratedAmount = Math.floor((defaultAmount * employedDays) / bounds.lastDay);
      
      const reasonParts = [];
      if (hireDate && hireDate.getFullYear() === bounds.start.getFullYear() && (hireDate.getMonth() + 1) === (bounds.start.getMonth() + 1)) {
        reasonParts.push('중도 입사');
      }
      if (resignDate) {
        const lastEmployedDate = shiftPayrollDate(resignDate, -1);
        if (lastEmployedDate.getFullYear() === bounds.end.getFullYear() && (lastEmployedDate.getMonth() + 1) === (bounds.end.getMonth() + 1)) {
          reasonParts.push('중도 퇴사');
        }
      }
      const reason = reasonParts.join(' 및 ') + ' 일할 정산';

      return {
        amount: proratedAmount,
        summary: {
          field,
          label: SALARY_CHANGE_FIELD_LABELS[field] || String(field),
          effective_dates: [formatPayrollDateKey(hireDate || resignDate)],
          before_value: defaultAmount,
          after_value: defaultAmount,
          reason,
          amount: proratedAmount,
          segments: [
            {
              period_start: formatPayrollDateKey(effectiveStart),
              period_end: formatPayrollDateKey(effectiveEnd),
              days: employedDays,
              monthly_amount: defaultAmount,
              prorated_amount: proratedAmount },
          ] } };
    }
    return { amount: defaultAmount, summary: null as SalaryChangeProrationSummary | null };
  }

  let rawTotal = 0;
  const segments: SalaryChangeProrationSegment[] = [];
  const addSegment = (start: Date, end: Date, monthlyAmount: unknown) => {
    const periodStart = maxPayrollDate(start, effectiveStart);
    const periodEnd = minPayrollDate(end, effectiveEnd);
    if (periodStart.getTime() > periodEnd.getTime()) return;

    const days = getInclusivePayrollDays(periodStart, periodEnd);
    const normalizedMonthlyAmount = Math.round(normalizeNonNegativePayrollAmount(monthlyAmount));
    const rawProratedAmount = (normalizedMonthlyAmount * days) / bounds.lastDay;
    const proratedAmount = Math.floor(rawProratedAmount);
    rawTotal += rawProratedAmount;
    segments.push({
      period_start: formatPayrollDateKey(periodStart),
      period_end: formatPayrollDateKey(periodEnd),
      days,
      monthly_amount: normalizedMonthlyAmount,
      prorated_amount: proratedAmount });
  };

  const firstChange = orderedChanges[0];
  addSegment(effectiveStart, shiftPayrollDate(firstChange.effectiveDate, -1), firstChange.change.before_value ?? fallback);
  orderedChanges.forEach((entry, index) => {
    const nextChange = orderedChanges[index + 1];
    addSegment(
      entry.effectiveDate,
      nextChange ? shiftPayrollDate(nextChange.effectiveDate, -1) : effectiveEnd,
      entry.change.after_value ?? fallback,
    );
  });

  if (segments.length === 0) {
    return { amount: defaultAmount, summary: null as SalaryChangeProrationSummary | null };
  }

  const amount = Math.floor(rawTotal);
  const reason = orderedChanges
    .map(({ change }) => String(change.reason || '').trim())
    .filter(Boolean)
    .join(' / ');

  return {
    amount,
    summary: {
      field,
      label: SALARY_CHANGE_FIELD_LABELS[field] || String(field),
      effective_dates: [...new Set(orderedChanges.map(({ change }) => String(change.effective_date).slice(0, 10)))],
      before_value: Math.round(normalizeNonNegativePayrollAmount(firstChange.change.before_value ?? fallback)),
      after_value: Math.round(
        normalizeNonNegativePayrollAmount(orderedChanges[orderedChanges.length - 1].change.after_value ?? fallback),
      ),
      reason: reason || '사유 미입력',
      amount,
      segments } };
}

function resolveSavedOrCalculatedAmount({
  savedValue,
  fallback,
  calculation,
  status }: {
  savedValue: unknown;
  fallback: unknown;
  calculation: ReturnType<typeof calculateSalaryAmountWithChanges>;
  status?: string | null;
}) {
  if (status === '확정') {
    if (savedValue !== null && savedValue !== undefined) {
      return Number(savedValue) || 0;
    }
  }

  return calculation.amount;
}

export function resolveSalaryAmountForSettlement({
  savedValue,
  fallback,
  field,
  yearMonth,
  salaryChanges,
  staff,
  status }: {
  savedValue: unknown;
  fallback: unknown;
  field: SalaryAmountField;
  yearMonth: string;
  salaryChanges?: SalaryChangeHistoryRow[];
  staff?: StaffMember;
  status?: string | null;
}) {
  const calculation = calculateSalaryAmountWithChanges({ fallback, field, yearMonth, salaryChanges, staff });
  let amount = resolveSavedOrCalculatedAmount({ savedValue, fallback, calculation, status });
  if (field === 'base_salary') {
    amount = calculation.amount;
  }
  return {
    amount,
    summary: calculation.summary ? { ...calculation.summary, amount } : null };
}

export async function fetchSalaryChangeHistoryForMonth(yearMonth: string, staffIds: string[]) {
  const bounds = getPayrollMonthBounds(yearMonth);
  if (!bounds || staffIds.length === 0) return {};

  const { data, error } = await db
    .from('salary_change_history')
    .select('id, staff_id, change_type, before_value, after_value, effective_date, reason, created_at')
    .in('staff_id', staffIds)
    .gte('effective_date', formatPayrollDateKey(bounds.start))
    .lte('effective_date', formatPayrollDateKey(bounds.end))
    .order('effective_date', { ascending: true });

  if (error) throw error;

  return ((data || []) as SalaryChangeHistoryRow[]).reduce<Record<string, SalaryChangeHistoryRow[]>>(
    (acc, row) => {
      const staffId = String(row.staff_id);
      if (!acc[staffId]) acc[staffId] = [];
      acc[staffId].push(row);
      return acc;
    },
    {},
  );
}

/**
 * 근태(결근/지각/조퇴) 차감의 분자로 쓸 "그 달 실제 지급 기준 기본급"을 반환한다 (A-2).
 *
 * 근태차감 일당 = 기본급 ÷ 그 달 소정근로일수. 그런데 중도입사·중도퇴사자는
 * 소정근로일수(분모)가 부분월로 줄어드는데 분자에 월 전액 기본급을 그대로 쓰면
 * 일당이 과대(약 2배)해져 결근차감이 과대공제된다.
 * 분자도 일할 후 금액(floor(월액 × 재직일수 / 역일수))으로 맞춰 분모와 일관시킨다.
 * 정상(전월 재직) 직원은 일할이 없으므로 월 전액을 그대로 반환(동작 불변).
 */
export function getEmploymentProratedBaseForMonth(
  staff: StaffMember | undefined,
  yearMonth: string,
  fullBase: unknown,
): number {
  const base = Math.max(0, Math.round(normalizeNonNegativePayrollAmount(fullBase)));
  const bounds = getPayrollMonthBounds(yearMonth);
  if (!bounds || !staff) return base;

  const hireDateStr = staff?.hire_date || staff?.join_date || staff?.joined_at;
  const resignDateStr = staff?.resign_date || staff?.resigned_at;
  const hireDate = hireDateStr ? parsePayrollDate(hireDateStr) : null;
  const resignDate = resignDateStr ? parsePayrollDate(resignDateStr) : null;

  let effectiveStart = bounds.start;
  let effectiveEnd = bounds.end;
  let isMidMonthEmployed = false;

  if (
    hireDate &&
    hireDate.getFullYear() === bounds.start.getFullYear() &&
    hireDate.getMonth() === bounds.start.getMonth()
  ) {
    if (hireDate.getTime() > bounds.start.getTime()) {
      effectiveStart = maxPayrollDate(effectiveStart, hireDate);
      isMidMonthEmployed = true;
    }
  }
  if (resignDate) {
    const lastEmployedDate = shiftPayrollDate(resignDate, -1);
    if (
      lastEmployedDate.getFullYear() === bounds.end.getFullYear() &&
      lastEmployedDate.getMonth() === bounds.end.getMonth()
    ) {
      if (lastEmployedDate.getTime() < bounds.end.getTime()) {
        effectiveEnd = minPayrollDate(effectiveEnd, lastEmployedDate);
        isMidMonthEmployed = true;
      }
    }
  }

  if (!isMidMonthEmployed) return base;

  const employedDays = getInclusivePayrollDays(effectiveStart, effectiveEnd);
  return Math.max(0, Math.floor((base * employedDays) / bounds.lastDay));
}
