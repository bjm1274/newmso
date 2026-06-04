-- 0010_company_payroll_policies.sql
-- 회사관리 → 급여기준 저장 실패 수정: 운영 D1에 company_payroll_policies 테이블이
-- 없어(=schema.ts/Supabase 마이그레이션에만 존재) INSERT가 "no such table"로 실패하던 문제.
-- D1(SQLite)에 테이블 + upsert용 유니크 인덱스 + '전체' 기본값 시드를 생성한다.
CREATE TABLE IF NOT EXISTS `company_payroll_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체' NOT NULL,
	`rule_label` text NOT NULL,
	`rule_value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_company_payroll_policies_unique` ON `company_payroll_policies` (`company_name`,`rule_label`);--> statement-breakpoint
INSERT OR IGNORE INTO `company_payroll_policies` (`id`, `company_name`, `rule_label`, `rule_value`) VALUES
	(lower(hex(randomblob(16))), '전체', '급여일', '매월 15일 · 전월 1일~말일 정산'),
	(lower(hex(randomblob(16))), '전체', '시급 계산 기준', '월 209시간 (주 40h × 4.345주)'),
	(lower(hex(randomblob(16))), '전체', '초과근로 수당', '통상임금 × 1.5'),
	(lower(hex(randomblob(16))), '전체', '야간근로 수당', '통상임금 × 0.5 (22:00~06:00)'),
	(lower(hex(randomblob(16))), '전체', '휴일근로 수당', '통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)'),
	(lower(hex(randomblob(16))), '전체', '주휴수당', '1주 15h 이상 + 출근율 100%'),
	(lower(hex(randomblob(16))), '전체', '퇴직금', '1년 이상 근속 · 평균임금 30일분'),
	(lower(hex(randomblob(16))), '전체', '4대보험', '법정 요율 · 자동 적용');
