CREATE TABLE IF NOT EXISTS public.insurance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  insurance_type TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reported_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '',
  resident_no TEXT,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_records_staff ON public.insurance_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_insurance_records_company_status ON public.insurance_records(company, status);
CREATE INDEX IF NOT EXISTS idx_insurance_records_created_at ON public.insurance_records(created_at DESC);

ALTER TABLE public.insurance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_records_select_scope ON public.insurance_records;
DROP POLICY IF EXISTS insurance_records_insert_scope ON public.insurance_records;
DROP POLICY IF EXISTS insurance_records_update_scope ON public.insurance_records;
DROP POLICY IF EXISTS insurance_records_delete_scope ON public.insurance_records;

CREATE POLICY insurance_records_select_scope
ON public.insurance_records
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY insurance_records_insert_scope
ON public.insurance_records
FOR INSERT
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY insurance_records_update_scope
ON public.insurance_records
FOR UPDATE
USING (public.erp_target_staff_in_scope(staff_id))
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY insurance_records_delete_scope
ON public.insurance_records
FOR DELETE
USING (public.erp_target_staff_in_scope(staff_id));
