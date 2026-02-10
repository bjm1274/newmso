/** 4대보험 자동 계산 (2024-2025 기준) */
export interface SocialInsuranceInput {
  grossPay: number;      // 총급여 (과세+비과세)
  nonTaxable: number;    // 비과세
  age?: number;          // 나이 (65세 이상 국민연금 제외)
}

export interface SocialInsuranceResult {
  nationalPension: number;   // 국민연금
  healthInsurance: number;   // 건강보험
  longTermCare: number;      // 장기요양
  employmentInsurance: number; // 고용보험
  total: number;
}

const NP_RATE = 0.09;       // 국민연금 9% (본인 4.5% + 회사 4.5%)
const HI_RATE = 0.0709;     // 건강보험 7.09%
const LTC_RATE = 0.1235;    // 장기요양 12.35% (건강보험의)
const EI_RATE = 0.008;      // 고용보험 0.8% (일반)

const NP_MAX = 276000;      // 국민연금 상한
const NP_MIN = 35100;       // 국민연금 하한
const HI_MAX = 498690;      // 건강보험 상한
const EI_MAX = 2760000;     // 고용보험 상한액 (월 276만)
const EI_RATE_CAP = 22100;  // 고용보험 상한 적용액

export function calculateSocialInsurance(input: SocialInsuranceInput): SocialInsuranceResult {
  const { grossPay, nonTaxable, age = 30 } = input;
  const taxable = Math.max(0, grossPay - nonTaxable);

  const npBase = Math.min(Math.max(taxable, 330000), 5530000);
  const nationalPension = age >= 65 ? 0 : Math.round(npBase * NP_RATE / 2); // 회사 부담분 50%

  const hiBase = Math.min(Math.max(taxable, 330000), 9690000);
  const healthInsurance = Math.round(hiBase * HI_RATE / 2);
  const longTermCare = Math.round(healthInsurance * LTC_RATE);

  const eiBase = Math.min(taxable, EI_MAX);
  const employmentInsurance = Math.round(Math.min(eiBase * EI_RATE / 2, EI_RATE_CAP / 2));

  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    total: nationalPension + healthInsurance + longTermCare + employmentInsurance
  };
}
