-- 메신저 고도화: 파일 공유, 답글 지원
-- messages 테이블이 있으면 컬럼 추가, 없으면 chat_messages 기반으로 생성

-- 1. messages 테이블이 없는 경우 chat_messages에서 마이그레이션 또는 messages 생성
DO $$
BEGIN
  -- messages 테이블 존재 시 file_url, reply_to_id 추가
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
  
  -- chat_messages 테이블만 있는 경우 (messages 없음) 컬럼 추가
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
END $$;

-- 2. Supabase Storage pchos-files 버킷은 대시보드에서 생성
-- Storage > New bucket > pchos-files (Public 권한 권장)
