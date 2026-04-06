/**
 * 급여·노무 준수 서비스 (Supabase 무관 순수 로직)
 * company-collab-system의 salary-compliance-service를 Supabase용으로 변환
 */

import { MINIMUM_WAGE_2025 as MW25, MINIMUM_WAGE_2026 as MW26, MONTHLY_STANDARD_HOURS, NP_INCOME_CEILING, NP_INCOME_FLOOR } from './tax-free-limits';

const MINIMUM_WAGE_2025 = MW25;
const MINIMUM_WAGE_2026 = MW26;
const MONTHLY_HOURS = MONTHLY_STANDARD_HOURS; // 월 소정근로시간(미입력 시 209h 기본값)

export interface StaffForCompliance {
  id: string;
  name?: string;
  base_salary?: number;
  position?: number; // 직책수당 등
}

/**
 * 최저임금법 준수 검증
 */
export function validateMinimumWageCompliance(
  staff: StaffForCompliance,
  year?: number,
  _month?: number
) {
  const y = year ?? new Date().getFullYear();
  // 2026년 이후면 2026년 기준, 그 외(2025년 포함)는 2025년 기준 적용 (2024 삭제됨)
  const minWage = y >= 2026 ? MINIMUM_WAGE_2026 : MINIMUM_WAGE_2025;
  const baseSalary = staff.base_salary ?? 0;
  const positionAllowance = staff.position ?? 0;
  const monthlySalary = baseSalary + positionAllowance;
  const minimumMonthlySalary = minWage * MONTHLY_HOURS;
  const isCompliant = monthlySalary >= minimumMonthlySalary;

  return {
    employeeId: staff.id,
    employeeName: staff.name,
    monthlySalary,
    minimumMonthlySalary,
    isCompliant,
    deficit: isCompliant ? 0 : minimumMonthlySalary - monthlySalary,
  };
}

/**
 * 법정 연차 일수 계산 (근로기준법 제60조)
 * - 1년 미만: 1개월 개근 시 1일 (최대 11일)
 * - 1년 이상: 15일 기본, 3년~부터 매 2년마다 1일 추가, 상한 25일
 */
export function calculateAnnualLeavePush(
  _employeeId: string,
  employmentMonths: number
) {
  let pushDays: number;
  if (employmentMonths < 12) {
    // 1년 미만: 개근 1개월마다 1일, 최대 11일 (근로기준법 제60조 2항)
    pushDays = Math.min(Math.max(0, Math.floor(employmentMonths)), 11);
  } else {
    // 1년 이상: 15일 기본, 3년~부터 매 2년마다 1일 추가, 최대 25일 (제60조 1·4항)
    const years = Math.floor(employmentMonths / 12);
    const extraDays = years >= 2 ? Math.floor((years - 1) / 2) : 0;
    pushDays = Math.min(15 + extraDays, 25);
  }
  return {
    employmentMonths,
    pushDays,
    message: `${pushDays}일의 연차가 부여됩니다`,
  };
}

/**
 * 근로기준법 위반 감지
 * @param workedHours - 해당 월 총 근로시간
 * @param dailyHours  - (선택) 특정 일의 근로시간. 전달 시 휴게시간 위반 감지 (근로기준법 제54조)
 */
export function detectLaborLawViolations(
  employeeId: string,
  year: number,
  month: number,
  workedHours: number,
  dailyHours?: number,
) {
  const violations: { type: string; message: string; hours?: number }[] = [];

  // 주 52시간 체크: 월 총 시간 ÷ 4.345주(월평균) (근로기준법 제53조)
  const weeklyHours = workedHours / 4.345;
  if (weeklyHours > 52) {
    violations.push({
      type: 'excessive-overtime',
      message: '주간 근무 시간이 52시간을 초과했습니다',
      hours: Math.round(weeklyHours * 10) / 10,
    });
  }

  // 일별 근로시간이 제공된 경우에만 휴게시간 위반 감지 (근로기준법 제54조)
  // - 4시간 이상 근무: 30분 이상 휴게 필수 → 기록 시간이 4시간 이상 4.5시간 미만이면 위반
  // - 8시간 이상 근무: 1시간 이상 휴게 필수  → 기록 시간이 8시간 이상 9시간 미만이면 위반
  if (dailyHours !== undefined) {
    if (dailyHours >= 8 && dailyHours < 9) {
      violations.push({
        type: 'insufficient-break-time',
        message: '휴게시간이 부족합니다 (8시간 이상 근무 시 1시간 휴게 필수)',
      });
    } else if (dailyHours >= 4 && dailyHours < 4.5) {
      violations.push({
        type: 'insufficient-break-time',
        message: '휴게시간이 부족합니다 (4시간 이상 근무 시 30분 휴게 필수)',
      });
    }
  }

  return {
    employeeId,
    year,
    month,
    violations,
    isCompliant: violations.length === 0,
  };
}

/**
 * 세금 및 보험료 자동 계산 (노무준수 리포트용 추정치)
 * 소득세: 연간 과세소득 기준 8단계 누진세율 (소득세법 제55조)
 * 4대보험: 2025~2026년 법정 요율 적용
 */
export function calculateTaxesAndInsurance(grossSalary: number) {
  // 소득세: 월급 × 12 = 연간 과세소득으로 환산 후 누진세 계산
  const annualTaxable = grossSalary * 12;
  let annualIncomeTax = 0;
  if      (annualTaxable <= 14_000_000)    annualIncomeTax = annualTaxable * 0.06;
  else if (annualTaxable <= 50_000_000)    annualIncomeTax = 840_000     + (annualTaxable - 14_000_000)  * 0.15;
  else if (annualTaxable <= 88_000_000)    annualIncomeTax = 6_240_000   + (annualTaxable - 50_000_000)  * 0.24;
  else if (annualTaxable <= 150_000_000)   annualIncomeTax = 15_360_000  + (annualTaxable - 88_000_000)  * 0.35;
  else if (annualTaxable <= 300_000_000)   annualIncomeTax = 37_060_000  + (annualTaxable - 150_000_000) * 0.38;
  else if (annualTaxable <= 500_000_000)   annualIncomeTax = 94_060_000  + (annualTaxable - 300_000_000) * 0.40;
  else if (annualTaxable <= 1_000_000_000) annualIncomeTax = 174_060_000 + (annualTaxable - 500_000_000) * 0.42;
  else                                     annualIncomeTax = 384_060_000 + (annualTaxable - 1_000_000_000) * 0.45;

  const incomeTax = Math.round(annualIncomeTax / 12);
  const localTax = Math.round(incomeTax * 0.1);

  // 건강보험 3.545% + 장기요양 건강보험료×12.95%
  const healthInsurance = Math.floor(grossSalary * 0.03545);
  const longTermCare = Math.floor(healthInsurance * 0.1295);

  // 국민연금: 기준소득월액 상·하한 적용 후 4.5% (국민연금법 시행령 제5조)
  const npBase = Math.min(Math.max(grossSalary, NP_INCOME_FLOOR), NP_INCOME_CEILING);
  const nationalPension = Math.floor(npBase * 0.045);

  // 고용보험: 근로자 부담 0.9% (2023년 이후)
  const employmentInsurance = Math.floor(grossSalary * 0.009);

  const totalDeductions = incomeTax + localTax + healthInsurance + longTermCare + nationalPension + employmentInsurance;

  return {
    incomeTax,
    localTax,
    healthInsurance,
    longTermCare,
    nationalPension,
    employmentInsurance,
    totalDeductions,
    netSalary: Math.round(grossSalary - totalDeductions),
  };
}

/**
 * 회사 전체 노무 준수 리포트 생성 (staffs 배열 전달)
 */
export function generateComplianceReport(
  staffs: StaffForCompliance[],
  year?: number,
  _month?: number
) {
  let totalViolations = 0;
  const violationsList: { employeeId: string; employeeName?: string; deficit: number }[] = [];

  for (const staff of staffs) {
    const compliance = validateMinimumWageCompliance(staff, year);
    if (!compliance.isCompliant) {
      totalViolations++;
      violationsList.push({
        employeeId: staff.id,
        employeeName: staff.name,
        deficit: compliance.deficit,
      });
    }
  }

  const totalEmployees = staffs.length;
  const complianceRate =
    totalEmployees > 0
      ? (((totalEmployees - totalViolations) / totalEmployees) * 100).toFixed(2)
      : '100.00';

  return {
    totalEmployees,
    totalViolations,
    violations: violationsList,
    complianceRate,
    generatedAt: new Date(),
  };
}
