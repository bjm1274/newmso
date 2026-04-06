import { calculateEmployeeInsuranceDeductions } from '@/lib/payroll-insurance-rates';

export interface SocialInsuranceInput {
  grossPay: number;
  nonTaxable: number;
  age?: number;
}

export interface SocialInsuranceResult {
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  total: number;
}

export function calculateSocialInsurance(input: SocialInsuranceInput): SocialInsuranceResult {
  const { grossPay, nonTaxable, age = 30 } = input;
  const taxableIncome = Math.max(0, grossPay - nonTaxable);
  const result = calculateEmployeeInsuranceDeductions(taxableIncome, age);

  return {
    nationalPension: result.nationalPension,
    healthInsurance: result.healthInsurance,
    longTermCare: result.longTermCare,
    employmentInsurance: result.employmentInsurance,
    total: result.total,
  };
}
