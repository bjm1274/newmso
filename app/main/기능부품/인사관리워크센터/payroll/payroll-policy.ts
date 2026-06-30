/**
 * 급여 워크센터 — 회사 정책 기본값 (hardcoded)
 *
 * 사용자가 추후 admin 설정 화면에서 override 할 수 있도록
 * `PayrollPolicyOverride` 타입을 받아 머지하는 `getPayrollPolicy()` 헬퍼를
 * 노출한다. 현재는 admin 설정 테이블이 없어 hardcoded 기본값만 반환한다.
 *
 * 출처:
 *   - 4대보험 요율 : `lib/payroll-insurance-rates.ts` 2026 기준
 *   - 최저임금     : `lib/tax-free-limits.ts` MINIMUM_WAGE_2026 = 10,320
 *   - 비과세 한도  : `lib/tax-free-limits.ts` TAX_FREE_LEGAL_LIMITS
 *   - 임금피크    : 보건복지부 권고안 평균치
 *
 * JM4: any 금지, readonly 상수 + 명시 union
 * JM5: 모든 값은 정수(원) — 부동소수 누적 금지
 */

import {
  MINIMUM_WAGE_2025,
  MINIMUM_WAGE_2026,
  TAX_FREE_LEGAL_LIMITS,
  MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import {
  EMPLOYEE_INSURANCE_RATES_2026,
  EMPLOYER_INSURANCE_RATES_2026,
  LONG_TERM_CARE_HEALTH_RATIO_2026 } from '@/lib/payroll-insurance-rates';

// ─── 임금피크 단계 ─────────────────────────────────────────
export interface WagePeakStage {
  yearOffset: number; // 적용 연도 (정년 기준 0,1,2)
  ratio: number;      // 0.0 ~ 1.0
  label: string;      // '1년차 90%' 등
}

export const DEFAULT_WAGE_PEAK_STAGES: readonly WagePeakStage[] = [
  { yearOffset: 0, ratio: 0.9, label: '1년차 90%' },
  { yearOffset: 1, ratio: 0.8, label: '2년차 80%' },
  { yearOffset: 2, ratio: 0.7, label: '3년차 70%' },
] as const;

// ─── 통상임금 포함 룰 ─────────────────────────────────────
export const ORDINARY_WAGE_INCLUDED_KEYS = [
  'base_salary',
  'position_allowance',     // 직책수당
  'meal_allowance',         // 정기 식대
  'vehicle_allowance',      // 자가운전 (정기 지급분)
] as const;

export const ORDINARY_WAGE_EXCLUDED_KEYS = [
  'overtime_pay',
  'night_duty_allowance',
  'holiday_work_allowance',
  'bonus',
] as const;

// ─── 정책 통합 타입 ───────────────────────────────────────
export interface PayrollPolicy {
  // 4대보험 (2026)
  insuranceEmployee: typeof EMPLOYEE_INSURANCE_RATES_2026;
  insuranceEmployer: typeof EMPLOYER_INSURANCE_RATES_2026;
  longTermCareRatio: number;

  // 최저임금
  minimumWageHourly: number;          // 2026: 10,320원
  minimumWageHourlyPrev: number;      // 2025: 10,030원
  minimumWageYear: number;

  // 통상임금
  monthlyStandardHours: number;       // 209h

  // 비과세 한도 (월)
  taxFreeLimits: typeof TAX_FREE_LEGAL_LIMITS;

  // 임금피크
  wagePeakStartAge: number;           // 만 60세
  wagePeakStages: readonly WagePeakStage[];

  // 정년
  retirementAge: number;              // 만 60세
}

export interface PayrollPolicyOverride {
  minimumWageHourly?: number;
  wagePeakStartAge?: number;
  wagePeakStages?: WagePeakStage[];
  retirementAge?: number;
}

// ─── 기본 정책 ─────────────────────────────────────────────
const DEFAULT_POLICY: PayrollPolicy = {
  insuranceEmployee: EMPLOYEE_INSURANCE_RATES_2026,
  insuranceEmployer: EMPLOYER_INSURANCE_RATES_2026,
  longTermCareRatio: LONG_TERM_CARE_HEALTH_RATIO_2026,

  minimumWageHourly: MINIMUM_WAGE_2026,
  minimumWageHourlyPrev: MINIMUM_WAGE_2025,
  minimumWageYear: 2026,

  monthlyStandardHours: MONTHLY_STANDARD_HOURS,

  taxFreeLimits: TAX_FREE_LEGAL_LIMITS,

  wagePeakStartAge: 60,
  wagePeakStages: DEFAULT_WAGE_PEAK_STAGES,

  retirementAge: 60 };

export function getPayrollPolicy(override?: PayrollPolicyOverride): PayrollPolicy {
  if (!override) return DEFAULT_POLICY;
  return {
    ...DEFAULT_POLICY,
    minimumWageHourly: override.minimumWageHourly ?? DEFAULT_POLICY.minimumWageHourly,
    wagePeakStartAge: override.wagePeakStartAge ?? DEFAULT_POLICY.wagePeakStartAge,
    wagePeakStages: override.wagePeakStages ?? DEFAULT_POLICY.wagePeakStages,
    retirementAge: override.retirementAge ?? DEFAULT_POLICY.retirementAge };
}

// ─── 헬퍼: 만 나이 ─────────────────────────────────────────
export function calculateAge(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

// ─── 헬퍼: 근속연수 ───────────────────────────────────────
export function calculateTenureYears(hireDate: string | null | undefined, endDate: Date = new Date()): number | null {
  if (!hireDate) return null;
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) return null;
  const diff = endDate.getTime() - hire.getTime();
  return Math.max(0, diff / (365.25 * 24 * 3600 * 1000));
}
