DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_members'
      AND column_name = 'working_hours_per_week'
  ) THEN
    EXECUTE '
      ALTER TABLE public.staff_members
      ALTER COLUMN working_hours_per_week TYPE NUMERIC(5,2)
      USING working_hours_per_week::NUMERIC(5,2)
    ';

    EXECUTE '
      ALTER TABLE public.staff_members
      ALTER COLUMN working_hours_per_week SET DEFAULT 40
    ';

    EXECUTE '
      UPDATE public.staff_members
      SET working_hours_per_week = COALESCE(
        NULLIF(permissions -> ''work_conditions'' ->> ''working_hours_per_week'', '''')::NUMERIC(5,2),
        working_hours_per_week
      )
      WHERE permissions ? ''work_conditions''
        AND NULLIF(permissions -> ''work_conditions'' ->> ''working_hours_per_week'', '''') IS NOT NULL
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employment_contracts'
      AND column_name = 'working_hours_per_week'
  ) THEN
    EXECUTE '
      ALTER TABLE public.employment_contracts
      ALTER COLUMN working_hours_per_week TYPE NUMERIC(5,2)
      USING working_hours_per_week::NUMERIC(5,2)
    ';

    EXECUTE '
      ALTER TABLE public.employment_contracts
      ALTER COLUMN working_hours_per_week SET DEFAULT 40
    ';
  END IF;
END $$;
