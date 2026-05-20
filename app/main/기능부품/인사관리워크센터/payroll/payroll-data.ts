/**
 * 급여 워크센터 — 더미 데이터
 * 실 API 연결 전 골격 렌더용. JM3: 후속 fetch 도입 시 폴백으로 사용 가능.
 */

import type {
  PayrollModuleMeta,
  PayrollAlert,
  PayrollKpi,
  SettlementStep,
  LedgerRow,
  RetirementRow,
  InsuranceItem,
  MinWageRow,
  TaxFreeRow,
  UnpaidRow,
} from './payroll-types';

// ─── 13 모듈 메타 ────────────────────────────────────────
export const PAYROLL_MODULES: PayrollModuleMeta[] = [
  { id: 'settlement', name: '급여 정산',      desc: '월별 정산 워크플로',     badge: '진행 중', tone: 'warn' },
  { id: 'ledger',     name: '급여 대장',      desc: '월별 직원별 내역' },
  { id: 'simulator',  name: '급여 시뮬레이터', desc: '예상 지급액 미리보기' },
  { id: 'retirement', name: '퇴직 정산',      desc: '정산서·중간정산' },
  { id: 'pension',    name: '퇴직연금',       desc: 'DC/DB 가입자 현황' },
  { id: 'insurance',  name: '4대보험',        desc: 'EDI 신고·증명서',       badge: '5/22', tone: 'warn' },
  { id: 'withholding',name: '원천징수',       desc: '파일 생성·연말정산',    badge: '5/20', tone: 'warn' },
  { id: 'wagePeak',   name: '임금피크제',     desc: '적용 대상·비율',        badge: '1명',  tone: 'info' },
  { id: 'minWage',    name: '최저임금 점검',  desc: '2026 시급 검증',        badge: '2건',  tone: 'danger' },
  { id: 'taxFree',    name: '비과세 점검',    desc: '식대·교통비 한도' },
  { id: 'ordinary',   name: '통상임금 계산기', desc: '평균임금·연차수당' },
  { id: 'unpaid',     name: '미지급 수당 점검', desc: '야간·휴일·연장',      badge: '1건',  tone: 'danger' },
  { id: 'absence',    name: '무급결근 차감',  desc: '자동 차감 규칙' },
];

// ─── 정산 진행 5단계 (이번 달) ────────────────────────────
export const SETTLEMENT_STEPS: SettlementStep[] = [
  { id: 1, label: '근태 마감',     date: '5/3',       state: 'done' },
  { id: 2, label: '수당·공제',     date: '5/7',       state: 'done' },
  { id: 3, label: '결재 상신',     date: '5/10',      state: 'done' },
  { id: 4, label: '지급 처리',     date: '예정 5/15', state: 'on' },
  { id: 5, label: '원천징수 신고', date: '예정 5/20', state: 'pending' },
];

// ─── 8 KPI ─────────────────────────────────────────────
export const PAYROLL_KPIS: PayrollKpi[] = [
  { key: 'target',   label: '정산 대상자',   value: '27',         unit: '명',   sub: '상시 25 · 시급 2',          iconColor: '#3B82F6' },
  { key: 'hours',    label: '총 근로시간',   value: '4,632',      unit: 'h',    sub: '초과 312h · 야간 184h',     iconColor: '#F59E0B' },
  { key: 'base',     label: '기본급 합계',   value: '94,200,000', unit: '원',   sub: '전월 대비 +1.2%',           iconColor: '#10B981' },
  { key: 'allow',    label: '수당',          value: '22,150,000', unit: '원',   sub: '초과 14M · 야간 6M · 기타 2M', iconColor: '#8B5CF6' },
  { key: 'deduct',   label: '공제',          value: '18,900,000', unit: '원',   sub: '4대보험 14M · 소득세 4.9M', iconColor: '#EF4444' },
  { key: 'insure',   label: '4대보험 신고',  value: '5/22',       unit: '예정', sub: '국민·건강·고용·산재',       iconColor: '#EC4899' },
  { key: 'with',     label: '원천징수 신고', value: '5/20',       unit: '예정', sub: '간이 25 · 일반 2',          iconColor: '#06B6D4' },
  { key: 'reserve',  label: '퇴직금 충당',   value: '4,820,000',  unit: '원',   sub: 'DC형 19 · DB형 8',          iconColor: '#7C3AED' },
];

// ─── 점검 필요 5건 ──────────────────────────────────────
export const PAYROLL_ALERTS: PayrollAlert[] = [
  { tag: '미지급 수당', body: '홍자비 · 야간수당 12시간 미반영 (4월)', amount: '+ 184,000원', actionLabel: '반영 처리', tone: 'danger', targetModule: 'unpaid' },
  { tag: '최저임금',    body: '시급 직원 2명 2026 최저시급 미달 가능성 (시급 9,800원 / 기준 10,030원)',          actionLabel: '시뮬레이션', tone: 'warn',   targetModule: 'minWage' },
  { tag: '통상임금',    body: '정기상여 포함 재산정 필요 — 평균 통상임금 변동 +3.2%',                            actionLabel: '계산기',    tone: 'warn',   targetModule: 'ordinary' },
  { tag: '무급결근',    body: '이나림 · 5월 1일(노동절) 결근 차감 확정 (-127,000원)',                            actionLabel: '상세',      tone: 'info',   targetModule: 'absence' },
  { tag: '임금피크',    body: '박철홍 임금피크 적용일 (만 60세 도래) — 6월부터 80% 적용',                       actionLabel: '설정',      tone: 'info',   targetModule: 'wagePeak' },
];

// ─── 급여 대장 ──────────────────────────────────────────
export const LEDGER_ROWS: LedgerRow[] = [
  { name: '박철홍', dept: '진료팀',   base: 8_500_000, allowance: 1_200_000, deduction: 1_450_000, net: 8_250_000 },
  { name: '김지오', dept: '병동팀',   base: 4_200_000, allowance: 1_480_000, deduction:   890_000, net: 4_790_000 },
  { name: '이나림', dept: '외래팀',   base: 3_800_000, allowance: 1_240_000, deduction:   812_000, net: 4_228_000 },
  { name: '백민',   dept: '경영지원', base: 3_200_000, allowance:   450_000, deduction:   620_000, net: 3_030_000 },
  { name: '박유진', dept: '경영지원', base: 3_600_000, allowance:   680_000, deduction:   742_000, net: 3_538_000 },
  { name: '홍자비', dept: '경영지원', base: 2_900_000, allowance:   420_000, deduction:   548_000, net: 2_772_000 },
  { name: '송소현', dept: '외래팀',   base: 2_800_000, allowance:   380_000, deduction:   524_000, net: 2_656_000 },
];

// ─── 퇴직 정산 ──────────────────────────────────────────
export const RETIREMENT_ROWS: RetirementRow[] = [
  { name: '이종도', date: '2026.4.30', tenure: '1년 8개월', retirementPay: 18_420_000, tax:    892_000, net: 17_528_000, status: '완료',     tone: 'success' },
  { name: '경조원', date: '2026.5.15', tenure: '4년 2개월', retirementPay: 38_260_000, tax:  2_840_000, net: 35_420_000, status: '세액 대기', tone: 'warn'    },
  { name: '(예정)', date: '2026.6.30', tenure: '8년',       retirementPay: 64_820_000, tax:  7_912_000, net: 56_908_000, status: '예정',     tone: 'muted'   },
];

// ─── 4대보험 ───────────────────────────────────────────
export const INSURANCE_ITEMS: InsuranceItem[] = [
  { name: '국민연금', employee: 5810, employer: 5810, total: 11620 },
  { name: '건강보험', employee: 4582, employer: 4582, total:  9164 },
  { name: '고용보험', employee:  890, employer: 1156, total:  2046 },
  { name: '산재보험', employee:    0, employer: 1247, total:  1247 },
];

// ─── 최저임금 ──────────────────────────────────────────
export const MIN_WAGE_ROWS: MinWageRow[] = [
  { name: '조혜원', employType: '시급직', currentHourly:  9800, convertedHourly:  9912, status: '미달' },
  { name: '이다혜', employType: '시급직', currentHourly:  9900, convertedHourly:  9988, status: '미달' },
  { name: '박술',   employType: '일용',   currentHourly: 10200, convertedHourly: 10400, status: '적합' },
];

// ─── 비과세 항목 (8개) ─────────────────────────────────
export const TAXFREE_ROWS: TaxFreeRow[] = [
  { label: '식대',              amount: '200,000', note: '원/월 · 27명 적용',    tone: 'accent' },
  { label: '교통비',            amount: '200,000', note: '원/월 · 8명 적용',     tone: 'accent' },
  { label: '생산직 야간수당',   amount: '240,000', note: '원/월',                 tone: 'success' },
  { label: '자가운전 보조',     amount: '미적용',  note: '신청 시 활성화',        tone: 'warning' },
  { label: '출장비 식대',       amount: '100,000', note: '원/일',                 tone: 'neutral' },
  { label: '경조·휴양 수당',    amount: '한도 없음', tone: 'neutral' },
  { label: '연구 활동비',       amount: '200,000', note: '원/월 · 비과세',        tone: 'neutral' },
  { label: '학자금 지원',       amount: '한도 없음', note: '교육법 인가 기관', tone: 'neutral' },
];

// ─── 미지급 수당 ───────────────────────────────────────
export const UNPAID_ROWS: UnpaidRow[] = [
  { category: '야간수당', name: '홍자비', detail: '4월 야간 12h 미반영',             amount: 184_000, tone: 'danger', actionLabel: '반영' },
  { category: '휴일근로', name: '이나림', detail: '5/5 출근 8h · 대체휴 미사용',     amount: 126_400, tone: 'warn',   actionLabel: '대체휴' },
];

// ─── 정산 요약 (hero 우측) ────────────────────────────
export const SETTLEMENT_SUMMARY = {
  month: '2026년 5월',
  totalAmount: 128_450_000,
  totalAmountLabel: '128,450,000',
  headCount: 27,
  diffPct: '+2.1%',
  ctaLabel: '5/15 지급 처리 시작',
};
