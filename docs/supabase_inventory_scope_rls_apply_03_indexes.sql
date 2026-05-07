-- 4th migration, step 3 of 5: supporting indexes.
-- If this reports lock timeout/deadlock, wait 30-60 seconds and rerun this same file only.

set lock_timeout = '10s';
set statement_timeout = '2min';

create index if not exists idx_inventory_company_department
  on public.inventory(company_id, department);

create index if not exists idx_inventory_logs_scope_created_at
  on public.inventory_logs(company_id, department, created_at desc);

create index if not exists idx_inventory_count_sessions_scope_created_at
  on public.inventory_count_sessions(company_id, department, created_at desc);

reset statement_timeout;
reset lock_timeout;
