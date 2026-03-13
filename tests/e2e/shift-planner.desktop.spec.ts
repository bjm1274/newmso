import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function openShiftPlanner(page: Page) {
  await page.goto('/main?open_menu=인사관리');
  await page.getByRole('button', { name: '교대근무' }).click();
  await expect(page.getByTestId('shift-suite-bar')).toBeVisible();
  await page.getByTestId('shift-suite-1').click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
}

async function openShiftPatternManager(page: Page) {
  await page.goto('/main?open_menu=인사관리');
  await page.getByRole('button', { name: '교대근무' }).click();
  await expect(page.getByTestId('shift-suite-bar')).toBeVisible();
  await page.getByTestId('shift-suite-3').click();
  await expect(page.getByTestId('roster-pattern-manager')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('shift management saves weekly mode and locks 3-shift rows to full-week workdays', async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    id: 'shift-admin-1',
    employee_no: 'SHIFT-ADM-001',
    name: 'Shift Admin',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: 'Operations',
    position: 'Director',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      mso: true,
      ['menu_관리자']: true,
      ['menu_인사관리']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
    orgTeams: [
      {
        company_name: 'AlphaClinic',
        team_name: 'Ward A',
        division: 'Nursing',
      },
      {
        id: 'shift-outpatient-day',
        name: '외래D',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '외래유형',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
      {
        id: 'shift-office-day',
        name: '통상상근',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '통상근무',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
    ],
    workShifts: [],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: '회사관리',
    },
  });

  await page.goto('/main?open_menu=관리자');
  await page.getByRole('button', { name: '근무형태' }).click();
  await expect(page.getByTestId('shift-management')).toBeVisible();

  await page.getByTestId('shift-create-button').click();
  await expect(page.getByTestId('shift-modal')).toBeVisible();
  await page.getByTestId('shift-name-input').fill('Full Week Day');
  await page.getByTestId('shift-workday-mode-all_days').click();
  await page.getByTestId('shift-company-AlphaClinic').check();

  const firstSaveRequest = page.waitForRequest(
    (request) => request.url().includes('/work_shifts') && request.method() === 'POST'
  );
  await page.getByTestId('shift-save-button').click();
  const firstPayload = JSON.parse((await firstSaveRequest).postData() || '[]')[0];

  expect(firstPayload.weekly_work_days).toBe(7);
  expect(firstPayload.is_weekend_work).toBe(true);

  await expect(page.getByText('Full Week Day')).toBeVisible();

  await page.getByTestId('shift-create-button').click();
  await expect(page.getByTestId('shift-modal')).toBeVisible();

  const shiftTypeSelect = page.getByTestId('shift-modal').locator('select').first();
  await shiftTypeSelect.selectOption('3교대');

  await expect(page.getByTestId('shift-workday-mode-weekdays')).toBeDisabled();
  await expect(page.getByText('현재 설정: 월~일 · 주 7일')).toBeVisible();

  await page.getByTestId('shift-name-input').fill('Forced Three Shift');
  await page.getByTestId('shift-company-AlphaClinic').check();

  const secondSaveRequest = page.waitForRequest(
    (request) => request.url().includes('/work_shifts') && request.method() === 'POST'
  );
  await page.getByTestId('shift-save-button').click();
  const secondPayload = JSON.parse((await secondSaveRequest).postData() || '[]')[0];

  expect(secondPayload.shift_type).toBe('3교대');
  expect(secondPayload.weekly_work_days).toBe(7);
  expect(secondPayload.is_weekend_work).toBe(true);
});

test('pattern planner keeps outpatient teams on weekday day shifts and weekends off', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'office-planner-1',
    employee_no: 'OFFICE-001',
    name: '외래 팀장',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '외래팀',
    position: '팀장',
    role: 'manager',
    shift_id: 'shift-outpatient-day',
    shift_type: '외래근무',
  };
  const officeMate = {
    ...fakeUser,
    id: 'office-planner-2',
    employee_no: 'OFFICE-002',
    name: '외래 스태프',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '외래팀',
    position: '사원',
    role: 'staff',
    shift_id: 'shift-outpatient-day',
    shift_type: '통상근무',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, officeMate],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-outpatient-day',
        name: '외래D',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '외래유형',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
      {
        id: 'shift-office-day',
        name: '통상상근',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '통상근무',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '병동N',
        start_time: '22:00:00',
        end_time: '07:00:00',
        shift_type: '3교대',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
    ],
  });
  await seedSession(page, {
    user: plannerUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '교대근무',
      erp_hr_tab: '교대근무',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await openShiftPlanner(page);
  await expect(page.getByTestId('planner-shift-chip-shift-outpatient-day')).toBeVisible();
  await expect(page.getByTestId('planner-shift-chip-shift-office-day')).toHaveCount(0);
  await expect(page.getByTestId('planner-shift-chip-shift-ward-night')).toHaveCount(0);

  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-generation-summary')).toContainText('외래팀');
  await expect(
    page.locator(`button[title^="${plannerUser.name} 2026-03-02 외래D"]`)
  ).toBeVisible();
  await expect(
    page.locator(`button[title^="${plannerUser.name} 2026-03-07 휴무"]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${officeMate.name} 2026-03-08 휴무"]`)
  ).toHaveText('OFF');
});

test('pattern planner narrows management and surgery teams to their allowed shift families', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'mgmt-planner-1',
    employee_no: 'MGMT-001',
    name: '관리 팀장',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '관리팀',
    position: '팀장',
    role: 'manager',
    shift_id: 'shift-manager',
    shift_type: '관리사유형',
  };
  const surgeryMate = {
    ...fakeUser,
    id: 'surgery-planner-1',
    employee_no: 'SURGERY-001',
    name: '수술 코디',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '수술팀',
    position: '주임',
    role: 'staff',
    shift_id: 'shift-office',
    shift_type: '통상근무',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, surgeryMate],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-manager',
        name: '관리사A',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '관리사유형',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
      {
        id: 'shift-office',
        name: '통상상근',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '통상근무',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
      {
        id: 'shift-outpatient',
        name: '외래D',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '외래유형',
        company_name: 'AlphaClinic',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_active: true,
      },
    ],
  });
  await seedSession(page, {
    user: plannerUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '교대근무',
      erp_hr_tab: '교대근무',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await openShiftPlanner(page);
  await expect(page.getByTestId('planner-shift-chip-shift-manager')).toBeVisible();
  await expect(page.getByTestId('planner-shift-chip-shift-office')).toHaveCount(0);
  await expect(page.getByTestId('planner-shift-chip-shift-outpatient')).toHaveCount(0);

  await page.getByTestId('roster-team-select').selectOption('수술팀');
  await expect(page.getByTestId('planner-shift-chip-shift-office')).toBeVisible();
  await expect(page.getByTestId('planner-shift-chip-shift-manager')).toHaveCount(0);
  await expect(page.getByTestId('planner-shift-chip-shift-outpatient')).toHaveCount(0);
});

test('saved ward pattern mixes day-fixed, night-fixed, and rotating staff in one roster', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-planner-1',
    employee_no: 'WARD-001',
    name: '병동 책임자',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const dayFixedMate = {
    ...fakeUser,
    id: 'ward-day-1',
    employee_no: 'WARD-D-001',
    name: '데이 전담 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '데이전담',
  };
  const nightFixedMate = {
    ...fakeUser,
    id: 'ward-night-1',
    employee_no: 'WARD-N-001',
    name: '나이트 전담 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '나이트전담',
  };
  const rotatingMate = {
    ...fakeUser,
    id: 'ward-rotate-1',
    employee_no: 'WARD-R-001',
    name: '순환 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, dayFixedMate, nightFixedMate, rotatingMate],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '병동D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3교대',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '병동E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3교대',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '병동N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3교대',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
    ],
  });
  await seedSession(page, {
    user: plannerUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '교대근무',
      erp_hr_tab: '교대근무',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await openShiftPatternManager(page);
  await page.getByTestId('pattern-name-input').fill('병동 혼합 3교대');
  await page.getByTestId('pattern-team-keywords-input').fill('병동팀');

  const groupCards = page.locator('[data-testid^="pattern-group-card-"]');

  const dayGroup = groupCards.nth(0);
  await dayGroup.locator('input').nth(0).fill('데이전담');
  await dayGroup.locator('input').nth(1).fill('데이전담');
  await dayGroup.getByRole('button', { name: /병동D/ }).click();

  const nightGroup = groupCards.nth(1);
  await nightGroup.locator('input').nth(0).fill('나이트전담');
  await nightGroup.locator('input').nth(1).fill('나이트전담');
  await nightGroup.getByRole('button', { name: /병동N/ }).click();

  const rotationGroup = groupCards.nth(2);
  await rotationGroup.locator('input').nth(0).fill('순환3교대');
  await rotationGroup.locator('input').nth(1).fill('3교대');
  await rotationGroup.getByRole('button', { name: /병동D/ }).click();
  await rotationGroup.getByRole('button', { name: /병동E/ }).click();
  await rotationGroup.getByRole('button', { name: /병동N/ }).click();

  await page.getByTestId('pattern-profile-save').click();
  await expect(page.getByText('병동 혼합 3교대')).toBeVisible();

  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
  await page.getByTestId('generation-rule-name-input').fill('병동 안전규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-rotation-night-count').fill('4');
  await page.getByTestId('generation-rule-night-block-size').fill('2');
  await page.getByTestId('generation-rule-off-days-after-night').fill('1');
  await page.getByTestId('generation-rule-save').click();
  await expect(page.getByText('병동 안전규칙')).toBeVisible();

  await page.getByTestId('shift-suite-1').click();
  await page.getByTestId('roster-pattern-profile-select').selectOption({ label: '병동 혼합 3교대' });
  await page.getByTestId('roster-generation-rule-select').selectOption({ label: '병동 안전규칙' });
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-generation-summary')).toContainText('병동 혼합 3교대');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('병동 안전규칙');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('데이전담 1명');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('나이트전담 1명');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('순환3교대 2명');
  await expect(
    page.locator(`button[title^="${dayFixedMate.name} 2026-03-02 병동D"]`)
  ).toBeVisible();
  await expect(
    page.locator(`button[title^="${dayFixedMate.name} 2026-03-07 휴무"]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${nightFixedMate.name} 2026-03-01 병동N"]`)
  ).toBeVisible();
  const rotatingRow = page.locator('tr').filter({ hasText: rotatingMate.name });
  await expect(rotatingRow).toContainText('N 4');
});
