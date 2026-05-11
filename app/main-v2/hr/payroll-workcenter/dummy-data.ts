/**
 * dummy-data.ts — 급여 워크센터 더미 데이터
 *
 * 직원 5명 × 12개월 급여 레코드
 * JM4: any 금지, 명시적 타입
 * JM5: 가상 이름/금액만 사용
 */

// ── 타입 정의 ──────────────────────────────────────────────────────────────────

export type Dept = '간호부' | '행정부' | '진료부';
export type EmpType = '정규직' | '파트타임' | '계약직';
export type PayrollStatus = '완료' | '검토 필요' | '오류';
export type BadgeStatus = 'ok' | 'warn' | 'err';

export interface Employee {
  id: string;
  name: string;
  dept: Dept;
  role: string;
  empType: EmpType;
  hireDate: string;
  baseSalary: number;
  monthlyHours: number;
}

export interface PayrollRecord {
  employeeId: string;
  yearMonth: string;
  baseSalary: number;
  overtimePay: number;
  nightPay: number;
  holidayPay: number;
  mealAllowance: number;
  transportAllowance: number;
  totalEarnings: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  incomeTax: number;
  totalDeductions: number;
  netPay: number;
  status: PayrollStatus;
}

export interface PayrollIssue {
  type: BadgeStatus;
  employeeId: string;
  message: string;
}

export interface RetirementRecord {
  employeeId: string;
  dept: Dept;
  hireDate: string;
  retireDate: string;
  yearsOfService: string;
  severancePay: number;
  status: '검토 중' | '확정';
}

export interface UnpaidAllowance {
  employeeId: string;
  allowanceType: string;
  date: string;
  amount: number;
  reason: string;
}

export interface UnpaidDeductRecord {
  employeeId: string;
  absentDays: number;
  dailyRate: number;
  deductAmount: number;
  confirmed: boolean;
}

export interface InsuranceRecord {
  employeeId: string;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  totalDeduction: number;
  hasIssue: boolean;
  issueNote?: string;
}

export interface WagePeakRecord {
  employeeId: string;
  age: number;
  peakAge: number;
  rate: number;
  prevBaseSalary: number;
  currentBaseSalary: number;
  reduction: number;
}

export interface ScheduleItem {
  label: string;
  date: string;
  status: 'done' | 'upcoming' | 'pending';
}

// ── 직원 마스터 ────────────────────────────────────────────────────────────────

export const EMPLOYEES: Employee[] = [
  { id: 'E001', name: '직원1', dept: '간호부',  role: '간호사',   empType: '정규직',   hireDate: '2020-03-01', baseSalary: 2_800_000, monthlyHours: 209 },
  { id: 'E002', name: '직원2', dept: '행정부',  role: '행정직',   empType: '정규직',   hireDate: '2019-07-01', baseSalary: 3_200_000, monthlyHours: 209 },
  { id: 'E003', name: '직원3', dept: '진료부',  role: '의사',     empType: '정규직',   hireDate: '2018-01-15', baseSalary: 4_500_000, monthlyHours: 174 },
  { id: 'E004', name: '직원4', dept: '간호부',  role: '간호조무사', empType: '파트타임', hireDate: '2022-05-01', baseSalary: 2_500_000, monthlyHours: 174 },
  { id: 'E005', name: '직원5', dept: '행정부',  role: '원무과',   empType: '계약직',   hireDate: '2023-03-01', baseSalary: 3_000_000, monthlyHours: 209 },
];

// ── 급여 레코드 (2026-04 기준) ─────────────────────────────────────────────────

export const PAYROLL_RECORDS: PayrollRecord[] = [
  {
    employeeId: 'E001', yearMonth: '2026-04',
    baseSalary: 2_800_000, overtimePay: 180_000, nightPay: 120_000, holidayPay: 50_000,
    mealAllowance: 150_000, transportAllowance: 0,
    totalEarnings: 3_300_000,
    nationalPension: 126_000, healthInsurance: 99_400, longTermCare: 12_860,
    employmentInsurance: 25_200, incomeTax: 161_400,
    totalDeductions: 424_860, netPay: 2_875_140,
    status: '오류',
  },
  {
    employeeId: 'E002', yearMonth: '2026-04',
    baseSalary: 3_200_000, overtimePay: 100_000, nightPay: 60_000, holidayPay: 40_000,
    mealAllowance: 200_000, transportAllowance: 200_000,
    totalEarnings: 3_800_000,
    nationalPension: 144_000, healthInsurance: 113_600, longTermCare: 14_700,
    employmentInsurance: 28_800, incomeTax: 193_600,
    totalDeductions: 494_700, netPay: 3_305_300,
    status: '완료',
  },
  {
    employeeId: 'E003', yearMonth: '2026-04',
    baseSalary: 4_500_000, overtimePay: 215_000, nightPay: 0, holidayPay: 285_000,
    mealAllowance: 200_000, transportAllowance: 0,
    totalEarnings: 5_200_000,
    nationalPension: 202_500, healthInsurance: 159_900, longTermCare: 20_690,
    employmentInsurance: 40_500, incomeTax: 418_000,
    totalDeductions: 841_590, netPay: 4_358_410,
    status: '완료',
  },
  {
    employeeId: 'E004', yearMonth: '2026-04',
    baseSalary: 2_500_000, overtimePay: 80_000, nightPay: 60_000, holidayPay: 160_000,
    mealAllowance: 150_000, transportAllowance: 0,
    totalEarnings: 2_950_000,
    nationalPension: 112_500, healthInsurance: 88_800, longTermCare: 11_480,
    employmentInsurance: 22_500, incomeTax: 137_000,
    totalDeductions: 372_280, netPay: 2_577_720,
    status: '검토 필요',
  },
  {
    employeeId: 'E005', yearMonth: '2026-04',
    baseSalary: 3_000_000, overtimePay: 0, nightPay: 0, holidayPay: 0,
    mealAllowance: 150_000, transportAllowance: 0,
    totalEarnings: 3_150_000,
    nationalPension: 135_000, healthInsurance: 106_600, longTermCare: 13_780,
    employmentInsurance: 27_000, incomeTax: 162_700,
    totalDeductions: 445_080, netPay: 2_704_920,
    status: '완료',
  },
];

// ── 이슈 목록 ──────────────────────────────────────────────────────────────────

export const PAYROLL_ISSUES: PayrollIssue[] = [
  { type: 'err',  employeeId: 'E001', message: '직원1 — 최저임금 미달 (₩9,620/h → ₩10,030/h 필요)' },
  { type: 'warn', employeeId: 'E002', message: '직원2 — 4대보험 정산 차이 ₩12,000 발생' },
  { type: 'warn', employeeId: 'E004', message: '직원4 — 무급결근 3일 차감 확인 필요' },
];

// ── 퇴직정산 ──────────────────────────────────────────────────────────────────

export const RETIREMENT_RECORDS: RetirementRecord[] = [
  { employeeId: 'E006', dept: '간호부', hireDate: '2018-03-01', retireDate: '2026-04-30', yearsOfService: '8년 1개월', severancePay: 32_400_000, status: '검토 중' },
  { employeeId: 'E007', dept: '진료부', hireDate: '2020-07-15', retireDate: '2026-04-30', yearsOfService: '5년 9개월', severancePay: 18_700_000, status: '확정' },
];

// ── 미지급 수당 ────────────────────────────────────────────────────────────────

export const UNPAID_ALLOWANCES: UnpaidAllowance[] = [
  { employeeId: 'E003', allowanceType: '연장수당', date: '04-15', amount: 48_000,  reason: '입력 누락' },
  { employeeId: 'E009', allowanceType: '휴일수당', date: '04-22', amount: 96_000,  reason: '승인 대기' },
  { employeeId: 'E011', allowanceType: '야간수당', date: '04-28', amount: 62_000,  reason: '집계 오류' },
];

// ── 무급결근차감 ───────────────────────────────────────────────────────────────

export const UNPAID_DEDUCTIONS: UnpaidDeductRecord[] = [
  { employeeId: 'E013', absentDays: 3, dailyRate: 133_333, deductAmount: 400_000, confirmed: false },
  { employeeId: 'E017', absentDays: 1, dailyRate: 152_381, deductAmount: 152_381, confirmed: true  },
];

// ── 4대보험 ───────────────────────────────────────────────────────────────────

export const INSURANCE_RECORDS: InsuranceRecord[] = [
  { employeeId: 'E001', nationalPension: 126_000, healthInsurance: 99_400,  longTermCare: 12_860, employmentInsurance: 25_200, totalDeduction: 263_460, hasIssue: false },
  { employeeId: 'E002', nationalPension: 144_000, healthInsurance: 113_600, longTermCare: 14_700, employmentInsurance: 28_800, totalDeduction: 313_100, hasIssue: true,  issueNote: '차이 ₩12,000' },
  { employeeId: 'E003', nationalPension: 202_500, healthInsurance: 159_900, longTermCare: 20_690, employmentInsurance: 40_500, totalDeduction: 423_590, hasIssue: false },
  { employeeId: 'E004', nationalPension: 112_500, healthInsurance: 88_800,  longTermCare: 11_480, employmentInsurance: 22_500, totalDeduction: 235_280, hasIssue: false },
  { employeeId: 'E005', nationalPension: 135_000, healthInsurance: 106_600, longTermCare: 13_780, employmentInsurance: 27_000, totalDeduction: 282_380, hasIssue: false },
];

// ── 임금피크제 ────────────────────────────────────────────────────────────────

export const WAGE_PEAK_RECORDS: WagePeakRecord[] = [
  { employeeId: 'E020', age: 58, peakAge: 57, rate: 80, prevBaseSalary: 4_200_000, currentBaseSalary: 3_360_000, reduction: 840_000 },
  { employeeId: 'E021', age: 59, peakAge: 57, rate: 70, prevBaseSalary: 3_800_000, currentBaseSalary: 2_660_000, reduction: 1_140_000 },
];

// ── 급여 일정 ─────────────────────────────────────────────────────────────────

export const SCHEDULE_ITEMS: ScheduleItem[] = [
  { label: '4월분 급여 마감',  date: '04-30', status: 'done'     },
  { label: '원천징수 신고',    date: '05-10', status: 'upcoming' },
  { label: '4대보험 납부',     date: '05-10', status: 'pending'  },
  { label: '퇴직연금 납입',   date: '05-15', status: 'pending'  },
];

// ── 대시보드 요약 ──────────────────────────────────────────────────────────────

export const DASHBOARD_SUMMARY = {
  targetCount:    42,
  totalPayAmount: 128_400_000,
  issueCount:     3,
  completionRate: 67,
  stepStatus: {
    settlement: 'done'    as const,
    ledger:     'active'  as const,
    verify:     'pending' as const,
    output:     'pending' as const,
  },
} as const;

// ── 원천징수 요약 ──────────────────────────────────────────────────────────────

export const WITHHOLDING_SUMMARY = {
  incomeTaxTotal:      4_230_000,
  localIncomeTaxTotal: 423_000,
  targetCount:         42,
};

// ── 퇴직연금 요약 ─────────────────────────────────────────────────────────────

export const RETIREMENT_PENSION_SUMMARY = {
  dcMemberCount:     38,
  plannedAmount:     42_800_000,
  paymentDate:       '04-15',
};

// ── 유틸: 직원명 조회 ──────────────────────────────────────────────────────────

export function getEmployeeName(employeeId: string): string {
  const found = EMPLOYEES.find((e) => e.id === employeeId);
  return found?.name ?? employeeId;
}

export function getEmployeeDept(employeeId: string): string {
  const found = EMPLOYEES.find((e) => e.id === employeeId);
  return found?.dept ?? '-';
}

export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}
