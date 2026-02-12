-- 채팅 보관정책 및 파일 메타데이터
-- 대화기록 5년, 사진/10MB 이하 파일 1년, 동영상·10MB 초과 3개월

-- 1. messages에 파일 크기·종류 컬럼 추가
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_kind VARCHAR(20); -- 'image' | 'video' | 'file'
  END IF;
END $$;

-- 2. 보관기간 정리용 함수 (Supabase cron 또는 API에서 주기 호출)
-- 정책: 텍스트만 5년, 사진/10MB이하 1년, 동영상·10MB초과 3개월
CREATE OR REPLACE FUNCTION cleanup_chat_messages_by_retention()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt BIGINT;
  cutoff_5y TIMESTAMPTZ := NOW() - INTERVAL '5 years';
  cutoff_1y TIMESTAMPTZ := NOW() - INTERVAL '1 year';
  cutoff_3m TIMESTAMPTZ := NOW() - INTERVAL '3 months';
BEGIN
  WITH to_delete AS (
    SELECT id FROM messages
    WHERE (file_url IS NULL OR file_url = '') AND created_at < cutoff_5y
    UNION
    SELECT id FROM messages
    WHERE file_url IS NOT NULL AND file_url <> ''
      AND (file_kind = 'image' OR (file_kind = 'file' AND COALESCE(file_size_bytes, 0) <= 10485760))
      AND created_at < cutoff_1y
    UNION
    SELECT id FROM messages
    WHERE file_url IS NOT NULL AND file_url <> ''
      AND (file_kind = 'video' OR COALESCE(file_size_bytes, 0) > 10485760)
      AND created_at < cutoff_3m
  )
  DELETE FROM messages WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

-- 3. (선택) pg_cron 설치 시 매일 새벽 2시 실행:
-- SELECT cron.schedule('chat-retention', '0 2 * * *', $$ SELECT cleanup_chat_messages_by_retention(); $$);

SELECT 'chat_retention_and_file_meta migration done' AS status;
