create table if not exists public.company_payroll_policies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '전체',
  rule_label text not null,
  rule_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_payroll_policies_company_rule_unique unique (company_name, rule_label)
);

create index if not exists idx_company_payroll_policies_scope
  on public.company_payroll_policies(company_name, rule_label);

alter table public.company_payroll_policies enable row level security;

drop policy if exists company_payroll_policies_select on public.company_payroll_policies;
drop policy if exists company_payroll_policies_insert on public.company_payroll_policies;
drop policy if exists company_payroll_policies_update on public.company_payroll_policies;
drop policy if exists company_payroll_policies_delete on public.company_payroll_policies;

create policy company_payroll_policies_select
on public.company_payroll_policies
for select
using (auth.uid() is not null);

create policy company_payroll_policies_insert
on public.company_payroll_policies
for insert
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_payroll_policies_update
on public.company_payroll_policies
for update
using (public.erp_is_admin() or public.erp_can_manage_company())
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_payroll_policies_delete
on public.company_payroll_policies
for delete
using (public.erp_is_admin() or public.erp_can_manage_company());

-- Seed payroll policies for '전체'
insert into public.company_payroll_policies (company_name, rule_label, rule_value) values
  ('전체', '급여일', '매월 15일 · 전월 1일~말일 정산'),
  ('전체', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
  ('전체', '초과근로 수당', '통상임금 × 1.5'),
  ('전체', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
  ('전체', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
  ('전체', '주휴수당', '1주 15h 이상 + 출근율 100%'),
  ('전체', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
  ('전체', '4대보험', '법정 요율 · 자동 적용'),
  ('전체', '원천징수 비율', '100%')
on conflict (company_name, rule_label) do nothing;

-- Seed payroll policies for other known companies
insert into public.company_payroll_policies (company_name, rule_label, rule_value) values
  ('박철홍정형외과', '급여일', '매월 15일 · 전월 1일~말일 정산'),
  ('박철홍정형외과', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
  ('박철홍정형외과', '초과근로 수당', '통상임금 × 1.5'),
  ('박철홍정형외과', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
  ('박철홍정형외과', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
  ('박철홍정형외과', '주휴수당', '1주 15h 이상 + 출근율 100%'),
  ('박철홍정형외과', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
  ('박철홍정형외과', '4대보험', '법정 요율 · 자동 적용'),
  ('박철홍정형외과', '원천징수 비율', '100%'),

  ('수연의원', '급여일', '매월 15일 · 전월 1일~말일 정산'),
  ('수연의원', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
  ('수연의원', '초과근로 수당', '통상임금 × 1.5'),
  ('수연의원', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
  ('수연의원', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
  ('수연의원', '주휴수당', '1주 15h 이상 + 출근율 100%'),
  ('수연의원', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
  ('수연의원', '4대보험', '법정 요율 · 자동 적용'),
  ('수연의원', '원천징수 비율', '100%'),

  ('MSO 본사', '급여일', '매월 15일 · 전월 1일~말일 정산'),
  ('MSO 본사', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
  ('MSO 본사', '초과근로 수당', '통상임금 × 1.5'),
  ('MSO 본사', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
  ('MSO 본사', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
  ('MSO 본사', '주휴수당', '1주 15h 이상 + 출근율 100%'),
  ('MSO 본사', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
  ('MSO 본사', '4대보험', '법정 요율 · 자동 적용'),
  ('MSO 본사', '원천징수 비율', '100%'),

  ('지점 A', '급여일', '매월 15일 · 전월 1일~말일 정산'),
  ('지점 A', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
  ('지점 A', '초과근로 수당', '통상임금 × 1.5'),
  ('지점 A', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
  ('지점 A', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
  ('지점 A', '주휴수당', '1주 15h 이상 + 출근율 100%'),
  ('지점 A', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
  ('지점 A', '4대보험', '법정 요율 · 자동 적용'),
  ('지점 A', '원천징수 비율', '100%')
on conflict (company_name, rule_label) do nothing;
