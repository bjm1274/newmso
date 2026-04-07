ALTER TABLE tax_insurance_rates
  ALTER COLUMN national_pension_rate TYPE NUMERIC(7,6) USING national_pension_rate::numeric,
  ALTER COLUMN health_insurance_rate TYPE NUMERIC(7,6) USING health_insurance_rate::numeric,
  ALTER COLUMN long_term_care_rate TYPE NUMERIC(7,6) USING long_term_care_rate::numeric,
  ALTER COLUMN employment_insurance_rate TYPE NUMERIC(7,6) USING employment_insurance_rate::numeric;

ALTER TABLE tax_insurance_rates
  ALTER COLUMN national_pension_rate SET DEFAULT 0.0475,
  ALTER COLUMN health_insurance_rate SET DEFAULT 0.03595,
  ALTER COLUMN long_term_care_rate SET DEFAULT 0.004724,
  ALTER COLUMN employment_insurance_rate SET DEFAULT 0.009;

INSERT INTO tax_insurance_rates (
  effective_year,
  company_name,
  national_pension_rate,
  health_insurance_rate,
  long_term_care_rate,
  employment_insurance_rate,
  income_tax_bracket
)
VALUES (
  2026,
  '전체',
  0.0475,
  0.03595,
  0.004724,
  0.009,
  '[]'::jsonb
)
ON CONFLICT (effective_year, company_name)
DO UPDATE SET
  national_pension_rate = EXCLUDED.national_pension_rate,
  health_insurance_rate = EXCLUDED.health_insurance_rate,
  long_term_care_rate = EXCLUDED.long_term_care_rate,
  employment_insurance_rate = EXCLUDED.employment_insurance_rate;
