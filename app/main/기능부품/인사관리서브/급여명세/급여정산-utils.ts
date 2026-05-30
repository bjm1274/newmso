// 급여정산 순수 헬퍼/상수 (순수 추출 — 동작 보존, 금액 계산 로직 불변)
import type { StaffMember } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  calculateHourlyRateFromMonthlySalary,
  resolveWeeklyWorkingHours,
} from '@/lib/payroll-working-hours';
import type {
  SettlementEntry,
  TaxableAllowanceBreakdown,
  SalaryAmountField,
  SalaryChangeHistoryRow,
  SalaryChangeProrationSegment,
  SalaryChangeProrationSummary,
} from './급여정산-types';

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
  manual_extra_allowance: 0,
};

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
  annual_leave_pay: 'annual_leave_pay',
};

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
  manual_extra_allowance: '기타 과세수당',
};

export function parsePayrollWonInput(value: unknown) {
  const numeric = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

export function getRegularHourlyRate(staff: StaffMember, data: Partial<SettlementEntry>) {
  const fixedMonthlyPay = [
    data.base_salary,
    data.extra_allowance,
    data.meal_allowance,
    data.night_duty_allowance,
    data.vehicle_allowance,
    data.childcare_allowance,
    data.research_allowance,
    data.other_taxfree,
  ].reduce<number>((sum, value) => sum + parsePayrollWonInput(value), 0);

  return calculateHourlyRateFromMonthlySalary(
    fixedMonthlyPay,
    resolveWeeklyWorkingHours(staff, 40),
    'ceil',
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
    overtime_allowance: Number(staff.overtime_allowance || 0),
    night_work_allowance: Number(staff.night_work_allowance || 0),
    holiday_work_allowance: Number(staff.holiday_work_allowance || 0),
    annual_leave_pay: Number(staff.annual_leave_pay || 0),
    manual_extra_allowance: 0,
  };
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
    manual_extra_allowance: Number(source.manual_extra_allowance || 0),
  };
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
    lastDay,
  };
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
      effectiveDate: parsePayrollDate(change.effective_date),
    }))
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
}: {
  fallback: unknown;
  field: SalaryAmountField;
  yearMonth: string;
  salaryChanges?: SalaryChangeHistoryRow[];
}) {
  const bounds = getPayrollMonthBounds(yearMonth);
  const defaultAmount = Math.round(normalizeNonNegativePayrollAmount(fallback));
  if (!bounds) return { amount: defaultAmount, summary: null as SalaryChangeProrationSummary | null };

  const orderedChanges = getSalaryChangesForField(salaryChanges, field, yearMonth);
  if (orderedChanges.length === 0) {
    return { amount: defaultAmount, summary: null as SalaryChangeProrationSummary | null };
  }

  let rawTotal = 0;
  const segments: SalaryChangeProrationSegment[] = [];
  const addSegment = (start: Date, end: Date, monthlyAmount: unknown) => {
    const periodStart = maxPayrollDate(start, bounds.start);
    const periodEnd = minPayrollDate(end, bounds.end);
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
      prorated_amount: proratedAmount,
    });
  };

  const firstChange = orderedChanges[0];
  addSegment(bounds.start, shiftPayrollDate(firstChange.effectiveDate, -1), firstChange.change.before_value ?? fallback);
  orderedChanges.forEach((entry, index) => {
    const nextChange = orderedChanges[index + 1];
    addSegment(
      entry.effectiveDate,
      nextChange ? shiftPayrollDate(nextChange.effectiveDate, -1) : bounds.end,
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
      segments,
    },
  };
}

function resolveSavedOrCalculatedAmount({
  savedValue,
  fallback,
  calculation,
}: {
  savedValue: unknown;
  fallback: unknown;
  calculation: ReturnType<typeof calculateSalaryAmountWithChanges>;
}) {
  if (savedValue !== null && savedValue !== undefined) {
    const normalizedSavedValue = Math.round(normalizeNonNegativePayrollAmount(savedValue));
    const refreshCandidates = [
      normalizeNonNegativePayrollAmount(fallback),
      calculation.summary?.before_value,
      calculation.summary?.after_value,
    ]
      .filter((value): value is number => typeof value === 'number')
      .map((value) => Math.round(value));

    if (
      normalizedSavedValue !== Math.round(calculation.amount) &&
      refreshCandidates.some((value) => normalizedSavedValue === value)
    ) {
      return calculation.amount;
    }
    return Number(savedValue) || 0;
  }

  return calculation.amount;
}

export function resolveSalaryAmountForSettlement({
  savedValue,
  fallback,
  field,
  yearMonth,
  salaryChanges,
}: {
  savedValue: unknown;
  fallback: unknown;
  field: SalaryAmountField;
  yearMonth: string;
  salaryChanges?: SalaryChangeHistoryRow[];
}) {
  const calculation = calculateSalaryAmountWithChanges({ fallback, field, yearMonth, salaryChanges });
  const amount = resolveSavedOrCalculatedAmount({ savedValue, fallback, calculation });
  return {
    amount,
    summary: calculation.summary ? { ...calculation.summary, amount } : null,
  };
}

export async function fetchSalaryChangeHistoryForMonth(yearMonth: string, staffIds: string[]) {
  const bounds = getPayrollMonthBounds(yearMonth);
  if (!bounds || staffIds.length === 0) return {};

  const { data, error } = await supabase
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
