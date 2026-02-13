-- 게시판 댓글에 대댓글(답글) 기능 추가
-- 실행: Supabase SQL Editor에서 한 번만 실행

ALTER TABLE board_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES board_post_comments(id) ON DELETE CASCADE;

COMMENT ON COLUMN board_post_comments.parent_comment_id IS '부모 댓글 ID (NULL 이면 최상위 댓글, 값이 있으면 대댓글)';

