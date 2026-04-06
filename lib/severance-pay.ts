/**
 * 퇴직금 계산 (근로기준법 제34조, 근로자퇴직급여보장법 제8조)
 * 공식: 1일 평균임금 × 30일 × (재직일수 / 365)
 *
 * @param dailyAvgWage - 1일 평균임금 (퇴직 전 3개월 총임금 ÷ 3개월 실제 일수)
 * @param workDays     - 재직일수 (입사일~퇴직일)
 */
export function calculateSeverancePay(dailyAvgWage: number, workDays: number): number {
  if (workDays < 365) return 0; // 1년 미만 근속 시 퇴직금 없음
  return Math.floor(dailyAvgWage * 30 * (workDays / 365));
}

/**
 * 월 평균임금으로부터 1일 평균임금 추정 (시뮬레이터용)
 * 실제 신고 시에는 퇴직 전 3개월 총임금 ÷ 3개월 실제 총일수를 사용해야 합니다.
 * 3개월 실제 일수는 89~92일 범위이므로, 기본값 91일을 사용합니다.
 */
export function estimateDailyAvgWageFromMonthly(monthlyAvgWage: number, threeMonthDays = 91): number {
  return (monthlyAvgWage * 3) / threeMonthDays;
}

export function formatWorkPeriod(workDays: number): string {
  const y = Math.floor(workDays / 365);
  const m = Math.floor((workDays % 365) / 30);
  const d = workDays % 30;
  const parts: string[] = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  if (d || parts.length === 0) parts.push(`${d}일`);
  return parts.join(' ');
}
