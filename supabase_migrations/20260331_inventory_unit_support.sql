alter table if exists public.inventory
  add column if not exists unit text;

update public.inventory
set unit = 'EA'
where coalesce(nullif(trim(unit), ''), '') = '';

alter table if exists public.inventory
  alter column unit set default 'EA';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_unit_check'
  ) then
    alter table public.inventory
      add constraint inventory_unit_check
      check (unit in ('EA', 'BOX'));
  end if;
end $$;
