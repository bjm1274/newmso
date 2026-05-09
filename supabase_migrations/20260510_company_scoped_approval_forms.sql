-- Company scoped approval form templates and seal support.
-- Safe to run even when approval_form_types has not been installed yet.

CREATE TABLE IF NOT EXISTS public.approval_form_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  company_name TEXT NOT NULL DEFAULT '전체',
  base_slug TEXT
);

DO $$
BEGIN
  ALTER TABLE public.approval_form_types
    ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '전체',
    ADD COLUMN IF NOT EXISTS base_slug TEXT;

  ALTER TABLE public.approval_form_types
    DROP CONSTRAINT IF EXISTS approval_form_types_slug_key;

  DROP INDEX IF EXISTS public.approval_form_types_slug_key;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_form_types_company_slug
    ON public.approval_form_types(company_name, slug);

  CREATE INDEX IF NOT EXISTS idx_approval_form_types_company_active
    ON public.approval_form_types(company_name, is_active, sort_order);
END $$;

ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS public.company_seals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '대표인',
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_seals_company_active
  ON public.company_seals(company, is_active, created_at DESC);

ALTER TABLE public.company_seals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_seals_select ON public.company_seals;
DROP POLICY IF EXISTS company_seals_insert ON public.company_seals;
DROP POLICY IF EXISTS company_seals_update ON public.company_seals;
DROP POLICY IF EXISTS company_seals_delete ON public.company_seals;

CREATE POLICY company_seals_select
ON public.company_seals
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY company_seals_insert
ON public.company_seals
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY company_seals_update
ON public.company_seals
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY company_seals_delete
ON public.company_seals
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-seals', 'company-seals', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS company_seals_storage_select ON storage.objects;
CREATE POLICY company_seals_storage_select
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-seals');

DROP POLICY IF EXISTS company_seals_storage_insert ON storage.objects;
CREATE POLICY company_seals_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
);

DROP POLICY IF EXISTS company_seals_storage_update ON storage.objects;
CREATE POLICY company_seals_storage_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
)
WITH CHECK (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
);
