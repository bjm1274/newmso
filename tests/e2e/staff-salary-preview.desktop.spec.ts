/**
 * staff-salary-preview.desktop.spec.ts
 *
 * 신규 직원 등록 모달 급여탭 미리보기.
 * 진입 경로: 인사관리 워크센터(HrWorkcenterRouter) → erp_hr_workspace: 'member' (MemberWorkcenter) → new-staff-button
 */

import { expect, test, type Page } from '@playwright/test';
import {
  dismissDialogs,
  fakeUser,
  mockSupabase,
  seedSession,
} from './helpers';

function buildHrUser() {
  return {
    ...fakeUser,
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_구성원: true,
    },
  };
}

async function openNewStaffPayroll(page: Page) {
  const hrUser = buildHrUser();

  await mockSupabase(page, {
    staffMembers: [hrUser],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: 'member',
      erp_hr_tab: 'member',
      erp_hr_workspace: 'member',
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`,
  );

  await expect(page.getByTestId('new-staff-button')).toBeVisible();
  await page.getByTestId('new-staff-button').click();
  await expect(page.getByTestId('new-staff-modal')).toBeVisible();
  await page.getByTestId('new-staff-tab-payroll').click();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('new staff payroll tab shows live total salary and hourly wage', async ({
  page,
}) => {
  await openNewStaffPayroll(page);

  await page.getByTestId('new-staff-salary-base_salary').fill('3000000');
  await page.getByTestId('new-staff-salary-position_allowance').fill('200000');
  await page.getByTestId('new-staff-taxfree-other_taxfree').fill('100000');

  await expect(page.getByTestId('new-staff-total-salary')).toHaveText(
    '3,300,000원',
  );
  await expect(page.getByTestId('new-staff-hourly-wage')).toHaveText(
    '15,790원',
  );
});

test('new staff affiliation tab accepts decimal weekly hours and reflects them in hourly wage', async ({
  page,
}) => {
  await openNewStaffPayroll(page);

  await page.getByTestId('new-staff-tab-affiliation').click();
  await page.getByTestId('new-staff-working-hours-per-week').fill('40.5');
  await expect(page.getByTestId('new-staff-working-hours-per-week')).toHaveValue('40.5');

  await page.getByTestId('new-staff-tab-payroll').click();
  await page.getByTestId('new-staff-salary-base_salary').fill('3300000');

  await expect(page.getByText('월 소정근로시간 211.6시간 기준')).toBeVisible();
  await expect(page.getByTestId('new-staff-hourly-wage')).toHaveText(
    '15,596원',
  );
});

test('new staff payroll tab floors the displayed hourly wage to the 2026 minimum when premium allowances distort reverse calculation', async ({
  page,
}) => {
  await openNewStaffPayroll(page);

  await page.getByTestId('new-staff-tab-affiliation').click();
  await page.getByTestId('new-staff-working-hours-per-week').fill('46');
  await page.getByTestId('new-staff-tab-payroll').click();
  await page.getByTestId('new-staff-salary-base_salary').fill('1627880');
  await page.getByTestId('new-staff-salary-overtime_allowance').fill('185760');
  await page.getByTestId('new-staff-salary-night_work_allowance').fill('216720');
  await page.getByTestId('new-staff-taxfree-meal_allowance').fill('200000');
  await page.getByTestId('new-staff-taxfree-other_taxfree').fill('200000');

  await expect(page.getByTestId('new-staff-total-salary')).toHaveText(
    '2,430,360원',
  );
  await expect(page.getByTestId('new-staff-hourly-wage')).toHaveText(
    '10,320원',
  );
});
