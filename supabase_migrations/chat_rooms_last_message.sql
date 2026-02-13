-- 카카오워크 스타일: 채팅방 목록을 "마지막 메시지 시각" 기준으로 정렬
-- 새 메시지가 오면 해당 방이 목록 상단으로 올라가도록 last_message_at 갱신

ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
COMMENT ON COLUMN chat_rooms.last_message_at IS '해당 방의 마지막 메시지 시각 (목록 정렬용)';
COMMENT ON COLUMN chat_rooms.last_message_preview IS '마지막 메시지 미리보기 (선택)';

-- 메시지 INSERT 시 해당 채팅방의 last_message_at, last_message_preview 자동 갱신
CREATE OR REPLACE FUNCTION update_chat_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_rooms
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.content, '(파일)'), 80)
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_messages_update_room_last ON messages;
CREATE TRIGGER trigger_messages_update_room_last
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE update_chat_room_last_message();

-- 기존 방: 마지막 메시지 시각으로 초기화 (한 번만 실행)
UPDATE chat_rooms r
SET last_message_at = sub.last_at, last_message_preview = LEFT(COALESCE(sub.preview, '(파일)'), 80)
FROM (
  SELECT room_id, MAX(created_at) AS last_at, (array_agg(COALESCE(content, '(파일)') ORDER BY created_at DESC))[1] AS preview
  FROM messages
  WHERE is_deleted IS NOT DISTINCT FROM false
  GROUP BY room_id
) sub
WHERE r.id = sub.room_id;
