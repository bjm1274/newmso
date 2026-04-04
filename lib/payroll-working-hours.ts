import { MONTHLY_STANDARD_HOURS } from './tax-free-limits';

type NumericInput = number | string | null | undefined;
type HourlyRateRounding = 'round' | 'floor' | 'ceil';

function toNumber(value: NumericInput, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  rounding: HourlyRateRounding = 'round',
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
