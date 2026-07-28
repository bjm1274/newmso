-- 0022_employment_contracts_allowance_snapshot.sql
-- 근로계약서를 "체결 시점 스냅샷" 으로 만들기 위한 수당 컬럼 추가.
--
-- 문제: employment_contracts 에 약정 연장/야간근로수당·당직수당 컬럼이 없어서
-- lib/contract-template-render.ts 의 폴백(contract 값이 0/미존재면 staff_members 사용)이
-- 항상 발동했다. 그 결과 **서명이 끝난 계약서를 다시 열면 서명 이후에 바뀐 현재 급여**가
-- 표시되고, 연봉·월합계·시급도 함께 틀어졌다.
--
-- 기존 행 보존: DEFAULT 를 주지 않으므로 이미 존재하는 계약서 행은 NULL 로 남는다.
-- NULL = "이 계약서에는 스냅샷이 없다" 를 뜻하며, 렌더러는 지금과 동일하게
-- staff_members 폴백을 계속 탄다(회귀 없음). 신규 계약서부터는 0 도 유효한 값
-- ("수당 없음")으로 기록되어 폴백이 발동하지 않는다.
ALTER TABLE `employment_contracts` ADD COLUMN `agreed_overtime_allowance` integer;--> statement-breakpoint
ALTER TABLE `employment_contracts` ADD COLUMN `agreed_night_allowance` integer;--> statement-breakpoint
ALTER TABLE `employment_contracts` ADD COLUMN `night_duty_allowance` integer;
