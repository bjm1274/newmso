-- =====================================================================
-- Migration 0007: 무음 실패 복구 — 미존재 기능 테이블 8종
--
-- 배경: 아래 8개 기능의 소비처가 supabase.from()/enqueueSupabaseMutation
-- 으로 D1 테이블을 호출하나 실테이블이 없어 무음 실패(또는 localStorage
-- 폴백)하던 기능을 신설. 컬럼은 각 소비처 코드의 insert/select/update
-- 실제 사용 컬럼에서 추출. SQLite 타입(text/integer)만 사용, boolean은
-- integer(0/1), 날짜는 text(ISO/날짜 문자열).
--
--   1. op_consultations            ← 모바일/추가기능/수술상담
--   2. congratulations_condolences ← 인사관리서브/경조사관리
--   3. early_leave_records         ← 인사관리서브/조기퇴근감지
--   4. generated_contracts         ← 인사관리서브/계약서자동생성
--   5. board_post_stars            ← 모바일/게시판/별표훅
--   6. as_repair_records           ← 재고관리서브/AS반품관리
--   7. return_records              ← 재고관리서브/AS반품관리
--   8. message_templates           ← 관리자/운영설정
--   9. external_integrations       ← 관리자/운영설정
--
-- 적용: npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0007_missing_feature_tables.sql
--       (로컬 dev: --local 플래그)
-- =====================================================================

-- 1. 수술상담 ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS op_consultations (
  id           TEXT PRIMARY KEY NOT NULL,
  patient_name TEXT NOT NULL,
  surgery_type TEXT,
  status       TEXT,
  note         TEXT,
  staff_id     TEXT,
  staff_name   TEXT,
  company      TEXT,
  created_at   TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_op_consultations_company_created
  ON op_consultations (company, created_at);
CREATE INDEX IF NOT EXISTS idx_op_consultations_staff_id
  ON op_consultations (staff_id);

-- 2. 경조사관리 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS congratulations_condolences (
  id          TEXT PRIMARY KEY NOT NULL,
  staff_id    TEXT,
  staff_name  TEXT,
  department  TEXT,
  event_type  TEXT,
  event_date  TEXT,
  amount      INTEGER DEFAULT 0,
  relation    TEXT,
  recipient   TEXT,
  memo        TEXT,
  wreath_sent INTEGER DEFAULT 0,
  company     TEXT,
  status      TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_congrats_company_event_date
  ON congratulations_condolences (company, event_date);
CREATE INDEX IF NOT EXISTS idx_congrats_event_type
  ON congratulations_condolences (event_type);

-- 3. 조기퇴근감지 -----------------------------------------------------
CREATE TABLE IF NOT EXISTS early_leave_records (
  id            TEXT PRIMARY KEY NOT NULL,
  staff_id      TEXT,
  staff_name    TEXT,
  dept          TEXT,
  work_date     TEXT,
  scheduled_end TEXT,
  actual_end    TEXT,
  early_minutes INTEGER DEFAULT 0,
  is_approved   INTEGER DEFAULT 0,
  note          TEXT,
  company       TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_early_leave_work_date
  ON early_leave_records (work_date);
CREATE INDEX IF NOT EXISTS idx_early_leave_staff_id
  ON early_leave_records (staff_id);

-- 4. 계약서자동생성 ---------------------------------------------------
CREATE TABLE IF NOT EXISTS generated_contracts (
  id            TEXT PRIMARY KEY NOT NULL,
  contract_type TEXT,
  staff_id      TEXT,
  staff_name    TEXT,
  position      TEXT,
  department    TEXT,
  salary        TEXT,
  start_date    TEXT,
  end_date      TEXT,
  company_name  TEXT,
  representative TEXT,
  work_location TEXT,
  work_hours    TEXT,
  note          TEXT,
  created_by    TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_generated_contracts_company
  ON generated_contracts (company_name, created_at);
CREATE INDEX IF NOT EXISTS idx_generated_contracts_staff_id
  ON generated_contracts (staff_id);

-- 5. 게시판 별표 (post_id + user_id upsert/충돌 회피용 복합 unique) ----
CREATE TABLE IF NOT EXISTS board_post_stars (
  id         TEXT PRIMARY KEY NOT NULL,
  post_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_post_stars_post_user
  ON board_post_stars (post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_board_post_stars_user_id
  ON board_post_stars (user_id);

-- 6. AS 수리 ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS as_repair_records (
  id                  TEXT PRIMARY KEY NOT NULL,
  device_name         TEXT NOT NULL,
  model_name          TEXT,
  received_date       TEXT,
  problem_description TEXT,
  company_name        TEXT,
  manager_name        TEXT,
  status              TEXT,
  created_by          TEXT,
  created_at          TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at          TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_as_repair_status_created
  ON as_repair_records (status, created_at);

-- 7. 반품 -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_records (
  id            TEXT PRIMARY KEY NOT NULL,
  item_name     TEXT NOT NULL,
  quantity      INTEGER DEFAULT 1,
  return_reason TEXT,
  company_name  TEXT,
  return_date   TEXT,
  status        TEXT,
  created_by    TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_return_records_status_created
  ON return_records (status, created_at);

-- 8. 메시지 템플릿 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id              TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  channel         TEXT,
  send_count      INTEGER DEFAULT 0,
  last_sent_label TEXT,
  status          TEXT DEFAULT '활성',
  content         TEXT,
  template_group  TEXT,
  created_at      TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_message_templates_name
  ON message_templates (name);

-- 9. 외부 연동 (vendor 단위 unique) ----------------------------------
CREATE TABLE IF NOT EXISTS external_integrations (
  id                TEXT PRIMARY KEY NOT NULL,
  vendor            TEXT NOT NULL,
  name              TEXT,
  sub               TEXT,
  status            TEXT DEFAULT 'connected',
  last_synced_label TEXT,
  created_at        TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at        TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_integrations_vendor
  ON external_integrations (vendor);
