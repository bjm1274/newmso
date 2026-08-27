-- =====================================================================
-- Migration 0027: 0007 이 운영에 도달하지 않아 비어 있는 기능 테이블 8종 복구
--
-- 배경 —
-- 10차 전수조사에서 운영 D1 의 d1_migrations 가 0행임이 확인됐다. 마이그레이션이
-- 배포 파이프라인이 아니라 손으로 적용돼 왔고, 그 과정에서 0007 이 통째로 누락됐다.
-- 2026-08-27 운영 sqlite_master 전수 대조 결과, 0007 이 만들려던 9개 테이블 중
-- congratulations_condolences 하나만 존재하고 나머지 8개가 없다.
--
-- 그 결과 아래 기능이 "저장 성공처럼 보이고 실제로는 아무것도 안 남는" 상태다:
--   op_consultations      → 모바일 수술상담 저장 100% 실패
--   generated_contracts   → 계약서 자동생성 [저장] 항상 실패
--   early_leave_records   → 근태이상 워크센터 조기퇴근 현황 영구 '이상 없음'
--   message_templates     → 메시지 템플릿 수정이 그 관리자 브라우저에만 남음
--   board_post_stars      → 게시판 별표가 서버에 안 남음
--   as_repair_records     → AS 수리 내역이 서버에 안 남음
--   return_records        → 반품 내역이 서버에 안 남음
--   external_integrations → 외부 연동 설정이 서버에 안 남음
--
-- 왜 0007 을 다시 적용하지 않고 새 번호로 다시 쓰는가 —
-- d1_migrations baseline 을 0000~0026 "적용됨"으로 정렬해야만 `migrations apply`
-- 가 안전해진다. 0012·0021·0022·0023 은 IF NOT EXISTS 가 없거나 ALTER ADD COLUMN
-- 이라 재적용하면 즉시 실패하기 때문이다. 그래서 baseline 은 0026 까지 통째로
-- 적용됨으로 두고, 실제로 빠진 효과만 이 파일로 다시 표현한다.
--
-- 기존 데이터 영향 —
-- 없다. 8개 테이블 모두 운영에 존재하지 않으므로 새로 만들 뿐이고, 기존 행을
-- 읽거나 고치는 문장이 하나도 없다. congratulations_condolences 는 이미 있으므로
-- 이 파일에서 제외했다.
--
-- 되돌리기 —
--   DROP TABLE IF EXISTS op_consultations;      -- (인덱스는 함께 사라진다)
--   DROP TABLE IF EXISTS early_leave_records;
--   DROP TABLE IF EXISTS generated_contracts;
--   DROP TABLE IF EXISTS board_post_stars;
--   DROP TABLE IF EXISTS as_repair_records;
--   DROP TABLE IF EXISTS return_records;
--   DROP TABLE IF EXISTS message_templates;
--   DROP TABLE IF EXISTS external_integrations;
-- 되돌리면 위 기능은 이 파일 적용 전과 똑같이 무음 실패 상태로 돌아간다.
--
-- 컬럼 정의는 0007 및 lib/db/schema.ts 와 글자 단위로 동일하다. app/api/d1/mutate
-- 의 getKnownTableColumns 가 schema.ts 를 소스로 set 키를 거르므로, 둘이 어긋나면
-- 테이블을 만들어도 컬럼이 조용히 떨어져 나간다.
--
-- 전부 IF NOT EXISTS 라 이미 손으로 만든 테이블이 섞여 있어도 안전하다.
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

-- 2. 조기퇴근감지 -----------------------------------------------------
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

-- 3. 계약서자동생성 ---------------------------------------------------
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

-- 4. 게시판 별표 (post_id + user_id upsert/충돌 회피용 복합 unique) ----
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

-- 5. AS 수리 ----------------------------------------------------------
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

-- 6. 반품 -------------------------------------------------------------
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

-- 7. 메시지 템플릿 ----------------------------------------------------
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

-- 8. 외부 연동 (vendor 단위 unique) ----------------------------------
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
