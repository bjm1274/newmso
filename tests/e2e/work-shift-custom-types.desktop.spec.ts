import { expect, test, type Page } from '@playwright/test';

import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function createAdminUser() {
  return {
    ...fakeUser,
    id: 'work-shift-admin',
    employee_no: 'SHIFT-ADM-100',
    name: '근무형태 관리자',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: 'Operations',
    position: 'Director',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      mso: true,
      hr: true,
      ['menu_관리자']: true,
      ['menu_인사관리']: true,
      직원등록: true,
    },
  };
}

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

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});
test('new staff adds an existing company work shift as an extra schedule', async ({ page }) => {
  const adminUser = createAdminUser();
  const workShiftPosts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/work_shifts') && request.method() === 'POST') {
      workShiftPosts.push(request.postData() || '');
    }
  });

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'clinic-1', name: 'AlphaClinic', type: 'hospital', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
    ],
    workShifts: [
      {
        id: 'shift-alpha-weekday',
        name: '상근 월~금',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '상근',
        company_name: 'AlphaClinic',
        is_active: true,
      },
      {
        id: 'shift-alpha-saturday',
        name: '상근 월~토',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '상근',
        company_name: 'AlphaClinic',
        is_active: true,
      },
      {
        id: 'shift-sy-weekday',
        name: 'SY 기본',
        start_time: '09:00:00',
        end_time: '18:00:00',
        shift_type: '상근',
        company_name: 'SY INC.',
        is_active: true,
      },
    ],
    orgTeams: [
      { company_name: 'AlphaClinic', team_name: '관리팀', division: '경영지원' },
      { company_name: 'SY INC.', team_name: '인사팀', division: '경영지원' },
    ],
  });
  await seedSession(page, { user: adminUser });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);
  await page.getByTestId('new-staff-button').click();
  const modal = page.getByTestId('new-staff-modal');
  await expect(modal).toBeVisible();
  await modal.getByTestId('new-staff-tab-affiliation').click();
  await modal.getByTestId('new-staff-company-select').selectOption('AlphaClinic');
  await modal.getByTestId('new-staff-shift-select').selectOption('shift-alpha-weekday');
  await expect(modal.getByTestId('new-staff-selected-shifts')).toContainText('상근 월~금');

  await modal.getByRole('button', { name: '+ 새 유형 추가' }).click();
  await expect(modal.getByTestId('new-staff-extra-shift-select')).toBeVisible();
  await modal.getByTestId('new-staff-extra-shift-select').selectOption('shift-alpha-saturday');
  await modal.getByTestId('new-staff-extra-shift-add-button').click();
  await expect(modal.getByTestId('new-staff-selected-shifts')).toContainText('상근 월~토');

  await modal.getByTestId('new-staff-joined-at-input').fill('2026-03-01');
  await modal.getByTestId('new-staff-tab-basic').click();
  await modal.getByTestId('new-staff-name-input').fill('순환 근무자');

  const staffInsertRequest = page.waitForRequest(
    (request) => request.url().includes('/staff_members') && request.method() === 'POST'
  );
  await modal.getByTestId('new-staff-save-button').click();
  const staffPayload = JSON.parse((await staffInsertRequest).postData() || '[]');
  const insertedStaff = Array.isArray(staffPayload) ? staffPayload[0] : staffPayload;

  expect(workShiftPosts).toHaveLength(0);
  expect(insertedStaff.shift_id).toBe('shift-alpha-weekday');
  expect(insertedStaff.permissions.work_conditions.shift_group_ids).toEqual([
    'shift-alpha-weekday',
    'shift-alpha-saturday',
  ]);
  expect(insertedStaff.permissions.work_conditions.weekly_rotation_shift_ids).toEqual(['shift-alpha-saturday']);
});
