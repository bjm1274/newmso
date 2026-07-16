/**
 * payroll-mid-month — 중도입사(월중 입사) 판별 SSOT.
 *
 * 입사연월 === 정산연월 && 입사일 !== 1일 이면 true.
 * calcStatutoryDeductions · calculateEmployeeInsuranceDeductions 공용.
 */

/**
 * @param joinedAt ISO 날짜 문자열 (YYYY-MM-DD 또는 그 이상 세그먼트)
 * @param yearMonth 정산 연월 (YYYY-MM)
 */
export function isMidMonthJoin(
  joinedAt: string | null | undefined,
  yearMonth: string | null | undefined,
): boolean {
  if (!joinedAt || !yearMonth) return false;
  const joinParts = joinedAt.split('-');
  if (joinParts.length < 3) return false;
  const joinYearMonth = `${joinParts[0]}-${joinParts[1]}`;
  const joinDay = parseInt(joinParts[2], 10);
  return joinYearMonth === yearMonth && joinDay !== 1;
}
