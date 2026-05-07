create table if not exists public.department_private_inventory_items (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  company_id uuid null references public.companies(id),
  department text not null,
  item_name text not null,
  category text null,
  unit text not null default 'EA',
  quantity integer not null default 0 check (quantity >= 0),
  min_quantity integer not null default 0 check (min_quantity >= 0),
  total_used integer not null default 0 check (total_used >= 0),
  memo text null,
  created_by uuid null references public.staff_members(id) on delete set null,
  created_by_name text null,
  updated_by uuid null references public.staff_members(id) on delete set null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.department_private_inventory_items
  add column if not exists company text,
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists department text,
  add column if not exists item_name text,
  add column if not exists category text,
  add column if not exists unit text not null default 'EA',
  add column if not exists quantity integer not null default 0,
  add column if not exists min_quantity integer not null default 0,
  add column if not exists total_used integer not null default 0,
  add column if not exists memo text,
  add column if not exists created_by uuid references public.staff_members(id) on delete set null,
  add column if not exists created_by_name text,
  add column if not exists updated_by uuid references public.staff_members(id) on delete set null,
  add column if not exists updated_by_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists department_private_inventory_unique_item
  on public.department_private_inventory_items (lower(company), lower(department), lower(item_name));

create index if not exists department_private_inventory_scope_idx
  on public.department_private_inventory_items (company_id, department, item_name);

create or replace function public.set_department_private_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists department_private_inventory_updated_at on public.department_private_inventory_items;
create trigger department_private_inventory_updated_at
before update on public.department_private_inventory_items
for each row execute function public.set_department_private_inventory_updated_at();

create table if not exists public.department_private_inventory_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.department_private_inventory_items(id) on delete cascade,
  company text not null,
  company_id uuid null references public.companies(id),
  department text not null,
  item_name text not null,
  action text not null default 'consume',
  quantity integer not null default 0 check (quantity >= 0),
  prev_quantity integer null,
  next_quantity integer null,
  actor_id uuid null references public.staff_members(id) on delete set null,
  actor_name text null,
  notes text null,
  created_at timestamptz not null default now()
);

alter table public.department_private_inventory_logs
  add column if not exists item_id uuid references public.department_private_inventory_items(id) on delete cascade,
  add column if not exists company text,
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists department text,
  add column if not exists item_name text,
  add column if not exists action text not null default 'consume',
  add column if not exists quantity integer not null default 0,
  add column if not exists prev_quantity integer,
  add column if not exists next_quantity integer,
  add column if not exists actor_id uuid references public.staff_members(id) on delete set null,
  add column if not exists actor_name text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists department_private_inventory_logs_item_idx
  on public.department_private_inventory_logs (item_id, created_at desc);

create index if not exists department_private_inventory_logs_scope_idx
  on public.department_private_inventory_logs (company_id, department, created_at desc);

comment on table public.department_private_inventory_items is
  'Department-only stock items that are intentionally not linked to the main inventory table.';

comment on table public.department_private_inventory_logs is
  'Usage and adjustment history for department-only stock items.';
