-- 4th migration, step 2 of 5: schema backfill columns and data.
-- If this reports lock timeout/deadlock, wait 30-60 seconds and rerun this same file only.

set lock_timeout = '10s';
set statement_timeout = '2min';

alter table if exists public.inventory_logs
  add column if not exists department text;

alter table if exists public.inventory_count_sessions
  add column if not exists company text;

alter table if exists public.inventory_count_sessions
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table if exists public.inventory_count_sessions
  add column if not exists department text;

update public.inventory_logs as l
set department = i.department
from public.inventory as i
where l.department is null
  and coalesce(l.inventory_id, l.item_id) = i.id
  and nullif(btrim(coalesce(i.department, '')), '') is not null;

reset statement_timeout;
reset lock_timeout;
