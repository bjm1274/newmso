/**
 * 직원 등록/수정 폼 타입 & 수동 검증 함수
 * - 면허/자격증 다중 입력
 * - 직종 다중 선택
 * - 근무유형 다중 선택
 * Note: zod 미설치 환경 — 수동 검증 함수 사용 (validateStaffRegistration)
 */

// ─── 면허/자격증 ───────────────────────────────────────────────────────────────

export const LICENSE_TYPE_OPTIONS = [
  '간호사면허',
  '방사선사면허',
  '물리치료사면허',
  '임상병리사면허',
  '간호조무사자격',
  '약사면허',
  '의사면허',
  '응급구조사자격',
  '영양사면허',
  '조리사면허',
  '기타',
] as const;

export type LicenseType = (typeof LICENSE_TYPE_OPTIONS)[number];

export type LicenseRow = {
  /** 클라이언트 임시 key (crypto.randomUUID 등) */
  _key: string;
  license_type: LicenseType | null | undefined;
  license_name: string | null | undefined;
  license_number: string | null | undefined;
  issued_date: string | null | undefined;
  expiry_date: string | null | undefined;
  issuing_body: string | null | undefined;
  memo: string | null | undefined;
  is_primary: boolean;
};

/** 비어있는 면허 row 판별 (모든 선택적 필드가 falsy) */
export function isEmptyLicenseRow(row: LicenseRow): boolean {
  return !row.license_type &&
    !row.license_name &&
    !row.license_number &&
    !row.issued_date &&
    !row.expiry_date &&
    !row.issuing_body &&
    !row.memo;
}

export function createEmptyLicenseRow(isPrimary = false): LicenseRow {
  return {
    _key: crypto.randomUUID(),
    license_type: null,
    license_name: '',
    license_number: '',
    issued_date: '',
    expiry_date: '',
    issuing_body: '',
    memo: '',
    is_primary: isPrimary };
}

// ─── 직종 ──────────────────────────────────────────────────────────────────────

export type JobCategory = {
  id: string;
  code: string;
  name: string;
  is_medical_staff: boolean;
  display_order: number;
};

export type SelectedJobCategory = {
  job_category_id: string;
  is_primary: boolean;
};

// ─── 근무유형 배정 ─────────────────────────────────────────────────────────────

export type SelectedShiftAssignment = {
  shift_id: string;
  is_primary: boolean;
  priority: number;
};

// ─── 검증 입력 타입 ────────────────────────────────────────────────────────────

export type StaffRegistrationValidateInput = {
  성명?: string;
  입사일?: string;
  이메일?: string;
  licenses?: LicenseRow[];
  jobCategories?: SelectedJobCategory[];
  shiftAssignments?: SelectedShiftAssignment[];
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 폼 submit 직전 검증
 * - 필수: 성명, 입사일
 * - 면허: 1개 이상 입력 시 대표 1개 필수
 * - 직종: 1개 이상 선택 시 주직종 1개 필수
 * - 근무유형: 1개 이상 선택 시 주근무유형 1개 필수
 */
export function validateStaffRegistration(
  data: StaffRegistrationValidateInput,
): ValidationResult {
  if (!data.성명 || !data.성명.trim()) {
    return { ok: false, message: '성명은 필수입니다' };
  }
  if (!data.입사일 || data.입사일.trim() === '') {
    return { ok: false, message: '입사일은 필수입니다' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.입사일)) {
    return { ok: false, message: '입사일 날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' };
  }
  if (data.이메일 && data.이메일.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.이메일)) {
    return { ok: false, message: '올바른 이메일 형식이 아닙니다' };
  }

  // 면허: 빈 row 제외 후 1개 이상이면 대표 1개 필수
  const filledLicenses = (data.licenses ?? []).filter(
    (l) => l.license_type || l.license_name || l.license_number,
  );
  if (filledLicenses.length > 0) {
    const primaryCount = filledLicenses.filter((l) => l.is_primary).length;
    if (primaryCount !== 1) {
      return {
        ok: false,
        message: '면허/자격증을 1개 이상 입력한 경우 대표 면허를 1개 지정해야 합니다' };
    }
  }

  // 직종: 1개 이상 선택 시 주직종 1개 필수
  const selectedJobs = data.jobCategories ?? [];
  if (selectedJobs.length > 0) {
    const primaryCount = selectedJobs.filter((j) => j.is_primary).length;
    if (primaryCount !== 1) {
      return {
        ok: false,
        message: '직종을 선택한 경우 주직종을 1개 지정해야 합니다' };
    }
  }

  // 근무유형: 1개 이상 선택 시 주근무유형 1개 필수
  const selectedShifts = data.shiftAssignments ?? [];
  if (selectedShifts.length > 0) {
    const primaryCount = selectedShifts.filter((s) => s.is_primary).length;
    if (primaryCount !== 1) {
      return {
        ok: false,
        message: '근무유형을 선택한 경우 주근무유형을 1개 지정해야 합니다' };
    }
  }

  return { ok: true };
}
