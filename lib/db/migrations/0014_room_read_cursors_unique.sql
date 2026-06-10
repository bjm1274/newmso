-- =====================================================================
-- Migration 0014: room_read_cursors (user_id, room_id) 유니크 인덱스
--
-- 배경 [4차 전수조사 lib-10]: lib/chat-read-cursors.ts upsertRoomReadCursors가
-- select-then-insert 방식이라 동시 요청(여러 탭) 시 (user_id, room_id) 중복행이
-- 생길 수 있었음. onConflictDoUpdate 원자적 upsert로 전환하려면 유니크 제약이 필요.
--
-- 적용:
--   npx wrangler d1 execute <DB> --remote --file=lib/db/migrations/0014_room_read_cursors_unique.sql
--   (로컬 dev는 --local)
--   ⚠️ 코드의 onConflictDoUpdate는 이 인덱스가 생성된 뒤에만 동작하므로
--      배포와 함께 적용할 것(미적용 시 upsert가 'no matching constraint' 오류).
-- =====================================================================

-- 1) 기존 중복행 정리 — (user_id, room_id)별 최신 rowid 1건만 남김.
--    last_read_at은 idempotent라 어느 것을 남겨도 정합성 영향 없음(최신 물리행 보존).
DELETE FROM `room_read_cursors`
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM `room_read_cursors`
  GROUP BY `user_id`, `room_id`
);
--> statement-breakpoint

-- 2) 유니크 인덱스 생성.
CREATE UNIQUE INDEX IF NOT EXISTS `room_read_cursors_user_room_uq`
  ON `room_read_cursors` (`user_id`, `room_id`);
