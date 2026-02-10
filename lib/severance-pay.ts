/** 퇴직금 계산 (근로기준법) */
export function calculateSeverancePay(avgWage: number, workDays: number): number {
  // 퇴직금 = (1일 평균임금 × 30일) × (재직일수 / 365) × (1/2)
  const dailyAvg = avgWage / 30;
  const years = workDays / 365;
  return Math.floor(dailyAvg * 30 * years * 0.5);
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
