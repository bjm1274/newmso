import { expect, test } from '@playwright/test';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek,
} from '../../lib/payroll-working-hours';

test('monthly working hours follow the shared payroll standard', async () => {
  expect(getMonthlyWorkingHours(40)).toBe(209);
  expect(getMonthlyWorkingHours(40.5)).toBe(211.6);
  expect(getMonthlyWorkingHours(46)).toBe(240.4);
  expect(getMonthlyWorkingHours(0)).toBe(209);
});

test('hourly wage conversion uses total fixed monthly pay with the shared divisor', async () => {
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40)).toBe(20_126);
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40, 'floor')).toBe(20_125);
  expect(calculateHourlyRateFromMonthlySalary(2_430_360, 46)).toBe(10_110);
  expect(calculateHourlyRateFromMonthlySalary(2_299_025.733, 40)).toBe(11_001);
});

test('weekly work conditions can be restored from permissions fallback', async () => {
  const legacyStaff = {
    permissions: {
      work_conditions: {
        working_hours_per_week: 45.5,
        working_days_per_week: 5,
      },
    },
  };

  expect(resolveWeeklyWorkingHours(legacyStaff, 40)).toBe(45.5);
  expect(resolveWorkingDaysPerWeek(legacyStaff, 5)).toBe(5);
});
