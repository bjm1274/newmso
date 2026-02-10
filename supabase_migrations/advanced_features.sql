-- 고도화 기능 통합 마이그레이션
-- 메신저: 읽음표시, 투표 DB, 반응 DB, 고정 DB
-- 실행: Supabase SQL Editor에서 순차 실행

-- 1. message_reads: 메시지별 읽음 (user_id, message_id, read_at)
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);

-- 2. room_read_cursors: 방별 마지막 읽은 시점 (user_id, room_id, last_read_at)
CREATE TABLE IF NOT EXISTS room_read_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  room_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, room_id)
);

-- 3. polls: 투표 (messages 테이블과 room_id로 연결)
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  message_id UUID,
  creator_id UUID REFERENCES staff_members(id),
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- ["찬성", "반대"]
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_polls_room ON polls(room_id);

-- 4. poll_votes: 투표 선택 (poll_id, user_id, option_index)
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- 5. message_reactions: 메시지 반응 (message_id, user_id, emoji)
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

-- 6. pinned_messages: 고정된 메시지 (room_id, message_id, pinned_by, pinned_at)
CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  message_id UUID NOT NULL,
  pinned_by UUID REFERENCES staff_members(id),
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id);

-- 7. messages 테이블에 file_url, reply_to_id가 없으면 추가
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
END $$;

-- 8. attendance ↔ attendances 동기화: attendance 테이블에 check_in, check_out 컬럼 확인
-- (기존 MSO 스키마에 따라 attendance 구조가 다를 수 있음)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ;
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8);
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lon DECIMAL(11, 8);
  END IF;
END $$;

-- 9. staff_members: annual_leave_used, join_date 확인
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS annual_leave_used DECIMAL(4,1) DEFAULT 0;
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date DATE;
  END IF;
END $$;
