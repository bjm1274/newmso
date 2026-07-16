import { NP_INCOME_CEILING, NP_INCOME_FLOOR } from '@/lib/tax-free-limits';
import { isMidMonthJoin } from '@/lib/payroll-mid-month';

export const EMPLOYEE_INSURANCE_RATES_2026 = {
  nationalPension: 0.0475,
  healthInsurance: 0.03595,
  longTermCare: 0.004724,
  employmentInsurance: 0.009 } as const;

export const EMPLOYER_INSURANCE_RATES_2026 = {
  nationalPension: 0.0475,
  healthInsurance: 0.03595,
  longTermCare: 0.004724,
  employmentInsuranceMin: 0.0115,
  employmentInsuranceMax: 0.0175 } as const;

export const LONG_TERM_CARE_HEALTH_RATIO_2026 = 0.1314;
export const COMMUTE_ACCIDENT_RATE_2026 = 0.0006;
export const AVERAGE_INDUSTRIAL_ACCIDENT_RATE_2026 = 0.0147;

export type IndustrialAccidentInsuranceInfo = {
  industryLabel: string;
  businessRate: number;
  commuteRate: number;
  employerRate: number;
  employeeRate: number;
};

function normalizeCompanyName(companyName?: unknown) {
  return String(companyName || '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function getIndustrialAccidentInsuranceInfo(companyName?: unknown): IndustrialAccidentInsuranceInfo {
  const normalized = normalizeCompanyName(companyName);

  if (
    normalized.includes('syinc') ||
    normalized.includes('sy.inc') ||
    normalized.includes('symso') ||
    normalized.includes('정보통신판매') ||
    normalized.includes('전자상거래') ||
    normalized.includes('통신판매')
  ) {
    return {
      industryLabel: '도소매·전자상거래업',
      businessRate: 0.008,
      commuteRate: COMMUTE_ACCIDENT_RATE_2026,
      employerRate: 0.0086,
      employeeRate: 0 };
  }

  if (
    normalized.includes('의원') ||
    normalized.includes('병원') ||
    normalized.includes('정형외과') ||
    normalized.includes('치과') ||
    normalized.includes('의료')
  ) {
    return {
      industryLabel: '의료·보건업',
      businessRate: 0.006,
      commuteRate: COMMUTE_ACCIDENT_RATE_2026,
      employerRate: 0.0066,
      employeeRate: 0 };
  }

  return {
    industryLabel: '기타 업종(평균 적용)',
    businessRate: AVERAGE_INDUSTRIAL_ACCIDENT_RATE_2026 - COMMUTE_ACCIDENT_RATE_2026,
    commuteRate: COMMUTE_ACCIDENT_RATE_2026,
    employerRate: AVERAGE_INDUSTRIAL_ACCIDENT_RATE_2026,
    employeeRate: 0 };
}

export function calculateEmployeeInsuranceDeductions(
  taxableIncome: number,
  age: number = 30,
  yearMonth?: string | null,
  nationalPensionAmount?: number | null,
  joinedAt?: string | null
) {
  const taxableBase = Math.max(0, Math.floor(Number(taxableIncome) || 0));

  // 중도입사 여부 확인 (입사연월 === 정산연월 && 입사일 !== 1일)
  const midMonthJoin = isMidMonthJoin(joinedAt, yearMonth);

  const pensionBase = Math.min(Math.max(taxableBase, NP_INCOME_FLOOR), NP_INCOME_CEILING);

  const nationalPension =
    midMonthJoin || age >= 60
      ? 0
      : typeof nationalPensionAmount === 'number' && nationalPensionAmount >= 0
      ? nationalPensionAmount
      : Math.floor(pensionBase * EMPLOYEE_INSURANCE_RATES_2026.nationalPension);

  const healthInsurance = midMonthJoin
    ? 0
    : Math.floor(taxableBase * EMPLOYEE_INSURANCE_RATES_2026.healthInsurance);

  const longTermCare = midMonthJoin
    ? 0
    : Math.floor(healthInsurance * LONG_TERM_CARE_HEALTH_RATIO_2026);
    
  const employmentInsurance = Math.floor(taxableBase * EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance);

  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    total: nationalPension + healthInsurance + longTermCare + employmentInsurance };
}

export function calculateIndustrialAccidentInsurance(baseAmount: number, companyName?: unknown) {
  const insuranceBase = Math.max(0, Math.floor(Number(baseAmount) || 0));
  const info = getIndustrialAccidentInsuranceInfo(companyName);
  const employerAmount = Math.round((insuranceBase * info.employerRate) / 10) * 10;

  return {
    ...info,
    employerAmount };
}
