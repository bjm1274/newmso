-- 직원 내선번호 (조직도·직원 정보에서 사용)
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS extension VARCHAR(20);
COMMENT ON COLUMN staff_members.extension IS '내선번호';
