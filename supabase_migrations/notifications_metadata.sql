-- 알림 클릭 시 채팅방 등으로 이동하기 위한 메타데이터 컬럼
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
COMMENT ON COLUMN notifications.metadata IS '알림 추가 정보 (예: room_id로 채팅방 이동)';
