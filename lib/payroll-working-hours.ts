import { MONTHLY_STANDARD_HOURS } from './tax-free-limits';

type NumericInput = number | string | null | undefined;
type HourlyRateRounding = 'round' | 'floor' | 'ceil';
type WorkConditionField = 'working_hours_per_week' | 'working_days_per_week';

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toNumber(value: NumericInput, fallback = 0) {
  const numeric = Number(value);
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

export function getMonthlyWorkingHours(weeklyHours: NumericInput) {
  const normalizedWeeklyHours = toNumber(weeklyHours, 40);

  if (normalizedWeeklyHours <= 0) {
    return MONTHLY_STANDARD_HOURS;
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
) {
  const monthlyWorkingHours = getMonthlyWorkingHours(weeklyHours);
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
