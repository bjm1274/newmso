/**
 * 비과세·법정 한도 SSOT (Single Source of Truth)
 * 2025-2026 기준
 *
 * 모든 비과세/야간/국외근로 한도는 이 모듈의 TAX_FREE_LEGAL_LIMITS 또는
 * 아래 named export 별칭만 사용한다. UI·정산 코드에 숫자 리터럴 하드코딩 금지.
 */

/** 법정 비과세 한도 표 — 단일 정본 객체 */
export const TAX_FREE_LEGAL_LIMITS = {
  meal: {
    limit: 200_000,
    name: '식대·식사비',
    basis: '소득세법 시행령' },
  vehicle: {
    limit: 200_000,
    name: '자가운전보조금',
    basis: '소득세법' },
  childcare: {
    limit: 200_000,
    name: '보육수당',
    basis: '근로기준법(기본 20만원)' },
  research: {
    limit: 200_000,
    name: '연구활동비',
    basis: '소득세법' },
  uniform: {
    limit: 300_000,
    name: '출장·업무용품',
    basis: '소득세법' },
  congratulations: {
    limit: 500_000,
    name: '경조사비',
    basis: '소득세법' },
  housing: {
    limit: 700_000,
    name: '기숙사·주택보조비',
    basis: '소득세법' },
  /** 야간근로수당 비과세 (생산직 등) — 소득세법 시행령 제17조, 월 24만원 */
  night: {
    limit: 240_000,
    name: '야간근로수당(생산직)',
    basis: '소득세법 시행령 제17조' },
  /** 국외근로소득(비파견) 월 한도 */
  overseas: {
    limit: 1_000_000,
    name: '국외근로소득(비파견)',
    basis: '소득세법' } } as const;

export type TaxFreeItemKey = keyof typeof TAX_FREE_LEGAL_LIMITS;

/** @deprecated Prefer TAX_FREE_LEGAL_LIMITS.night.limit — 하위 호환 별칭 */
export const NIGHT_DUTY_TAX_FREE_LIMIT = TAX_FREE_LEGAL_LIMITS.night.limit;

/** @deprecated Prefer TAX_FREE_LEGAL_LIMITS.overseas.limit — 하위 호환 별칭 */
export const OVERSEAS_WORK_TAX_FREE_LIMIT = TAX_FREE_LEGAL_LIMITS.overseas.limit;

export const MINIMUM_WAGE_2025 = 10_030;
export const MINIMUM_WAGE_2026 = 10_320;

/**
 * 국민연금 기준소득월액 상·하한 (국민연금법 시행령 제5조 — 매년 **7월 1일** 조정)
 *
 * 왜 상수 하나가 아니라 표인가: 조정 시점이 1월이 아니라 7월이라 같은 해 안에서도
 * 값이 갈린다. 예전에는 `NP_INCOME_CEILING = 6_370_000` 한 값만 있었고 그 값은
 * 2025.7~2026.6 적용분이었다. 2026.7 부터 상한 659만·하한 41만으로 올랐는데도
 * 상수가 그대로여서, **2026년 7월 이후 정산에서 월 637만원 초과자의 국민연금이
 * 10,450원씩 적게** 계산됐다(313,025원 → 302,575원). 반대로 상수만 새 값으로
 * 갈아끼우면 2026-06 이전 달을 재정산할 때 이미 신고된 금액과 어긋난다.
 * 그래서 적용 시작월을 함께 들고 정산 연월로 조회한다.
 *
 * 최신 항목이 앞에 오도록 내림차순 유지할 것.
 */
export const NP_INCOME_LIMIT_TABLE = [
  { effectiveFrom: '2026-07', ceiling: 6_590_000, floor: 410_000 },
  { effectiveFrom: '2025-07', ceiling: 6_370_000, floor: 400_000 },
  { effectiveFrom: '2024-07', ceiling: 6_170_000, floor: 390_000 },
] as const;

function normalizeYearMonth(value?: unknown): string {
  const text = String(value ?? '').slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 정산 연월(`YYYY-MM`)에 적용되는 국민연금 기준소득월액 상·하한. 연월이 없으면 현재월 기준. */
export function getNpIncomeLimits(yearMonth?: string | null): { ceiling: number; floor: number } {
  const key = normalizeYearMonth(yearMonth);
  const matched = NP_INCOME_LIMIT_TABLE.find((entry) => key >= entry.effectiveFrom);
  // 표보다 과거인 연월은 가장 오래된 항목으로 폴백한다(그 이전 정산분은 이 시스템에 없다).
  return matched ?? NP_INCOME_LIMIT_TABLE[NP_INCOME_LIMIT_TABLE.length - 1];
}

/** @deprecated 정산 연월을 아는 곳에서는 getNpIncomeLimits(yearMonth) 를 쓸 것 — 현재 적용값 별칭 */
export const NP_INCOME_CEILING = NP_INCOME_LIMIT_TABLE[0].ceiling;
/** @deprecated 정산 연월을 아는 곳에서는 getNpIncomeLimits(yearMonth) 를 쓸 것 — 현재 적용값 별칭 */
export const NP_INCOME_FLOOR = NP_INCOME_LIMIT_TABLE[0].floor;

/**
 * 건강보험 보수월액보험료 상·하한 — 보건복지부 고시
 * 「월별 건강보험료액의 상한과 하한에 관한 고시」(2026년분: 고시 제2025-222호, 2026.1.1 시행)
 *
 * 왜 "보수월액"이 아니라 "보험료" 한도인가: 고시가 정하는 값 자체가 보수월액이 아니라
 * **월별 보험료액**이다. 예전에는 이를 보수월액 상한(119,625,706원)으로 환산해 들고
 * 있었는데, 그 환산값은 2024년분이라 2025·2026년 인상이 반영되지 않았고 요율이
 * 바뀔 때마다 다시 환산해야 했다. 고시값을 그대로 두고 보험료에 clamp 하는 편이
 * 고시 갱신 시 손댈 곳이 한 군데로 줄고 환산 오차도 없다.
 *
 * total* 은 노사 합산액이다. 직장가입자는 근로자와 사업주가 각각 50%씩 부담하므로
 * (국민건강보험법 제76조) 근로자 한도는 절반이다.
 * 최신 항목이 앞에 오도록 내림차순 유지할 것.
 */
export const HEALTH_PREMIUM_LIMIT_TABLE = [
  { effectiveFrom: '2026-01', totalMax: 9_183_480, totalMin: 20_160 },
  { effectiveFrom: '2025-01', totalMax: 9_008_340, totalMin: 19_780 },
] as const;

/** 정산 연월에 적용되는 건강보험료 **근로자 부담분** 상·하한. 연월이 없으면 현재월 기준. */
export function getHealthEmployeePremiumLimits(yearMonth?: string | null): { max: number; min: number } {
  const key = normalizeYearMonth(yearMonth);
  const matched =
    HEALTH_PREMIUM_LIMIT_TABLE.find((entry) => key >= entry.effectiveFrom)
    ?? HEALTH_PREMIUM_LIMIT_TABLE[HEALTH_PREMIUM_LIMIT_TABLE.length - 1];
  return { max: matched.totalMax / 2, min: matched.totalMin / 2 };
}

export function getMinimumWageByYear(year: number) {
  return year >= 2026 ? MINIMUM_WAGE_2026 : MINIMUM_WAGE_2025;
}

export const DAILY_STANDARD_HOURS = 8;
export const WEEKLY_STANDARD_HOURS = 48;
export const MONTHLY_STANDARD_HOURS = 209;
export const WEEKLY_MAX_HOURS = 52;
export const ANNUAL_LEAVE_FIRST_YEAR = 11;
export const ANNUAL_LEAVE_AFTER_ONE = 15;

export function getTaxFreeLimit(
  key: TaxFreeItemKey,
  customLimits?: Partial<Record<TaxFreeItemKey, number>>,
): number {
  return customLimits?.[key] ?? TAX_FREE_LEGAL_LIMITS[key].limit;
}
