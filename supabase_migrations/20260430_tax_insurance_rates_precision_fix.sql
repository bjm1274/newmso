ALTER TABLE public.tax_insurance_rates
  ALTER COLUMN national_pension_rate TYPE NUMERIC(9,6) USING national_pension_rate::numeric,
  ALTER COLUMN health_insurance_rate TYPE NUMERIC(9,6) USING health_insurance_rate::numeric,
  ALTER COLUMN long_term_care_rate TYPE NUMERIC(9,6) USING long_term_care_rate::numeric,
  ALTER COLUMN employment_insurance_rate TYPE NUMERIC(9,6) USING employment_insurance_rate::numeric;

ALTER TABLE public.tax_insurance_rates
  ALTER COLUMN national_pension_rate SET DEFAULT 0.0475,
  ALTER COLUMN health_insurance_rate SET DEFAULT 0.03595,
  ALTER COLUMN long_term_care_rate SET DEFAULT 0.004724,
  ALTER COLUMN employment_insurance_rate SET DEFAULT 0.009;

UPDATE public.tax_insurance_rates
SET
  national_pension_rate = 0.0475,
  health_insurance_rate = 0.03595,
  long_term_care_rate = 0.004724,
  employment_insurance_rate = 0.009
WHERE effective_year = 2026;

UPDATE public.tax_insurance_rates
SET
  national_pension_rate = 0.045,
  health_insurance_rate = 0.03545,
  long_term_care_rate = 0.004591,
  employment_insurance_rate = 0.009
WHERE effective_year = 2025;
