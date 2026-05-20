/**
 * 급여 워크센터 — 타입 정의
 * 13개 모듈 통합 + 대시보드 KPI/점검 구조
 *
 * JM4: any 금지, 모든 union/interface 명시
 */

// ─── 13 모듈 ID (union) ───────────────────────────────────
export type PayrollModuleId =
  | 'settlement'   // 1. 급여 정산
  | 'ledger'       // 2. 급여 대장
  | 'simulator'    // 3. 시뮬레이터
  | 'retirement'   // 4. 퇴직 정산
  | 'pension'      // 5. 퇴직연금
  | 'insurance'    // 6. 4대보험
  | 'withholding'  // 7. 원천징수
  | 'wagePeak'     // 8. 임금피크제
  | 'minWage'      // 9. 최저임금
  | 'taxFree'      // 10. 비과세
  | 'ordinary'     // 11. 통상임금
  | 'unpaid'       // 12. 미지급 수당
  | 'absence';     // 13. 무급결근

// ─── 점검 카드 톤 ─────────────────────────────────────────
export type AlertTone = 'danger' | 'warn' | 'info';

// ─── 모듈 메타 (대시보드 카드용) ─────────────────────────
export interface PayrollModuleMeta {
  id: PayrollModuleId;
  name: string;
  desc: string;
  badge?: string;
  tone?: AlertTone;
}

// ─── 점검 필요 카드 ──────────────────────────────────────
export interface PayrollAlert {
  tag: string;          // 미지급 수당 / 최저임금 ...
  body: string;         // 본문 (이름 포함)
  amount?: string;      // +184,000원 형태
  actionLabel: string;  // 인라인 액션 라벨
  tone: AlertTone;
  // 클릭 시 이동할 모듈 (대시보드에서 setCurrent 위임)
  targetModule?: PayrollModuleId;
}

// ─── KPI 카드 (대시보드 8개) ─────────────────────────────
export interface PayrollKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  iconColor: string; // hex
}

// ─── 진행 5단계 hero ─────────────────────────────────────
export type SettlementStepState = 'done' | 'on' | 'pending';

export interface SettlementStep {
  id: number;
  label: string;
  date: string;
  state: SettlementStepState;
}

// ─── 급여 대장 행 ────────────────────────────────────────
export interface LedgerRow {
  name: string;
  dept: string;
  base: number;       // 기본급
  allowance: number;  // 수당
  deduction: number;  // 공제
  net: number;        // 실수령
}

// ─── 퇴직 정산 행 ────────────────────────────────────────
export interface RetirementRow {
  name: string;
  date: string;
  tenure: string;
  retirementPay: number;
  tax: number;
  net: number;
  status: string;
  tone: 'success' | 'warn' | 'muted';
}

// ─── 4대보험 항목 ────────────────────────────────────────
export interface InsuranceItem {
  name: string;
  employee: number; // 근로자 부담 (천원)
  employer: number; // 사업주 부담
  total: number;
}

// ─── 최저임금 환산 행 ────────────────────────────────────
export interface MinWageRow {
  name: string;
  employType: string;
  currentHourly: number;
  convertedHourly: number;
  status: '미달' | '적합';
}

// ─── 비과세 한도 행 ─────────────────────────────────────
export interface TaxFreeRow {
  label: string;
  amount: string;
  note?: string;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
}

// ─── 미지급 수당 row ────────────────────────────────────
export interface UnpaidRow {
  category: string; // 야간수당 / 휴일근로 ...
  name: string;
  detail: string;
  amount: number;
  tone: 'danger' | 'warn';
  actionLabel: string;
}
