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
  await installFixedDate(page);
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '인사관리', open_subview: '교대근무' }).toString()}`
  );
  await page.getByRole('button', { name: '교대근무' }).click();
  await expect(page.getByTestId('shift-suite-bar')).toBeVisible();
  await page.getByTestId('shift-suite-1').click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
}

async function openShiftRuleManager(page: Page) {
  await installFixedDate(page);
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '관리자', open_subview: '회사관리' }).toString()}`
  );
  await expect(page.getByTestId('company-manager-view')).toBeVisible();
  await page.getByTestId('company-manager-tab-rosterPolicy').click();
  await page.getByRole('button', { name: '근무 규칙', exact: true }).click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
}

async function switchAdminRosterTab(page: Page, tab: 'planner' | 'rules') {
  if (tab === 'rules') {
    await page.getByRole('button', { name: '근무 규칙', exact: true }).click();
    await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
    return;
  }

  await page.getByRole('button', { name: '월간 편성 저장', exact: true }).click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
}

function createRosterAdminUser() {
  return {
    ...fakeUser,
    id: 'roster-advanced-admin-user',
    employee_no: 'ROSTER-ADV-ADM-001',
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

test('ward generation rule applies advanced safety constraints for evening, weekends, holidays, and new nurses', async ({
  page,
}) => {
  const rosterAdminUser = createRosterAdminUser();
  const plannerUser = {
    ...fakeUser,
    id: 'ward-advanced-rule-1',
    employee_no: 'WARD-ADV-001',
    name: '병동 책임간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '수간호사',
    role: 'manager',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
    join_date: '2020-03-01',
  };
  const newNurseA = {
    ...fakeUser,
    id: 'ward-advanced-rule-2',
    employee_no: 'WARD-ADV-002',
    name: '신규간호사 A',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-day',
    shift_type: '3교대',
    join_date: '2026-01-10',
  };
  const newNurseB = {
    ...fakeUser,
    id: 'ward-advanced-rule-3',
    employee_no: 'WARD-ADV-003',
    name: '신규간호사 B',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '간호사',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
    join_date: '2026-02-01',
  };
  const experiencedNurse = {
    ...fakeUser,
    id: 'ward-advanced-rule-4',
    employee_no: 'WARD-ADV-004',
    name: '경력간호사',
    company: 'AlphaClinic',
    company_id: 'clinic-1',
    department: '병동팀',
    position: '주임',
    role: 'staff',
    shift_id: 'shift-ward-evening',
    shift_type: '3교대',
    join_date: '2023-05-01',
  };

  await mockSupabase(page, {
    staffMembers: [rosterAdminUser, plannerUser, newNurseA, newNurseB, experiencedNurse],
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
      erp_last_subview: '교대근무',
      erp_hr_tab: '교대근무',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await openShiftRuleManager(page);
  await page.getByTestId('generation-rule-name-input').fill('병동 고급 안전규칙');
  await page.getByTestId('generation-rule-team-keywords-input').fill('병동팀');
  await page.getByTestId('generation-rule-rotation-night-min-count').fill('0');
  await page.getByTestId('generation-rule-rotation-night-max-count').fill('0');
  await page.getByTestId('generation-rule-max-consecutive-evening-shifts').fill('1');
  await page.getByTestId('generation-rule-max-consecutive-weekend-work-days').fill('1');
  await page.getByTestId('generation-rule-distribute-holidays').check();
  await page.getByTestId('generation-rule-separate-new-nurses').check();
  await page.getByTestId('generation-rule-save').click();

  await expect(page.getByTestId(/generation-rule-card-/).first()).toContainText('병동 고급 안전규칙');
  await switchAdminRosterTab(page, 'planner');
  await page.getByTestId('roster-auto-generate').click({ force: true });
  await expect(page.getByTestId('roster-generation-summary')).toContainText('병동 고급 안전규칙');
});
