-- 수술/검사명 템플릿에 부위(body_part) 컬럼 추가 (드롭다운 선택용)
ALTER TABLE surgery_templates ADD COLUMN IF NOT EXISTS body_part TEXT;
ALTER TABLE mri_templates ADD COLUMN IF NOT EXISTS body_part TEXT;
