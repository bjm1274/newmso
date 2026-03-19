create extension if not exists pgcrypto;

create table if not exists public.virtual_account_deposits (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  provider text not null,
  dedupe_key text not null unique,
  provider_event_type text,
  provider_event_id text,
  order_id text,
  order_name text,
  payment_key text,
  transaction_key text,
  method text,
  deposit_status text not null default 'issued',
  match_status text not null default 'unmatched',
  amount numeric(14, 0) not null default 0,
  currency text not null default 'KRW',
  depositor_name text,
  customer_name text,
  patient_name text,
  patient_id text,
  transaction_label text,
  bank_code text,
  bank_name text,
  account_number text,
  due_date timestamptz,
  deposited_at timestamptz,
  matched_target_type text,
  matched_target_id text,
  matched_note text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_virtual_account_deposits_company_created_at
  on public.virtual_account_deposits (company_id, created_at desc);

create index if not exists idx_virtual_account_deposits_match_status
  on public.virtual_account_deposits (match_status);

create index if not exists idx_virtual_account_deposits_deposit_status
  on public.virtual_account_deposits (deposit_status);
