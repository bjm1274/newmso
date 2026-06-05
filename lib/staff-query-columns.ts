import { buildSelectClause } from '@/lib/query-columns-utils';

export const STAFF_APPROVAL_DIRECTORY_SELECT = [
  'id',
  'employee_no',
  'name',
  'company',
  'company_id',
  'department',
  'position',
].join(', ');

export const STAFF_APPROVER_PERMISSION_SELECT = [
  'id',
  'permissions',
].join(', ');

export const STAFF_BIRTHDAY_SELECT = [
  'id',
  'name',
  'birth_date',
  'status',
].join(', ');

const STAFF_BOOTSTRAP_COLUMNS = [
  'id',
  'name',
  'email',
  'phone',
  'company',
  'company_id',
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'join_date',
  'joined_at',
  'resigned_at',
  'birth_date',
  'address',
  'annual_leave_total',
  'annual_leave_used',
  'base_salary',
  // taxable allowances
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
  // tax-free allowances
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  // work conditions
  'working_hours_per_week',
  'working_days_per_week',
  // identity
  'resident_no',
  'presence_status',
  'permissions',
  'bank_account',
  'bank_name',
  'shift_id',
  'auth_user_id',
  'employment_type',
  'contract_type',
  'created_at',
];

export const STAFF_BOOTSTRAP_OPTIONAL_COLUMNS = [
  'email',
  'phone',
  'company_id',
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'join_date',
  'joined_at',
  'hire_date',
  'resigned_at',
  'resign_date',
  'birth_date',
  'address',
  'gender',
  'annual_days',
  'annual_used',
  'annual_leave_total',
  'annual_leave_used',
  'salary',
  'base_salary',
  // taxable allowances
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
  // tax-free allowances
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  // work conditions
  'working_hours_per_week',
  'working_days_per_week',
  // identity
  'resident_no',
  'presence_status',
  'permissions',
  'avatar_url',
  'photo_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'extension',
  'bank_name',
  'bank_account',
  'shift_id',
  'auth_user_id',
  'employment_type',
  'contract_type',
  'updated_at',
];

export function buildStaffBootstrapSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(STAFF_BOOTSTRAP_COLUMNS, omittedColumns);
}

export const STAFF_BOOTSTRAP_SELECT = buildStaffBootstrapSelect();

const STAFF_LIGHT_BOOTSTRAP_COLUMNS = [
  'id',
  'name',
  'email',
  'phone',
  'company',
  'company_id',
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'join_date',
  'joined_at',
  'resigned_at',
  'birth_date',
  'address',
  'annual_leave_total',
  'annual_leave_used',
  'presence_status',
  'permissions',
  'avatar_url',
  'photo_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'auth_user_id',
  'employment_type',
  'contract_type',
  'created_at',
];

export const STAFF_LIGHT_BOOTSTRAP_OPTIONAL_COLUMNS = [
  'email',
  'phone',
  'company_id',
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'join_date',
  'joined_at',
  'hire_date',
  'resigned_at',
  'resign_date',
  'birth_date',
  'address',
  'gender',
  'annual_days',
  'annual_used',
  'annual_leave_total',
  'annual_leave_used',
  'presence_status',
  'permissions',
  'avatar_url',
  'photo_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'extension',
  'shift_id',
  'auth_user_id',
  'employment_type',
  'contract_type',
  'updated_at',
];

export function buildStaffLightBootstrapSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(STAFF_LIGHT_BOOTSTRAP_COLUMNS, omittedColumns);
}

export const STAFF_LIGHT_BOOTSTRAP_SELECT = buildStaffLightBootstrapSelect();

const STAFF_SETTLEMENT_COLUMNS = [
  'id',
  'name',
  'email',
  'company',
];

export const STAFF_SETTLEMENT_OPTIONAL_COLUMNS = [
  'email',
  'staff_email',
  'company',
];

export function buildStaffSettlementSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(STAFF_SETTLEMENT_COLUMNS, omittedColumns);
}

export const STAFF_SETTLEMENT_SELECT = buildStaffSettlementSelect();

const STAFF_ORG_CHART_COLUMNS = [
  'id',
  'name',
  'company',
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'permissions',
];

export const STAFF_ORG_CHART_OPTIONAL_COLUMNS = [
  'department',
  'position',
  'role',
  'status',
  'employee_no',
  'resign_date',
  'extension',
  'permissions',
  'avatar_url',
  'photo_url',
  'profile_photo_path',
  'profile_photo_updated_at',
];

export function buildStaffOrgChartSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(STAFF_ORG_CHART_COLUMNS, omittedColumns);
}

export const STAFF_ORG_CHART_SELECT = buildStaffOrgChartSelect();
