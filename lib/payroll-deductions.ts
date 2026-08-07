import { calculateMonthlyIncomeTax, type TaxInsuranceRates, hasExactIncomeTaxBracket } from './use-tax-insurance-rates';
import { getNpIncomeLimits, getHealthEmployeePremiumLimits } from './tax-free-limits';
import { isMidMonthJoin } from './payroll-mid-month';
import { floorPremium, LONG_TERM_CARE_HEALTH_RATIO_2026 } from './payroll-insurance-rates';

/**
 * 장기요양보험료율(= 건강보험료 대비 비율)을 요율 설정에서 되살린다.
 *
 * 왜 이렇게 됐는가: `tax_insurance_rates.long_term_care_rate` 는 "보수월액 대비"
 * 환산율(2026 기준 0.4724%)로 저장돼 있지만, 법이 정한 산식의 모수는
 * **건강보험료 대비 비율**(2026 기준 13.14%)이다. 두 값은
 * `0.004724 = 0.03595 × 0.1314` 관계라, 설정된 두 요율의 몫으로 되돌릴 수 있다.
 * DB 설정을 계속 정본으로 쓰기 위해 상수로 갈아끼우지 않고 몫을 쓴다.
 *
 * 몫을 소수점 4자리(= 백분율 소수점 둘째 자리)로 반올림하는 이유: 저장된 환산율
 * 0.004724 자체가 0.0047238…을 반올림한 값이라 그냥 나누면 0.1314047 이 나오고,
 * 그 상태로 계산하면 이미 확정 저장된 과거 레코드보다 1원이 커진다(예: 건강보험료
 * 136,831원 → 17,980원 vs 실제 저장값 17,979원). 장기요양보험료율은 법정 고시가
 * 12.95%·13.14% 처럼 백분율 소수점 둘째 자리까지만 쓰므로 그 자리로 되돌린다.
 * 건강보험료율이 비어 있는 비정상 설정에서만 2026 상수로 폴백한다.
 */
function resolveLongTermCareHealthRatio(rates: TaxInsuranceRates): number {
  const healthRate = Number(rates.health_insurance_rate);
  const ltcRate = Number(rates.long_term_care_rate);
  if (!Number.isFinite(healthRate) || healthRate <= 0 || !Number.isFinite(ltcRate) || ltcRate < 0) {
    return LONG_TERM_CARE_HEALTH_RATIO_2026;
  }
  return Math.round((ltcRate / healthRate) * 10_000) / 10_000;
}

export interface StatutoryDeductionOptions {
  applyInsurance?: boolean;
  applyTax?: boolean;
  isDuruNuriActive?: boolean;
  isMedicalBenefit?: boolean;
  dependentCount?: number;
  qualifyingChildCount?: number;
  withholdingRatePercent?: number;
  applyNationalPension?: boolean;
  applyHealthInsurance?: boolean;
  applyEmploymentInsurance?: boolean;
  nationalPensionAmount?: number | null;
  joinedAt?: string | null;
  yearMonth?: string | null;
}

export interface StatutoryDeductionResult {
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_tax: number;
  total_insurance_deductions: number;
}

/**
 * 4대보험 및 근로소득세/지방소득세를 계산하는 단일 공통 함수 (SSOT)
 */
export function calcStatutoryDeductions(
  taxableIncome: number,
  rates: TaxInsuranceRates,
  opts: StatutoryDeductionOptions = {}
): StatutoryDeductionResult {
  const applyInsurance = opts.applyInsurance !== false;

  // 중도입사 여부 확인 (입사연월 === 정산연월 && 입사일 !== 1일)
  const midMonthJoin = isMidMonthJoin(opts.joinedAt, opts.yearMonth);

  const applyNational = !midMonthJoin && opts.applyNationalPension !== false && applyInsurance;
  const applyHealth = !midMonthJoin && opts.applyHealthInsurance !== false && applyInsurance;
  const applyEmployment = opts.applyEmploymentInsurance !== false && applyInsurance;
  const applyTax = opts.applyTax !== false;
  const isDuruNuriActive = !!opts.isDuruNuriActive;
  const isMedicalBenefit = !!opts.isMedicalBenefit;
  const dependentCount = opts.dependentCount ?? 0;
  const qualifyingChildCount = opts.qualifyingChildCount ?? 0;
  const withholdingRatePercent = opts.withholdingRatePercent ?? 100;

  let national_pension = 0;
  let health_insurance = 0;
  let long_term_care = 0;
  let employment_insurance = 0;
  let income_tax = 0;
  let local_tax = 0;

  // 1. 국민연금 - 기준소득월액 상·하한 적용. 상·하한은 매년 7월에 바뀌므로
  //    정산 연월로 조회한다(getNpIncomeLimits). 하드코딩 상수를 쓰던 시절에는
  //    2026.7 인상분이 반영되지 않아 고소득자 보험료가 월 10,450원 적게 나왔다.
  //    두루누리 80% 지원 적용 시 근로자 부담분 20%만 부과
  //    고정 국민연금액이 있으면 고정액 사용
  if (applyNational) {
    if (typeof opts.nationalPensionAmount === 'number' && opts.nationalPensionAmount >= 0) {
      national_pension = opts.nationalPensionAmount;
    } else {
      const npLimits = getNpIncomeLimits(opts.yearMonth);
      const npBase = Math.min(Math.max(taxableIncome, npLimits.floor), npLimits.ceiling);
      const full_national = floorPremium(npBase * rates.national_pension_rate);
      national_pension = isDuruNuriActive ? Math.floor(full_national * 0.2) : full_national;
    }
  }

  // 2. 건강보험 및 장기요양보험 - 의료급여 수급자는 제외 (0원)
  //    보험료 상·하한(보건복지부 고시) 및 음수 소득 방지 가드 적용
  if (applyHealth && !isMedicalBenefit) {
    const hiBase = Math.max(0, taxableIncome);
    const hiLimits = getHealthEmployeePremiumLimits(opts.yearMonth);
    const rawHealth = floorPremium(hiBase * rates.health_insurance_rate);
    // 하한은 보수가 있는 달에만 건다. 무급휴직 등으로 보수가 0인 달까지 최저보험료를
    // 물리면 실제 고지액과 어긋난다(그런 달은 납부유예·정산 대상이다).
    health_insurance = hiBase > 0
      ? Math.min(Math.max(rawHealth, hiLimits.min), hiLimits.max)
      : 0;
    // 장기요양보험료 = **건강보험료액** × 장기요양보험료율 (노인장기요양보험법 제9조 제1항).
    //
    // 왜 바꿨는가: 예전에는 `floor(보수월액 × 0.4724%)` 로 소득에서 바로 뽑았는데,
    // 이는 법이 정한 모수(건강보험료액)를 건너뛴 환산율 근사라 중간 절사가 사라진다.
    // 저장소 안에 두 산식이 공존해(`calculateEmployeeInsuranceDeductions` 는 건강보험료
    // 기준) 화면마다 최대 3원이 어긋났고, 실제로 저장된 과거 확정분
    // (2026-04·2026-05 레코드)은 전부 **건강보험료 기준** 값이었다.
    // 법조문과 기존 확정 데이터가 같은 쪽을 가리키므로 건강보험료 기준으로 통일한다.
    long_term_care = floorPremium(health_insurance * resolveLongTermCareHealthRatio(rates));
  }

  // 3. 고용보험 - 두루누리 80% 지원 적용 시 20%만 부과
  //    음수 소득 방지 가드 적용
  if (applyEmployment) {
    const eiBase = Math.max(0, taxableIncome);
    const full_employment = floorPremium(eiBase * rates.employment_insurance_rate);
    employment_insurance = isDuruNuriActive ? Math.floor(full_employment * 0.2) : full_employment;
  }

  const hasExactWithholdingTable = hasExactIncomeTaxBracket(rates);
  if (applyTax && hasExactWithholdingTable) {
    const exactIncomeTax = calculateMonthlyIncomeTax(taxableIncome, rates, dependentCount, {
      withholdingRatePercent,
      qualifyingChildCount });
    income_tax = Math.max(0, exactIncomeTax);
    local_tax = Math.floor(income_tax * 0.1 / 10) * 10; // 지방소득세 10% 이내 10원 단위 절사 (국고금관리법 제47조)
  }

  return {
    national_pension,
    health_insurance,
    long_term_care,
    employment_insurance,
    income_tax,
    local_tax,
    total_insurance_deductions: national_pension + health_insurance + long_term_care + employment_insurance };
}
