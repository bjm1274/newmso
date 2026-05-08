import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function installFixedDate(page: Page, initialIso = '2026-03-01T09:00:00+09:00') {
  await page.addInitScript(({ iso }) => {
    const RealDate = Date;
    const fixedTime = new RealDate(iso).getTime();

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }
        // @ts-expect-error browser test shim
        super(...args);
      }

      static now() {
        return fixedTime;
      }
    }

    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    // @ts-expect-error browser test shim
    window.Date = MockDate;
  }, { iso: initialIso });
}

async function openShiftPlanner(page: Page) {
  await openAdminRosterPolicy(page, 'planner');
}

async function openAdminRosterPolicy(page: Page, tab: 'planner' | 'rules' | 'patterns') {
  await installFixedDate(page);
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '관리자', open_subview: '회사관리' }).toString()}`
  );
  await expect(page.getByTestId('company-manager-view')).toBeVisible();
  await page.getByTestId('company-manager-tab-rosterPolicy').click();

  if (tab === 'rules') {
    await page.getByRole('button', { name: '근무 규칙', exact: true }).click();
    await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
    return;
  }

  if (tab === 'patterns') {
    await page.getByRole('button', { name: '근무 패턴', exact: true }).click();
    await expect(page.getByTestId('roster-pattern-manager')).toBeVisible();
    return;
  }

  await page.getByRole('button', { name: '월간 편성 저장', exact: true }).click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
}

async function openShiftPatternManager(page: Page) {
  await openAdminRosterPolicy(page, 'patterns');
}

async function switchAdminRosterTab(page: Page, tab: 'planner' | 'rules' | 'patterns') {
  if (tab === 'rules') {
    await page.getByRole('button', { name: '근무 규칙', exact: true }).click();
    await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
    return;
  }

  if (tab === 'patterns') {
    await page.getByRole('button', { name: '근무 패턴', exact: true }).click();
    await expect(page.getByTestId('roster-pattern-manager')).toBeVisible();
    return;
  }

  await page.getByRole('button', { name: '월간 편성 저장', exact: true }).click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
}

function createRosterAdminUser() {
  return {
    ...fakeUser,
    id: 'roster-admin-user',
    employee_no: 'ROSTER-ADM-001',
    name: '근무표 관리자',
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
  const rosterAdminUser = createRosterAdminUser();
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
    permissions: {
      ...fakeUser.permissions,
      ['menu_인사관리']: true,
    },
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
    staffMembers: [rosterAdminUser, plannerUser, officeMate],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-team-select').selectOption('외래팀');
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
  const rosterAdminUser = createRosterAdminUser();
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
    permissions: {
      ...fakeUser.permissions,
      ['menu_인사관리']: true,
    },
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
    staffMembers: [rosterAdminUser, plannerUser, surgeryMate],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-team-select').selectOption('관리팀');
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
  const rosterAdminUser = createRosterAdminUser();
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
    staffMembers: [rosterAdminUser, plannerUser, dayFixedMate, nightFixedMate, rotatingMate],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '근태',
      erp_hr_tab: '근태',
      erp_hr_workspace: '근태 · 급여',
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

  await switchAdminRosterTab(page, 'rules');
  await page.getByTestId('generation-rule-name-input').fill('병동 안전규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-rotation-night-min-count').fill('3');
  await page.getByTestId('generation-rule-rotation-night-max-count').fill('4');
  await page.getByTestId('generation-rule-night-block-size').fill('2');
  await page.getByTestId('generation-rule-off-days-after-night').fill('1');
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
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
  const rosterAdminUser = createRosterAdminUser();
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
    staffMembers: [rosterAdminUser, plannerUser, dayFixedMate, nightFixedMate, rotatingMate],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
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
  const rosterAdminUser = createRosterAdminUser();
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
    staffMembers: [rosterAdminUser, plannerUser, shortageMate],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '근태',
      erp_hr_tab: '근태',
      erp_hr_workspace: '근태 · 급여',
    },
  });

  await openShiftPatternManager(page);
  await switchAdminRosterTab(page, 'rules');
  await page.getByTestId('generation-rule-name-input').fill('병동 인원부족 규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
  await page.getByTestId('roster-generation-rule-select').selectOption({ label: '병동 인원부족 규칙' });
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByText('생성 전 확인 필요')).toBeVisible();
  await expect(page.locator('body')).toContainText('최소 인원 합계가 현재 직원 수를 초과합니다');
});

test('ward generation rule limits consecutive work days while preserving weekend coverage', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
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
    staffMembers: [rosterAdminUser, ...staffMembers],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPatternManager(page);
  await switchAdminRosterTab(page, 'rules');

  await page.getByTestId('generation-rule-name-input').fill('\uBCD1\uB3D9 \uC778\uB825\uC548\uC804\uADDC\uCE59');
  await page.getByTestId('generation-rule-team-keywords-input').fill('\uBCD1\uB3D9\uD300');
  await page.getByTestId('generation-rule-max-consecutive-work-days').fill('3');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-min-monthly-off-days').fill('7');
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
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
  const rosterAdminUser = createRosterAdminUser();
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
    staffMembers: [rosterAdminUser, ...staffMembers],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '\uC778\uC0AC\uAD00\uB9AC',
      erp_last_subview: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_tab: '\uAD50\uB300\uADFC\uBB34',
      erp_hr_workspace: '\uADFC\uD0DC \uBC0F \uAE09\uC5EC',
    },
  });

  await openShiftPatternManager(page);
  await switchAdminRosterTab(page, 'rules');

  await page.getByTestId('generation-rule-name-input').fill('\uBCD1\uB3D9 \uC774\uBE0C \uBCF4\uD638\uADDC\uCE59');
  await page.getByTestId('generation-rule-team-keywords-input').fill('\uBCD1\uB3D9\uD300');
  await page.getByTestId('generation-rule-avoid-day-after-evening').check();
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
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
  const rosterAdminUser = createRosterAdminUser();
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
  const coverageStaff = {
    ...fakeUser,
    id: 'ward-leave-4',
    employee_no: 'WARD-LEAVE-004',
    name: '\uCEE4\uBC84 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };

  await mockSupabase(page, {
    staffMembers: [rosterAdminUser, plannerUser, leaveStaff, supportStaff, coverageStaff],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '\uAD00\uB9AC\uC790',
      erp_last_subview: '\uD68C\uC0AC\uAD00\uB9AC',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-team-select').selectOption('\uBCD1\uB3D9\uD300');
  await page.getByTestId('roster-auto-generate').click();

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
  const rosterAdminUser = createRosterAdminUser();
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
  const coverageStaff = {
    ...fakeUser,
    id: 'ward-preferred-off-4',
    employee_no: 'WARD-PREF-004',
    name: '\uCEE4\uBC84 \uAC04\uD638\uC0AC',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '\uBCD1\uB3D9\uD300',
    position: '\uAC04\uD638\uC0AC',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '3\uAD50\uB300',
  };

  await mockSupabase(page, {
    staffMembers: [rosterAdminUser, plannerUser, preferredOffStaff, supportStaff, coverageStaff],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '\uAD00\uB9AC\uC790',
      erp_last_subview: '\uD68C\uC0AC\uAD00\uB9AC',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-team-select').selectOption('\uBCD1\uB3D9\uD300');
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

  await expect(
    page.locator(`button[title^="${preferredOffStaff.name} 2026-03-18 "]`)
  ).toHaveText('OFF');
  await expect(
    page.locator(`button[title^="${preferredOffStaff.name} 2026-03-19 "]`)
  ).toHaveText('OFF');
});

test('ward planner exposes review, manual impact, and partial regeneration controls', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
  const preferredOffStaff = {
    ...fakeUser,
    id: 'ward-review-2',
    employee_no: 'WARD-REVIEW-002',
    name: '검수 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
  };
  const supportStaffA = {
    ...fakeUser,
    id: 'ward-review-3',
    employee_no: 'WARD-REVIEW-003',
    name: '지원 간호사A',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3교대',
  };
  const supportStaffB = {
    ...fakeUser,
    id: 'ward-review-4',
    employee_no: 'WARD-REVIEW-004',
    name: '지원 간호사B',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const supportStaffC = {
    ...fakeUser,
    id: 'ward-review-5',
    employee_no: 'WARD-REVIEW-005',
    name: '지원 간호사C',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
  };
  const supportStaffD = {
    ...fakeUser,
    id: 'ward-review-6',
    employee_no: 'WARD-REVIEW-006',
    name: '지원 간호사D',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3교대',
  };

  await mockSupabase(page, {
    staffMembers: [
      rosterAdminUser,
      preferredOffStaff,
      supportStaffA,
      supportStaffB,
      supportStaffC,
      supportStaffD,
    ],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-team-select').selectOption('병동팀');
  await page.getByTestId('roster-auto-generate').click();

  await expect(page.getByTestId('roster-review-panel')).toBeVisible();
  await expect(page.getByTestId('roster-partial-regeneration-panel')).toBeVisible();

  await page.getByRole('button', { name: '수동 수정' }).click();
  await page.locator(`button[title^="${preferredOffStaff.name} 2026-03-01 "]`).click();
  await expect(page.getByTestId('roster-manual-impact-panel')).toBeVisible();

  await page.getByTestId('roster-partial-staff-select').selectOption(preferredOffStaff.id);
  await page.getByTestId('roster-partial-start-date').selectOption('2026-03-10');
  await page.getByTestId('roster-partial-end-date').selectOption('2026-03-12');
  await page.getByTestId('roster-partial-regenerate').click();

  await expect(page.getByTestId('roster-generation-summary')).toContainText('선택한 범위만 다시 생성');
});

test('ward wizard and AI recommendation use hospital 3-shift constraints, preferred off, and night ranges', async ({
  page,
}) => {
  const rosterAdminUser = {
    ...createRosterAdminUser(),
    id: 'ward-ai-planner-1',
    employee_no: 'WARD-AI-001',
    name: '병동 책임간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const preferredOffStaff = {
    ...fakeUser,
    id: 'ward-ai-nurse-2',
    employee_no: 'WARD-AI-002',
    name: '희망OFF 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
    join_date: '2025-11-15',
  };
  const leaveStaff = {
    ...fakeUser,
    id: 'ward-ai-nurse-3',
    employee_no: 'WARD-AI-003',
    name: '휴가 간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3교대',
  };
  const supportStaffA = {
    ...fakeUser,
    id: 'ward-ai-nurse-4',
    employee_no: 'WARD-AI-004',
    name: '지원 간호사A',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const supportStaffB = {
    ...fakeUser,
    id: 'ward-ai-nurse-5',
    employee_no: 'WARD-AI-005',
    name: '지원 간호사B',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
  };
  const supportStaffC = {
    ...fakeUser,
    id: 'ward-ai-nurse-6',
    employee_no: 'WARD-AI-006',
    name: '지원 간호사C',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-night',
    shift_type: '3교대',
  };

  let recommendationRequest: any = null;
  await page.route('**/api/ai/roster-recommendation', async (route) => {
    recommendationRequest = route.request().postDataJSON();
    const body = recommendationRequest as {
      monthDates: string[];
      staffs: Array<{ id: string }>;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'AI 병동 추천',
        teamAnalysis: {
          teamPurpose: '병동 3교대 운영',
          workMode: '병동 3교대',
          includesNight: true,
          reasoning: ['최소 커버 인원 반영'],
          planningFocus: ['희망 OFF 우선', '나이트 후 휴식'],
        },
        staffPlans: body.staffs.map((staff, index) => ({
          staffId: staff.id,
          modeLabel: index === 0 ? '순환 근무' : '일반 배치',
          rationale: '테스트용 추천 결과',
          assignments: body.monthDates.map((_, dateIndex) =>
            dateIndex % 4 === 0 ? 'shift-ward-day' : '__OFF__'
          ),
        })),
      }),
    });
  });

  await mockSupabase(page, {
    staffMembers: [
      rosterAdminUser,
      preferredOffStaff,
      leaveStaff,
      supportStaffA,
      supportStaffB,
      supportStaffC,
    ],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    leaveRequests: [
      {
        id: 'leave-ward-ai-1',
        staff_id: leaveStaff.id,
        start_date: '2026-03-10',
        end_date: '2026-03-11',
        status: '승인',
      },
    ],
  });
  await seedSession(page, {
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-wizard-open').click();
  await page.getByRole('button', { name: /병동팀/ }).click();
  await page.getByTestId('roster-wizard-next').click();
  await page.getByTestId('roster-wizard-next').click();

  await page.getByTestId('roster-wizard-generation-basis-select').selectOption('rotation_only');
  await page.getByTestId('roster-wizard-rule-min-day-staff').fill('2');
  await page.getByTestId('roster-wizard-rule-min-evening-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-min-night-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-weekend-min-day-staff').fill('2');
  await page.getByTestId('roster-wizard-rule-weekend-min-evening-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-weekend-min-night-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-holiday-min-day-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-holiday-min-evening-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-holiday-min-night-staff').fill('1');
  await page.getByTestId('roster-wizard-rule-off-days-after-night').fill('2');
  await page.getByTestId('roster-wizard-rule-rotation-night-min-count').fill('3');
  await page.getByTestId('roster-wizard-rule-rotation-night-max-count').fill('6');
  await page.getByTestId('roster-wizard-rule-min-monthly-off-days').fill('8');
  await page.getByTestId('roster-wizard-rule-distribute-weekends').uncheck();
  await page.getByTestId('roster-wizard-rule-distribute-holidays').uncheck();
  await page.getByTestId('roster-wizard-date-coverage-add').click();
  await page.getByTestId('roster-wizard-date-coverage-date-1').selectOption('2026-03-20');
  await page.getByTestId('roster-wizard-date-coverage-day-1').fill('3');
  await page.getByTestId('roster-wizard-date-coverage-evening-1').fill('1');
  await page.getByTestId('roster-wizard-date-coverage-night-1').fill('1');
  await page.getByTestId('roster-wizard-rule-role-coverage-add').click();
  await page.getByTestId('roster-wizard-rule-role-slot-label-1').fill('격리 담당');
  await page.getByTestId('roster-wizard-rule-role-slot-keywords-1').fill('격리, isolation');
  await page.getByTestId('roster-wizard-rule-role-slot-day-1').fill('1');
  await page.getByTestId('roster-wizard-rule-role-slot-night-1').fill('1');
  await page.getByTestId('roster-wizard-next').click();

  await page.getByTestId('roster-wizard-preferred-off-staff-select').selectOption(preferredOffStaff.id);
  await page.getByTestId('roster-wizard-preferred-off-date-select').selectOption('2026-03-18');
  await page.getByTestId('roster-wizard-preferred-off-add').click();
  await page.getByTestId(`roster-wizard-night-min-${preferredOffStaff.id}`).fill('2');
  await page.getByTestId(`roster-wizard-night-max-${preferredOffStaff.id}`).fill('4');
  await page.getByTestId(`roster-wizard-blocked-band-${supportStaffA.id}-evening`).click();
  await page.getByTestId(`roster-wizard-blocked-weekday-${supportStaffA.id}-1`).click();
  await page.getByTestId(`roster-wizard-avoid-weekend-${supportStaffA.id}`).check();
  await page.getByTestId(`roster-wizard-avoid-holiday-${supportStaffB.id}`).check();
  await page.getByTestId(`roster-wizard-dedicated-band-${supportStaffC.id}`).selectOption('night');
  await page.getByTestId(`roster-wizard-role-tags-${supportStaffC.id}`).fill('격리, isolation');
  await page.getByTestId('roster-wizard-pair-rule-add').click();
  await page.getByTestId('roster-wizard-pair-primary-1').selectOption(supportStaffA.id);
  await page.getByTestId('roster-wizard-pair-secondary-1').selectOption(supportStaffB.id);
  await page.getByTestId('roster-wizard-pair-mode-1').selectOption('together');
  await page.getByTestId('roster-wizard-pair-band-1').selectOption('night');
  await page.getByTestId('roster-wizard-apply').click();

  await expect(page.getByTestId('roster-active-generation-rule-summary')).toContainText(
    '최소 D/E/N 2/1/1'
  );
  await expect(page.getByTestId('roster-active-generation-rule-summary')).toContainText(
    '나이트 후 OFF 2일'
  );
  await expect(page.getByTestId('roster-active-generation-rule-summary')).toContainText(
    '신규 단독 NIGHT 금지'
  );
  await expect(page.getByTestId('roster-active-generation-rule-summary')).toContainText('역할 슬롯 1개');

  await page.getByTestId('roster-gemini-recommend').click();

  await expect.poll(() => recommendationRequest?.constraints?.minDayReq).toBe(2);
  expect(recommendationRequest.generationBasis).toBe('rotation_only');
  expect(recommendationRequest.constraints.minEveReq).toBe(1);
  expect(recommendationRequest.constraints.minNightReq).toBe(1);
  expect(recommendationRequest.constraints.weekendMinDayReq).toBe(2);
  expect(recommendationRequest.constraints.weekendMinEveReq).toBe(1);
  expect(recommendationRequest.constraints.weekendMinNightReq).toBe(1);
  expect(recommendationRequest.constraints.holidayMinDayReq).toBe(1);
  expect(recommendationRequest.constraints.holidayMinEveReq).toBe(1);
  expect(recommendationRequest.constraints.holidayMinNightReq).toBe(1);
  expect(recommendationRequest.constraints.offDaysAfterNight).toBe(2);
  expect(recommendationRequest.constraints.minNightDays).toBe(3);
  expect(recommendationRequest.constraints.maxNightDays).toBe(6);
  expect(recommendationRequest.constraints.targetOffDays).toBe(8);
  expect(recommendationRequest.constraints.distributeWeekendShifts).toBeFalsy();
  expect(recommendationRequest.constraints.distributeHolidayShifts).toBeFalsy();
  expect(recommendationRequest.constraints.dateCoverageOverrides).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        date: '2026-03-20',
        minDayStaff: 3,
        minEveningStaff: 1,
        minNightStaff: 1,
      }),
    ])
  );
  expect(recommendationRequest.constraints.blockNewNurseSoloNight).toBeTruthy();
  expect(recommendationRequest.constraints.requireSeniorWithNewNurseNight).toBeTruthy();
  expect(recommendationRequest.constraints.pairRules).toEqual([
    expect.objectContaining({
      primaryStaffId: supportStaffA.id,
      secondaryStaffId: supportStaffB.id,
      mode: 'together',
      band: 'night',
    }),
  ]);
  expect(recommendationRequest.constraints.roleCoverageRules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: '격리 담당',
        keywords: ['격리', 'isolation'],
        minDayStaff: 1,
        minNightStaff: 1,
      }),
    ])
  );
  expect(recommendationRequest.preAssigned[`${preferredOffStaff.id}|2026-03-18`]).toBe('__OFF__');
  expect(recommendationRequest.preAssigned[`${leaveStaff.id}|2026-03-10`]).toBe('__OFF__');
  expect(recommendationRequest.preAssigned[`${leaveStaff.id}|2026-03-11`]).toBe('__OFF__');

  const preferredOffPayload = recommendationRequest.staffs.find(
    (staff: any) => staff.id === preferredOffStaff.id
  );
  expect(preferredOffPayload.preferredOffDates).toContain('2026-03-18');
  expect(preferredOffPayload.minNightShiftCount).toBe(2);
  expect(preferredOffPayload.maxNightShiftCount).toBe(4);
  expect(preferredOffPayload.isNewNurse).toBeTruthy();

  const restrictedPayload = recommendationRequest.staffs.find(
    (staff: any) => staff.id === supportStaffA.id
  );
  expect(restrictedPayload.blockedShiftBands).toEqual(['evening']);
  expect(restrictedPayload.blockedWeekdays).toEqual([1]);
  expect(restrictedPayload.avoidWeekendWork).toBeTruthy();
  expect(restrictedPayload.avoidHolidayWork).toBeFalsy();

  const holidayRestrictedPayload = recommendationRequest.staffs.find(
    (staff: any) => staff.id === supportStaffB.id
  );
  expect(holidayRestrictedPayload.avoidHolidayWork).toBeTruthy();

  const roleCoveragePayload = recommendationRequest.staffs.find(
    (staff: any) => staff.id === supportStaffC.id
  );
  expect(roleCoveragePayload.coverageRoleTags).toEqual(['격리', 'isolation']);
  expect(roleCoveragePayload.resolvedGroupMode).toBe('night_fixed');
});

test('ward planner shows feasibility issues and blocks AI requests when constraints are impossible', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
  const staffMembers = [
    {
      ...fakeUser,
      id: 'ward-impossible-1',
      employee_no: 'WARD-IMP-001',
      name: '병동 간호사1',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-impossible-2',
      employee_no: 'WARD-IMP-002',
      name: '병동 간호사2',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
  ];

  let recommendationRequestCount = 0;
  await page.route('**/api/ai/roster-recommendation', async (route) => {
    recommendationRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'should not be used',
        teamAnalysis: {
          teamPurpose: 'unused',
          workMode: 'unused',
          includesNight: true,
          reasoning: ['unused'],
          planningFocus: ['unused'],
        },
        staffPlans: [],
      }),
    });
  });

  await mockSupabase(page, {
    staffMembers: [rosterAdminUser, ...staffMembers],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await expect(page.getByTestId('roster-feasibility-summary')).toContainText(
    '최소 인원 합계가 현재 직원 수를 초과합니다'
  );

  await page.getByTestId('roster-gemini-recommend').click();
  await expect(page.getByText(/현재 조건으로는 AI 자동생성을 시작할 수 없습니다/)).toBeVisible();
  expect(recommendationRequestCount).toBe(0);
});

test('ward local generation protects recovery off and avoids quick returns after nights', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
  const staffMembers = [
    {
      ...fakeUser,
      id: 'ward-safety-1',
      employee_no: 'WARD-SAFE-001',
      name: '병동 책임간호사',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '수간호사',
      role: 'manager',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-safety-2',
      employee_no: 'WARD-SAFE-002',
      name: '간호사2',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-safety-3',
      employee_no: 'WARD-SAFE-003',
      name: '간호사3',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-safety-4',
      employee_no: 'WARD-SAFE-004',
      name: '간호사4',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-safety-5',
      employee_no: 'WARD-SAFE-005',
      name: '간호사5',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-safety-6',
      employee_no: 'WARD-SAFE-006',
      name: '간호사6',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
  ];

  await mockSupabase(page, {
    staffMembers: [rosterAdminUser, ...staffMembers],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openShiftPatternManager(page);
  await switchAdminRosterTab(page, 'rules');
  await page.getByTestId('generation-rule-name-input').fill('병동 회복휴무 규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-off-days-after-night').fill('2');
  await page.getByTestId('generation-rule-avoid-day-after-evening').check();
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
  await page.getByTestId('roster-generation-rule-select').selectOption({
    label: '병동 회복휴무 규칙',
  });
  await page.getByTestId('roster-auto-generate').click();

  for (const staff of staffMembers) {
    const row = page.locator('tr').filter({ hasText: staff.name });
    const codes = await row.locator('button[title]').evaluateAll((buttons) =>
      buttons.map((button) => (button.textContent || '').trim())
    );

    const hasEveningToDay = codes.some((code, index) => code === 'E' && codes[index + 1] === 'D');
    const hasNightToWork = codes.some(
      (code, index) => code === 'N' && (codes[index + 1] === 'D' || codes[index + 1] === 'E')
    );

    expect(hasEveningToDay).toBeFalsy();
    expect(hasNightToWork).toBeFalsy();

    codes.forEach((code, index) => {
      if (code !== 'N') return;
      if (codes[index + 1] === 'N') return;

      const firstRecovery = codes[index + 1];
      const secondRecovery = codes[index + 2];
      if (firstRecovery) {
        expect(firstRecovery).toBe('OFF');
      }
      if (secondRecovery) {
        expect(secondRecovery).toBe('OFF');
      }
    });
  }
});

test('roster save stays blocked while blocking warnings remain', async ({ page }) => {
  const rosterAdminUser = {
    ...createRosterAdminUser(),
    id: 'ward-save-block-admin',
    employee_no: 'WARD-SAVE-001',
    name: '병동 저장 관리자',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
  };
  const staffMembers = [
    rosterAdminUser,
    {
      ...fakeUser,
      id: 'ward-save-block-2',
      employee_no: 'WARD-SAVE-002',
      name: '간호사2',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-save-block-3',
      employee_no: 'WARD-SAVE-003',
      name: '간호사3',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-save-block-4',
      employee_no: 'WARD-SAVE-004',
      name: '간호사4',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-save-block-5',
      employee_no: 'WARD-SAVE-005',
      name: '간호사5',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-save-block-6',
      employee_no: 'WARD-SAVE-006',
      name: '간호사6',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
  ];

  let shiftAssignmentWriteCount = 0;
  page.on('request', (request) => {
    if (
      request.url().includes('/shift_assignments') &&
      (request.method() === 'POST' || request.method() === 'DELETE')
    ) {
      shiftAssignmentWriteCount += 1;
    }
  });

  await page.route('**/api/ai/roster-recommendation', async (route) => {
    const body = route.request().postDataJSON() as {
      staffs: Array<{ id: string }>;
      monthDates: string[];
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: '의도적으로 잘못된 초안',
        teamAnalysis: {
          teamPurpose: '테스트용',
          workMode: '테스트용',
          includesNight: true,
          reasoning: ['저장 차단 검증'],
          planningFocus: ['저장 차단 검증'],
        },
        staffPlans: body.staffs.map((staff) => ({
          staffId: staff.id,
          modeLabel: '테스트용',
          rationale: '모든 날짜 OFF',
          assignments: body.monthDates.map(() => '__OFF__'),
        })),
      }),
    });
  });

  await mockSupabase(page, {
    staffMembers,
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'planner');
  await page.getByTestId('roster-wizard-open').click();
  await page.getByRole('button', { name: /병동팀/ }).click();
  await page.getByTestId('roster-wizard-next').click();
  await page.getByTestId('roster-wizard-next').click();
  await page.getByTestId('roster-wizard-next').click();
  await page.getByTestId('roster-wizard-night-min-ward-save-block-2').fill('31');
  await page.getByTestId('roster-wizard-apply').click();

  await page.getByTestId('roster-gemini-recommend').click();
  await expect(page.getByTestId('roster-warning-report')).toBeVisible();
  await expect(page.getByTestId('roster-blocking-warning-summary')).toBeVisible();

  await page.getByRole('button', { name: '월간 근무표 저장', exact: true }).click();
  await expect(page.getByTestId('roster-blocking-warning-summary')).toBeVisible();
  await page.waitForTimeout(500);
  expect(shiftAssignmentWriteCount).toBe(0);
});

test('ward planner shows dedicated staffing feasibility issues when required dedicated staff are unavailable', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
  const staffMembers = [
    rosterAdminUser,
    {
      ...fakeUser,
      id: 'ward-shift-filter-2',
      employee_no: 'WARD-SHIFT-002',
      name: 'Day Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-shift-filter-3',
      employee_no: 'WARD-SHIFT-003',
      name: 'Evening Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-shift-filter-4',
      employee_no: 'WARD-SHIFT-004',
      name: 'Night Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'rules');
  await page.getByTestId('generation-rule-name-input').fill('Dedicated Feasibility Rule');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-min-dedicated-night-staff').fill('1');
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
  await page
    .getByTestId('roster-generation-rule-select')
    .selectOption({ label: 'Dedicated Feasibility Rule' });
  await expect(page.getByTestId('roster-feasibility-summary')).toContainText(
    'NIGHT 타임 전담 최소 인원을 만족할 수 없습니다'
  );
});

test('manual roster edits are blocked when they break dedicated or senior night coverage', async ({
  page,
}) => {
  const rosterAdminUser = {
    ...createRosterAdminUser(),
    id: 'ward-manual-guard-admin',
    employee_no: 'WARD-MANUAL-001',
    name: 'Night Charge',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    shift_id: 'shift-ward-night',
    shift_type: '야간전담',
  };
  const staffMembers = [
    rosterAdminUser,
    {
      ...fakeUser,
      id: 'ward-manual-guard-2',
      employee_no: 'WARD-MANUAL-002',
      name: 'Night Buddy',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-night',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-manual-guard-3',
      employee_no: 'WARD-MANUAL-003',
      name: 'Day Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-manual-guard-4',
      employee_no: 'WARD-MANUAL-004',
      name: 'Evening Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-evening',
      shift_type: '3교대',
    },
    {
      ...fakeUser,
      id: 'ward-manual-guard-5',
      employee_no: 'WARD-MANUAL-005',
      name: 'Float Nurse',
      company: 'AlphaClinic',
      company_id: 'clinic-1',
      department: '병동팀',
      position: '간호사',
      role: 'staff',
      shift_id: 'shift-ward-day',
      shift_type: '3교대',
    },
  ];

  await page.route('**/api/ai/roster-recommendation', async (route) => {
    const requestBody = route.request().postDataJSON() as { monthDates: string[] };
    const monthDates = requestBody.monthDates;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'manual guard test',
        teamAnalysis: {
          teamPurpose: 'ward team',
          workMode: '3교대',
          includesNight: true,
          reasoning: ['test'],
          planningFocus: ['test'],
        },
        staffPlans: [
          {
            staffId: rosterAdminUser.id,
            modeLabel: 'night fixed',
            rationale: 'dedicated night senior',
            assignments: monthDates.map(() => 'shift-ward-night'),
          },
          {
            staffId: 'ward-manual-guard-2',
            modeLabel: 'night support',
            rationale: 'night support',
            assignments: monthDates.map(() => 'shift-ward-night'),
          },
          {
            staffId: 'ward-manual-guard-3',
            modeLabel: 'day',
            rationale: 'day',
            assignments: monthDates.map(() => 'shift-ward-day'),
          },
          {
            staffId: 'ward-manual-guard-4',
            modeLabel: 'evening',
            rationale: 'evening',
            assignments: monthDates.map(() => 'shift-ward-evening'),
          },
          {
            staffId: 'ward-manual-guard-5',
            modeLabel: 'off',
            rationale: 'float',
            assignments: monthDates.map(() => '__OFF__'),
          },
        ],
      }),
    });
  });

  await mockSupabase(page, {
    staffMembers,
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
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
    user: rosterAdminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '회사관리',
    },
  });

  await openAdminRosterPolicy(page, 'rules');
  await page.getByTestId('generation-rule-name-input').fill('Manual Guard Rule');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-min-day-staff').fill('1');
  await page.getByTestId('generation-rule-min-evening-staff').fill('1');
  await page.getByTestId('generation-rule-min-night-staff').fill('1');
  await page.getByTestId('generation-rule-min-senior-night-staff').fill('1');
  await page.getByTestId('generation-rule-min-dedicated-night-staff').fill('1');
  await page.getByTestId('generation-rule-save').click();

  await switchAdminRosterTab(page, 'planner');
  await page.getByTestId('roster-generation-rule-select').selectOption({ label: 'Manual Guard Rule' });
  await page.getByTestId('roster-gemini-recommend').click();
  await expect(page.getByTestId('roster-generation-summary')).toBeVisible();

  await page.getByRole('button', { name: '수동 수정' }).click();
  const blockedCell = page.locator(`button[title^="${rosterAdminUser.name} 2026-03-01 "]`).first();
  await expect(blockedCell).toHaveText('N');
  await blockedCell.click();

  await expect(blockedCell).toHaveText('N');
});
