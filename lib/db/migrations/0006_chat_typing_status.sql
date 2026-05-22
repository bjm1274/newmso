-- =====================================================================
-- Migration 0006: 채팅 typing 상태 테이블
--
-- 배경: Supabase Realtime presence/broadcast 기반 typing 표시를
-- D1 polling 기반으로 재구현하기 위한 영속 상태 테이블.
--
-- room_id + user_id 조합으로 upsert. updated_at 기준 TTL 필터(5초)로
-- 오래된 행은 get 쿼리에서 자동 제외. 별도 정리 작업은 불필요.
--
-- 적용: npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0006_chat_typing_status.sql
--       (로컬 dev: --local 플래그)
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_typing_status (
  room_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_typing_status_room_updated
  ON chat_typing_status (room_id, updated_at);
