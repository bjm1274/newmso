-- =====================================================================
-- Migration 0028: approval_form_types 의 base_slug·company_name 복구 + 기본양식 시드
--
-- 배경 —
-- 0011_add_missing_approval_form_columns.sql 과 0016_add_resignation_form.sql 이
-- 운영에 도달하지 않았다(d1_migrations 0행 · 손으로 적용해 온 결과).
-- 2026-08-27 운영 실측: approval_form_types 컬럼은
--   id, name, slug, description, sort_order, is_active, created_at, updated_at
-- 8개뿐이고 base_slug·company_name 이 없다. 행 수도 0이다.
--
-- 피해 —
-- [관리자전용 → 전자결재 양식관리] 에서 기본양식을 복제해 새 양식을 만들면
-- INSERT 가 `table approval_form_types has no column named base_slug` 로 거부되는데,
-- 그 오류메시지가 테이블명을 포함하는 탓에 isMissingTableError 필터에 걸려
-- console.warn 조차 남지 않는다(완전 무성). 화면에는 저장된 것처럼 보이고 실제로는
-- 그 브라우저 localStorage 에만 남는다. 이름 수정(update)도 company_name 을 SET 에
-- 넣어 같은 이유로 거부된다.
--
-- 왜 0011 을 다시 적용하지 않고 새 번호로 다시 쓰는가 —
-- 0027 머리말과 같은 이유다. d1_migrations baseline 을 0000~0026 "적용됨"으로
-- 정렬해야 `migrations apply` 가 안전해지므로, 빠진 효과만 새 파일로 다시 표현한다.
-- 덧붙여 저장소에는 0011 번호가 두 파일(0011_add_missing_approval_form_columns /
-- 0011_unified_leave_ledger)에 중복돼 있어 그 번호를 다시 쓰면 안 된다.
--
-- 기존 데이터 영향 —
-- 없다. ADD COLUMN 은 기존 8컬럼을 건드리지 않고 새 컬럼을 NULL 로 채운다.
-- 시드 INSERT 는 WHERE NOT EXISTS 로 slug 중복을 피하고, 지금 운영은 0행이라
-- 6행이 그대로 들어간다.
--
-- 시드 6행이 화면을 바꾸지 않는 근거 (회귀 확인) —
-- app/main/기능부품/전자결재.tsx:548-554 의 normalizedFallbackTypes 가
--   연차/휴가(leave) · 연장근무(overtime) · 비품구매(purchase) ·
--   출결정정(attendance_fix) · 사직서(resignation) · 증명서발급(generic)
-- 로 아래 시드와 이름·slug 가 완전히 같다. 지금은 테이블이 0행이라 :607
-- `next.length ? next : normalizedFallbackTypes` 가 폴백을 쓰고 있고, 시드 후에는
-- DB 행을 쓰게 되는데 내용이 동일해 사용자에게 보이는 목록이 바뀌지 않는다.
-- 양식관리 화면(전자결재양식관리.tsx:264-270)도 slug 키로 dedupe 하므로
-- localStorage 에 같은 slug 가 남아 있어도 중복 표시되지 않는다.
--
-- 되돌리기 —
--   DELETE FROM approval_form_types WHERE id IN (
--     'default-leave','default-overtime','default-purchase',
--     'default-attendance-fix','default-generic','default-resignation');
--   ALTER TABLE approval_form_types DROP COLUMN company_name;
--   ALTER TABLE approval_form_types DROP COLUMN base_slug;
-- (DROP COLUMN 은 D1 의 SQLite 3.4x 에서 지원된다. 되돌리면 커스텀 양식 저장이
--  다시 무음 실패 상태로 돌아간다.)
--
-- 주의 —
-- SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없다. 이 파일은 한 번만 적용해야 하며,
-- 적용 전 아래로 컬럼 부재를 먼저 확인할 것:
--   npx wrangler d1 execute pchos-d1-v2 --remote \
--     --command "SELECT sql FROM sqlite_master WHERE name='approval_form_types'"
-- =====================================================================

ALTER TABLE `approval_form_types` ADD COLUMN `base_slug` text;--> statement-breakpoint
ALTER TABLE `approval_form_types` ADD COLUMN `company_name` text;--> statement-breakpoint

-- 기본양식 6종 시드 (0016 재적용분). company_name IS NULL = 전사 공통.
INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-leave', '연차/휴가', 'leave', 1, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'leave');--> statement-breakpoint

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-overtime', '연장근무', 'overtime', 2, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'overtime');--> statement-breakpoint

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-purchase', '비품구매', 'purchase', 3, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'purchase');--> statement-breakpoint

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-attendance-fix', '출결정정', 'attendance_fix', 4, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'attendance_fix');--> statement-breakpoint

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-generic', '증명서발급', 'generic', 5, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'generic');--> statement-breakpoint

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-resignation', '사직서', 'resignation', 6, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'resignation');
