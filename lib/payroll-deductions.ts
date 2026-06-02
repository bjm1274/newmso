import { calculateMonthlyIncomeTax, type TaxInsuranceRates, hasExactIncomeTaxBracket } from './use-tax-insurance-rates';
import { NP_INCOME_CEILING, NP_INCOME_FLOOR } from './tax-free-limits';

export interface StatutoryDeductionOptions {
  applyInsurance?: boolean;
  applyTax?: boolean;
  isDuruNuriActive?: boolean;
  isMedicalBenefit?: boolean;
  dependentCount?: number;
  qualifyingChildCount?: number;
  withholdingRatePercent?: number;
}

export interface StatutoryDeductionResult {
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_tax: number;
  total_insurance_deductions: number;
}

/**
 * 4대보험 및 근로소득세/지방소득세를 계산하는 단일 공통 함수 (SSOT)
 */
export function calcStatutoryDeductions(
  taxableIncome: number,
  rates: TaxInsuranceRates,
  opts: StatutoryDeductionOptions = {}
): StatutoryDeductionResult {
  const applyInsurance = opts.applyInsurance !== false;
  const applyTax = opts.applyTax !== false;
  const isDuruNuriActive = !!opts.isDuruNuriActive;
  const isMedicalBenefit = !!opts.isMedicalBenefit;
  const dependentCount = opts.dependentCount ?? 0;
  const qualifyingChildCount = opts.qualifyingChildCount ?? 0;
  const withholdingRatePercent = opts.withholdingRatePercent ?? 100;

  let national_pension = 0;
  let health_insurance = 0;
  let long_term_care = 0;
  let employment_insurance = 0;
  let income_tax = 0;
  let local_tax = 0;

  if (applyInsurance) {
    // 1. 국민연금 - 기준소득월액 상·하한 적용 (2025.7~2026.6: 상한 637만원, 하한 40만원)
    //    두루누리 80% 지원 적용 시 근로자 부담분 20%만 부과
    const npBase = Math.min(Math.max(taxableIncome, NP_INCOME_FLOOR), NP_INCOME_CEILING);
    const full_national = Math.floor(npBase * rates.national_pension_rate);
    national_pension = isDuruNuriActive ? Math.floor(full_national * 0.2) : full_national;

    // 2. 건강보험 및 장기요양보험 - 의료급여 수급자는 제외 (0원)
    if (!isMedicalBenefit) {
      health_insurance = Math.floor(taxableIncome * rates.health_insurance_rate);
      long_term_care = Math.floor(taxableIncome * rates.long_term_care_rate);
    }

    // 3. 고용보험 - 두루누리 80% 지원 적용 시 20%만 부과
    const full_employment = Math.floor(taxableIncome * rates.employment_insurance_rate);
    employment_insurance = isDuruNuriActive ? Math.floor(full_employment * 0.2) : full_employment;
  }

  const hasExactWithholdingTable = hasExactIncomeTaxBracket(rates);
  if (applyTax && hasExactWithholdingTable) {
    const exactIncomeTax = calculateMonthlyIncomeTax(taxableIncome, rates, dependentCount, {
      withholdingRatePercent,
      qualifyingChildCount,
    });
    income_tax = Math.max(0, exactIncomeTax);
    local_tax = Math.floor(income_tax * 0.1 / 10) * 10; // 지방소득세 10% 이내 10원 단위 절사 (국고금관리법 제47조)
  }

  return {
    national_pension,
    health_insurance,
    long_term_care,
    employment_insurance,
    income_tax,
    local_tax,
    total_insurance_deductions: national_pension + health_insurance + long_term_care + employment_insurance,
  };
}
