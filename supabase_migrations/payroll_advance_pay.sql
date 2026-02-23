-- 선지급: 해당 월 선지급 금액 저장, 명세서에 선지급 행(구분) 표시
-- 학습 문서 §2·§3·§5·§10 선지급 처리 참고

ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS advance_pay BIGINT DEFAULT 0;

COMMENT ON COLUMN payroll_records.advance_pay IS '해당 월 선지급 금액. >0이면 본급·공제·차인 0원, 명세서에 (선지급: 금액) 표기';
