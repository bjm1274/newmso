-- =====================================================================
-- Migration 0017: 재무·회계·세무 서버화 — journal_entries / fixed_assets / bank_accounts_sync (G2)
--
-- 배경: app/main/기능부품/재무회계.tsx가 재무 데이터를 React State로만 보관해
-- 브라우저 새로고침 시 데이터 유실 및 기기 간 공유 불가가 일어남.
-- D1 실테이블로 이관해 서버 영속화.
-- 정책은 PUBLIC_ALL로 등록(전사 조회).
--
-- 적용: npx wrangler d1 execute DB --local --file=lib/db/migrations/0017_finance_tables.sql
--       (원격 실서버 적용 시: --remote 플래그)
-- =====================================================================

-- 1. 분개장 -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
  id          TEXT PRIMARY KEY NOT NULL,
  company_id  TEXT,
  date        TEXT NOT NULL,
  desc        TEXT NOT NULL,
  debit_acc   TEXT NOT NULL,
  credit_acc  TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date
  ON journal_entries (date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_id
  ON journal_entries (company_id);

-- 2. 고정자산 대장 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_assets (
  id          TEXT PRIMARY KEY NOT NULL,
  company_id  TEXT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  date        TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  salvage     INTEGER NOT NULL,
  useful_life INTEGER NOT NULL,
  method      TEXT NOT NULL,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_id
  ON fixed_assets (company_id);

-- 3. 금융 연동 현황 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts_sync (
  id          TEXT PRIMARY KEY NOT NULL,
  company_id  TEXT,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  num         TEXT NOT NULL,
  state       TEXT NOT NULL,
  updated_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_sync_company_id
  ON bank_accounts_sync (company_id);
