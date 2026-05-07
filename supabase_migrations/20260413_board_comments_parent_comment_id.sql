ALTER TABLE public.board_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.board_post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_board_post_comments_parent_comment_id
  ON public.board_post_comments(parent_comment_id);

COMMENT ON COLUMN public.board_post_comments.parent_comment_id IS
  'Parent comment id. NULL means a root comment.';

NOTIFY pgrst, 'reload schema';
