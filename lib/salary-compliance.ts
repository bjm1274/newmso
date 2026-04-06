/**
 * 급여·노무 준수 계산 공통 로직
 */

import {
  MINIMUM_WAGE_2025 as MW25,
  MINIMUM_WAGE_2026 as MW26,
  MONTHLY_STANDARD_HOURS,
} from './tax-free-limits';
import { calculateEmployeeInsuranceDeductions } from './payroll-insurance-rates';

const MINIMUM_WAGE_2025 = MW25;
const MINIMUM_WAGE_2026 = MW26;
const MONTHLY_HOURS = MONTHLY_STANDARD_HOURS;

export interface StaffForCompliance {
  id: string;
  name?: string;
  base_salary?: number;
  position?: number;
}

export function validateMinimumWageCompliance(
  staff: StaffForCompliance,
  year?: number,
  _month?: number,
) {
  const targetYear = year ?? new Date().getFullYear();
  const minWage = targetYear >= 2026 ? MINIMUM_WAGE_2026 : MINIMUM_WAGE_2025;
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

export function calculateAnnualLeavePush(_employeeId: string, employmentMonths: number) {
  let pushDays: number;

  if (employmentMonths < 12) {
    pushDays = Math.min(Math.max(0, Math.floor(employmentMonths)), 11);
  } else {
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

export function detectLaborLawViolations(
  employeeId: string,
  year: number,
  month: number,
  workedHours: number,
  dailyHours?: number,
) {
  const violations: { type: string; message: string; hours?: number }[] = [];
  const weeklyHours = workedHours / 4.345;

  if (weeklyHours > 52) {
    violations.push({
      type: 'excessive-overtime',
      message: '주간 근무 시간이 52시간을 초과했습니다',
      hours: Math.round(weeklyHours * 10) / 10,
    });
  }

  if (dailyHours !== undefined) {
    if (dailyHours >= 8 && dailyHours < 9) {
      violations.push({
        type: 'insufficient-break-time',
        message: '휴게시간이 부족합니다 (8시간 이상 근무 시 1시간 휴게 필요)',
      });
    } else if (dailyHours >= 4 && dailyHours < 4.5) {
      violations.push({
        type: 'insufficient-break-time',
        message: '휴게시간이 부족합니다 (4시간 이상 근무 시 30분 휴게 필요)',
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

export function calculateTaxesAndInsurance(grossSalary: number) {
  const annualTaxable = grossSalary * 12;
  let annualIncomeTax = 0;

  if (annualTaxable <= 14_000_000) annualIncomeTax = annualTaxable * 0.06;
  else if (annualTaxable <= 50_000_000) annualIncomeTax = 840_000 + (annualTaxable - 14_000_000) * 0.15;
  else if (annualTaxable <= 88_000_000) annualIncomeTax = 6_240_000 + (annualTaxable - 50_000_000) * 0.24;
  else if (annualTaxable <= 150_000_000) annualIncomeTax = 15_360_000 + (annualTaxable - 88_000_000) * 0.35;
  else if (annualTaxable <= 300_000_000) annualIncomeTax = 37_060_000 + (annualTaxable - 150_000_000) * 0.38;
  else if (annualTaxable <= 500_000_000) annualIncomeTax = 94_060_000 + (annualTaxable - 300_000_000) * 0.4;
  else if (annualTaxable <= 1_000_000_000) annualIncomeTax = 174_060_000 + (annualTaxable - 500_000_000) * 0.42;
  else annualIncomeTax = 384_060_000 + (annualTaxable - 1_000_000_000) * 0.45;

  const incomeTax = Math.round(annualIncomeTax / 12);
  const localTax = Math.round(incomeTax * 0.1);
  const insurance = calculateEmployeeInsuranceDeductions(grossSalary);
  const totalDeductions =
    incomeTax +
    localTax +
    insurance.nationalPension +
    insurance.healthInsurance +
    insurance.longTermCare +
    insurance.employmentInsurance;

  return {
    incomeTax,
    localTax,
    healthInsurance: insurance.healthInsurance,
    longTermCare: insurance.longTermCare,
    nationalPension: insurance.nationalPension,
    employmentInsurance: insurance.employmentInsurance,
    totalDeductions,
    netSalary: Math.round(grossSalary - totalDeductions),
  };
}

export function generateComplianceReport(
  staffs: StaffForCompliance[],
  year?: number,
  _month?: number,
) {
  let totalViolations = 0;
  const violationsList: { employeeId: string; employeeName?: string; deficit: number }[] = [];

  for (const staff of staffs) {
    const compliance = validateMinimumWageCompliance(staff, year);
    if (!compliance.isCompliant) {
      totalViolations += 1;
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
