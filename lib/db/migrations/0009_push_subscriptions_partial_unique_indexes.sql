-- =====================================================================
-- Migration 0009: push_subscriptions 부분 유니크 인덱스 정합
--
-- 배경: 0000_lovely_alice.sql 에서 생성된 두 인덱스가 무조건 UNIQUE 이므로
-- device_id=NULL 또는 fcm_token=NULL 행이 둘 이상 존재하면 SQLite 가 삽입
-- 충돌을 일으킨다.  SQLite 에서 NULL 은 UNIQUE 제약 대상이 아니지만 복합
-- 인덱스(staff_id, device_id)에서 NULL 값 비교는 구현에 따라 불일치를 낳을
-- 수 있으며, Postgres 부분 인덱스와 동작이 다르다.
--
-- Postgres 마이그레이션(20260416_push_subscriptions_device_columns_and_dedupe.sql)은
--   CREATE UNIQUE INDEX ... WHERE staff_id IS NOT NULL AND device_id IS NOT NULL
--   CREATE UNIQUE INDEX ... WHERE fcm_token IS NOT NULL
-- 으로 부분 인덱스를 사용한다.  D1 을 동일하게 맞춘다.
--
-- 안전성: 부분 인덱스로 전환하면 NULL 행은 유니크 검사에서 제외되므로
-- 이미 device_id=NULL 중복이 있어도 DROP/CREATE 가 실패하지 않는다.
-- 기존 데이터(NULL 포함)는 삭제되지 않는다.
--
-- 보존 인덱스:
--   idx_push_subscriptions_staff_endpoint  — 변경 없음 (endpoint NOT NULL 이므로 무조건 unique 유지)
--   idx_push_subscriptions_staff_id        — 변경 없음 (일반 인덱스)
--   idx_push_subscriptions_fcm_token       — 변경 없음 (일반 인덱스)
--
-- 적용: npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0009_push_subscriptions_partial_unique_indexes.sql
--       (로컬 dev: --local 플래그)
-- =====================================================================

-- 1. (staff_id, device_id) 복합 유니크 → 부분 유니크로 교체
DROP INDEX IF EXISTS idx_push_subscriptions_staff_device_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_staff_device_unique
  ON push_subscriptions (staff_id, device_id)
  WHERE staff_id IS NOT NULL
    AND device_id IS NOT NULL;

-- 2. fcm_token 유니크 → 부분 유니크로 교체
DROP INDEX IF EXISTS idx_push_subscriptions_fcm_token_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token_unique
  ON push_subscriptions (fcm_token)
  WHERE fcm_token IS NOT NULL;
