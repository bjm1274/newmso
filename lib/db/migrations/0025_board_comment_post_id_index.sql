-- board_post_comments 에 post_id 인덱스가 없었다.
-- 모바일 게시판 목록은 글 목록을 받은 뒤 `WHERE post_id IN (…최대 200개…)` 로
-- 댓글 수를 세는데, 인덱스가 없어 매번 전체 스캔이었다. 지금은 댓글이 15건뿐이라
-- 비용이 드러나지 않지만 글이 쌓이면 그대로 목록 지연이 된다.
CREATE INDEX IF NOT EXISTS idx_board_post_comments_post_id ON board_post_comments (post_id);
