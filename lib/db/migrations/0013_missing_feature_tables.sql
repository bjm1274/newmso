-- =====================================================================
-- Migration 0013: 무음 실패 복구 — 미존재 기능 테이블 5종 (G7)
--
-- 배경: 아래 5개 기능의 소비처가 supabase.from()으로 D1 테이블을 호출하나
-- 실테이블이 schema.ts / scripts/migrate-d1/output/d1_schema_final.sql 둘 다에
-- 없어 무음 실패(또는 localStorage/대체쿼리 폴백)하던 기능을 신설. 컬럼은 각
-- 소비처 코드의 insert/select/upsert/delete 실제 사용 컬럼에서 추출. SQLite
-- 타입(text/integer)만 사용, 날짜는 text(ISO/날짜 문자열).
--
--   1. nurse_schedules           ← 인사관리서브/간호근무표.tsx
--   2. leave_policies            ← 관리자워크센터/CompanyWorkcenter/CompanyLeaveTab.tsx
--   3. work_type_change_history  ← lib/hr-history-ledger.ts
--   4. education_completions     ← 인사관리서브/교육내역/education-utils.ts
--   5. email_queue               ← 인사관리서브/급여명세/급여명세서발송.tsx
--
-- MSO 설계상 회사 격리 불필요 — PUBLIC_ALL 정책(lib/db/auth/policies.ts)과 일치.
--
-- 적용: npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0013_missing_feature_tables.sql
--       (로컬 dev: --local 플래그)
-- =====================================================================

-- 1. 간호근무표 -------------------------------------------------------
--    소비처: select('*').eq('year_month', ym);
--            insert([{ staff_id, year_month, day, shift_code }]);
--            delete().eq('year_month').in('staff_id', ...)
CREATE TABLE IF NOT EXISTS nurse_schedules (
  id         TEXT PRIMARY KEY NOT NULL,
  staff_id   TEXT,
  year_month TEXT,
  day        INTEGER,
  shift_code TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_nurse_schedules_year_month
  ON nurse_schedules (year_month);
CREATE INDEX IF NOT EXISTS idx_nurse_schedules_staff_id
  ON nurse_schedules (staff_id);

-- 2. 연차/휴가 정책 (key-value 룰) ------------------------------------
--    소비처: select('label,value').limit(50)
CREATE TABLE IF NOT EXISTS leave_policies (
  id         TEXT PRIMARY KEY NOT NULL,
  label      TEXT,
  value      TEXT,
  company    TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_leave_policies_company
  ON leave_policies (company);

-- 3. 근무유형 변경 이력 -----------------------------------------------
--    소비처: select('id, changed_date, created_at, staff_id, previous_type,
--            new_type, reason').eq('staff_id').order('changed_date')
CREATE TABLE IF NOT EXISTS work_type_change_history (
  id            TEXT PRIMARY KEY NOT NULL,
  staff_id      TEXT,
  changed_date  TEXT,
  previous_type TEXT,
  new_type      TEXT,
  reason        TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_work_type_change_history_staff_changed
  ON work_type_change_history (staff_id, changed_date);

-- 4. 교육 이수 (staff_id + education_name upsert 충돌 회피용 복합 unique) -
--    소비처: select('staff_id, education_name, certificate_url');
--            upsert([{ staff_id, education_name, certificate_url }]);
--            delete().eq('staff_id').eq('education_name')
CREATE TABLE IF NOT EXISTS education_completions (
  id              TEXT PRIMARY KEY NOT NULL,
  staff_id        TEXT,
  education_name  TEXT,
  certificate_url TEXT,
  created_at      TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_education_completions_staff_education
  ON education_completions (staff_id, education_name);

-- 5. 이메일 발송 큐 ---------------------------------------------------
--    소비처: insert([{ recipient, subject, body, type, status, created_at }])
CREATE TABLE IF NOT EXISTS email_queue (
  id         TEXT PRIMARY KEY NOT NULL,
  recipient  TEXT,
  subject    TEXT,
  body       TEXT,
  type       TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON email_queue (status, created_at);
