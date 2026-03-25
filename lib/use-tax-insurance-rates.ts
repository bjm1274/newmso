import { supabase } from '@/lib/supabase';

export interface TaxInsuranceRates {
  national_pension_rate: number;
  health_insurance_rate: number;
  long_term_care_rate: number;
  employment_insurance_rate: number;
  income_tax_bracket: any[];
  configured?: boolean;
}

export type IncomeTaxBracketEntry = {
  min: number;
  max: number | null;
  rate: number;
  deduction?: number;
  base_tax?: number;
  monthly_tax?: number;
  official?: boolean;
};

export const DEFAULT_INCOME_TAX_BRACKET: IncomeTaxBracketEntry[] = [
  { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
  { min: 14_000_000, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_000, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_000, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_000, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_000, max: 500_000_000, rate: 0.4, deduction: 25_940_000 },
  { min: 500_000_000, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_000, max: null, rate: 0.45, deduction: 65_940_000 },
];

export const DEFAULT_TAX_INSURANCE_RATES: TaxInsuranceRates = {
  national_pension_rate: 0.045,
  health_insurance_rate: 0.0355,
  long_term_care_rate: 0.0046,
  employment_insurance_rate: 0.009,
  income_tax_bracket: DEFAULT_INCOME_TAX_BRACKET,
  configured: false,
};

function toFiniteNumber(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIncomeTaxBracketEntry(entry: any): IncomeTaxBracketEntry | null {
  if (!entry || typeof entry !== 'object') return null;

  const min = toFiniteNumber(entry.min ?? entry.from ?? entry.start ?? entry.lower_bound ?? entry.annual_min);
  const max = toFiniteNumber(entry.max ?? entry.to ?? entry.end ?? entry.upper_bound ?? entry.annual_max);
  const rate = toFiniteNumber(entry.rate ?? entry.tax_rate ?? entry.percentage);
  const deduction = toFiniteNumber(entry.deduction ?? entry.quick_deduction ?? entry.quickDeduction ?? entry.누진공제);
  const baseTax = toFiniteNumber(entry.base_tax ?? entry.baseTax ?? entry.tax ?? entry.산출세액);
  const monthlyTax = toFiniteNumber(entry.monthly_tax ?? entry.monthlyTax ?? entry.month_tax ?? entry.월세액);

  if (min === null && max === null && rate === null && deduction === null && baseTax === null && monthlyTax === null) {
    return null;
  }

  return {
    min: min ?? 0,
    max,
    rate: rate ?? 0,
    deduction: deduction ?? undefined,
    base_tax: baseTax ?? undefined,
    monthly_tax: monthlyTax ?? undefined,
    official: entry.official === true,
  };
}

function isDetailedBracket(entries: IncomeTaxBracketEntry[]) {
  return entries.length > 1 || entries.some((entry) =>
    entry.max !== null ||
    entry.deduction !== undefined ||
    entry.base_tax !== undefined ||
    entry.monthly_tax !== undefined
  );
}

export function resolveIncomeTaxBracket(rates?: Partial<TaxInsuranceRates> | null): IncomeTaxBracketEntry[] {
  const normalized = Array.isArray(rates?.income_tax_bracket)
    ? rates!.income_tax_bracket
        .map((entry) => normalizeIncomeTaxBracketEntry(entry))
        .filter((entry): entry is IncomeTaxBracketEntry => entry !== null)
        .sort((left, right) => left.min - right.min)
    : [];

  return isDetailedBracket(normalized) ? normalized : DEFAULT_INCOME_TAX_BRACKET;
}

export function calculateMonthlyIncomeTax(
  taxableIncome: number,
  rates?: Partial<TaxInsuranceRates> | null
): number {
  const monthlyTaxable = Math.max(0, Math.floor(Number(taxableIncome) || 0));
  if (monthlyTaxable <= 0) return 0;

  const annualTaxable = monthlyTaxable * 12;
  const brackets = resolveIncomeTaxBracket(rates);
  const matched = brackets.find((entry) => annualTaxable >= entry.min && annualTaxable <= (entry.max ?? Number.POSITIVE_INFINITY))
    ?? brackets[brackets.length - 1];

  if (!matched) return 0;

  if (matched.monthly_tax !== undefined) {
    return Math.max(0, Math.floor(matched.monthly_tax));
  }

  const annualTax = matched.base_tax !== undefined
    ? matched.base_tax + Math.max(0, annualTaxable - matched.min) * matched.rate
    : Math.max(0, annualTaxable * matched.rate - (matched.deduction ?? 0));

  return Math.max(0, Math.floor(annualTax / 12));
}

export function calculateAnnualIncomeTax(
  taxableIncome: number,
  rates?: Partial<TaxInsuranceRates> | null
): number {
  const annualTaxable = Math.max(0, Math.floor(Number(taxableIncome) || 0));
  if (annualTaxable <= 0) return 0;

  const brackets = resolveIncomeTaxBracket(rates);
  const matched = brackets.find((entry) => annualTaxable >= entry.min && annualTaxable <= (entry.max ?? Number.POSITIVE_INFINITY))
    ?? brackets[brackets.length - 1];

  if (!matched) return 0;

  if (matched.monthly_tax !== undefined) {
    return Math.max(0, Math.floor(matched.monthly_tax * 12));
  }

  const annualTax = matched.base_tax !== undefined
    ? matched.base_tax + Math.max(0, annualTaxable - matched.min) * matched.rate
    : Math.max(0, annualTaxable * matched.rate - (matched.deduction ?? 0));

  return Math.max(0, Math.floor(annualTax));
}

function normalizeRates(row: any | null | undefined, configured: boolean): TaxInsuranceRates {
  const source = Array.isArray(row) ? row[0] : row;
  if (!source) {
    return {
      ...DEFAULT_TAX_INSURANCE_RATES,
      configured,
    };
  }
  return {
    national_pension_rate: Number(source.national_pension_rate ?? DEFAULT_TAX_INSURANCE_RATES.national_pension_rate),
    health_insurance_rate: Number(source.health_insurance_rate ?? DEFAULT_TAX_INSURANCE_RATES.health_insurance_rate),
    long_term_care_rate: Number(source.long_term_care_rate ?? DEFAULT_TAX_INSURANCE_RATES.long_term_care_rate),
    employment_insurance_rate: Number(source.employment_insurance_rate ?? DEFAULT_TAX_INSURANCE_RATES.employment_insurance_rate),
    income_tax_bracket: resolveIncomeTaxBracket(source),
    configured,
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
    return normalizeRates(companyRes.data, true);
  }

  const fallbackRes = await supabase
    .from('tax_insurance_rates')
    .select('*')
    .eq('company_name', '전체')
    .eq('effective_year', year)
    .maybeSingle();

  return normalizeRates(fallbackRes.data, Boolean(fallbackRes.data));
}

export function hasExactIncomeTaxBracket(rates: TaxInsuranceRates): boolean {
  if (rates.configured !== true || !Array.isArray(rates.income_tax_bracket) || rates.income_tax_bracket.length === 0) {
    return false;
  }
  return rates.income_tax_bracket.every((entry: any) => entry && entry.official === true);
}
