-- 계약서 템플릿에 회사별 직인 이미지 URL 보관용 컬럼 추가
-- Supabase SQL Editor에서 실행

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contract_templates'
  ) THEN
    CREATE TABLE public.contract_templates (
      company_name TEXT PRIMARY KEY,
      template_content TEXT,
      updated_at TIMESTAMPTZ,
      seal_url TEXT
    );
  END IF;
END $$;

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS seal_url TEXT;

SELECT 'contract_templates_seal_url done' AS status;

