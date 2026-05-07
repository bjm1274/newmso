// 급여정산 관련 타입/인터페이스 및 공통 상수·유틸리티 함수

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

// DB upsert 시 누락될 수 있는 선택 컬럼 목록
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

// taxable_allowance_breakdown 기본값
export const EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN: TaxableAllowanceBreakdown = {
  position_allowance: 0,
  overtime_allowance: 0,
  night_work_allowance: 0,
  holiday_work_allowance: 0,
  annual_leave_pay: 0,
  manual_extra_allowance: 0,
};

// TaxableAllowanceBreakdown 합산
export function getTaxableAllowanceBreakdownTotal(value?: Partial<TaxableAllowanceBreakdown> | null): number {
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

// StaffMember 기본값에서 TaxableAllowanceBreakdown 생성
export function getStaffTaxableAllowanceBreakdown(staff: Record<string, unknown>): TaxableAllowanceBreakdown {
  return {
    position_allowance: Number(staff.position_allowance || 0),
    overtime_allowance: Number(staff.overtime_allowance || 0),
    night_work_allowance: Number(staff.night_work_allowance || 0),
    holiday_work_allowance: Number(staff.holiday_work_allowance || 0),
    annual_leave_pay: Number(staff.annual_leave_pay || 0),
    manual_extra_allowance: 0,
  };
}

// unknown 값을 TaxableAllowanceBreakdown 으로 정규화
export function normalizeTaxableAllowanceBreakdown(value: unknown): TaxableAllowanceBreakdown {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    position_allowance: Number(source.position_allowance || 0),
    overtime_allowance: Number(source.overtime_allowance || 0),
    night_work_allowance: Number(source.night_work_allowance || 0),
    holiday_work_allowance: Number(source.holiday_work_allowance || 0),
    annual_leave_pay: Number(source.annual_leave_pay || 0),
    manual_extra_allowance: Number(source.manual_extra_allowance || 0),
  };
}
