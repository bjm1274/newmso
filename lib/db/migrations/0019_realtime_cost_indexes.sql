CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reactions_created_at ON message_reactions (created_at);
CREATE INDEX IF NOT EXISTS idx_room_read_cursors_last_read_at ON room_read_cursors (last_read_at);
CREATE INDEX IF NOT EXISTS idx_board_post_reads_created_at ON board_post_reads (created_at);
