// ============================================================
// education-types.ts
// 교육 관련 타입 및 상수 정의 (education-utils.ts 에서 분리)
// ============================================================

// ──────────────────────────────────────────────────────────────
// Supabase 클라이언트 최소 인터페이스 (any 대체)
// ──────────────────────────────────────────────────────────────
export interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: SupabaseError | null;
}

export interface SupabaseError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

// SupabaseLike: 실제 SupabaseClient와 호환되도록 from() 반환을 any로 허용
// (PostgrestQueryBuilder 제네릭이 복잡하여 구조 매칭이 어려움)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = Pick<import('@supabase/supabase-js').SupabaseClient<any, 'public', any>, 'from'>;

// ──────────────────────────────────────────────────────────────
// 교육 분류 타입
// ──────────────────────────────────────────────────────────────

/** @deprecated hospital/company 분류는 직종 코드 기반으로 이전 예정. appliesTo 필드를 사용하세요. */
export type EducationCategory = 'hospital' | 'company' | 'common';

export type ObligationType = 'legal' | 'recommended';

export interface EducationItem {
  /** 교육 식별 코드 */
  code: string;
  /** 교육 항목 이름 */
  name: string;
  /**
   * @deprecated hospital/company 분류는 직종 코드 기반으로 이전 예정.
   * 기존 호출부 호환을 위해 유지.
   */
  category: EducationCategory;
  /** 법정의무 여부 */
  obligation: ObligationType;
  /**
   * 적용 직종: 'all' 이면 전 직종,
   * string[] 이면 job_categories.code 배열
   */
  appliesTo: 'all' | string[];
  /** 갱신 주기 (개월) */
  cycleMonths?: number;
  /** 법적 근거 */
  legalBasis?: string;
}

export interface EducationCompletionEntry {
  is_completed: boolean;
  certificate_url?: string | null;
}

export interface EducationCompletionLikeRow {
  staff_id: string | number;
  education_name: string;
  certificate_url?: string | null;
}

export interface EducationRecordRow {
  staff_id: string | number;
  education_name: string;
  status?: string | null;
  completed_at?: string | null;
  certificate_url?: string | null;
}

export interface EducationAlert {
  id: string | number;
  name: string;
  education: string;
  dueDate: string;
  daysLeft: number;
  type: 'URGENT' | 'PENDING';
}

export interface EducationSummary {
  totalStaffCount: number;
  totalRequiredCount: number;
  completedCount: number;
  pendingAssignmentCount: number;
  pendingStaffCount: number;
  urgentStaffCount: number;
  completionRate: number;
  focusItems: Array<{ name: string; count: number }>;
}

export interface LicenseLikeRow {
  id: string | number;
  staff_id: string | number;
  license_name: string;
  license_number?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  issuing_body?: string | null;
  memo?: string | null;
  source?: 'staff_licenses' | 'staff_members';
}

export interface StaffLike {
  department?: string | null;
  team?: string | null;
  부서?: string | null;
  position?: string | null;
  job_title?: string | null;
  직함?: string | null;
}

export interface StaffMemberLike {
  id?: string | number;
  license?: string;
  license_expiry_date?: string;
  license_issuer?: string;
  permissions?: {
    license_no?: string;
    license_date?: string;
    license_expiry_date?: string;
    license_expiry?: string;
    license_issuer?: string;
    license_org?: string;
    license_note?: string;
  };
}

// ──────────────────────────────────────────────────────────────
// 교육 항목 상수
// ──────────────────────────────────────────────────────────────

const MEDICAL_STAFF_CODES = [
  'doctor', 'nurse', 'nurse_assistant', 'radiologist',
  'physical_therapist', 'occupational_therapist',
  'clinical_pathologist', 'pharmacist', 'nutritionist', 'social_worker',
] as const;

export const EDUCATION_ITEMS: EducationItem[] = [
  // ── 법정의무 / 전 직종 공통 ──────────────────────────────
  {
    code: 'sexual_harass',
    name: '성희롱예방',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'common',
    obligation: 'legal',
    appliesTo: 'all',
    cycleMonths: 12,
    legalBasis: '남녀고용평등법 제13조',
  },
  {
    code: 'personal_info',
    name: '개인정보보호',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'common',
    obligation: 'legal',
    appliesTo: 'all',
    cycleMonths: 12,
    legalBasis: '개인정보보호법 제28조',
  },
  {
    code: 'disability_aware',
    name: '직장 내 장애인 인식개선',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'company',
    obligation: 'legal',
    appliesTo: 'all',
    cycleMonths: 12,
    legalBasis: '장애인고용촉진 및 직업재활법 제5조의2',
  },
  {
    code: 'workplace_bullying',
    name: '직장 내 괴롭힘 방지',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'company',
    obligation: 'recommended',
    appliesTo: 'all',
    cycleMonths: 12,
  },
  {
    code: 'osha',
    name: '산업안전보건(일반)',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'company',
    obligation: 'legal',
    appliesTo: 'all',
    cycleMonths: 12,
    legalBasis: '산업안전보건법 제29조',
  },
  // ── 권장/내부 또는 의료기관 인증평가 ─────────────────────
  {
    code: 'infection_control',
    name: '감염관리 교육',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'recommended',
    appliesTo: [...MEDICAL_STAFF_CODES],
    cycleMonths: 12,
  },
  {
    code: 'patient_safety',
    name: '환자안전·의료사고 예방',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'recommended',
    appliesTo: [...MEDICAL_STAFF_CODES],
    cycleMonths: 12,
  },
  {
    code: 'medical_law_ethics',
    name: '의료법·의료윤리 교육',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'recommended',
    appliesTo: [
      'doctor', 'nurse', 'nurse_assistant', 'radiologist',
      'physical_therapist', 'occupational_therapist',
      'clinical_pathologist', 'pharmacist',
    ],
    cycleMonths: 12,
  },
  {
    code: 'narcotics_handling',
    name: '마약류 취급자 교육(해당자)',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'legal',
    appliesTo: ['doctor', 'pharmacist'],
    cycleMonths: 12,
  },
  {
    code: 'child_abuse_report',
    name: '아동학대신고',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'legal',
    appliesTo: ['doctor', 'nurse', 'nurse_assistant', 'social_worker'],
    cycleMonths: 12,
  },
  {
    code: 'elder_abuse_report',
    name: '노인학대신고',
    /** @deprecated 직종 코드 기반 분류로 이전 예정 */
    category: 'hospital',
    obligation: 'legal',
    appliesTo: ['doctor', 'nurse', 'nurse_assistant', 'social_worker'],
    cycleMonths: 12,
  },
];

export const EDUCATION_DEADLINES: Record<string, { month: number; day: number }> = {
  성희롱예방: { month: 6, day: 30 },
  개인정보보호: { month: 6, day: 30 },
  '직장 내 장애인 인식개선': { month: 6, day: 30 },
  '직장 내 괴롭힘 방지': { month: 6, day: 30 },
  '산업안전보건(일반)': { month: 9, day: 30 },
  '감염관리 교육': { month: 3, day: 31 },
  '환자안전·의료사고 예방': { month: 3, day: 31 },
  '의료법·의료윤리 교육': { month: 3, day: 31 },
  '마약류 취급자 교육(해당자)': { month: 5, day: 31 },
  아동학대신고: { month: 3, day: 31 },
  노인학대신고: { month: 3, day: 31 },
};
