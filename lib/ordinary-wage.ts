/**
 * 통상임금 산출 (근로기준법)
 * 통상임금 = 1개월간 통상적으로 지급되는 임금 / 월 소정근로시간(209시간)
 */

import { MONTHLY_STANDARD_HOURS } from './tax-free-limits';

export type SalaryBreakdown = {
  base_salary?: number;
  meal_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
  position_allowance?: number;
};

export type OrdinaryWageRow = {
  label: string;
  amount: number;
};

export function getOrdinaryWageTable(breakdown: SalaryBreakdown): {
  rows: OrdinaryWageRow[];
  totalMonthly: number;
  hourlyWage: number;
} {
  const items: OrdinaryWageRow[] = [];
  if (Number(breakdown.base_salary) > 0) {
    items.push({ label: '기본급', amount: Number(breakdown.base_salary) });
  }
  if (Number(breakdown.position_allowance) > 0) {
    items.push({ label: '직책수당', amount: Number(breakdown.position_allowance) });
  }
  if (Number(breakdown.meal_allowance) > 0) {
    items.push({ label: '식대 (비과세)', amount: Number(breakdown.meal_allowance) });
  }
  if (Number(breakdown.vehicle_allowance) > 0) {
    items.push({ label: '자가운전 (비과세)', amount: Number(breakdown.vehicle_allowance) });
  }
  if (Number(breakdown.childcare_allowance) > 0) {
    items.push({ label: '보육수당 (비과세)', amount: Number(breakdown.childcare_allowance) });
  }
  if (Number(breakdown.research_allowance) > 0) {
    items.push({ label: '연구활동비 (비과세)', amount: Number(breakdown.research_allowance) });
  }
  if (Number(breakdown.other_taxfree) > 0) {
    items.push({ label: '기타 비과세', amount: Number(breakdown.other_taxfree) });
  }

  const totalMonthly = items.reduce((sum, r) => sum + r.amount, 0);
  const hourlyWage = totalMonthly > 0
    ? Math.floor(totalMonthly / MONTHLY_STANDARD_HOURS)
    : 0;

  return {
    rows: items,
    totalMonthly,
    hourlyWage,
  };
}
