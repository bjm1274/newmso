-- 4th migration, step 5 of 5: RLS policies.
-- If this reports lock timeout/deadlock, wait 30-60 seconds and rerun this same file only.

set lock_timeout = '10s';
set statement_timeout = '2min';

drop policy if exists inventory_select_scope on public.inventory;
drop policy if exists inventory_insert_scope on public.inventory;
drop policy if exists inventory_update_scope on public.inventory;
drop policy if exists inventory_delete_scope on public.inventory;

create policy inventory_select_scope on public.inventory
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_insert_scope on public.inventory
for insert
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

create policy inventory_update_scope on public.inventory
for update
using (public.erp_inventory_scope_matches(company, company_id, department))
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

create policy inventory_delete_scope on public.inventory
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists inventory_logs_select_scope on public.inventory_logs;
drop policy if exists inventory_logs_insert_scope on public.inventory_logs;

create policy inventory_logs_select_scope on public.inventory_logs
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_logs_insert_scope on public.inventory_logs
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

drop policy if exists inventory_transfers_select_scope on public.inventory_transfers;
drop policy if exists inventory_transfers_insert_scope on public.inventory_transfers;

create policy inventory_transfers_select_scope on public.inventory_transfers
for select
using (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  or public.erp_inventory_scope_matches(to_company, null, to_department)
);

create policy inventory_transfers_insert_scope on public.inventory_transfers
for insert
with check (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  and public.erp_inventory_scope_matches(to_company, null, to_department)
);

drop policy if exists purchase_orders_select_scope on public.purchase_orders;
drop policy if exists purchase_orders_write_scope on public.purchase_orders;
drop policy if exists purchase_orders_insert_scope on public.purchase_orders;
drop policy if exists purchase_orders_update_scope on public.purchase_orders;
drop policy if exists purchase_orders_delete_scope on public.purchase_orders;

create policy purchase_orders_select_scope on public.purchase_orders
for select
using (
  public.erp_can_view_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_insert_scope on public.purchase_orders
for insert
with check (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_update_scope on public.purchase_orders
for update
using (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
)
with check (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_delete_scope on public.purchase_orders
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists delivery_confirmations_select_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_write_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_insert_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_update_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_delete_scope on public.delivery_confirmations;

create policy delivery_confirmations_select_scope on public.delivery_confirmations
for select
using (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_insert_scope on public.delivery_confirmations
for insert
with check (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_update_scope on public.delivery_confirmations
for update
using (public.erp_inventory_company_scope_matches(receiver_company, null))
with check (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_delete_scope on public.delivery_confirmations
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists inventory_price_history_select_scope on public.inventory_price_history;
drop policy if exists inventory_price_history_insert_scope on public.inventory_price_history;

create policy inventory_price_history_select_scope on public.inventory_price_history
for select
using (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

create policy inventory_price_history_insert_scope on public.inventory_price_history
for insert
with check (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

drop policy if exists inventory_count_sessions_select_scope on public.inventory_count_sessions;
drop policy if exists inventory_count_sessions_insert_scope on public.inventory_count_sessions;

create policy inventory_count_sessions_select_scope on public.inventory_count_sessions
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_count_sessions_insert_scope on public.inventory_count_sessions
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

drop policy if exists inventory_cost_entries_select_scope on public.inventory_cost_entries;
drop policy if exists inventory_cost_entries_insert_scope on public.inventory_cost_entries;

create policy inventory_cost_entries_select_scope on public.inventory_cost_entries
for select
using (public.erp_inventory_scope_matches(company_name, company_id, department));

create policy inventory_cost_entries_insert_scope on public.inventory_cost_entries
for insert
with check (public.erp_inventory_scope_matches(company_name, company_id, department));

drop policy if exists inventory_closing_snapshots_select_scope on public.inventory_closing_snapshots;
drop policy if exists inventory_closing_snapshots_insert_scope on public.inventory_closing_snapshots;

create policy inventory_closing_snapshots_select_scope on public.inventory_closing_snapshots
for select
using (public.erp_inventory_company_scope_matches(company, company_id));

create policy inventory_closing_snapshots_insert_scope on public.inventory_closing_snapshots
for insert
with check (public.erp_inventory_company_scope_matches(company, company_id));

reset statement_timeout;
reset lock_timeout;
