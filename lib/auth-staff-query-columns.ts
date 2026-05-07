import { buildSelectClause } from '@/lib/query-columns-utils';

const STAFF_AUTH_REQUIRED_COLUMNS = [
  'id',
  'employee_no',
  'name',
  'role',
  'status',
  'department',
  'company',
  'position',
  'email',
  'phone',
];

export const STAFF_AUTH_OPTIONAL_COLUMNS = [
  'company_id',
  'address',
  'bank_account',
  'bank_name',
  'salary_info',
  'resident_no',
  'license',
  'joined_at',
  'join_date',
  'hire_date',
  'resigned_at',
  'resign_date',
  'created_at',
  'updated_at',
  'force_logout_at',
  'photo_url',
  'avatar_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'annual_leave_total',
  'annual_leave_used',
  'shift_id',
  'working_hours_per_week',
  'working_days_per_week',
  'base_salary',
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
  'auth_user_id',
  'is_system_master',
  'permissions',
];

export const STAFF_LOGIN_OPTIONAL_COLUMNS = [
  ...STAFF_AUTH_OPTIONAL_COLUMNS,
  'password',
  'passwd',
];

export function buildStaffAuthSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(
    [...STAFF_AUTH_REQUIRED_COLUMNS, ...STAFF_AUTH_OPTIONAL_COLUMNS],
    omittedColumns,
  );
}

export function buildStaffLoginSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(
    [...STAFF_AUTH_REQUIRED_COLUMNS, ...STAFF_LOGIN_OPTIONAL_COLUMNS],
    omittedColumns,
  );
}

export const STAFF_AUTH_SELECT = buildStaffAuthSelect();
export const STAFF_LOGIN_SELECT = buildStaffLoginSelect();
