-- =====================================================================
-- Migration 0030: onboarding_checklists staff_id + checklist_type 복합 유니크 인덱스
--
-- 배경: 오프보딩 및 온보딩 체크리스트의 upsert 시 onConflict: 'staff_id,checklist_type'을
-- 사용하는데, D1 SQLite 스키마에 해당 복합 유니크 인덱스가 누락되어
-- ON CONFLICT 절 오류가 발생하던 문제를 해결.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_checklists_staff_type
  ON onboarding_checklists (staff_id, checklist_type);
