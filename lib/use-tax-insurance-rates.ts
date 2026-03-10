import { supabase } from '@/lib/supabase';

export interface TaxInsuranceRates {
  national_pension_rate: number;
  health_insurance_rate: number;
  long_term_care_rate: number;
  employment_insurance_rate: number;
  income_tax_bracket: any[];
}

export const DEFAULT_TAX_INSURANCE_RATES: TaxInsuranceRates = {
  national_pension_rate: 0.045,
  health_insurance_rate: 0.0355,
  long_term_care_rate: 0.0046,
  employment_insurance_rate: 0.009,
  income_tax_bracket: [],
};

function normalizeRates(row: any | null | undefined): TaxInsuranceRates {
  const source = Array.isArray(row) ? row[0] : row;
  if (!source) return DEFAULT_TAX_INSURANCE_RATES;
  return {
    national_pension_rate: Number(source.national_pension_rate ?? DEFAULT_TAX_INSURANCE_RATES.national_pension_rate),
    health_insurance_rate: Number(source.health_insurance_rate ?? DEFAULT_TAX_INSURANCE_RATES.health_insurance_rate),
    long_term_care_rate: Number(source.long_term_care_rate ?? DEFAULT_TAX_INSURANCE_RATES.long_term_care_rate),
    employment_insurance_rate: Number(source.employment_insurance_rate ?? DEFAULT_TAX_INSURANCE_RATES.employment_insurance_rate),
    income_tax_bracket: Array.isArray(source.income_tax_bracket) ? source.income_tax_bracket : [],
  };
}

export async function fetchTaxInsuranceRates(
  companyName: string,
  year: number = new Date().getFullYear()
): Promise<TaxInsuranceRates> {
  const companyScope = companyName === '전체' ? '전체' : companyName;

  const companyRes = await supabase
    .from('tax_insurance_rates')
    .select('*')
    .eq('company_name', companyScope)
    .eq('effective_year', year)
    .maybeSingle();

  if (companyRes.data) {
    return normalizeRates(companyRes.data);
  }

  const fallbackRes = await supabase
    .from('tax_insurance_rates')
    .select('*')
    .eq('company_name', '전체')
    .eq('effective_year', year)
    .maybeSingle();

  return normalizeRates(fallbackRes.data);
}

export function hasExactIncomeTaxBracket(rates: TaxInsuranceRates): boolean {
  return Array.isArray(rates.income_tax_bracket) && rates.income_tax_bracket.length > 0;
}
