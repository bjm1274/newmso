import { expect, test } from '@playwright/test';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
} from '../../lib/payroll-working-hours';

test('monthly working hours follow the shared payroll standard', async () => {
  expect(getMonthlyWorkingHours(40)).toBe(209);
  expect(getMonthlyWorkingHours(46)).toBe(240.4);
  expect(getMonthlyWorkingHours(0)).toBe(209);
});

test('hourly wage conversion uses total fixed monthly pay with the shared divisor', async () => {
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40)).toBe(20_125);
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40, 'floor')).toBe(20_125);
  expect(calculateHourlyRateFromMonthlySalary(2_430_360, 46)).toBe(10_110);
});
