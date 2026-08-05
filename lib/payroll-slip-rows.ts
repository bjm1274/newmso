/**
 * 급여명세서 공제 항목 구성 (SSOT).
 *
 * 8차 D12-007: 같은 공제표가 PC(`급여명세/급여상세.tsx`)와
 * 모바일(`마이페이지/급여명세서/모바일명세서.tsx`)에 따로 구현돼 있었다.
 * 두 사본은 **데이터 소스까지 갈라져** 있었다 —
 *   PC   : deduction_detail(정산 시 저장한 JSON) → record 컬럼 → 계산 폴백
 *   모바일: record 컬럼만
 * 그리고 항목 구성 자체가 달라(모바일에는 '기타 공제' 가 없고 PC 에는 가불금이 없었다)
 * 양쪽 모두 "지급총액 − 공제총액 = 실지급액" 이 성립하지 않았다.
 *
 * 여기서는 **항목·라벨·순서·합계 규칙**과 **금액 해석 규칙**을 한 벌로 고정한다.
 * 라벨과 순서가 갈라지면 같은 사람이 PC 와 모바일에서 다른 명세서를 보게 되고,
 * 그게 급여 신뢰 문제로 직결되기 때문이다.
 *
 * **의도적으로 통합하지 않은 것**: PC 에만 있는 "4대보험 계산 폴백"
 * (`calculateEmployeeInsuranceDeductions`). 워크센터처럼 deduction_detail 을 조회하지 않는
 * 관리자 화면에서 표를 비우지 않으려는 장치인데, 직원 본인이 보는 모바일 명세서에서
 * 저장값이 없을 때 추정치를 실제 공제액인 양 보여주는 것은 다른 문제다.
 * 그래서 폴백은 호출자가 명시적으로 넘길 때만 적용한다.
 */

export type PayrollSlipAmountRow = { label: string; value: number; isTaxFree?: boolean };

export type PayrollDeductionAmounts = {
  pension: number;
  health: number;
  longTerm: number;
  employment: number;
  incomeTax: number;
  localTax: number;
  attendanceDeduction: number;
  customDeduction: number;
  advancePay: number;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type PayrollDeductionSource = {
  national_pension?: unknown;
  health_insurance?: unknown;
  long_term_care?: unknown;
  employment_insurance?: unknown;
  income_tax?: unknown;
  local_tax?: unknown;
  attendance_deduction?: unknown;
  advance_pay?: unknown;
  total_deduction?: unknown;
};

/** deduction_detail 이 없을 때 쓸 4대보험 추정치(PC 관리자 화면 전용). */
export type PayrollDeductionFallback = {
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
};

/**
 * record + deduction_detail 에서 공제 9개 금액을 뽑는다.
 *
 * 우선순위는 `deduction_detail` → `record` 컬럼 순이다. deduction_detail 은 정산 시점에
 * 확정 저장한 내역이고, record 컬럼은 같은 값을 비정규화해 둔 것이라 둘이 어긋나면
 * 내역 쪽이 정본이다. (모바일 사본은 이 우선순위가 없어 detail 만 갱신된 레코드에서
 * PC 와 다른 금액을 보여줄 수 있었다.)
 */
export function resolvePayrollDeductionAmounts(
  record: PayrollDeductionSource,
  deductionDetail: Record<string, unknown> | null | undefined,
  fallback?: PayrollDeductionFallback,
): PayrollDeductionAmounts {
  const detail = deductionDetail ?? {};

  const pension = num(detail.national_pension ?? record.national_pension ?? fallback?.nationalPension);
  const health = num(detail.health_insurance ?? record.health_insurance ?? fallback?.healthInsurance);
  const longTerm = num(detail.long_term_care ?? record.long_term_care ?? fallback?.longTermCare);
  const employment = num(
    detail.employment_insurance ?? record.employment_insurance ?? fallback?.employmentInsurance,
  );
  const incomeTax = num(detail.income_tax ?? record.income_tax);
  const localTax = num(detail.local_tax ?? record.local_tax);

  const statutoryTotal = pension + health + longTerm + employment + incomeTax + localTax;

  // 저장된 total_deduction 은 (법정공제 6종 + custom_deduction) 뿐이다(급여정산.tsx 의 deduction 정의).
  // deduction_detail 을 조회하지 않는 경로에서도 기타공제가 증발하지 않도록,
  // detail 이 없으면 total_deduction 에서 법정공제를 뺀 잔액으로 보정한다.
  const customDeduction =
    detail.custom_deduction != null
      ? num(detail.custom_deduction)
      : Math.max(0, num(record.total_deduction) - statutoryTotal);

  return {
    pension,
    health,
    longTerm,
    employment,
    incomeTax,
    localTax,
    // 근태공제는 total_taxable 에서 이미 빠져 있고 선지급은 net_pay 에서만 빠지므로
    // 둘 다 total_deduction 에 없다 — 표시 계층에서 되살려야 등식이 성립한다.
    attendanceDeduction: num(record.attendance_deduction),
    customDeduction,
    advancePay: num(record.advance_pay) };
}

/** 명세서 공제란에 보일 행 목록. 0원 항목은 숨긴다. */
export function buildPayrollDeductionRows(
  amounts: PayrollDeductionAmounts,
): PayrollSlipAmountRow[] {
  return [
    { label: '국민연금', value: amounts.pension },
    { label: '건강보험', value: amounts.health },
    { label: '장기요양보험', value: amounts.longTerm },
    { label: '고용보험', value: amounts.employment },
    { label: '소득세', value: amounts.incomeTax },
    { label: '지방소득세', value: amounts.localTax },
    { label: '근태공제', value: amounts.attendanceDeduction },
    { label: '기타 공제', value: amounts.customDeduction },
    // '가불금' 이 아니라 '선지급 차감' 이다 — advance_pay 는 지급액이 아니라
    // net_pay 에서 빼는 차감액이다(급여정산.tsx 의 getAdvanceAdjustedNet).
    { label: '선지급 차감', value: amounts.advancePay },
  ].filter((row) => row.value > 0);
}

/** 공제 합계. 저장된 total_deduction 이 아니라 표시 행의 합이어야 등식이 성립한다. */
export function sumPayrollDeductionRows(rows: PayrollSlipAmountRow[]): number {
  return rows.reduce((acc, row) => acc + row.value, 0);
}
