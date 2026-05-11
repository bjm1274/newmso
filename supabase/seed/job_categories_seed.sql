-- ============================================================
-- supabase/seed/job_categories_seed.sql
-- 직종 마스터 초기 데이터 (idempotent)
-- ============================================================

INSERT INTO job_categories (code, name, is_medical_staff, display_order)
VALUES
  ('doctor',                '의사',       TRUE,  10),
  ('nurse',                 '간호사',     TRUE,  20),
  ('nurse_assistant',       '간호조무사', TRUE,  30),
  ('radiologist',           '방사선사',   TRUE,  40),
  ('physical_therapist',    '물리치료사', TRUE,  50),
  ('occupational_therapist','작업치료사', TRUE,  60),
  ('clinical_pathologist',  '임상병리사', TRUE,  70),
  ('pharmacist',            '약사',       TRUE,  80),
  ('nutritionist',          '영양사',     TRUE,  90),
  ('social_worker',         '사회복지사', TRUE,  100),
  ('admin',                 '사무직',     FALSE, 200),
  ('reception',             '원무행정',   FALSE, 210),
  ('etc',                   '기타',       FALSE, 999)
ON CONFLICT (code) DO NOTHING;
