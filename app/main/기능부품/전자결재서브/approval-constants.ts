import { STORAGE_KEYS } from '@/lib/storage-keys';

// 전자결재 상수 모음 — 전자결재.tsx에서 분리

export const APPROVAL_VIEWS = ['기안함', '결재함', '참조 문서함', '작성하기'] as const;

export const APPROVER_POSITIONS = [
  '팀장', '간호과장', '실장', '부장', '본부장', '총무부장', '진료부장', '간호부장',
  '이사', '병원장', '원장', '대표',
];

export const BUILTIN_FORM_TYPE_DEFINITIONS = [
  { slug: 'leave', name: '연차/휴가' },
  { slug: 'annual_plan', name: '연차계획서' },
  { slug: 'overtime', name: '연장근무' },
  { slug: 'purchase', name: '물품신청' },
  { slug: 'repair_request', name: '수리요청서' },
  { slug: 'report', name: '보고서작성' },
  { slug: 'draft_business', name: '업무기안' },
  { slug: 'cooperation', name: '업무협조' },
  { slug: 'official_document_dispatch', name: '공문발송' },
  { slug: 'generic', name: '증명서발급' },
  { slug: 'attendance_fix', name: '출결정정' },
  { slug: 'resignation', name: '사직서' },
  { slug: 'severance_extension_agreement', name: '금품청산 지급기일 연장 동의서' },
  { slug: 'retirement_pledge', name: '퇴직 서약서' },
  { slug: 'leave_promotion_notice', name: '연차촉진통보서' },
  { slug: 'probation_evaluation', name: '수습직원평가서' },
  { slug: 'salary_increase_evaluation', name: '급여인상평가서' },
  { slug: 'contract_end_notice', name: '계약종료 통보' },
  { slug: 'dismissal_notice', name: '해고통보' },
  { slug: 'disciplinary_attendance_request', name: '징계위원회 출석요구서' },
] as const;

export const BUILTIN_FORM_TYPE_NAMES = BUILTIN_FORM_TYPE_DEFINITIONS.map((item) => item.name);

export const SYSTEM_FORM_TYPE_SLUGS = new Set([
  ...BUILTIN_FORM_TYPE_DEFINITIONS.map((item) => item.slug),
  'personnel_order',
]);

export const DEFAULT_APPROVAL_TEMPLATE_DESIGN = {
  title: '결재 문서',
  subtitle: '전자결재 승인 문서',
  companyLabel: 'SY INC.',
  primaryColor: '#155eef',
  borderColor: '#d7e3ff',
  footerText: '전자결재 승인 문서입니다.',
  showSignArea: true,
  showBackgroundLogo: true,
  backgroundLogoUrl: '/sy-logo.png',
  backgroundLogoOpacity: 0.055,
  showSeal: true,
  sealLabel: 'SY INC. 직인',
  sealImageUrl: '',
};

export const APPROVAL_OPTIONAL_INSERT_COLUMNS = ['company_id', 'approver_line', 'doc_number'];

export const APPROVAL_REFERENCE_DEFAULTS_KEY = 'approval_reference_defaults';
export const APPROVAL_REFERENCE_ALL_KEY = 'all';
export const ALL_DOCUMENT_FILTER = '전체 문서';
export const APPROVAL_INBOX_HIDDEN_STATUSES = new Set(['회수']);
export const APPROVAL_DRAFT_STORAGE_KEY = STORAGE_KEYS.DRAFT_APPROVAL;
export const LOCAL_APPROVAL_FORM_TYPES_KEY = STORAGE_KEYS.APPROVAL_FORM_TYPES_CUSTOM;
export const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = STORAGE_KEYS.FORM_TEMPLATE_DESIGNS;
