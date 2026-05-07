/**
 * 구성원현황 유틸리티 모음
 * - 직원 폼 초기값 생성
 * - 급여 필드 상수
 * - 직원 DB mutation 페이로드 빌더
 * - 주민번호/이름 정규화
 * - 에러 판별 헬퍼
 */

// ─── 폼 초기값 ────────────────────────────────────────────────────────────────

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyStaffForm(selectedCompany?: string) {
  const company = selectedCompany && selectedCompany !== '전체' ? selectedCompany : '';

  return {
    성명: '', 전화번호: '', 내선번호: '', 사업체: company, 팀: '', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 면허번호: '', 취득일자: '', 면허기타내용: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '', 근무형태IDs: [] as string[],
    고용형태: '정규직' as string, 계약종료일: '' as string,
    probation_months: 0,
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0,
    overtime_allowance: 0, night_work_allowance: 0, holiday_work_allowance: 0, annual_leave_pay: 0,
    salary_change_effective_date: getTodayDateKey(), salary_change_reason: '',
    ins_national: true, ins_health: true, ins_employment: true, ins_injury: true, is_basic_living: false, other_welfare: '',
    ins_duru_nuri: false, duru_nuri_start: '', duru_nuri_end: '', is_medical_benefit: false,
    working_hours_per_week: 40, working_days_per_week: 5,
  };
}

// ─── 급여 필드 상수 ────────────────────────────────────────────────────────────

export const TAXABLE_SALARY_FIELDS = [
  { key: 'base_salary', label: '기본급 (월)' },
  { key: 'position_allowance', label: '직책수당' },
  { key: 'overtime_allowance', label: '연장근로수당' },
  { key: 'night_work_allowance', label: '야간근로수당' },
  { key: 'holiday_work_allowance', label: '휴일근로수당' },
  { key: 'annual_leave_pay', label: '연차휴가수당' },
] as const;

export const TAXFREE_SALARY_FIELDS = [
  { key: 'meal_allowance', label: '식대' },
  { key: 'night_duty_allowance', label: '야간 당직수당' },
  { key: 'vehicle_allowance', label: '자가운전' },
  { key: 'childcare_allowance', label: '보육수당' },
  { key: 'research_allowance', label: '연구비' },
  { key: 'other_taxfree', label: '기타 비과세' },
] as const;

// ─── mutation 컬럼 상수 (내부 + export) ────────────────────────────────────────

export const STAFF_MUTATION_ALLOWANCE_COLUMNS = [
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
] as const;

export const STAFF_MUTATION_WORK_CONDITION_COLUMNS = [
  'working_hours_per_week',
  'working_days_per_week',
] as const;

// ─── DB mutation 페이로드 빌더 ─────────────────────────────────────────────────

/**
 * Supabase에 누락 컬럼이 있을 때 해당 컬럼 값을 permissions JSONB 필드로 이동시키는 헬퍼.
 */
export function buildStaffMutationPayload(
  payload: Record<string, unknown>,
  omittedColumns: ReadonlySet<string>,
) {
  if (omittedColumns.size === 0) {
    return payload;
  }

  const nextPayload: Record<string, unknown> = { ...payload };
  const permissions =
    nextPayload.permissions && typeof nextPayload.permissions === 'object' && !Array.isArray(nextPayload.permissions)
      ? { ...(nextPayload.permissions as Record<string, unknown>) }
      : {};
  const fallbackAllowances =
    permissions.payroll_allowances && typeof permissions.payroll_allowances === 'object' && !Array.isArray(permissions.payroll_allowances)
      ? { ...(permissions.payroll_allowances as Record<string, unknown>) }
      : {};
  const fallbackWorkConditions =
    permissions.work_conditions && typeof permissions.work_conditions === 'object' && !Array.isArray(permissions.work_conditions)
      ? { ...(permissions.work_conditions as Record<string, unknown>) }
      : {};

  omittedColumns.forEach((columnName) => {
    if (!(columnName in nextPayload)) return;
    if ((STAFF_MUTATION_ALLOWANCE_COLUMNS as readonly string[]).includes(columnName)) {
      fallbackAllowances[columnName] = nextPayload[columnName];
    }
    if ((STAFF_MUTATION_WORK_CONDITION_COLUMNS as readonly string[]).includes(columnName)) {
      fallbackWorkConditions[columnName] = nextPayload[columnName];
    }
    delete nextPayload[columnName];
  });

  if (Object.keys(fallbackAllowances).length > 0) {
    permissions.payroll_allowances = fallbackAllowances;
  }
  if (Object.keys(fallbackWorkConditions).length > 0) {
    permissions.work_conditions = fallbackWorkConditions;
  }
  nextPayload.permissions = permissions;
  return nextPayload;
}

// ─── 문자열 정규화 ─────────────────────────────────────────────────────────────

export function normalizeResidentNo(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9]/g, '');
}

export function normalizeStaffName(value: string | null | undefined) {
  return String(value || '').trim();
}

// ─── 에러 판별 헬퍼 ────────────────────────────────────────────────────────────

export function isDuplicateStaffIdentityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('duplicate_staff_identity');
}

export function isInvalidIntegerInputError(error: unknown, value?: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.includes('invalid input syntax for type integer')) {
    return false;
  }
  return value === undefined ? true : message.includes(`"${String(value)}"`);
}

export function hasFractionalValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && !Number.isInteger(numeric);
}
