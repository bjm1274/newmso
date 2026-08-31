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

/** 0=대상 아님, 1=1차, 2=2차 */
export type DuePromotionStage = 0 | 1 | 2;

const MS_PER_DAY = 86_400_000;

/**
 * 잔여 연차 안전 계산.
 * used 가 음수(데이터 오류)여도 잔여를 부풀리지 않는다.
 */
export function clampLeaveRemaining(
  total: number | null | undefined,
  used: number | null | undefined,
): number {
  const t = Math.max(0, Number(total) || 0);
  const u = Math.max(0, Number(used) || 0);
  return Math.max(0, Math.round((t - u) * 100) / 100);
}

/** 멱등 키: staffId|stage|expiryYYYY-MM-DD */
export function buildPromotionSentKey(
  staffId: string,
  stage: 1 | 2 | number,
  expiryDate: string | null | undefined,
): string {
  return `${String(staffId)}|${Number(stage)}|${String(expiryDate || '').slice(0, 10)}`;
}

/**
 * 오늘(KST YYYY-MM-DD) 기준으로 발송해야 할 촉진 차수.
 *
 * - 만료일 이후: 발송 안 함
 * - 1차일 도래 후 미발송이면 1차 (당일 누락 소급)
 * - 2차일 도래 후 미발송이면 2차
 * - 1차가 아직이면 2차보다 1차를 우선 (적법 촉진 순서)
 */
export function resolveDuePromotionStage(params: {
  todayKey: string;
  step1Key: string;
  step2Key: string;
  expiryKey: string;
  hasStage1: boolean;
  hasStage2: boolean;
  step1Enabled?: boolean;
  step2Enabled?: boolean;
}): DuePromotionStage {
  const {
    todayKey,
    step1Key,
    step2Key,
    expiryKey,
    hasStage1,
    hasStage2,
  } = params;
  const step1Enabled = params.step1Enabled !== false;
  const step2Enabled = params.step2Enabled !== false;

  if (!todayKey || !expiryKey || todayKey > expiryKey) return 0;

  if (step1Enabled && step1Key && todayKey >= step1Key && !hasStage1) {
    return 1;
  }
  if (step2Enabled && step2Key && todayKey >= step2Key && !hasStage2) {
    return 2;
  }
  return 0;
}

export function resolveHireDateFromStaff(staff: {
  hire_date?: string | null;
  join_date?: string | null;
  joined_at?: string | null;
}): string | null {
  const raw = staff.hire_date || staff.join_date || staff.joined_at;
  if (!raw) return null;
  const key = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

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

function subtractMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const targetDate = new Date(year, month - months, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  return new Date(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth));
}

/**
 * 만료일 기반 1차/2차 촉진일 계산
 * - 1년 이상: 만료 6개월 전(1차), 2개월 전(2차) (근로기준법 제61조 제1항)
 * - 1년 미만: 만료 3개월 전(1차), 1개월 전(2차) (근로기준법 제61조 제2항)
 */
export function calculatePromotionDates(expiryDate: Date, isFirstYear = false): { step1: Date; step2: Date } {
  const step1Months = isFirstYear ? 3 : 6;
  const step2Months = isFirstYear ? 1 : 2;

  const step1 = subtractMonthsClamped(expiryDate, step1Months);
  const step2 = subtractMonthsClamped(expiryDate, step2Months);

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

  const hDate = new Date(hireDate);
  const isFirstYear =
    !Number.isNaN(hDate.getTime()) &&
    referenceDate.getTime() - hDate.getTime() < 365 * MS_PER_DAY;

  const expiryDate = calculateAnnualLeaveExpiryDate(hireDate, referenceDate);
  const { step1, step2 } = calculatePromotionDates(expiryDate, isFirstYear);
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - referenceDate.getTime()) / MS_PER_DAY);

  return {
    expiryDate,
    step1Date: step1,
    step2Date: step2,
    targetYear: expiryDate.getFullYear(),
    daysUntilExpiry };
}

/**
 * 오늘(또는 referenceDate) 기준 촉진이 필요한 직원 필터링.
 * 당일 일치뿐 아니라 누락 소급(도래 후 미발송)까지 포함한다.
 * sentKeys: `${staffId}|${stage}|${expiryYYYY-MM-DD}`
 */
export function filterStaffsNeedingPromotion(
  staffs: Array<{
    id: string;
    join_date?: string | null;
    joined_at?: string | null;
    hire_date?: string | null;
    annual_leave_total?: number | null;
    annual_leave_used?: number | null;
  }>,
  step: 1 | 2,
  today: Date = new Date(),
  sentKeys: Set<string> = new Set(),
): Array<{ staffId: string; schedule: PromotionSchedule; stage: 1 | 2 }> {
  const todayStr = formatDateKey(today);
  const results: Array<{ staffId: string; schedule: PromotionSchedule; stage: 1 | 2 }> = [];

  for (const staff of staffs) {
    if (clampLeaveRemaining(staff.annual_leave_total, staff.annual_leave_used) <= 0) continue;
    const hireDate = resolveHireDateFromStaff(staff);
    const schedule = getStaffPromotionSchedule(hireDate, today);
    if (!schedule) continue;

    const expiryKey = formatDateKey(schedule.expiryDate);
    const step1Key = formatDateKey(schedule.step1Date);
    const step2Key = formatDateKey(schedule.step2Date);
    const hasStage1 = sentKeys.has(buildPromotionSentKey(staff.id, 1, expiryKey));
    const hasStage2 = sentKeys.has(buildPromotionSentKey(staff.id, 2, expiryKey));
    const due = resolveDuePromotionStage({
      todayKey: todayStr,
      step1Key,
      step2Key,
      expiryKey,
      hasStage1,
      hasStage2,
    });
    if (due === step) {
      results.push({ staffId: staff.id, schedule, stage: due });
    }
  }

  return results;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
