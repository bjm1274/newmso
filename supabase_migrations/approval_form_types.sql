-- 전자결재 양식 관리 (관리자 메뉴에서 추가/수정)
-- 실행: Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS approval_form_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_form_types_active ON approval_form_types(is_active);
COMMENT ON TABLE approval_form_types IS '관리자가 추가/수정하는 전자결재 양식 목록. 기본 양식(인사명령, 연차/휴가 등)은 코드에 고정, 여기서는 추가 양식만 관리.';
