-- Allow regular, interim, and year-end payroll records to coexist in the same month.

alter table if exists public.payroll_records
  add column if not exists record_type varchar(20) default 'regular';

alter table if exists public.payroll_records
  alter column record_type type varchar(20) using record_type::text;

alter table if exists public.payroll_records
  add column if not exists settlement_reason text,
  add column if not exists settlement_date date,
  add column if not exists severance_pay bigint default 0;

do $$
declare
  settlement_date_type text;
begin
  select data_type
    into settlement_date_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payroll_records'
    and column_name = 'settlement_date';

  if settlement_date_type is not null and settlement_date_type <> 'date' then
    alter table public.payroll_records
      alter column settlement_date type date
      using case
        when settlement_date::text ~ '^\d{4}-\d{2}-\d{2}$' then settlement_date::text::date
        when settlement_date::text ~ '^\d{4}-\d{2}$' then (settlement_date::text || '-01')::date
        else null
      end;
  end if;
end $$;

update public.payroll_records
set record_type = 'regular'
where record_type is null;

alter table if exists public.payroll_records
  alter column record_type set default 'regular',
  alter column record_type set not null;

do $$
declare
  target_constraint text;
begin
  for target_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'payroll_records'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by key_order.ordinality)
        from unnest(con.conkey) with ordinality as key_order(attnum, ordinality)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key_order.attnum
      ) = array['staff_id', 'year_month']
  loop
    execute format('alter table public.payroll_records drop constraint %I', target_constraint);
  end loop;
end $$;

create unique index if not exists payroll_records_staff_ym_record_type_uidx
  on public.payroll_records(staff_id, year_month, record_type);
