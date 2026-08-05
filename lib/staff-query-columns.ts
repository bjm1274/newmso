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

// ---------------------------------------------------------------------------
// 증명서 발급 / 문서보관함 직원 컨텍스트 (8차 FB4 · D03-005 · D03-018)
//
// 왜 SSOT 로 뽑았나: 두 화면 모두 `duty, job_duty, responsibility, rank, grade,
// level, base, meal, resigned_reason, resign_reason, profile_photo_url` 같은
// **D1 에 존재하지 않는 레거시 컬럼**을 셀렉트에 나열하고 있었다. `/api/d1/query`
// 는 컬럼명을 `sql.identifier` 로 큰따옴표 인용하는데, SQLite 는 "컬럼으로 해석되지
// 않는 큰따옴표 토큰을 문자열 리터럴로 취급"하는 관용 동작이 있어 에러 대신
// `{"\"duty\"": "duty"}` 처럼 **키 이름에 따옴표가 박힌 쓰레기 컬럼**을 돌려줬다.
// 즉 화면은 조용히 undefined 를 읽으며 정상처럼 보였고, 드리프트가 몇 년을 살아남았다.
// 실컬럼만 나열해 그 회색지대를 없애고, 두 화면이 같은 목록을 쓰게 한다.
// ---------------------------------------------------------------------------

/** 증명서 발급 인쇄 컨텍스트용 (급여계열 증명서의 기준급여 포함) */
export const STAFF_CERT_CONTEXT_SELECT = [
  'id',
  'name',
  'company',
  'department',
  'position',
  'role',
  'employee_no',
  'joined_at',
  'join_date',
  'status',
  'resigned_at',
  'resign_date',
  'base_salary',
  'meal_allowance',
  'profile_photo_path',
  'profile_photo_updated_at',
  'avatar_url',
  'photo_url',
  'permissions',
].join(', ');

/** 문서보관함 직원 컨텍스트용 (급여 제외 — 문서 목록 화면에 급여를 실을 이유가 없다) */
export const STAFF_DOC_CONTEXT_SELECT = [
  'id',
  'name',
  'company',
  'department',
  'position',
  'role',
  'employee_no',
  'joined_at',
  'join_date',
  'profile_photo_path',
  'profile_photo_updated_at',
  'avatar_url',
  'photo_url',
].join(', ');

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
