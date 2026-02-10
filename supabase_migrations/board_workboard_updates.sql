-- 게시판 좋아요·댓글·태그 / 할일 우선순위 마이그레이션
-- 실행: Supabase SQL Editor에서 실행

-- 1. board_posts 확장 (좋아요, 태그)
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- 2. board_post_likes (좋아요 중복 방지)
CREATE TABLE IF NOT EXISTS board_post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 3. board_post_comments (댓글)
CREATE TABLE IF NOT EXISTS board_post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  author_name VARCHAR(100),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. tasks 우선순위
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
-- priority: 'low' | 'medium' | 'high' | 'urgent'
