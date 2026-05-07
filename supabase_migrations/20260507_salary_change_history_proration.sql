-- Salary change history support for mid-month payroll proration.
-- Run in Supabase SQL Editor before relying on non-legacy allowance change types.

ALTER TABLE salary_change_history
  DROP CONSTRAINT IF EXISTS salary_change_history_change_type_check;

ALTER TABLE salary_change_history
  ADD CONSTRAINT salary_change_history_change_type_check
  CHECK (
    change_type IN (
      'base_salary',
      'meal',
      'meal_allowance',
      'night_duty_allowance',
      'vehicle',
      'vehicle_allowance',
      'childcare',
      'childcare_allowance',
      'research',
      'research_allowance',
      'other',
      'other_taxfree',
      'position_allowance',
      'overtime_allowance',
      'night_work_allowance',
      'holiday_work_allowance',
      'annual_leave_pay'
    )
  );

CREATE INDEX IF NOT EXISTS idx_salary_change_staff_date
  ON salary_change_history(staff_id, effective_date);
