-- 급여 마감은 저장 트랜잭션 안에서 검사하며, 혼합 형식 채팅 시각은 실제 시각으로 정렬합니다.
CREATE TRIGGER IF NOT EXISTS payroll_locked_insert BEFORE INSERT ON payroll_records WHEN EXISTS (SELECT 1 FROM payroll_locks l WHERE l.year_month = NEW.year_month AND (COALESCE(l.company_name, '전체') = '전체' OR l.company_name = (SELECT company FROM staff_members WHERE id = NEW.staff_id))) BEGIN SELECT RAISE(ABORT, 'PAYROLL_MONTH_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payroll_locked_update BEFORE UPDATE ON payroll_records WHEN EXISTS (SELECT 1 FROM payroll_locks l WHERE l.year_month = OLD.year_month AND (COALESCE(l.company_name, '전체') = '전체' OR l.company_name = (SELECT company FROM staff_members WHERE id = OLD.staff_id))) OR EXISTS (SELECT 1 FROM payroll_locks l WHERE l.year_month = NEW.year_month AND (COALESCE(l.company_name, '전체') = '전체' OR l.company_name = (SELECT company FROM staff_members WHERE id = NEW.staff_id))) BEGIN SELECT RAISE(ABORT, 'PAYROLL_MONTH_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS payroll_locked_delete BEFORE DELETE ON payroll_records WHEN EXISTS (SELECT 1 FROM payroll_locks l WHERE l.year_month = OLD.year_month AND (COALESCE(l.company_name, '전체') = '전체' OR l.company_name = (SELECT company FROM staff_members WHERE id = OLD.staff_id))) BEGIN SELECT RAISE(ABORT, 'PAYROLL_MONTH_LOCKED'); END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_messages_room_chrono ON messages(room_id, julianday(created_at), id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_chat_rooms_chrono ON chat_rooms(julianday(last_message_at));
