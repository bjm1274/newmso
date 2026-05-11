-- ============================================================
-- 2026-05-11_020_staff_trainings.sql
-- staff_trainings 테이블 생성 (idempotent)
-- 직종별 필수교육 자동 부여 및 이수 현황 관리용
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_trainings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,

  -- 교육 식별
  training_code   TEXT NOT NULL,
  training_name   TEXT NOT NULL,

  -- 부여 정보
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mandatory       BOOLEAN DEFAULT TRUE,
  obligation_type TEXT NOT NULL DEFAULT 'legal',
  cycle_months    INT,

  -- 이수 정보
  status          TEXT NOT NULL DEFAULT '미이수',
  completed_at    TIMESTAMPTZ,
  certificate_url TEXT,
  memo            TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 직원 × 교육코드 중복 방지
  UNIQUE (staff_id, training_code),

  CONSTRAINT chk_st_obligation_type
    CHECK (obligation_type IN ('legal', 'recommended')),

  CONSTRAINT chk_st_status
    CHECK (status IN ('미이수', '이수완료', '면제', '진행중'))
);

-- --------------------------------------------------------
-- 인덱스
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_trainings_staff_id
  ON staff_trainings (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_trainings_status
  ON staff_trainings (status);

CREATE INDEX IF NOT EXISTS idx_staff_trainings_training_code
  ON staff_trainings (training_code);
