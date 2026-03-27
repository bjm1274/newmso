create table if not exists public.asset_loan_item_settings (
  company_name text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.asset_loans
  drop constraint if exists asset_loans_asset_type_check;

create or replace function public.touch_asset_loan_item_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_asset_loan_item_settings_updated_at on public.asset_loan_item_settings;
create trigger trg_asset_loan_item_settings_updated_at
before update on public.asset_loan_item_settings
for each row
execute function public.touch_asset_loan_item_settings_updated_at();

insert into public.asset_loan_item_settings (company_name, items)
values ('전체', '["노트북","PC","모니터","키보드","마우스","회의실키","기타"]'::jsonb)
on conflict (company_name) do nothing;
