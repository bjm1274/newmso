alter table if exists public.inventory
  add column if not exists serial_number text;

alter table if exists public.inventory_logs
  add column if not exists serial_number text;

alter table if exists public.inventory_transfers
  add column if not exists serial_number text;

create index if not exists idx_inventory_serial_number
  on public.inventory (serial_number);

create index if not exists idx_inventory_logs_serial_number
  on public.inventory_logs (serial_number);

create index if not exists idx_inventory_transfers_serial_number
  on public.inventory_transfers (serial_number);
