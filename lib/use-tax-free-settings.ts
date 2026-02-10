/**
 * 비과세 항목 설정 조회/적용
 */
import { supabase } from '@/lib/supabase';
import {
  TAX_FREE_LEGAL_LIMITS_2024,
  type TaxFreeItemKey,
  getTaxFreeLimit
} from './tax-free-limits';

export interface TaxFreeSettings {
  meal_limit: number;
  vehicle_limit: number;
  childcare_limit: number;
  research_limit: number;
  uniform_limit: number;
  congratulations_limit: number;
  housing_limit: number;
  other_taxfree_limit: number;
}

const DEFAULT_SETTINGS: TaxFreeSettings = {
  meal_limit: TAX_FREE_LEGAL_LIMITS_2024.meal.limit,
  vehicle_limit: TAX_FREE_LEGAL_LIMITS_2024.vehicle.limit,
  childcare_limit: TAX_FREE_LEGAL_LIMITS_2024.childcare.limit,
  research_limit: TAX_FREE_LEGAL_LIMITS_2024.research.limit,
  uniform_limit: TAX_FREE_LEGAL_LIMITS_2024.uniform.limit,
  congratulations_limit: TAX_FREE_LEGAL_LIMITS_2024.congratulations.limit,
  housing_limit: TAX_FREE_LEGAL_LIMITS_2024.housing.limit,
  other_taxfree_limit: 0,
};

export async function fetchTaxFreeSettings(
  companyName: string,
  year: number = new Date().getFullYear()
): Promise<TaxFreeSettings> {
  const co = companyName === '전체' ? '전체' : companyName;
  const { data } = await supabase
    .from('tax_free_settings')
    .select('*')
    .eq('company_name', co)
    .eq('effective_year', year)
    .single();
  if (!data) return DEFAULT_SETTINGS;
  return {
    meal_limit: data.meal_limit ?? DEFAULT_SETTINGS.meal_limit,
    vehicle_limit: data.vehicle_limit ?? DEFAULT_SETTINGS.vehicle_limit,
    childcare_limit: data.childcare_limit ?? DEFAULT_SETTINGS.childcare_limit,
    research_limit: data.research_limit ?? DEFAULT_SETTINGS.research_limit,
    uniform_limit: data.uniform_limit ?? DEFAULT_SETTINGS.uniform_limit,
    congratulations_limit: data.congratulations_limit ?? DEFAULT_SETTINGS.congratulations_limit,
    housing_limit: data.housing_limit ?? DEFAULT_SETTINGS.housing_limit,
    other_taxfree_limit: data.other_taxfree_limit ?? 0,
  };
}

export async function saveTaxFreeSettings(
  companyName: string,
  settings: Partial<TaxFreeSettings>,
  year: number = new Date().getFullYear()
) {
  const co = companyName === '전체' ? '전체' : companyName;
  await supabase
    .from('tax_free_settings')
    .upsert(
      { company_name: co, effective_year: year, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'company_name,effective_year' }
    );
}

export function getLimitByKey(
  key: keyof TaxFreeSettings,
  settings: TaxFreeSettings
): number {
  return settings[key] ?? DEFAULT_SETTINGS[key];
}

export { DEFAULT_SETTINGS, TAX_FREE_LEGAL_LIMITS_2024, type TaxFreeItemKey };
