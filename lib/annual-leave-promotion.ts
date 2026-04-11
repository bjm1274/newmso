/**
 * 연차촉진제도 개인별 부여일 기반 계산
 * 근로기준법 제61조에 따른 촉진 일정 계산
 */

export type PromotionSchedule = {
  /** 연차 만료일 (입사일 기준 1주년 단위) */
  expiryDate: Date;
  /** 1차 촉진일 (만료 6개월 전) */
  step1Date: Date;
  /** 2차 촉진일 (만료 2개월 전) */
  step2Date: Date;
  /** 대상 연도 */
  targetYear: number;
  /** 만료까지 남은 일수 */
  daysUntilExpiry: number;
};

const MS_PER_DAY = 86_400_000;

/**
 * 입사일 기준 연차 만료일 계산
 * - 입사 1년 미만: 입사일 + 1년
 * - 입사 1년 이상: 매년 입사일 기준 1주년 단위
 */
export function calculateAnnualLeaveExpiryDate(
  hireDate: string | Date,
  referenceDate: Date = new Date(),
): Date {
  const hire = typeof hireDate === 'string' ? new Date(`${hireDate}T00:00:00`) : hireDate;
  if (Number.isNaN(hire.getTime())) {
    // 입사일이 없으면 12월 31일 기본값
    return new Date(referenceDate.getFullYear(), 11, 31);
  }

  const refYear = referenceDate.getFullYear();
  const hireMonth = hire.getMonth();
  const hireDay = hire.getDate();

  // 올해 입사일 기준 만료일
  let expiry = new Date(refYear, hireMonth, hireDay);

  // 이미 지났으면 내년으로
  if (expiry.getTime() <= referenceDate.getTime()) {
    expiry = new Date(refYear + 1, hireMonth, hireDay);
  }

  return expiry;
}

/**
 * 만료일 기반 1차/2차 촉진일 계산
 * - 1차: 만료 6개월 전
 * - 2차: 만료 2개월 전
 */
export function calculatePromotionDates(expiryDate: Date): { step1: Date; step2: Date } {
  const step1 = new Date(expiryDate);
  step1.setMonth(step1.getMonth() - 6);

  const step2 = new Date(expiryDate);
  step2.setMonth(step2.getMonth() - 2);

  return { step1, step2 };
}

/**
 * 특정 직원의 촉진 스케줄 전체 반환
 */
export function getStaffPromotionSchedule(
  hireDate: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): PromotionSchedule | null {
  if (!hireDate) return null;

  const expiryDate = calculateAnnualLeaveExpiryDate(hireDate, referenceDate);
  const { step1, step2 } = calculatePromotionDates(expiryDate);
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - referenceDate.getTime()) / MS_PER_DAY);

  return {
    expiryDate,
    step1Date: step1,
    step2Date: step2,
    targetYear: expiryDate.getFullYear(),
    daysUntilExpiry,
  };
}

/**
 * 오늘 촉진이 필요한 직원 필터링
 */
export function filterStaffsNeedingPromotion(
  staffs: Array<{ id: string; join_date?: string; joined_at?: string; hire_date?: string }>,
  step: 1 | 2,
  today: Date = new Date(),
): Array<{ staffId: string; schedule: PromotionSchedule }> {
  const todayStr = formatDateKey(today);
  const results: Array<{ staffId: string; schedule: PromotionSchedule }> = [];

  for (const staff of staffs) {
    const hireDate = staff.hire_date || staff.join_date || staff.joined_at;
    const schedule = getStaffPromotionSchedule(hireDate, today);
    if (!schedule) continue;

    const targetDate = step === 1 ? schedule.step1Date : schedule.step2Date;
    if (formatDateKey(targetDate) === todayStr) {
      results.push({ staffId: staff.id, schedule });
    }
  }

  return results;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
