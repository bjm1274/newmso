alter table if exists public.staff_members
  add column if not exists meal_allowance bigint default 0,
  add column if not exists night_duty_allowance bigint default 0,
  add column if not exists vehicle_allowance bigint default 0,
  add column if not exists childcare_allowance bigint default 0,
  add column if not exists research_allowance bigint default 0,
  add column if not exists other_taxfree bigint default 0,
  add column if not exists position_allowance bigint default 0,
  add column if not exists overtime_allowance bigint default 0,
  add column if not exists night_work_allowance bigint default 0,
  add column if not exists holiday_work_allowance bigint default 0,
  add column if not exists annual_leave_pay bigint default 0;

alter table if exists public.payroll_records
  add column if not exists meal_allowance bigint default 0,
  add column if not exists night_duty_allowance bigint default 0,
  add column if not exists vehicle_allowance bigint default 0,
  add column if not exists childcare_allowance bigint default 0,
  add column if not exists research_allowance bigint default 0,
  add column if not exists other_taxfree bigint default 0;
