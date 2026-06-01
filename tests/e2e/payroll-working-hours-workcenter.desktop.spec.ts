/**
 * payroll-working-hours-workcenter.desktop.spec.ts
 *
 * 워크센터 기준 재작성: 근로시간·시급 산정 공유 라이브러리 단위 검증.
 *
 * 원본(payroll-working-hours.desktop.spec.ts)과 동일한 라이브러리 함수를
 * 검증하되, 테스트 이름에 "workcenter:" prefix를 부여하여 워크센터 컨텍스트
 * 실행 목록에서 식별 가능하게 한다.
 *
 * 참고: 이 테스트들은 라이브러리 순수 함수를 검증하므로 브라우저 페이지를
 * 열지 않는다. erp_e2e_workcenter localStorage 플래그는 UI를 여는 테스트에만
 * 적용 가능하며, 여기서는 해당 없음.
 */

import { expect, test } from '@playwright/test';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek,
} from '../../lib/payroll-working-hours';

test('workcenter: monthly working hours follow the shared payroll standard', async () => {
  expect(getMonthlyWorkingHours(40)).toBe(209);
  expect(getMonthlyWorkingHours(40.5)).toBe(211.6);
  expect(getMonthlyWorkingHours(46)).toBe(240.4);
  expect(getMonthlyWorkingHours(0)).toBe(209);
});

test('workcenter: hourly wage conversion uses total fixed monthly pay with the shared divisor', async () => {
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40)).toBe(20_126);
  expect(calculateHourlyRateFromMonthlySalary(4_206_170, 40, 'floor')).toBe(20_125);
  expect(calculateHourlyRateFromMonthlySalary(2_430_360, 46)).toBe(10_110);
  expect(calculateHourlyRateFromMonthlySalary(2_299_025.733, 40)).toBe(11_001);
});

test('workcenter: weekly work conditions can be restored from permissions fallback', async () => {
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
