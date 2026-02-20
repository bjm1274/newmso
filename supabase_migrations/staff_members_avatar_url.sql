-- 프로필 사진 URL 저장용 컬럼 (스키마 캐시 오류 해결)
-- 오류: Could not find the 'avatar_url' column of 'staff_members' in the schema cache
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
