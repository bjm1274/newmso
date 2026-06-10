-- =====================================================================
-- Migration 0015: 예산관리 서버화 — budget_settings / budget_executions (G1)
--
-- 배경: app/main/기능부품/관리자전용서브/예산관리.tsx 가 예산 설정·집행 데이터를
-- localStorage(STORAGE_KEYS.BUDGET_SETTINGS / BUDGET_EXECUTIONS)에만 보관해
-- 브라우저·기기 간 공유가 되지 않았음. D1 실테이블로 이관해 서버 영속화.
-- 컬럼은 소비처 코드의 BudgetSetting/BudgetExecution 데이터형에서 1:1 추출.
-- (코드의 date → exec_date 로 매핑: SQLite 예약/모호어 회피 및 의미 명확화)
--
-- MSO 설계상 회사 격리 불필요 — company 는 선택(NULL 허용). 정책은
-- PUBLIC_ALL(lib/db/auth/policies.ts)로 등록(전사 조회, 회사 필터 없음).
--
-- 적용: npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0015_budget_tables.sql
--       (로컬 dev: --local 플래그)
-- =====================================================================

-- 1. 예산 설정 -------------------------------------------------------
--    소비처(BudgetSetting): { id, dept, year, month, item, amount, createdAt }
CREATE TABLE IF NOT EXISTS budget_settings (
  id         TEXT PRIMARY KEY NOT NULL,
  company    TEXT,
  dept       TEXT,
  year       INTEGER,
  month      INTEGER,
  item       TEXT,
  amount     INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_budget_settings_year_month
  ON budget_settings (year, month);
CREATE INDEX IF NOT EXISTS idx_budget_settings_dept
  ON budget_settings (dept);

-- 2. 예산 집행 -------------------------------------------------------
--    소비처(BudgetExecution): { id, dept, item, amount, date, memo, createdAt }
--    (date → exec_date 로 매핑)
CREATE TABLE IF NOT EXISTS budget_executions (
  id         TEXT PRIMARY KEY NOT NULL,
  company    TEXT,
  dept       TEXT,
  item       TEXT,
  amount     INTEGER,
  exec_date  TEXT,
  memo       TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_budget_executions_exec_date
  ON budget_executions (exec_date);
CREATE INDEX IF NOT EXISTS idx_budget_executions_dept
  ON budget_executions (dept);
