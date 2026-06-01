/**
 * payroll-allowance-hours.ts
 *
 * Pure, side-effect-free helper for converting hours inputs into Korean won
 * amounts for time-based salary allowances, applying the statutory premium
 * multipliers defined in 근로기준법 제56조 (Labor Standards Act Article 56).
 *
 * No React, no I/O, no global state — safe to use in any context.
 */

// ---------------------------------------------------------------------------
// 1. Multiplier map (as const → derived union, no `any`)
// ---------------------------------------------------------------------------

/**
 * Statutory premium multipliers per allowance field.
 *
 * Legal basis (근로기준법 제56조):
 *   - 연장·휴일근로: 통상임금의 100분의 50 이상 가산 → ×1.5
 *   - 야간근로(22:00–06:00): 통상임금의 100분의 50 이상 가산 (가산분만 ×0.5)
 *   - 연차휴가수당: 통상임금 × 1일 → ×1.0 (가산 없음)
 *
 * `agreed_*` fields are contractual pre-payments of the same statutory
 * premiums, so they share the same multiplier as their runtime counterparts.
 */
export const ALLOWANCE_MULTIPLIERS = {
  /** 약정연장수당 — 연장근로 사전약정 지급분 (근로기준법 제56조 제1항) */
  agreed_overtime_allowance: 1.5,
  /** 연장근로수당 — 실제 연장근로 발생분 (근로기준법 제56조 제1항) */
  overtime_allowance: 1.5,
  /** 휴일근로수당 — 휴일 8시간 이내 근로 가산분 (근로기준법 제56조 제2항) */
  holiday_work_allowance: 1.5,
  /** 약정야간수당 — 야간근로 사전약정 지급분·가산분만 (근로기준법 제56조 제3항) */
  agreed_night_allowance: 0.5,
  /** 야간근로수당 — 실제 야간근로(22:00–06:00) 가산분 (근로기준법 제56조 제3항) */
  night_work_allowance: 0.5,
  /** 연차휴가수당 — 미사용 연차 보상, 가산 없음 (근로기준법 제60조 제5항) */
  annual_leave_pay: 1.0,
} as const;

/** Union of all hours-based allowance field keys. */
export type AllowanceHoursKey = keyof typeof ALLOWANCE_MULTIPLIERS;

// ---------------------------------------------------------------------------
// 2. Ordered UI field list (key + Korean label + multiplier)
// ---------------------------------------------------------------------------

/**
 * Ordered list of hours-based allowance fields for UI rendering.
 *
 * Labels are kept consistent with TAXABLE_SALARY_FIELDS in 구성원현황.tsx.
 * `base_salary`(기본급) and `position_allowance`(직책수당) are deliberately
 * excluded because they are not hours-based.
 *
 * Iterate over this to render an "hours" input per field.
 */
export const HOURS_BASED_ALLOWANCE_FIELDS: ReadonlyArray<{
  readonly key: AllowanceHoursKey;
  readonly label: string;
  readonly multiplier: number;
}> = [
  {
    key: 'agreed_overtime_allowance',
    label: '약정연장수당',
    multiplier: ALLOWANCE_MULTIPLIERS.agreed_overtime_allowance,
  },
  {
    key: 'agreed_night_allowance',
    label: '약정야간수당',
    multiplier: ALLOWANCE_MULTIPLIERS.agreed_night_allowance,
  },
  {
    key: 'overtime_allowance',
    label: '연장근로수당',
    multiplier: ALLOWANCE_MULTIPLIERS.overtime_allowance,
  },
  {
    key: 'night_work_allowance',
    label: '야간근로수당',
    multiplier: ALLOWANCE_MULTIPLIERS.night_work_allowance,
  },
  {
    key: 'holiday_work_allowance',
    label: '휴일근로수당',
    multiplier: ALLOWANCE_MULTIPLIERS.holiday_work_allowance,
  },
  {
    key: 'annual_leave_pay',
    label: '연차휴가수당',
    multiplier: ALLOWANCE_MULTIPLIERS.annual_leave_pay,
  },
] as const;

// ---------------------------------------------------------------------------
// 3. Type guard
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `key` is one of the hours-based allowance field keys.
 *
 * Use this to narrow an arbitrary string (e.g. from a form field name) to
 * `AllowanceHoursKey` before passing it to `allowanceWonFromHours`.
 */
export function isHoursBasedAllowance(key: string): key is AllowanceHoursKey {
  return Object.prototype.hasOwnProperty.call(ALLOWANCE_MULTIPLIERS, key);
}

// ---------------------------------------------------------------------------
// 4. Accessors
// ---------------------------------------------------------------------------

/**
 * Returns the statutory premium multiplier for the given hours-based field.
 *
 * Legal basis: 근로기준법 제56조.
 */
export function getAllowanceMultiplier(key: AllowanceHoursKey): number {
  return ALLOWANCE_MULTIPLIERS[key];
}

// ---------------------------------------------------------------------------
// 5. Core calculation
// ---------------------------------------------------------------------------

/** Returns `true` when `n` is a finite, non-negative number. */
function isValidAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/**
 * Converts an hours input to a Korean won amount using the 환산시급 (converted
 * hourly wage) and the statutory premium multiplier for the given field.
 *
 * Formula: `Math.round(hourlyWage × max(hours, 0) × multiplier)`
 *
 * Guards (return 0):
 *   - `hourlyWage` is NaN, Infinity, or negative
 *   - `hours` is NaN or non-finite
 *   - Negative `hours` are clamped to 0 (not an error — just no pay)
 *
 * Legal basis: 근로기준법 제56조 (가산임금), 최저임금법 제6조 (환산시급 산정).
 *
 * @param hourlyWage  환산시급 (원) — pre-computed from monthly salary ÷ statutory hours
 * @param hours       해당 수당의 해당 기간 실근로시간 (시간 단위)
 * @param fieldKey    HOURS_BASED_ALLOWANCE_FIELDS 내 수당 필드 키
 * @returns           원 단위 수당금액 (정수, Math.round 처리)
 */
export function allowanceWonFromHours(
  hourlyWage: number,
  hours: number,
  fieldKey: AllowanceHoursKey,
): number {
  if (!isValidAmount(hourlyWage)) return 0;
  if (!Number.isFinite(hours) || isNaN(hours)) return 0;

  const clampedHours = Math.max(0, hours);
  const multiplier = ALLOWANCE_MULTIPLIERS[fieldKey];

  return Math.round(hourlyWage * clampedHours * multiplier);
}
