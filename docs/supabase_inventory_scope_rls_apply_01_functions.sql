-- 4th migration, step 1 of 5: helper functions only.
-- Run after docs/supabase_inventory_procurement_apply.sql succeeds.

create or replace function public.erp_claim_text(claim_key text)
returns text
language sql
stable
as 'select nullif(btrim(coalesce(auth.jwt() ->> claim_key, '''')), '''')';

create or replace function public.erp_company_name()
returns text
language sql
stable
as 'select public.erp_claim_text(''erp_company_name'')';

create or replace function public.erp_department_name()
returns text
language sql
stable
as 'select public.erp_claim_text(''erp_department_name'')';

create or replace function public.erp_claim_bool(claim_key text)
returns boolean
language sql
stable
as 'select coalesce(nullif(auth.jwt() ->> claim_key, '''')::boolean, false)';

create or replace function public.erp_can_view_all_department_inventory()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_view_all_department_inventory'')';

create or replace function public.erp_can_manage_department_inventory()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_manage_department_inventory'')';

create or replace function public.erp_can_view_all_inventory_companies()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_view_all_inventory_companies'')';

create or replace function public.erp_can_manage_all_inventory_companies()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_manage_all_inventory_companies'')';

create or replace function public.erp_inventory_company_scope_matches(
  target_company text,
  target_company_id uuid
)
returns boolean
language sql
stable
as 'select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_company_id() is not null
      and target_company_id is not null
      and public.erp_company_id() = target_company_id
    )
    or (
      public.erp_company_name() is not null
      and nullif(btrim(coalesce(target_company, '''')), '''') is not null
      and lower(public.erp_company_name()) = lower(btrim(target_company))
    )';

create or replace function public.erp_inventory_scope_matches(
  target_company text,
  target_company_id uuid,
  target_department text
)
returns boolean
language sql
stable
as 'select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_inventory_company_scope_matches(target_company, target_company_id)
      and (
        public.erp_can_view_all_department_inventory()
        or nullif(btrim(coalesce(target_department, '''')), '''') is null
        or (
          public.erp_department_name() is not null
          and lower(public.erp_department_name()) = lower(btrim(target_department))
        )
      )
    )';
