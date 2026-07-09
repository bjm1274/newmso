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
 * 국민연금 기준소득월액 상·하한
 * 2025.7.1 ~ 2026.6.30 기준
 */
export const NP_INCOME_CEILING = 6_370_000;
export const NP_INCOME_FLOOR = 400_000;

/**
 * 건강보험 보수월액 상한
 * 건강보험법 시행규칙 제42조 및 보건복지부 고시 기준
 * TODO: 2026 건강보험 보수월액 상한값 확인 필요
 * (참고: 2025년 상한 119,625,706원/월 — 2026년 고시 확인 후 갱신)
 */
export const HEALTH_INCOME_CEILING = 119_625_706;

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
