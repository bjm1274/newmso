-- annual_leave_promotion_logs.step 의 CHECK 가 (1, 2) 만 허용하고 있었다.
--
-- 소멸 확정 로그는 lib/annual-leave-expiry.processStaffLeaveExpiry 가 step=3 으로
-- 남기는데, 제약에 걸려 INSERT 가 터졌다. 그 결과 매일 00:00 크론이 500 으로
-- 죽었고, 예외가 배치 루프 밖으로 나가 **그 뒤 직원들은 아예 처리되지 않았다.**
--
-- step=3 은 촉진 단계가 아니라 "소멸 확정" 이벤트다. 촉진 이행 판정
-- (hasCompletedBothPromotions)은 stage/step 이 1·2 인 행만 세므로 3 을 넣어도
-- 오판하지 않는다. 제약을 넓힌다.
--
-- SQLite 는 CHECK 를 ALTER 로 못 바꾼다 — 테이블을 다시 만들어 옮긴다.

CREATE TABLE annual_leave_promotion_logs__new (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_name TEXT,
  target_year INTEGER NOT NULL,
  step INTEGER NOT NULL,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
  remain_days REAL,
  meta TEXT,
  stage INTEGER,
  expiry_date TEXT,
  notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
  plan_submitted_at TEXT,
  remaining_days_at_notice REAL,
  notification_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT annual_leave_promotion_logs_pkey PRIMARY KEY (id),
  -- 1: 1차 촉진, 2: 2차 촉진, 3: 소멸 확정
  CONSTRAINT annual_leave_promotion_logs_step_check CHECK ((step IN (1, 2, 3)))
);

INSERT INTO annual_leave_promotion_logs__new
SELECT id, staff_id, company_name, target_year, step, sent_at, remain_days, meta,
       stage, expiry_date, notified_at, plan_submitted_at, remaining_days_at_notice,
       notification_id, created_at
FROM annual_leave_promotion_logs;

DROP TABLE annual_leave_promotion_logs;

ALTER TABLE annual_leave_promotion_logs__new RENAME TO annual_leave_promotion_logs;

CREATE INDEX IF NOT EXISTS idx_annual_leave_promotion_logs_staff_year
  ON annual_leave_promotion_logs (staff_id, target_year, step);
CREATE INDEX IF NOT EXISTS idx_alpl_stage ON annual_leave_promotion_logs (stage);
CREATE INDEX IF NOT EXISTS idx_alpl_staff_id ON annual_leave_promotion_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_alpl_expiry_date ON annual_leave_promotion_logs (expiry_date);
