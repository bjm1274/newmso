-- ============================================================
-- supabase/seed/job_category_required_trainings_seed.sql
-- 직종별 필수/권장 교육 항목 초기 데이터 (idempotent)
-- ============================================================
-- 실행 전제: job_categories_seed.sql 먼저 실행 완료
-- ============================================================

-- ============================================================
-- A. 법정의무 (obligation_type='legal', mandatory=TRUE)
-- ============================================================

-- ── A-1. 전 직종 공통 (applies_to_all=TRUE) ─────────────────
INSERT INTO job_category_required_trainings
  (applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
VALUES
  (TRUE, 'personal_info',   '개인정보취급자 정기교육',      12, TRUE, 'legal', '개인정보보호법 제28조'),
  (TRUE, 'sexual_harass',   '성희롱예방교육',               12, TRUE, 'legal', '남녀고용평등법 제13조'),
  (TRUE, 'osha',            '산업안전보건교육',             12, TRUE, 'legal', '산업안전보건법 제29조'),
  (TRUE, 'disability_aware','장애인인식개선교육',           12, TRUE, 'legal', '장애인고용촉진 및 직업재활법 제5조의2')
ON CONFLICT DO NOTHING;

-- ── A-2. 간호사 ──────────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'nurse_ceu', '간호사 보수교육 8h', 12, TRUE, 'legal', '의료법 제30조'
FROM job_categories jc
WHERE jc.code = 'nurse'
ON CONFLICT DO NOTHING;

-- ── A-3. 간호조무사 ──────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'nurse_assistant_ceu', '간호조무사 보수교육 8h', 12, TRUE, 'legal', '의료법 시행규칙 제45조'
FROM job_categories jc
WHERE jc.code = 'nurse_assistant'
ON CONFLICT DO NOTHING;

-- ── A-4. 의료기사 4개 직종 (방사선사, 물리치료사, 작업치료사, 임상병리사) ──
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'medical_technician_ceu', '의료기사 보수교육 8h', 12, TRUE, 'legal', '의료기사 등에 관한 법률 제20조'
FROM job_categories jc
WHERE jc.code IN ('radiologist', 'physical_therapist', 'occupational_therapist', 'clinical_pathologist')
ON CONFLICT DO NOTHING;

-- ── A-5. 약사 ────────────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'pharmacist_ceu', '약사 보수교육 8h', 12, TRUE, 'legal', '약사법 제15조'
FROM job_categories jc
WHERE jc.code = 'pharmacist'
ON CONFLICT DO NOTHING;

-- ============================================================
-- B. 권장/내부 (obligation_type='recommended', mandatory=FALSE)
-- ============================================================

-- ── B-1. 전 직종 공통: 직장 내 괴롭힘 예방 ─────────────────
INSERT INTO job_category_required_trainings
  (applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
VALUES
  (TRUE, 'workplace_bullying', '직장내괴롭힘예방교육', 12, FALSE, 'recommended', NULL)
ON CONFLICT DO NOTHING;

-- ── B-2. 의료 직종 공통: 인증평가 권장 항목 ─────────────────
-- 대상: doctor, nurse, nurse_assistant, radiologist,
--       physical_therapist, occupational_therapist,
--       clinical_pathologist, pharmacist, nutritionist, social_worker
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'infection_control', '감염관리 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'patient_safety', '환자안전 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'bls', 'BLS (기본소생술)', 24, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'tb_management', '결핵관리 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;
