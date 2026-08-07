import { getNpIncomeLimits, getHealthEmployeePremiumLimits } from '@/lib/tax-free-limits';
import { isMidMonthJoin } from '@/lib/payroll-mid-month';

/**
 * 보험료 절사 — Math.floor 하기 전에 2진 부동소수점 오차를 걷어낸다.
 *
 * 왜 이렇게 됐는가: 고용보험 요율 0.009 는 2진수로 정확히 표현되지 않아
 * `3_000_000 * 0.009 === 26999.999999999996` 이 된다. 그대로 Math.floor 하면
 * 27,000원이어야 할 고용보험료가 26,999원이 된다. 월 100만~800만원을 1,000원
 * 간격으로 전수 대조하니 **48.3%(3,381/7,001)** 구간에서 1원이 모자랐다
 * (국민연금 0.0475·건강보험 0.03595·장기요양 0.004724 요율은 0건).
 * 1원이라도 공단 고지액·EDI 신고액과 어긋나면 매달 차액 정리가 필요해지므로,
 * 유효자릿수 10자리로 정규화해 오차만 지운다. 절사(내림) 규칙 자체는 그대로다.
 */
export function floorPremium(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(Number(value.toPrecision(10)));
}

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

  const npLimits = getNpIncomeLimits(yearMonth);
  const pensionBase = Math.min(Math.max(taxableBase, npLimits.floor), npLimits.ceiling);

  const nationalPension =
    midMonthJoin || age >= 60
      ? 0
      : typeof nationalPensionAmount === 'number' && nationalPensionAmount >= 0
      ? nationalPensionAmount
      : floorPremium(pensionBase * EMPLOYEE_INSURANCE_RATES_2026.nationalPension);

  // 건강보험료 상·하한(보건복지부 고시)을 여기서도 적용한다. 예전에는
  // calcStatutoryDeductions 쪽에만 한도가 있어서, 같은 고소득자를 4대보험EDI·
  // 급여상세 폴백·시뮬레이터에서 보면 정산 화면보다 건강보험료가 크게 나왔다.
  const healthLimits = getHealthEmployeePremiumLimits(yearMonth);
  const rawHealth = floorPremium(taxableBase * EMPLOYEE_INSURANCE_RATES_2026.healthInsurance);

  const healthInsurance = midMonthJoin || taxableBase <= 0
    ? 0
    : Math.min(Math.max(rawHealth, healthLimits.min), healthLimits.max);

  const longTermCare = midMonthJoin
    ? 0
    : floorPremium(healthInsurance * LONG_TERM_CARE_HEALTH_RATIO_2026);

  const employmentInsurance = floorPremium(taxableBase * EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance);

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
