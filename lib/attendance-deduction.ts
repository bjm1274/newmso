/**
 * 근태 차감 계산 유틸
 * - 기본급/근로일수 → 일당, 시급
 * - 지각/조퇴/결근 → 차감액
 * - 시급 산정: 일당 / 소정근로시간(미입력 시 일 8h 기본값 적용)
 */

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
  status: string;  // present, late, early_leave, absent, annual_leave, sick_leave ...
  check_in_time?: string | null;
  check_out_time?: string | null;
};

const DEFAULT_RULE: DeductionRule = {
  late_deduction_type: 'fixed',
  late_deduction_amount: 10000,
  early_leave_deduction_type: 'fixed',
  early_leave_deduction_amount: 10000,
  absent_use_daily_rate: true,
};

/** 해당 월 근로일수 (토일 제외) */
export function getWorkDaysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** 일당 = 기본급 / 근로일수 */
export function getDailyRate(baseSalary: number, yearMonth: string): number {
  const days = getWorkDaysInMonth(yearMonth);
  return days > 0 ? Math.floor(baseSalary / days) : 0;
}

/** 시급 = 일당 / 일 소정근로시간 (미입력 시 8시간 기본값) */
export function getHourlyRate(baseSalary: number, yearMonth: string): number {
  const daily = getDailyRate(baseSalary, yearMonth);
  return Math.floor(daily / DAILY_STANDARD_HOURS);
}

export function calculateAttendanceDeduction(
  baseSalary: number,
  yearMonth: string,
  attendances: AttendanceRecord[],
  rule: Partial<DeductionRule> = {}
): { total: number; detail: Record<string, number> } {
  const r = { ...DEFAULT_RULE, ...rule };
  const dailyRate = getDailyRate(baseSalary, yearMonth);
  const hourlyRate = getHourlyRate(baseSalary, yearMonth);

  let total = 0;
  const detail: Record<string, number> = { late: 0, early_leave: 0, absent: 0 };

  for (const a of attendances) {
    if (a.status === 'absent') {
      const amt = r.absent_use_daily_rate ? dailyRate : 0;
      total += amt;
      detail.absent += amt;
    } else if (a.status === 'late') {
      if (r.late_deduction_type === 'fixed') {
        total += r.late_deduction_amount;
        detail.late += r.late_deduction_amount;
      } else {
        const mins = 30;
        const hrs = mins / 60;
        const amt = Math.floor(hourlyRate * hrs);
        total += amt;
        detail.late += amt;
      }
    } else if (a.status === 'early_leave') {
      if (r.early_leave_deduction_type === 'fixed') {
        total += r.early_leave_deduction_amount;
        detail.early_leave += r.early_leave_deduction_amount;
      } else {
        const mins = 30;
        const amt = Math.floor(hourlyRate * (mins / 60));
        total += amt;
        detail.early_leave += amt;
      }
    }
  }

  return { total, detail };
}
