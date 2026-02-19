-- 수술일정표·MRI일정표 등록을 위한 board_posts 컬럼 추가
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_date TEXT;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_time TEXT;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_room TEXT;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_fasting BOOLEAN DEFAULT false;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_inpatient BOOLEAN DEFAULT false;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_guardian BOOLEAN DEFAULT false;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_caregiver BOOLEAN DEFAULT false;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_transfusion BOOLEAN DEFAULT false;
