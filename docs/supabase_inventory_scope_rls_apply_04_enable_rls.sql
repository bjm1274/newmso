-- 4th migration, step 4 of 5: enable RLS on inventory-related tables.
-- This step takes strong table locks. Run only one SQL Editor tab at a time.
-- If this reports lock timeout/deadlock, wait 30-60 seconds and rerun this same file only.

set lock_timeout = '10s';
set statement_timeout = '2min';

alter table if exists public.inventory enable row level security;
alter table if exists public.inventory_logs enable row level security;
alter table if exists public.inventory_transfers enable row level security;
alter table if exists public.purchase_orders enable row level security;
alter table if exists public.delivery_confirmations enable row level security;
alter table if exists public.inventory_price_history enable row level security;
alter table if exists public.inventory_count_sessions enable row level security;
alter table if exists public.inventory_cost_entries enable row level security;
alter table if exists public.inventory_closing_snapshots enable row level security;

reset statement_timeout;
reset lock_timeout;
