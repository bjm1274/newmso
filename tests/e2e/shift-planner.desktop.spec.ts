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
  await expect(page.getByTestId('roster-pattern-manager').getByText('병동 혼합 3교대')).toBeVisible();

  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
  await page.getByTestId('generation-rule-name-input').fill('병동 안전규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-rotation-night-min-count').fill('3');
  await page.getByTestId('generation-rule-rotation-night-max-count').fill('4');
  await page.getByTestId('generation-rule-night-block-size').fill('2');
  await page.getByTestId('generation-rule-off-days-after-night').fill('1');
  await page.getByTestId('generation-rule-save').click();
  await expect(
    page.getByTestId('roster-rule-manager').getByText('병동 안전규칙'),
  ).toBeVisible();

  await page.getByTestId('shift-suite-1').click();
  await page.getByTestId('roster-pattern-profile-select').selectOption({ label: '병동 혼합 3교대' });
  await page.getByTestId('roster-generation-rule-select').selectOption({ label: '병동 안전규칙' });
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-generation-summary')).toContainText('병동 혼합 3교대');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('병동 안전규칙');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('데이전담 1명');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('나이트전담 1명');
  await expect(page.getByTestId('roster-generation-summary')).toContainText('순환3교대 2명');
  await expect(page.getByTestId('roster-warning-report')).toBeVisible();
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/D\s+\d+/);
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/E\s+\d+/);
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/N\s+\d+/);
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
  const rotatingNightCount = await rotatingRow.locator('button[title]').evaluateAll((buttons) =>
    buttons.filter((button) => (button.textContent || '').trim() === 'N').length
  );
  expect(rotatingNightCount).toBeGreaterThanOrEqual(3);

  const rotatingDayEveningSequence = await rotatingRow.locator('button[title]').evaluateAll((buttons) =>
    buttons
      .map((button) => (button.textContent || '').trim())
      .filter((code) => code === 'D' || code === 'E')
      .slice(0, 8)
  );

  await expect(page.getByTestId('roster-fairness-board')).toBeVisible();
  await expect(page.getByTestId(`roster-fairness-row-${dayFixedMate.id}`)).toContainText(dayFixedMate.name);

  expect(
    rotatingDayEveningSequence.some((code, index, list) => index > 0 && code === list[index - 1])
  ).toBeTruthy();
});

test('ward auto generation detects dedicated staff without a saved pattern profile', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-planner-auto-1',
    employee_no: 'WARD-AUTO-001',
    name: '\uBCD1\uB3D9 \uCC45\uC784\uC790',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uC218\uAC04\uD638\uC0AC',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };
  const dayFixedMate = {
    ...fakeUser,
    id: 'ward-auto-day-1',
    employee_no: 'WARD-AUTO-D-001',
    name: '\uB370\uC774 \uC804\uB2F4 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '\uB370\uC774\uC804\uB2F4',
  };
  const nightFixedMate = {
    ...fakeUser,
    id: 'ward-auto-night-1',
    employee_no: 'WARD-AUTO-N-001',
    name: '\uB098\uC774\uD2B8 \uC804\uB2F4 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '\uB098\uC774\uD2B8\uC804\uB2F4',
  };
  const rotatingMate = {
    ...fakeUser,
    id: 'ward-auto-rotate-1',
    employee_no: 'WARD-AUTO-R-001',
    name: '\uC21C\uD658 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3\uAD50\uB300',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, dayFixedMate, nightFixedMate, rotatingMate],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '\uBCD1\uB3D9D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '\uBCD1\uB3D9E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '\uBCD1\uB3D9N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3\uAD50\uB300',
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
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPlanner(page);
  await expect(page.getByTestId('roster-pattern-group-preview')).toContainText('\uB370\uC774\uC804\uB2F4 1\uBA85');
  await expect(page.getByTestId('roster-pattern-group-preview')).toContainText('\uB098\uC774\uD2B8\uC804\uB2F4 1\uBA85');
  await expect(page.getByTestId('roster-pattern-group-preview')).toContainText('\uC21C\uD658\uADFC\uBB34 2\uBA85');

  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-generation-summary')).toContainText('\uBCD1\uB3D9\uD300');
  await expect(page.locator('button[title*="2026-03-01 \uBCD1\uB3D9D"]').first()).toBeVisible();
  await expect(page.locator('button[title*="2026-03-01 \uBCD1\uB3D9E"]').first()).toBeVisible();
  await expect(page.locator('button[title*="2026-03-01 \uBCD1\uB3D9N"]').first()).toBeVisible();
  await expect(
    page.locator(`button[title^="${dayFixedMate.name} 2026-03-03 \uBCD1\uB3D9D"]`)
  ).toBeVisible();
  await expect(
    page.locator(`button[title^="${nightFixedMate.name} 2026-03-01 \uBCD1\uB3D9N"]`)
  ).toBeVisible();
});

test('ward generation clearly marks staff shortage when minimum D/E/N exceeds available headcount', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-shortage-1',
    employee_no: 'WARD-SHORT-001',
    name: '병동 책임자',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const shortageMate = {
    ...fakeUser,
    id: 'ward-shortage-2',
    employee_no: 'WARD-SHORT-002',
    name: '간호사2',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, shortageMate],
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
  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
  await page.getByTestId('generation-rule-name-input').fill('병동 인원부족 규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-save').click();

  await page.getByTestId('shift-suite-1').click();
  await page.getByTestId('roster-generation-rule-select').selectOption({ label: '병동 인원부족 규칙' });
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-staff-shortage-summary')).toContainText('인원 부족');
  await expect(page.getByTestId('roster-staff-shortage-summary')).toContainText('최소 3명 / 현재 2명');
  await expect(page.getByTestId('roster-warning-report')).toContainText('인원 부족');
});

test('ward generation rule limits consecutive work days while preserving weekend coverage', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-rule-planner-1',
    employee_no: 'WARD-RULE-001',
    name: '\uBCD1\uB3D9 \uCC45\uC784\uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uC218\uAC04\uD638\uC0AC',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };
  const staffMembers = [
    plannerUser,
    {
      ...fakeUser,
      id: 'ward-rule-2',
      employee_no: 'WARD-RULE-002',
      name: '\uAC04\uD638\uC0AC2',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-rule-3',
      employee_no: 'WARD-RULE-003',
      name: '\uAC04\uD638\uC0AC3',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-rule-4',
      employee_no: 'WARD-RULE-004',
      name: '\uAC04\uD638\uC0AC4',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-rule-5',
      employee_no: 'WARD-RULE-005',
      name: '\uAC04\uD638\uC0AC5',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3\uAD50\uB300',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '\uBCD1\uB3D9D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '\uBCD1\uB3D9E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '\uBCD1\uB3D9N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3\uAD50\uB300',
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
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPatternManager(page);
  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();

  await page.getByTestId('generation-rule-name-input').fill('\uBCD1\uB3D9 \uC778\uB825\uC548\uC804\uADDC\uCE59');
  await page.getByTestId('generation-rule-team-keywords-input').fill('\uBCD1\uB3D9\uD300');
  await page.getByTestId('generation-rule-max-consecutive-work-days').fill('3');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-min-monthly-off-days').fill('7');
  await page.getByTestId('generation-rule-save').click();

  await page.getByTestId('shift-suite-1').click();
  await page.getByTestId('roster-generation-rule-select').selectOption({
    label: '\uBCD1\uB3D9 \uC778\uB825\uC548\uC804\uADDC\uCE59',
  });
  await page.getByTestId('roster-auto-generate').click();

  const weekendDates = new Set([
    '2026-03-01',
    '2026-03-07',
    '2026-03-08',
    '2026-03-14',
    '2026-03-15',
    '2026-03-21',
    '2026-03-22',
    '2026-03-28',
    '2026-03-29',
  ]);

  const weekendLoads: number[] = [];
  for (const staff of staffMembers) {
    const row = page.locator('tr').filter({ hasText: staff.name });
    const codes = await row.locator('button[title]').evaluateAll((buttons) =>
      buttons.map((button) => (button.textContent || '').trim())
    );
    let streak = 0;
    let maxStreak = 0;
    codes.forEach((code) => {
      if (code === 'OFF') {
        streak = 0;
      } else {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      }
    });
    expect(maxStreak).toBeLessThanOrEqual(5);
    expect(codes.filter((code) => code === 'OFF').length).toBeGreaterThanOrEqual(7);

    const titles = await row.locator('button[title]').evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('title') || '')
    );
    weekendLoads.push(
      titles.filter((title, index) => {
        const date = title.split(' ')[1] || '';
        return weekendDates.has(date) && codes[index] !== 'OFF';
      }).length
    );
  }

  await expect(
    page.locator('button[title^="병동 책임간호사 2026-03-01 병동D"], button[title^="간호사2 2026-03-01 병동D"], button[title^="간호사3 2026-03-01 병동D"], button[title^="간호사4 2026-03-01 병동D"], button[title^="간호사5 2026-03-01 병동D"]')
      .first()
  ).toBeVisible();
  await expect(
    page.locator('button[title^="병동 책임간호사 2026-03-01 병동E"], button[title^="간호사2 2026-03-01 병동E"], button[title^="간호사3 2026-03-01 병동E"], button[title^="간호사4 2026-03-01 병동E"], button[title^="간호사5 2026-03-01 병동E"]')
      .first()
  ).toBeVisible();
  await expect(
    page.locator('button[title^="병동 책임간호사 2026-03-01 병동N"], button[title^="간호사2 2026-03-01 병동N"], button[title^="간호사3 2026-03-01 병동N"], button[title^="간호사4 2026-03-01 병동N"], button[title^="간호사5 2026-03-01 병동N"]')
      .first()
  ).toBeVisible();
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/D\s+\d+/);
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/E\s+\d+/);
  await expect(page.getByTestId('roster-preview-coverage-2026-03-01')).toContainText(/N\s+\d+/);
  expect(Math.max(...weekendLoads) - Math.min(...weekendLoads)).toBeLessThanOrEqual(9);
});

test('ward generation rule can block a day shift immediately after an evening shift', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-evening-rule-planner-1',
    employee_no: 'WARD-EVE-001',
    name: '\uBCD1\uB3D9 \uCC45\uC784\uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uC218\uAC04\uD638\uC0AC',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };
  const staffMembers = [
    plannerUser,
    {
      ...fakeUser,
      id: 'ward-evening-rule-2',
      employee_no: 'WARD-EVE-002',
      name: '\uAC04\uD638\uC0AC2',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-evening-rule-3',
      employee_no: 'WARD-EVE-003',
      name: '\uAC04\uD638\uC0AC3',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-evening-rule-4',
      employee_no: 'WARD-EVE-004',
      name: '\uAC04\uD638\uC0AC4',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3\uAD50\uB300',
    },
    {
      ...fakeUser,
      id: 'ward-evening-rule-5',
      employee_no: 'WARD-EVE-005',
      name: '\uAC04\uD638\uC0AC5',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '\uBCD1\uB3D9\uD300',
      position: '\uAC04\uD638\uC0AC',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3\uAD50\uB300',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '\uBCD1\uB3D9D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '\uBCD1\uB3D9E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '\uBCD1\uB3D9N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3\uAD50\uB300',
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
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPatternManager(page);
  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();

  await page.getByTestId('generation-rule-name-input').fill('\uBCD1\uB3D9 \uC774\uBE0C \uBCF4\uD638\uADDC\uCE59');
  await page.getByTestId('generation-rule-team-keywords-input').fill('\uBCD1\uB3D9\uD300');
  await page.getByTestId('generation-rule-avoid-day-after-evening').check();
  await page.getByTestId('generation-rule-save').click();

  await page.getByTestId('shift-suite-1').click();
  await page.getByTestId('roster-generation-rule-select').selectOption({
    label: '\uBCD1\uB3D9 \uC774\uBE0C \uBCF4\uD638\uADDC\uCE59',
  });
  await page.getByTestId('roster-auto-generate').click();

  for (const staff of staffMembers) {
    const row = page.locator('tr').filter({ hasText: staff.name });
    const codes = await row.locator('button[title]').evaluateAll((buttons) =>
      buttons.map((button) => (button.textContent || '').trim())
    );
    expect(codes.includes('E')).toBeTruthy();
    const hasEveningToDay = codes.some((code, index) => code === 'E' && codes[index + 1] === 'D');
    expect(hasEveningToDay).toBeFalsy();
  }
});

test('ward auto generation keeps approved leave dates off in the roster', async ({ page }) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-leave-planner-1',
    employee_no: 'WARD-LEAVE-001',
    name: '\uBCD1\uB3D9 \uCC45\uC784\uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uC218\uAC04\uD638\uC0AC',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };
  const leaveStaff = {
    ...fakeUser,
    id: 'ward-leave-2',
    employee_no: 'WARD-LEAVE-002',
    name: '\uD734\uAC00 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3\uAD50\uB300',
  };
  const supportStaff = {
    ...fakeUser,
    id: 'ward-leave-3',
    employee_no: 'WARD-LEAVE-003',
    name: '\uBCF4\uC870 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3\uAD50\uB300',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, leaveStaff, supportStaff],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '\uBCD1\uB3D9D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '\uBCD1\uB3D9E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '\uBCD1\uB3D9N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
    ],
    leaveRequests: [
      {
        id: 'leave-ward-1',
        staff_id: leaveStaff.id,
        leave_type: '\uC5F0\uCC28',
        start_date: '2026-03-10',
        end_date: '2026-03-12',
        status: '\uC2B9\uC778',
      },
    ],
  });
  await seedSession(page, {
    user: plannerUser,
    localStorage: {
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPlanner(page);
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-leave-coverage-summary')).toContainText(
    '\uC2B9\uC778 \uD734\uAC00 1\uAC74 \u00B7 3\uC77C \uBC18\uC601'
  );
  await expect(
    page.locator(`button[title^="${leaveStaff.name} 2026-03-10 "]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${leaveStaff.name} 2026-03-11 "]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${leaveStaff.name} 2026-03-12 "]`)
  ).toHaveText('OFF');
});

test('ward auto generation applies personal preferred off dates before building the roster', async ({
  page,
}) => {
  const plannerUser = {
    ...fakeUser,
    id: 'ward-preferred-off-planner-1',
    employee_no: 'WARD-PREF-001',
    name: '\uBCD1\uB3D9 \uCC45\uC784\uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uC218\uAC04\uD638\uC0AC',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };
  const preferredOffStaff = {
    ...fakeUser,
    id: 'ward-preferred-off-2',
    employee_no: 'WARD-PREF-002',
    name: '\uD76C\uB9DDOFF \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3\uAD50\uB300',
  };
  const supportStaff = {
    ...fakeUser,
    id: 'ward-preferred-off-3',
    employee_no: 'WARD-PREF-003',
    name: '\uBCF4\uC870 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3\uAD50\uB300',
  };

  await mockSupabase(page, {
    staffMembers: [plannerUser, preferredOffStaff, supportStaff],
    companies: [{ id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true }],
    workShifts: [
      {
        id: 'shift-ward-day',
        name: '\uBCD1\uB3D9D',
        start_time: '07:00:00',
        end_time: '15:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-evening',
        name: '\uBCD1\uB3D9E',
        start_time: '15:00:00',
        end_time: '23:00:00',
        shift_type: '3\uAD50\uB300',
        company_name: 'AlphaClinic',
        weekly_work_days: 7,
        is_weekend_work: true,
        is_active: true,
      },
      {
        id: 'shift-ward-night',
        name: '\uBCD1\uB3D9N',
        start_time: '23:00:00',
        end_time: '07:00:00',
        shift_type: '3\uAD50\uB300',
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
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPlanner(page);
  await page.getByTestId('preferred-off-staff-select').selectOption(preferredOffStaff.id);
  await page.getByTestId('preferred-off-date-select').selectOption('2026-03-18');
  await page.getByTestId('preferred-off-add').click();
  await page.getByTestId('preferred-off-date-select').selectOption('2026-03-19');
  await page.getByTestId('preferred-off-add').click();

  await expect(
    page.getByTestId(`preferred-off-chip-${preferredOffStaff.id}-2026-03-18`)
  ).toBeVisible();
  await expect(
    page.getByTestId(`preferred-off-chip-${preferredOffStaff.id}-2026-03-19`)
  ).toBeVisible();

  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-preferred-off-summary')).toContainText(
    '\uD76C\uB9DD OFF 2\uAC74 \uBC18\uC601'
  );
  await expect(
    page.locator(`button[title^="${preferredOffStaff.name} 2026-03-18 "]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${preferredOffStaff.name} 2026-03-19 "]`)
  ).toHaveText('OFF');
});
