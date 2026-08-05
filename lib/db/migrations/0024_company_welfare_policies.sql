-- 0024_company_welfare_policies.sql
-- 8차 전수조사 FB4 · D04-006 — 관리자 워크센터 '복지(경조사) 규정' 저장 복구.
--
-- 문제: CompanyLeaveTab 의 handleSaveWelfare 가 company_welfare_policies 에 upsert 하는데
-- **이 테이블을 CREATE 하는 마이그레이션이 한 번도 없었다.** lib/db/schema.ts 와
-- meta/0010_snapshot.json 에만 존재했고 스냅샷이 "이미 있다"고 기록하므로
-- `drizzle generate` 는 영구히 CREATE 를 만들지 않는다(0010_company_payroll_policies.sql 은
-- 이름이 비슷한 company_payroll_policies 만 생성했다). 그 결과 저장은 항상
-- `no such table` 로 실패했고, catch 가 "(로컬 임시저장)" 이라고 표시해
-- **실패를 성공처럼 위장**해 왔다(파일에 localStorage 백업은 0건이라 새로고침하면 소실).
--
-- 구조는 자매 테이블 company_payroll_policies(0010)와 동일하게 맞춘다.
-- 유니크 인덱스는 (company_name, rule_name) — upsert onConflict 대상.
-- 시드 값은 CompanyLeaveTab 의 DEFAULT_WELFARE_RULES 와 동일해서,
-- 마이그레이션 직후 화면이 지금과 똑같이 보이고 그때부터 편집이 실제로 저장된다.
CREATE TABLE IF NOT EXISTS `company_welfare_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체' NOT NULL,
	`rule_name` text NOT NULL,
	`rule_value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_company_welfare_policies_unique` ON `company_welfare_policies` (`company_name`,`rule_name`);--> statement-breakpoint
INSERT OR IGNORE INTO `company_welfare_policies` (`id`, `company_name`, `rule_name`, `rule_value`) VALUES
	(lower(hex(randomblob(16))), '전체', '본인 결혼', '편도 5일 · 경조금 500,000원'),
	(lower(hex(randomblob(16))), '전체', '자녀 결혼', '편도 1일 · 경조금 200,000원'),
	(lower(hex(randomblob(16))), '전체', '부모·조부모 상', '편도 3일 · 조의금 300,000원'),
	(lower(hex(randomblob(16))), '전체', '배우자·자녀 상', '편도 5일 · 조의금 500,000원'),
	(lower(hex(randomblob(16))), '전체', '출산', '편도 3일 · 축하금 100,000원'),
	(lower(hex(randomblob(16))), '전체', '생일', '백화점 상품권 50,000원 또는 케이크 기프티콘');
