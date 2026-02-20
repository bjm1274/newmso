-- 공지사항/자유게시판/경조사 사진·파일 첨부용
-- attachments: [{ url, name, type?: 'image'|'file' }]
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
