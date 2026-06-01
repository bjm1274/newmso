import { MONTHLY_STANDARD_HOURS } from './tax-free-limits';

type NumericInput = number | string | null | undefined;
type HourlyRateRounding = 'round' | 'floor' | 'ceil';
type WorkConditionField = 'working_hours_per_week' | 'working_days_per_week';

function toFiniteNumber(value: unknown) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  const numeric = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toNumber(value: NumericInput, fallback = 0) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }
  const numeric = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveNestedWorkCondition(source: unknown, fieldName: WorkConditionField) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  const permissions =
    record.permissions && typeof record.permissions === 'object' && !Array.isArray(record.permissions)
      ? (record.permissions as Record<string, unknown>)
      : null;
  if (permissions) {
    const workConditions =
      permissions.work_conditions &&
      typeof permissions.work_conditions === 'object' &&
      !Array.isArray(permissions.work_conditions)
        ? (permissions.work_conditions as Record<string, unknown>)
        : null;
    const workConditionValue = workConditions ? toFiniteNumber(workConditions[fieldName]) : undefined;
    if (workConditionValue !== undefined) {
      return workConditionValue;
    }

    const permissionValue = toFiniteNumber(permissions[fieldName]);
    if (permissionValue !== undefined) {
      return permissionValue;
    }
  }

  return toFiniteNumber(record[fieldName]);
}

export function resolveWeeklyWorkingHours(source: unknown, fallback = 40) {
  const resolved = resolveNestedWorkCondition(source, 'working_hours_per_week');
  return resolved !== undefined ? resolved : toNumber(source as NumericInput, fallback);
}
export function resolveWorkingDaysPerWeek(source: unknown, fallback = 5) {
  const resolved = resolveNestedWorkCondition(source, 'working_days_per_week');
  return resolved !== undefined ? resolved : toNumber(source as NumericInput, fallback);
}

export function getMonthlyWorkingHours(weeklyHours: NumericInput, isAlternateDayShift?: boolean) {
  const normalizedWeeklyHours = toNumber(weeklyHours, 40);

  if (normalizedWeeklyHours <= 0) {
    return MONTHLY_STANDARD_HOURS;
  }

  if (isAlternateDayShift) {
    const dailyHours = normalizedWeeklyHours / 3.5;
    const weeklyBase = Math.min(8, dailyHours) * 3.5;
    const weeklyOvertime = Math.max(0, dailyHours - 8) * 3.5;
    const hBase = Math.round(MONTHLY_STANDARD_HOURS * (weeklyBase / 40) * 10) / 10;
    const hOver = weeklyOvertime * 4.345 * 1.5;
    return Math.max(1, Math.round((hBase + hOver) * 10) / 10);
  }

  return Math.max(
    1,
    Math.round(MONTHLY_STANDARD_HOURS * (normalizedWeeklyHours / 40) * 10) / 10,
  );
}

export function calculateHourlyRateFromMonthlySalary(
  monthlySalary: NumericInput,
  weeklyHours: NumericInput,
  rounding: HourlyRateRounding = 'ceil',
  isAlternateDayShift?: boolean,
) {
  const monthlyWorkingHours = getMonthlyWorkingHours(weeklyHours, isAlternateDayShift);
  const normalizedMonthlySalary = Math.max(0, toNumber(monthlySalary));
  const rawHourlyRate = monthlyWorkingHours > 0 ? normalizedMonthlySalary / monthlyWorkingHours : 0;

  switch (rounding) {
    case 'floor':
      return Math.floor(rawHourlyRate);
    case 'ceil':
      return Math.ceil(rawHourlyRate);
    default:
      return Math.round(rawHourlyRate);
  }
}
