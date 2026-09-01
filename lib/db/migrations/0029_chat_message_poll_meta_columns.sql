-- =====================================================================
-- Migration 0029: 메신저 메타 정규 컬럼 (messages.ward_meta · polls.poll_meta)
--
-- 배경 —
-- 채팅 병동 메시지(WARD_MESSAGE_META)는 messages.content,
-- 투표 메타(POLL_META)는 polls.question 에 각각
--   [[WARD_MESSAGE_META]]{json}[[/WARD_MESSAGE_META]]
--   [[POLL_META]]{json}[[/POLL_META]]
-- 형태로 JSON 을 숨겨 저장해 왔다. 이 문자열 인코딩은
-- 정규화/검색/마이그레이션에 취약해 정규 컬럼으로 이관한다.
--
-- 전략 —
-- - 쓰기: content/question 에는 순수 텍스트만, 메타는 신규 컬럼에 저장.
-- - 읽기: 신규 컬럼 우선, 없으면 기존 content/question 파싱으로 폴백(하위 호환).
-- - 백필: 기존 행의 메타 블록을 신규 컬럼으로 복사(블록 제거는 하지 않음 —
--   읽기 폴백과 stripHiddenMessageMetaBlocks 가 기존 블록을 무시/제거한다).
--
-- 기존 데이터 영향 —
-- 없다. ADD COLUMN 은 기존 컬럼을 건드리지 않고 NULL 로 채운다.
--
-- 주의 —
-- SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없다. 이 파일은 한 번만 적용해야 하며,
-- 적용 전 컬럼 부재를 먼저 확인할 것:
--   npx wrangler d1 execute pchos-d1-v2 --remote \
--     --command "PRAGMA table_info(messages)"
-- =====================================================================

ALTER TABLE `messages` ADD COLUMN `ward_meta` text;--> statement-breakpoint
ALTER TABLE `polls` ADD COLUMN `poll_meta` text;--> statement-breakpoint

-- =====================================================================
-- 백필: 기존 content/question 의 메타 블록 → 신규 컬럼 복사.
-- SQLite substr/instr 로 블록 본문(JSON)만 추출한다.
-- 블록이 없는 행은 NULL 그대로 둔다(WHERE 로 보호).
-- =====================================================================

-- messages.ward_meta: WARD_MESSAGE_META 블록 본문 추출
UPDATE `messages`
SET `ward_meta` = substr(
  `content`,
  instr(`content`, '[[WARD_MESSAGE_META]]') + length('[[WARD_MESSAGE_META]]'),
  instr(`content`, '[[/WARD_MESSAGE_META]]')
    - instr(`content`, '[[WARD_MESSAGE_META]]')
    - length('[[WARD_MESSAGE_META]]')
)
WHERE `content` LIKE '%[[WARD_MESSAGE_META]]%'
  AND `content` LIKE '%[[/WARD_MESSAGE_META]]%'
  AND `ward_meta` IS NULL;--> statement-breakpoint

-- polls.poll_meta: POLL_META 블록 본문 추출
UPDATE `polls`
SET `poll_meta` = substr(
  `question`,
  instr(`question`, '[[POLL_META]]') + length('[[POLL_META]]'),
  instr(`question`, '[[/POLL_META]]')
    - instr(`question`, '[[POLL_META]]')
    - length('[[POLL_META]]')
)
WHERE `question` LIKE '%[[POLL_META]]%'
  AND `question` LIKE '%[[/POLL_META]]%'
  AND `poll_meta` IS NULL;
