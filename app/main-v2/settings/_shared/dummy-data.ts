/**
 * dummy-data.ts — 관리자 설정 화면 더미 데이터
 *
 * JM4: any 금지, 명시적 타입
 * JM5: 가상 병원명 "샘플병원", 직원명 가명 사용, 카드번호 마스킹
 */

// ── 회사 기본정보 ─────────────────────────────────────────────────────────────

export interface CompanyBasic {
  name: string;
  bizNo: string;
  ceoName: string;
  phone: string;
  address: string;
  logoUrl?: string;
  sealUrl?: string;
}

export const COMPANY_BASIC: CompanyBasic = {
  name: '샘플병원',
  bizNo: '123-45-67890',
  ceoName: '김원장',
  phone: '02-1234-5678',
  address: '서울특별시 강남구 테헤란로 123, 4층',
};

// ── 근무형태 ──────────────────────────────────────────────────────────────────

export type WorkTypeStatus = 'active' | 'inactive';

export interface WorkType {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: WorkTypeStatus;
}

export const WORK_TYPES: WorkType[] = [
  { id: 'WT001', name: '주간 근무',  startTime: '09:00', endTime: '18:00', breakMinutes: 60, status: 'active'   },
  { id: 'WT002', name: '야간 근무',  startTime: '22:00', endTime: '07:00', breakMinutes: 60, status: 'active'   },
  { id: 'WT003', name: '반일 근무',  startTime: '09:00', endTime: '13:00', breakMinutes: 0,  status: 'active'   },
  { id: 'WT004', name: '교대 (구형)', startTime: '08:00', endTime: '20:00', breakMinutes: 90, status: 'inactive' },
];

// ── 법인카드 ──────────────────────────────────────────────────────────────────

export interface CorporateCard {
  id: string;
  /** 항상 마스킹 형태로 저장 — JM5 */
  maskedNumber: string;
  holder: string;
  bank: string;
  limit: number;
  expiry: string;
  active: boolean;
}

export const CORPORATE_CARDS: CorporateCard[] = [
  { id: 'CC001', maskedNumber: '****-****-****-1234', holder: '김원장',  bank: 'KB국민',  limit: 10_000_000, expiry: '2027-08', active: true  },
  { id: 'CC002', maskedNumber: '****-****-****-5678', holder: '이관리',  bank: '신한',    limit:  5_000_000, expiry: '2026-12', active: true  },
  { id: 'CC003', maskedNumber: '****-****-****-9012', holder: '박총무',  bank: '우리',    limit:  3_000_000, expiry: '2025-06', active: false },
];

// ── 계약 템플릿 ───────────────────────────────────────────────────────────────

export type ContractType = '근로계약서' | '비밀유지' | '개인정보동의' | '촉탁계약' | '파트타임';

export interface ContractTemplate {
  id: string;
  name: string;
  type: ContractType;
  version: string;
  updatedAt: string;
  pdfUrl?: string;
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  { id: 'CT001', name: '표준 근로계약서 v3',        type: '근로계약서',   version: 'v3.0', updatedAt: '2026-03-01' },
  { id: 'CT002', name: '비밀유지서약서',             type: '비밀유지',     version: 'v1.2', updatedAt: '2025-11-15' },
  { id: 'CT003', name: '개인정보 수집·이용 동의서',  type: '개인정보동의', version: 'v2.0', updatedAt: '2026-01-10' },
  { id: 'CT004', name: '촉탁의사 계약서',            type: '촉탁계약',     version: 'v1.0', updatedAt: '2025-09-20' },
  { id: 'CT005', name: '파트타임 근로계약서',        type: '파트타임',     version: 'v2.1', updatedAt: '2026-02-28' },
];

// ── 휴가/공휴일 ───────────────────────────────────────────────────────────────

export interface PublicHoliday {
  date: string;
  name: string;
  synced: boolean;
}

export const PUBLIC_HOLIDAYS_2026: PublicHoliday[] = [
  { date: '2026-01-01', name: '신정',         synced: true  },
  { date: '2026-01-28', name: '설날 연휴',    synced: true  },
  { date: '2026-03-01', name: '삼일절',       synced: true  },
  { date: '2026-05-05', name: '어린이날',     synced: true  },
  { date: '2026-05-25', name: '부처님오신날', synced: false },
  { date: '2026-06-06', name: '현충일',       synced: false },
];

// ── 급여기준 ──────────────────────────────────────────────────────────────────

export interface TaxRate {
  name: string;
  rate: number;
  readonly: boolean;
  note?: string;
}

export const TAX_RATES: TaxRate[] = [
  { name: '국민연금',      rate: 4.50, readonly: true,  note: '법정 고정값' },
  { name: '건강보험',      rate: 3.545, readonly: true, note: '법정 고정값' },
  { name: '장기요양보험',  rate: 0.9182, readonly: true, note: '건강보험료의 12.95%' },
  { name: '고용보험',      rate: 0.90, readonly: true,  note: '법정 고정값' },
  { name: '식대 비과세',   rate: 0,    readonly: false, note: '월 20만원 한도' },
];

// ── 직원 권한 ─────────────────────────────────────────────────────────────────

export type PermLevel = 'none' | 'read' | 'write';
export type RoleKey = 'director' | 'admin' | 'manager' | 'staff' | 'parttime';

export interface PermRow {
  employeeId: string;
  name: string;
  role: RoleKey;
  dept: string;
  permCompany: PermLevel;
  permHR: PermLevel;
  permOps: PermLevel;
  permMgmt: PermLevel;
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  director: '원장',
  admin:    '관리자',
  manager:  '팀장',
  staff:    '일반직원',
  parttime: '파트타임',
};

export const PERM_ROWS: PermRow[] = [
  { employeeId: 'E001', name: '김원장', role: 'director', dept: '원장실',  permCompany: 'write', permHR: 'write', permOps: 'write', permMgmt: 'write' },
  { employeeId: 'E002', name: '이관리', role: 'admin',    dept: '행정부',  permCompany: 'write', permHR: 'write', permOps: 'write', permMgmt: 'read'  },
  { employeeId: 'E003', name: '박팀장', role: 'manager',  dept: '간호부',  permCompany: 'read',  permHR: 'read',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E004', name: '최팀장', role: 'manager',  dept: '진료부',  permCompany: 'read',  permHR: 'read',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E005', name: '정직원', role: 'staff',    dept: '간호부',  permCompany: 'none',  permHR: 'none',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E006', name: '한직원', role: 'staff',    dept: '행정부',  permCompany: 'none',  permHR: 'none',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E007', name: '강직원', role: 'staff',    dept: '진료부',  permCompany: 'none',  permHR: 'none',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E008', name: '윤직원', role: 'staff',    dept: '간호부',  permCompany: 'none',  permHR: 'none',  permOps: 'read',  permMgmt: 'none'  },
  { employeeId: 'E009', name: '임파트', role: 'parttime', dept: '행정부',  permCompany: 'none',  permHR: 'none',  permOps: 'none',  permMgmt: 'none'  },
  { employeeId: 'E010', name: '신파트', role: 'parttime', dept: '간호부',  permCompany: 'none',  permHR: 'none',  permOps: 'none',  permMgmt: 'none'  },
];

// ── 운영 설정 (일반) ─────────────────────────────────────────────────────────

export interface GeneralSetting {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const GENERAL_SETTINGS: GeneralSetting[] = [
  { key: 'push_notification',  label: '푸시 알림',       description: '직원에게 앱 푸시 알림 발송',           enabled: true  },
  { key: 'auto_approval',      label: '자동 결재',        description: '24시간 내 미처리 결재 자동 승인',       enabled: false },
  { key: 'overtime_alert',     label: '초과근무 알림',    description: '일 10시간 초과 시 관리자 알림',         enabled: true  },
  { key: 'sms_notice',         label: 'SMS 공지',         description: '긴급 공지 SMS 발송 허용',               enabled: false },
  { key: 'attendance_lock',    label: '근태 잠금',        description: '전월 근태 자동 잠금 (마감 후)',         enabled: true  },
];

// ── 팝업 관리 ─────────────────────────────────────────────────────────────────

export type PopupStatus = 'active' | 'scheduled' | 'expired';

export interface PopupItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  target: '전체' | '관리자' | '직원';
  status: PopupStatus;
}

export const POPUP_ITEMS: PopupItem[] = [
  { id: 'POP001', title: '5월 정기점검 안내',    startDate: '2026-05-12', endDate: '2026-05-12', target: '전체',   status: 'active'    },
  { id: 'POP002', title: '개인정보보호 교육 공지', startDate: '2026-05-15', endDate: '2026-05-20', target: '전체',   status: 'scheduled' },
  { id: 'POP003', title: '급여 지급일 변경 안내', startDate: '2026-04-01', endDate: '2026-04-30', target: '직원',   status: 'expired'   },
];

// ── 결재양식 ──────────────────────────────────────────────────────────────────

export interface ApprovalStep {
  order: number;
  roleName: string;
  type: '검토' | '승인' | '협조';
}

export interface ApprovalForm {
  id: string;
  name: string;
  category: '인사' | '구매' | '업무' | '경비';
  steps: ApprovalStep[];
}

export const APPROVAL_FORMS: ApprovalForm[] = [
  {
    id: 'AF001',
    name: '연차 신청서',
    category: '인사',
    steps: [
      { order: 1, roleName: '팀장',  type: '검토' },
      { order: 2, roleName: '관리자', type: '승인' },
    ],
  },
  {
    id: 'AF002',
    name: '비품 구매 요청서',
    category: '구매',
    steps: [
      { order: 1, roleName: '팀장',  type: '검토' },
      { order: 2, roleName: '총무',  type: '협조' },
      { order: 3, roleName: '원장',  type: '승인' },
    ],
  },
  {
    id: 'AF003',
    name: '초과근무 신청서',
    category: '인사',
    steps: [
      { order: 1, roleName: '팀장',  type: '승인' },
    ],
  },
];

// ── 템플릿 라이브러리 ─────────────────────────────────────────────────────────

export type TemplateCategory = '전체' | '계약서' | '동의서' | '안내문' | '업무양식' | '교육자료';

export interface LibraryTemplate {
  id: string;
  title: string;
  category: Exclude<TemplateCategory, '전체'>;
  description: string;
  fileType: 'DOCX' | 'PDF';
  fileSizeKB: number;
  downloadCount: number;
  updatedAt: string;
  tags: string[];
}

export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  {
    id: 'LT001', title: '표준 근로계약서',
    category: '계약서', description: '정규직 · 계약직 공통 표준 양식',
    fileType: 'DOCX', fileSizeKB: 48, downloadCount: 132, updatedAt: '2026-03-01',
    tags: ['필수', '정규직'],
  },
  {
    id: 'LT002', title: '파트타임 근로계약서',
    category: '계약서', description: '시간제 근로자 전용 계약서',
    fileType: 'DOCX', fileSizeKB: 42, downloadCount: 87, updatedAt: '2026-02-15',
    tags: ['파트타임'],
  },
  {
    id: 'LT003', title: '개인정보 수집·이용 동의서',
    category: '동의서', description: 'GDPR 및 개인정보보호법 준수',
    fileType: 'PDF', fileSizeKB: 120, downloadCount: 210, updatedAt: '2026-01-10',
    tags: ['필수', '개인정보'],
  },
  {
    id: 'LT004', title: '비밀유지서약서',
    category: '동의서', description: '입사 시 필수 서약 양식',
    fileType: 'DOCX', fileSizeKB: 35, downloadCount: 98, updatedAt: '2025-11-20',
    tags: ['입사'],
  },
  {
    id: 'LT005', title: '의료기기 사용 안내문',
    category: '안내문', description: '주요 의료기기 사용법 및 주의사항',
    fileType: 'PDF', fileSizeKB: 340, downloadCount: 45, updatedAt: '2026-02-01',
    tags: ['의료기기'],
  },
  {
    id: 'LT006', title: '업무 인수인계서',
    category: '업무양식', description: '퇴직 · 부서이동 인수인계 양식',
    fileType: 'DOCX', fileSizeKB: 52, downloadCount: 63, updatedAt: '2025-12-15',
    tags: ['퇴직', '이동'],
  },
  {
    id: 'LT007', title: '개인정보보호 교육 자료',
    category: '교육자료', description: '연간 필수 교육 슬라이드 (PPT 기반)',
    fileType: 'PDF', fileSizeKB: 1024, downloadCount: 72, updatedAt: '2026-01-05',
    tags: ['교육', '필수'],
  },
  {
    id: 'LT008', title: '안전보건 교육 자료',
    category: '교육자료', description: '산업안전보건법 기반 교육 자료',
    fileType: 'PDF', fileSizeKB: 780, downloadCount: 55, updatedAt: '2026-03-10',
    tags: ['교육', '안전'],
  },
  {
    id: 'LT009', title: '경비 지출 보고서',
    category: '업무양식', description: '출장 · 접대 · 소모품 등 지출 보고',
    fileType: 'DOCX', fileSizeKB: 38, downloadCount: 91, updatedAt: '2025-10-20',
    tags: ['경비'],
  },
];

// ── 유틸 ─────────────────────────────────────────────────────────────────────

export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

export function formatFileSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  '전체', '계약서', '동의서', '안내문', '업무양식', '교육자료',
];
