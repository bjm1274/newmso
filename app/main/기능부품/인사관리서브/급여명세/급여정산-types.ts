// 급여정산 도메인 타입 정의 (순수 추출 — 동작 보존)

export interface SettlementEntry {
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
  apply_tax: boolean;
  apply_insurance: boolean;
  attendance_deduction: number;
  attendance_deduction_detail: Record<string, unknown>;
  custom_deduction: number;
  dependent_count: number;
  child_count_8_20: number;
  withholding_rate_percent: 80 | 100 | 120;
  advance_pay: number;
  salary_change_proration?: SalaryChangeProrationSummary[];
  saved_status?: string;
  taxable_allowance_breakdown: TaxableAllowanceBreakdown;
}

export interface TaxableAllowanceBreakdown {
  position_allowance: number;
  overtime_allowance: number;
  night_work_allowance: number;
  holiday_work_allowance: number;
  annual_leave_pay: number;
  manual_extra_allowance: number;
}

export interface SavedPayrollRecord {
  staff_id: string;
  year_month?: string | null;
  base_salary?: number | null;
  meal_allowance?: number | null;
  night_duty_allowance?: number | null;
  vehicle_allowance?: number | null;
  childcare_allowance?: number | null;
  research_allowance?: number | null;
  other_taxfree?: number | null;
  extra_allowance?: number | null;
  overtime_pay?: number | null;
  bonus?: number | null;
  attendance_deduction?: number | null;
  attendance_deduction_detail?: Record<string, unknown> | null;
  deduction_detail?: Record<string, unknown> | null;
  advance_pay?: number | null;
  status?: string | null;
  record_type?: string | null;
}

export type SalaryAmountField =
  | 'base_salary'
  | 'meal_allowance'
  | 'night_duty_allowance'
  | 'vehicle_allowance'
  | 'childcare_allowance'
  | 'research_allowance'
  | 'other_taxfree'
  | keyof TaxableAllowanceBreakdown;

export type SalaryChangeHistoryRow = {
  id?: string;
  staff_id: string;
  change_type: string;
  before_value: number | null;
  after_value: number | null;
  effective_date: string;
  reason?: string | null;
  created_at?: string | null;
};

export type SalaryChangeProrationSegment = {
  period_start: string;
  period_end: string;
  days: number;
  monthly_amount: number;
  prorated_amount: number;
};

export type SalaryChangeProrationSummary = {
  field: SalaryAmountField;
  label: string;
  effective_dates: string[];
  before_value: number;
  after_value: number;
  reason: string;
  amount: number;
  segments: SalaryChangeProrationSegment[];
};
