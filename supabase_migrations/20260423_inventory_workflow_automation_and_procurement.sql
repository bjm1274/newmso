create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory(id) on delete set null,
  item_name text not null,
  quantity integer not null default 0,
  from_company text,
  from_department text,
  to_company text,
  to_department text,
  reason text,
  transferred_by text,
  transferred_by_id uuid references public.staff_members(id) on delete set null,
  status text default 'completed',
  approval_id uuid references public.approvals(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  serial_number text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_transfers_created_at
  on public.inventory_transfers (created_at desc);

create index if not exists idx_inventory_transfers_approval_id
  on public.inventory_transfers (approval_id);

create index if not exists idx_inventory_transfers_purchase_order_id
  on public.inventory_transfers (purchase_order_id);

alter table if exists public.inventory
  add column if not exists serial_number text,
  add column if not exists lot_number text,
  add column if not exists expiry_date date,
  add column if not exists location text,
  add column if not exists unit_price numeric(12, 2) default 0,
  add column if not exists supplier_name text,
  add column if not exists is_udi boolean default false,
  add column if not exists udi_code text;

create index if not exists idx_inventory_lot_number
  on public.inventory (lot_number);

create index if not exists idx_inventory_location
  on public.inventory (location);

alter table if exists public.inventory_logs
  add column if not exists notes text,
  add column if not exists actor_id uuid references public.staff_members(id) on delete set null,
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists approval_id uuid references public.approvals(id) on delete set null,
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  add column if not exists serial_number text,
  add column if not exists lot_number text,
  add column if not exists expiry_date date,
  add column if not exists location text,
  add column if not exists unit_price numeric(12, 2),
  add column if not exists supplier_name text;

create index if not exists idx_inventory_logs_approval_id
  on public.inventory_logs (approval_id);

create index if not exists idx_inventory_logs_purchase_order_id
  on public.inventory_logs (purchase_order_id);

create index if not exists idx_inventory_logs_lot_number
  on public.inventory_logs (lot_number);

alter table if exists public.purchase_orders
  add column if not exists supplier_name text,
  add column if not exists expected_delivery_date date,
  add column if not exists ordered_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists received_by_id uuid references public.staff_members(id) on delete set null,
  add column if not exists received_by_name text,
  add column if not exists inspected_at timestamptz,
  add column if not exists inspected_by_id uuid references public.staff_members(id) on delete set null,
  add column if not exists inspected_by_name text,
  add column if not exists inspection_status text,
  add column if not exists received_qty numeric(14, 2) default 0,
  add column if not exists rejected_qty numeric(14, 2) default 0,
  add column if not exists received_items jsonb default '[]'::jsonb,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_id uuid references public.staff_members(id) on delete set null,
  add column if not exists closed_by_name text,
  add column if not exists expense_status text default 'pending',
  add column if not exists expense_posted_at timestamptz,
  add column if not exists expense_posted_by_id uuid references public.staff_members(id) on delete set null,
  add column if not exists expense_posted_by_name text,
  add column if not exists expense_total_amount numeric(14, 2) default 0,
  add column if not exists tax_amount numeric(14, 2) default 0,
  add column if not exists invoice_no text,
  add column if not exists invoice_date date,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists payment_due_date date,
  add column if not exists cost_center text,
  add column if not exists budget_department text,
  add column if not exists account_code text,
  add column if not exists source_supply_approval_id uuid references public.approvals(id) on delete set null,
  add column if not exists source_supply_request_index integer,
  add column if not exists requester_company text,
  add column if not exists requester_department text;

create index if not exists idx_purchase_orders_status
  on public.purchase_orders (status);

create index if not exists idx_purchase_orders_source_supply_approval
  on public.purchase_orders (source_supply_approval_id, source_supply_request_index);

create index if not exists idx_purchase_orders_inspection_status
  on public.purchase_orders (inspection_status);

create index if not exists idx_purchase_orders_expense_status
  on public.purchase_orders (expense_status);

create table if not exists public.inventory_cost_entries (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  inventory_item_id uuid references public.inventory(id) on delete set null,
  order_item_index integer default 0,
  item_name text not null,
  company_id uuid references public.companies(id) on delete set null,
  company_name text,
  department text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  qty_ordered numeric(14, 2) default 0,
  qty_received numeric(14, 2) default 0,
  qty_rejected numeric(14, 2) default 0,
  qty_pending numeric(14, 2) default 0,
  unit_price numeric(14, 2) default 0,
  supply_amount numeric(14, 2) default 0,
  vat_amount numeric(14, 2) default 0,
  total_amount numeric(14, 2) default 0,
  cost_center text,
  budget_item text,
  account_code text,
  posted_status text default 'posted',
  occurred_at timestamptz not null default now(),
  posted_at timestamptz,
  posted_by_id uuid references public.staff_members(id) on delete set null,
  posted_by_name text,
  idempotency_key text unique,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_cost_entries_purchase_order
  on public.inventory_cost_entries (purchase_order_id);

create index if not exists idx_inventory_cost_entries_company_month
  on public.inventory_cost_entries (company_name, occurred_at desc);

create table if not exists public.inventory_closing_snapshots (
  id uuid primary key default gen_random_uuid(),
  closing_month text not null,
  snapshot_date date,
  company text,
  company_id uuid references public.companies(id) on delete set null,
  status text default 'locked',
  item_count integer default 0,
  total_quantity numeric(14, 2) default 0,
  total_value numeric(14, 2) default 0,
  summary jsonb default '{}'::jsonb,
  items jsonb default '[]'::jsonb,
  created_by_id uuid references public.staff_members(id) on delete set null,
  created_by_name text,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_closing_snapshots_company_month
  on public.inventory_closing_snapshots (company, closing_month desc);

create table if not exists public.delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  doc_number text,
  issue_date date,
  supplier_name text,
  supplier_rep text,
  receiver_company text,
  receiver_rep text,
  delivery_date date,
  notes text,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric(12, 2) default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_confirmations_created_at
  on public.delivery_confirmations (created_at desc);

create table if not exists public.inventory_price_history (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  unit_price numeric(12, 2) not null default 0,
  quantity integer default 0,
  total_amount numeric(14, 2) default 0,
  source_type text default 'manual',
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.staff_members(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  notes text
);

alter table if exists public.inventory_price_history
  add column if not exists supplier_name text,
  add column if not exists total_amount numeric(14, 2) default 0,
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  add column if not exists notes text;

create index if not exists idx_inventory_price_history_item_recorded_at
  on public.inventory_price_history (inventory_item_id, recorded_at desc);

create index if not exists idx_inventory_price_history_purchase_order_id
  on public.inventory_price_history (purchase_order_id);

create table if not exists public.inventory_count_sessions (
  id uuid primary key default gen_random_uuid(),
  conducted_by uuid references public.staff_members(id) on delete set null,
  conducted_name text,
  total_items integer not null default 0,
  discrepancy_count integer not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_count_sessions_created_at
  on public.inventory_count_sessions (created_at desc);
