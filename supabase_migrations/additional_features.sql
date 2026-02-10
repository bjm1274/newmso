-- 추가 고도화 기능 마이그레이션
-- 실행: Supabase SQL Editor

-- 1. 감사 로그
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  action TEXT NOT NULL,  -- '급여수정','결재승인','연차차감','인사변경' 등
  target_type TEXT,     -- 'payroll','approval','leave_request','staff'
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 2. 결재 이력 (승인/반려 내역·코멘트)
CREATE TABLE IF NOT EXISTS approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL,
  approver_id UUID,
  approver_name TEXT,
  action TEXT NOT NULL,  -- '승인','반려','요청'
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history(approval_id);

-- 3. 결재선 (approvals에 approver_line, current_step 추가)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'approvals') THEN
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approver_line JSONB;  -- [{id, name, order}]
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS current_step INT DEFAULT 0;
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS rejection_comment TEXT;
  END IF;
END $$;

-- 4. 결재 템플릿 (양식별 기본값)
CREATE TABLE IF NOT EXISTS approval_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL UNIQUE,  -- 휴가신청, 출결정정 등
  default_values JSONB,  -- {leave_type:'연차', ...}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 방별 알림 설정
CREATE TABLE IF NOT EXISTS room_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  room_id UUID NOT NULL,
  notifications_enabled BOOLEAN DEFAULT true,
  UNIQUE(user_id, room_id)
);

-- 6. 휴가 증빙 파일
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leave_requests') THEN
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_name TEXT;
  END IF;
END $$;

-- 7. messages에 soft delete, 수정 지원
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
  END IF;
END $$;
