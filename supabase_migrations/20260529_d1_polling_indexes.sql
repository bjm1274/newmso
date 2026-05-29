-- MSO ERP 5차 아키텍처 개선: 백그라운드 폴링 테이블 인덱스 전면 구축
-- 대상: D1 SQLite 및 Supabase PostgreSQL 공용

-- 1. 채팅 메시지 테이블 created_at 인덱스 추가 (1.5초 폴링 풀 스캔 방지)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- 2. 채팅 읽음 커서 테이블 last_read_at 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_room_read_cursors_last_read_at ON room_read_cursors(last_read_at);

-- 3. 메시지 리액션 테이블 created_at 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_message_reactions_created_at ON message_reactions(created_at);

-- 4. 핀 고정 메시지 테이블 pinned_at 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_pinned_messages_pinned_at ON pinned_messages(pinned_at);

-- 5. 메신저 투표 투표 기록 테이블 created_at 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_poll_votes_created_at ON poll_votes(created_at);

-- 6. 게시판 조회 기록 테이블 created_at 인덱스 추가 (10초 폴링 풀 스캔 방지)
CREATE INDEX IF NOT EXISTS idx_board_post_reads_created_at ON board_post_reads(created_at);

-- 7. 게시판 게시물 테이블 created_at 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON board_posts(created_at);

-- 8. 전자결재 테이블 created_at 인덱스 추가 (5초 폴링 풀 스캔 방지)
CREATE INDEX IF NOT EXISTS idx_approvals_created_at ON approvals(created_at);

-- 9. 재고 변동 로그 테이블 created_at 인덱스 추가 (5초 폴링 풀 스캔 방지)
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);

-- 10. 알림 테이블 created_at 인덱스 추가 (30초 폴링 풀 스캔 방지)
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
