-- ============================================================
-- DB 통합 호환성 패치 (메신저 및 알림 시스템 업그레이드용)
-- ============================================================

-- 1. 채팅 메시지 테이블 호환성 (chat_messages -> messages)
DO $$ 
BEGIN
    -- chat_messages 테이블이 있고 messages가 없으면 이름 변경
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_messages') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
        ALTER TABLE chat_messages RENAME TO messages;
    END IF;

    -- 만약 둘 다 있다면 (중복), messages를 메인으로 사용하되 컬럼 보강
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
        -- 부족한 컬럼 추가
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_kind VARCHAR(20);
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
        
        -- 외래키 제약조건 (reply_to_id)
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_reply_to_id_fkey') THEN
            ALTER TABLE messages ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- 2. 알림 테이블 호환성 (read_at 및 metadata 보강)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        -- read_at 컬럼 추가 (is_read 대체용)
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
        
        -- 기존 is_read 데이터 보존 (is_read가 true면 read_at을 현재시간으로)
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
            UPDATE notifications SET read_at = created_at WHERE is_read = true AND read_at IS NULL;
        END IF;
    END IF;
END $$;

-- 3. 읽음 확인 테이블 (message_reads vs chat_message_reads)
DO $$ 
BEGIN
    -- user_id / reader_id 호환성 처리
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'message_reads') THEN
        ALTER TABLE message_reads ADD COLUMN IF NOT EXISTS user_id UUID;
        -- reader_id가 있다면 user_id로 복사
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'message_reads' AND column_name = 'reader_id') THEN
            UPDATE message_reads SET user_id = reader_id WHERE user_id IS NULL;
        END IF;
    END IF;
END $$;

-- 4. 채팅방 기술 정보 (last_message_at, last_message 등)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_rooms') THEN
        ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
        ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message TEXT;
        ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_preview TEXT; -- 호환성용
    END IF;
END $$;

-- 5. 채팅방 정보 자동 갱신 트리거 보정
CREATE OR REPLACE FUNCTION update_chat_room_last_message_v2()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_rooms
  SET
    last_message_at = NEW.created_at,
    last_message = LEFT(COALESCE(NEW.content, '(파일)'), 100),
    last_message_preview = LEFT(COALESCE(NEW.content, '(파일)'), 80)
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재연결 (messages 테이블 대상)
DROP TRIGGER IF EXISTS trigger_messages_update_room_last ON messages;
CREATE TRIGGER trigger_messages_update_room_last
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE update_chat_room_last_message_v2();
