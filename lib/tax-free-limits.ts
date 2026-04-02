/**
 * 비과세 항목 법정 한도 (소득세법·근로기준법)
 * 2025-2026년 기준
 */

export const TAX_FREE_LEGAL_LIMITS = {
  meal: { limit: 200_000, name: '식대·식사비', basis: '소득세법 시행령' },
  vehicle: { limit: 200_000, name: '자가운전보조금', basis: '소득세법' },
  childcare: { limit: 200_000, name: '보육수당', basis: '근로기준법 (기본 20만원)' },
  research: { limit: 200_000, name: '연구활동비', basis: '소득세법' },
  uniform: { limit: 300_000, name: '출장·업무용복', basis: '소득세법' },
  congratulations: { limit: 500_000, name: '경조사비', basis: '소득세법 (연1회)' },
  housing: { limit: 700_000, name: '기숙사·숙박비', basis: '소득세법' },
} as const;

export const MINIMUM_WAGE_2025 = 10_030; // 시급
export const MINIMUM_WAGE_2026 = 10_320; // 시급 (2026년 확정)

/** 근로·임금 정보 기본값: 미입력(0)일 때 적용 (학습 문서 §9·§14.2) */
export const DAILY_STANDARD_HOURS = 8;   // 일 소정근로시간
export const WEEKLY_STANDARD_HOURS = 48;  // 주 소정근로+주휴 환산 시간(40+8)
export const MONTHLY_STANDARD_HOURS = 209; // 월 소정근로시간(주휴포함)
export const WEEKLY_MAX_HOURS = 52; // 주 52시간
export const ANNUAL_LEAVE_FIRST_YEAR = 11; // 1년 미만
export const ANNUAL_LEAVE_AFTER_ONE = 15; // 1년 이상

export type TaxFreeItemKey = keyof typeof TAX_FREE_LEGAL_LIMITS;

export function getTaxFreeLimit(key: TaxFreeItemKey, customLimits?: Partial<Record<TaxFreeItemKey, number>>): number {
  return customLimits?.[key] ?? TAX_FREE_LEGAL_LIMITS[key].limit;
}
