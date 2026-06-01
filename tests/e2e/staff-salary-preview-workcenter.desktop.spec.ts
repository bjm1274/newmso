/**
 * staff-salary-preview-workcenter.desktop.spec.ts
 *
 * 워크센터 기준 재작성: 신규 직원 등록 모달 급여탭 미리보기.
 *
 * 진입 경로:
 *   erp_e2e_workcenter: '1' → 인사관리 워크센터(HrWorkcenterRouter) 렌더
 *   → erp_hr_workspace: 'member' (MemberWorkcenter) → new-staff-button 클릭
 *   → new-staff-modal → new-staff-tab-payroll
 *
 * 참고:
 *   - new-staff-button은 MemberWorkcenter/StaffTable.tsx에 존재하며,
 *     canRegisterNewStaff prop이 true일 때 노출됨.
 *     canRegisterNewStaff는 인사관리.tsx에서 hr_직원등록 권한 또는 admin으로 결정.
 *     fakeUser는 hr_직원등록: true를 갖고 있으므로 버튼이 표시됨.
 *   - new-staff-modal, new-staff-tab-* 는 StaffListManager(구성원현황.tsx)에서
 *     렌더되며, 워크센터에서 isRegistering=true 시 동일하게 렌더됨.
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

  // 워크센터 플래그: erp_e2e_workcenter=1 → webdriver여도 HrWorkcenterRouter 사용
  // erp_hr_workspace: 'member' → MemberWorkcenter 렌더 (구성원 탭)
  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: 'member',
      erp_hr_tab: 'member',
      erp_hr_workspace: 'member',
      erp_e2e_workcenter: '1',
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

test('workcenter: new staff payroll tab shows live total salary and hourly wage', async ({
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

test('workcenter: new staff affiliation tab accepts decimal weekly hours and reflects them in hourly wage', async ({
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

test('workcenter: new staff payroll tab floors the displayed hourly wage to the 2026 minimum when premium allowances distort reverse calculation', async ({
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
