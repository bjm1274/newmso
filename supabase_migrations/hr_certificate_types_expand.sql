-- 증명서 종류 확장 (급여인증서, 근무확인서, 소득금액증명원 추가)
-- 전자결재 양식신청과 인사관리 증명서 발급 통일

DO $$
DECLARE conname text;
BEGIN
  SELECT conname INTO conname FROM pg_constraint 
    WHERE conrelid = 'certificate_issuances'::regclass AND contype = 'c' AND conname LIKE '%cert_type%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE certificate_issuances DROP CONSTRAINT %I', conname);
  END IF;
  ALTER TABLE certificate_issuances ADD CONSTRAINT certificate_issuances_cert_type_check 
    CHECK (cert_type IN ('재직증명서','경력증명서','퇴직증명서','급여인증서','근무확인서','원천징수영수증','소득금액증명원'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
