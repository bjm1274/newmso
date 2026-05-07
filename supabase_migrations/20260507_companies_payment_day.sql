ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_day INTEGER DEFAULT 7;

UPDATE companies
SET payment_day = 7
WHERE payment_day IS NULL;

ALTER TABLE companies ALTER COLUMN payment_day SET DEFAULT 7;
ALTER TABLE companies ALTER COLUMN payment_day SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_payment_day_check'
      AND conrelid = 'companies'::regclass
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_payment_day_check CHECK (payment_day BETWEEN 1 AND 31);
  END IF;
END $$;
