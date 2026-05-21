-- =====================================================================
-- Migration 0003: D1 기반 레이트리밋을 위한 rate_limit_attempts 테이블
--
-- 배경: lib/rate-limit.ts가 인메모리 Map으로 레이트리밋을 관리했으나
-- Cloudflare Workers는 요청마다 isolate가 분산되어 메모리가 공유되지 않음.
-- D1에 상태를 영속해 Workers 전체에서 실질적인 차단이 동작하도록 변경.
--
-- key         : 식별자 (loginId, ip:userId 등)
-- count       : 현재 윈도우 내 실패 횟수
-- window_start: 윈도우 시작 시각 (epoch ms, TEXT)
-- updated_at  : 마지막 갱신 시각
-- =====================================================================

CREATE TABLE IF NOT EXISTS `rate_limit_attempts` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL DEFAULT 0,
  `window_start` text NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_rate_limit_attempts_window_start`
  ON `rate_limit_attempts` (`window_start`);
