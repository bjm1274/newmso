/**
 * 급여 확정 금액 서버 shadow 재계산 (D04-008)
 *
 * 예전에는 4대보험·소득세·차인지급액이 **전부 브라우저에서** 계산되고
 * 그 결과가 그대로 `payroll_records` 로 upsert 됐다. 서버는 RBAC 만 볼 뿐
 * 금액을 다시 계산하지도, 대조하지도 않았다 — 요율 로드가 조용히 실패한
 * 브라우저가 폴백 요율로 계산한 금액이 그대로 "확정"이 되는 구조였다.
 *
 * 그런데 서버 재계산 결과를 **강제로 덮어쓰면 실제 급여 금액이 바뀐다.**
 * 서버와 클라이언트의 계산이 미세하게라도 다르면(요율 해석·반올림 순서·
 * 직원별 보험 설정 로딩 시점) 그 차이가 곧바로 직원 통장에 반영된다.
 * 그래서 이 단계에서는 **덮어쓰지 않는다.** 서버가 같은 입력으로 다시 계산해
 * 클라이언트 값과 **대조하고, 어긋나면 감사로그로 드러내기만** 한다.
 * 로그로 diff 0 을 확인한 뒤에 강제 교정으로 넘어가는 것이 순서다.
 *
 * 이 파일은 순수 비교 로직만 담는다(라우트는 app/api/payroll/shadow-verify).
 */
import {
  calcStatutoryDeductions,
  type StatutoryDeductionOptions } from '@/lib/payroll-deductions';
import {
  DEFAULT_TAX_INSURANCE_RATES,
  hasOfficialMonthlyIncomeTaxTable,
  resolveIncomeTaxBracket,
  type TaxInsuranceRates } from '@/lib/use-tax-insurance-rates';
import { EMPLOYEE_INSURANCE_RATES_2026 } from '@/lib/payroll-insurance-rates';

/** 클라이언트가 저장하려는 금액 — 서버가 재계산해 대조할 대상. */
export type ClientPayrollAmounts = {
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_tax: number;
  /** 4대보험+세금+기타공제 합계 */
  total_deduction: number;
  /** 과세 + 비과세 */
  gross_pay: number;
  net_pay: number;
};

export type ShadowVerifyStaffInput = {
  staff_id: string;
  /** 클라이언트가 산출한 과세 대상 금액. 재계산의 입력값이다. */
  total_taxable: number;
  total_taxfree: number;
  custom_deduction: number;
  advance_pay: number;
  /** calcStatutoryDeductions 에 넘긴 것과 같은 옵션 */
  options: StatutoryDeductionOptions;
  client: ClientPayrollAmounts;
};

export type ShadowMismatch = {
  field: string;
  client: number;
  server: number;
  diff: number;
};

export type ShadowVerifyStaffResult = {
  staff_id: string;
  mismatches: ShadowMismatch[];
};

const STATUTORY_FIELDS = [
  'national_pension',
  'health_insurance',
  'long_term_care',
  'employment_insurance',
  'income_tax',
  'local_tax',
] as const;

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function pushMismatch(out: ShadowMismatch[], field: string, client: number, server: number) {
  if (client !== server) {
    out.push({ field, client, server, diff: client - server });
  }
}

/**
 * tax_insurance_rates 원본 행 → TaxInsuranceRates.
 *
 * 클라이언트의 `normalizeRates`(lib/use-tax-insurance-rates.ts, 비공개)와 같은 규칙이다.
 * 그쪽을 export 해 공유하는 것이 정석이지만 그 파일은 이번 범위 밖이라 손대지 않는다.
 * 규칙이 갈라지면 shadow diff 가 **거짓 양성**으로 뜨므로, 두 곳을 합치는 것을
 * 후속 과제로 남긴다.
 */
export function resolveServerTaxInsuranceRates(row: Record<string, unknown> | null | undefined): TaxInsuranceRates {
  if (!row) {
    return { ...DEFAULT_TAX_INSURANCE_RATES, configured: false };
  }

  const effectiveYear = Number(row.effective_year) || 0;
  const floorTo2026 = (value: number, floor: number) =>
    effectiveYear >= 2026 ? Math.max(value, floor) : value;

  const bracketSource = typeof row.income_tax_bracket === 'string'
    ? (() => {
        try {
          return JSON.parse(row.income_tax_bracket as string) as unknown;
        } catch {
          return [];
        }
      })()
    : row.income_tax_bracket;

  return {
    national_pension_rate: floorTo2026(
      Number(row.national_pension_rate ?? EMPLOYEE_INSURANCE_RATES_2026.nationalPension),
      EMPLOYEE_INSURANCE_RATES_2026.nationalPension,
    ),
    health_insurance_rate: floorTo2026(
      Number(row.health_insurance_rate ?? EMPLOYEE_INSURANCE_RATES_2026.healthInsurance),
      EMPLOYEE_INSURANCE_RATES_2026.healthInsurance,
    ),
    long_term_care_rate: floorTo2026(
      Number(row.long_term_care_rate ?? EMPLOYEE_INSURANCE_RATES_2026.longTermCare),
      EMPLOYEE_INSURANCE_RATES_2026.longTermCare,
    ),
    employment_insurance_rate: floorTo2026(
      Number(row.employment_insurance_rate ?? EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance),
      EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance,
    ),
    income_tax_bracket: resolveIncomeTaxBracket({ income_tax_bracket: Array.isArray(bracketSource) ? bracketSource : [] }),
    configured: true };
}

/** 서버가 읽은 간이세액표가 공식 표인지 — 아니면 소득세 대조는 신뢰도가 낮다. */
export function hasOfficialWithholdingTable(rates: TaxInsuranceRates): boolean {
  return hasOfficialMonthlyIncomeTaxTable(rates.income_tax_bracket);
}

export type PayrollVerifyOutcome = {
  /** true 면 저장을 중단해야 한다. */
  blocked: boolean;
  message: string;
};

/**
 * 저장 직전 서버 검증 호출 (클라이언트에서 사용).
 *
 * 마감 잠금 판정은 **fail-closed** 다 — 서버가 답을 못 주면 막는다.
 * 예전 클라이언트 가드는 조회가 실패하면 통과였고(스스로 fail-open 이라고
 * 주석에 적어 뒀다), 그래서 조회 실패 하나로 마감이 무력화됐다.
 * 반대로 금액 불일치는 **막지 않는다** — 아직 shadow 단계이므로 서버 로그로만
 * 드러내고, 강제 교정은 diff 0 을 실측한 뒤로 미룬다.
 */
export async function verifyPayrollBeforeSave(payload: {
  yearMonth: string;
  companyName: string;
  targetStatus: string;
  staffs: ShadowVerifyStaffInput[];
}): Promise<PayrollVerifyOutcome> {
  try {
    const res = await fetch('/api/payroll/shadow-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) });

    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null;
      return {
        blocked: true,
        message: detail?.error
          || `급여 마감 잠금 상태를 확인하지 못해 저장을 중단했습니다. (HTTP ${res.status})\n잠시 후 다시 시도해 주세요.` };
    }

    const json = (await res.json()) as {
      locked?: boolean;
      mismatches?: ShadowVerifyStaffResult[];
    };

    if (json.locked === true) {
      return {
        blocked: true,
        message: `${payload.yearMonth} 급여가 마감 잠금되어 저장할 수 없습니다.\n재오픈 승인 후 다시 시도해 주세요.` };
    }

    if (Array.isArray(json.mismatches) && json.mismatches.length > 0) {
      // 저장은 진행한다. 불일치는 서버 감사로그에 남았고, 여기서는 콘솔로만 드러낸다.
      console.warn(
        '[payroll] 서버 재계산과 화면 계산이 다릅니다(저장은 진행 — shadow 단계):',
        json.mismatches,
      );
    }

    return { blocked: false, message: '' };
  } catch (error) {
    return {
      blocked: true,
      message: `급여 마감 잠금 상태를 확인하지 못해 저장을 중단했습니다.\n${error instanceof Error ? error.message : '네트워크 오류'}` };
  }
}

/**
 * 한 직원분에 대해 서버 재계산 결과와 클라이언트 값을 대조한다.
 * **금액을 바꾸지 않는다.** 어긋난 항목 목록만 돌려준다.
 */
export function verifyPayrollRecordShadow(
  input: ShadowVerifyStaffInput,
  rates: TaxInsuranceRates,
): ShadowVerifyStaffResult {
  const mismatches: ShadowMismatch[] = [];

  const taxable = toInt(input.total_taxable);
  const taxfree = toInt(input.total_taxfree);
  const customDeduction = toInt(input.custom_deduction);
  const advancePay = toInt(input.advance_pay);

  const server = calcStatutoryDeductions(taxable, rates, input.options);

  for (const field of STATUTORY_FIELDS) {
    pushMismatch(mismatches, field, toInt(input.client[field]), toInt(server[field]));
  }

  // 합계 항등식 — 개별 항목이 맞아도 합계 계산이 틀어지는 경우를 잡는다.
  const serverTotalDeduction =
    server.national_pension +
    server.health_insurance +
    server.long_term_care +
    server.employment_insurance +
    server.income_tax +
    server.local_tax +
    customDeduction;
  pushMismatch(mismatches, 'total_deduction', toInt(input.client.total_deduction), serverTotalDeduction);

  const serverGross = taxable + taxfree;
  pushMismatch(mismatches, 'gross_pay', toInt(input.client.gross_pay), serverGross);

  // net_pay = (지급총액 − 공제총액) − 선지급 차감 (급여정산.tsx getAdvanceAdjustedNet)
  const serverNet = serverGross - serverTotalDeduction - advancePay;
  pushMismatch(mismatches, 'net_pay', toInt(input.client.net_pay), serverNet);

  return { staff_id: String(input.staff_id), mismatches };
}
