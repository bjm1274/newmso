/**
 * 급여·노무 준수 서비스 (Supabase 무관 순수 로직)
 * company-collab-system의 salary-compliance-service를 Supabase용으로 변환
 */

const MINIMUM_WAGE_2024 = 9860;  // 2024년 최저임금 (시급)
const MINIMUM_WAGE_2025 = 10030; // 2025년 최저임금 (시급)
const MONTHLY_HOURS = 209;       // 월 소정근로시간

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
  const minWage = y >= 2025 ? MINIMUM_WAGE_2025 : MINIMUM_WAGE_2024;
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
 * 연차촉진 자동 계산 (6개월마다 1일 추가)
 */
export function calculateAnnualLeavePush(
  _employeeId: string,
  employmentMonths: number
) {
  const pushDays = Math.floor(employmentMonths / 6);
  return {
    employmentMonths,
    pushDays,
    message: `${pushDays}일의 연차가 추가 부여되었습니다`,
  };
}

/**
 * 근로기준법 위반 감지
 */
export function detectLaborLawViolations(
  employeeId: string,
  year: number,
  month: number,
  workedHours: number
) {
  const violations: { type: string; message: string; hours?: number }[] = [];

  const weeklyHours = workedHours / 4; // 4주 기준
  if (weeklyHours > 52) {
    violations.push({
      type: 'excessive-overtime',
      message: '주간 근무 시간이 52시간을 초과했습니다',
      hours: weeklyHours,
    });
  }

  if (workedHours >= 8 && workedHours < 9) {
    violations.push({
      type: 'insufficient-break-time',
      message: '휴게시간이 부족합니다 (8시간 이상 근무 시 1시간 휴게 필수)',
    });
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
 * 세금 및 보험료 자동 계산
 */
export function calculateTaxesAndInsurance(grossSalary: number) {
  let incomeTax = 0;
  if (grossSalary > 5000000) {
    incomeTax = (grossSalary - 5000000) * 0.15 + 5000000 * 0.1;
  } else if (grossSalary > 3000000) {
    incomeTax = (grossSalary - 3000000) * 0.1 + 3000000 * 0.06;
  } else {
    incomeTax = grossSalary * 0.06;
  }

  const localTax = incomeTax * 0.1;
  const healthInsurance = grossSalary * 0.03545;
  const nationalPension = grossSalary * 0.045;
  const employmentInsurance = grossSalary * 0.008;
  const totalDeductions =
    incomeTax + localTax + healthInsurance + nationalPension + employmentInsurance;

  return {
    incomeTax: Math.round(incomeTax),
    localTax: Math.round(localTax),
    healthInsurance: Math.round(healthInsurance),
    nationalPension: Math.round(nationalPension),
    employmentInsurance: Math.round(employmentInsurance),
    totalDeductions: Math.round(totalDeductions),
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
