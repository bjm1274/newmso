create table if not exists public.company_welfare_policies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '전체',
  rule_name text not null,
  rule_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_welfare_policies_company_rule_unique unique (company_name, rule_name)
);

create index if not exists idx_company_welfare_policies_scope
  on public.company_welfare_policies(company_name, rule_name);

alter table public.company_welfare_policies enable row level security;

drop policy if exists company_welfare_policies_select on public.company_welfare_policies;
drop policy if exists company_welfare_policies_insert on public.company_welfare_policies;
drop policy if exists company_welfare_policies_update on public.company_welfare_policies;
drop policy if exists company_welfare_policies_delete on public.company_welfare_policies;

create policy company_welfare_policies_select
on public.company_welfare_policies
for select
using (auth.uid() is not null);

create policy company_welfare_policies_insert
on public.company_welfare_policies
for insert
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_welfare_policies_update
on public.company_welfare_policies
for update
using (public.erp_is_admin() or public.erp_can_manage_company())
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_welfare_policies_delete
on public.company_welfare_policies
for delete
using (public.erp_is_admin() or public.erp_can_manage_company());

-- Insert default welfare rules for '전체'
insert into public.company_welfare_policies (company_name, rule_name, rule_value) values
  ('전체', '본인 결혼', '편도 5일 · 경조금 500,000원'),
  ('전체', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
  ('전체', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
  ('전체', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
  ('전체', '출산', '편도 3일 · 축하금 100,000원'),
  ('전체', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘')
on conflict (company_name, rule_name) do nothing;

-- Insert default welfare rules for other known companies
insert into public.company_welfare_policies (company_name, rule_name, rule_value) values
  ('박철홍정형외과', '본인 결혼', '편도 5일 · 경조금 500,000원'),
  ('박철홍정형외과', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
  ('박철홍정형외과', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
  ('박철홍정형외과', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
  ('박철홍정형외과', '출산', '편도 3일 · 축하금 100,000원'),
  ('박철홍정형외과', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘'),

  ('수연의원', '본인 결혼', '편도 5일 · 경조금 500,000원'),
  ('수연의원', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
  ('수연의원', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
  ('수연의원', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
  ('수연의원', '출산', '편도 3일 · 축하금 100,000원'),
  ('수연의원', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘'),

  ('MSO 본사', '본인 결혼', '편도 5일 · 경조금 500,000원'),
  ('MSO 본사', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
  ('MSO 본사', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
  ('MSO 본사', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
  ('MSO 본사', '출산', '편도 3일 · 축하금 100,000원'),
  ('MSO 본사', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘'),

  ('지점 A', '본인 결혼', '편도 5일 · 경조금 500,000원'),
  ('지점 A', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
  ('지점 A', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
  ('지점 A', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
  ('지점 A', '출산', '편도 3일 · 축하금 100,000원'),
  ('지점 A', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘')
on conflict (company_name, rule_name) do nothing;
