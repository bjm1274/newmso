import { DAILY_STANDARD_HOURS } from './tax-free-limits';

export type DeductionRule = {
  late_deduction_type: 'hourly' | 'fixed';
  late_deduction_amount: number;
  early_leave_deduction_type: 'hourly' | 'fixed';
  early_leave_deduction_amount: number;
  absent_use_daily_rate: boolean;
};

export type AttendanceRecord = {
  staff_id: string;
  work_date: string;
  status: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
};

const DEFAULT_RULE: DeductionRule = {
  late_deduction_type: 'fixed',
  late_deduction_amount: 10000,
  early_leave_deduction_type: 'fixed',
  early_leave_deduction_amount: 10000,
  absent_use_daily_rate: true,
};

export function getWorkDaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;

  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }

  return count;
}

export function getDailyRate(baseSalary: number, yearMonth: string, divisorDays?: number): number {
  const days = divisorDays && divisorDays > 0 ? divisorDays : getWorkDaysInMonth(yearMonth);
  return days > 0 ? Math.floor(baseSalary / days) : 0;
}

export function getHourlyRate(baseSalary: number, yearMonth: string, divisorDays?: number): number {
  const dailyRate = getDailyRate(baseSalary, yearMonth, divisorDays);
  return Math.floor(dailyRate / DAILY_STANDARD_HOURS);
}

function getRecordedWorkDays(attendances: AttendanceRecord[]) {
  return new Set(
    attendances
      .map((attendance) => String(attendance.work_date || '').slice(0, 10))
      .filter(Boolean)
  ).size;
}

/** 지각/조퇴 분수를 10분 단위 내림으로 반환 (기본 10분, 최소 10분) */
function resolveMinuteAmount(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.max(10, Math.floor(parsed / 10) * 10);
}

export function calculateAttendanceDeduction(
  baseSalary: number,
  yearMonth: string,
  attendances: AttendanceRecord[],
  rule: Partial<DeductionRule> = {},
  options: { scheduledWorkDays?: number } = {}
): { total: number; detail: Record<string, number> } {
  const resolvedRule: DeductionRule = {
    late_deduction_type: rule.late_deduction_type ?? DEFAULT_RULE.late_deduction_type,
    late_deduction_amount: rule.late_deduction_amount ?? DEFAULT_RULE.late_deduction_amount,
    early_leave_deduction_type: rule.early_leave_deduction_type ?? DEFAULT_RULE.early_leave_deduction_type,
    early_leave_deduction_amount: rule.early_leave_deduction_amount ?? DEFAULT_RULE.early_leave_deduction_amount,
    absent_use_daily_rate: rule.absent_use_daily_rate ?? DEFAULT_RULE.absent_use_daily_rate,
  };
  const divisorDays =
    options.scheduledWorkDays && options.scheduledWorkDays > 0
      ? options.scheduledWorkDays
      : getRecordedWorkDays(attendances);
  const dailyRate = getDailyRate(baseSalary, yearMonth, divisorDays);
  const hourlyRate = getHourlyRate(baseSalary, yearMonth, divisorDays);

  let total = 0;
  const detail: Record<string, number> = { late: 0, early_leave: 0, absent: 0 };

  for (const attendance of attendances) {
    if (attendance.status === 'absent') {
      const amount = resolvedRule.absent_use_daily_rate ? dailyRate : 0;
      total += amount;
      detail.absent += amount;
      continue;
    }

    if (attendance.status === 'late') {
      if (resolvedRule.late_deduction_type === 'fixed') {
        total += resolvedRule.late_deduction_amount;
        detail.late += resolvedRule.late_deduction_amount;
      } else {
        const amount = Math.floor(hourlyRate * (resolveMinuteAmount(attendance.late_minutes) / 60));
        total += amount;
        detail.late += amount;
      }
      continue;
    }

    if (attendance.status === 'early_leave') {
      if (resolvedRule.early_leave_deduction_type === 'fixed') {
        total += resolvedRule.early_leave_deduction_amount;
        detail.early_leave += resolvedRule.early_leave_deduction_amount;
      } else {
        const amount = Math.floor(hourlyRate * (resolveMinuteAmount(attendance.early_leave_minutes) / 60));
        total += amount;
        detail.early_leave += amount;
      }
    }
  }

  return { total, detail };
}
