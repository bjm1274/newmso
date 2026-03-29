import { expect, test } from '@playwright/test';

import { fakeUser, mockSupabase, seedSession } from './helpers';

test('new staff registration creates an onboarding checklist package', async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: 'SY INC.',
    company_id: 'mso-company-id',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      mso: true,
      admin: true,
      menu_관리자: true,
      menu_인사관리: true,
      직원등록: true,
    },
    role: 'admin',
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    workShifts: [
      {
        id: 'shift-1',
        company_name: '박철홍정형외과',
        name: '외래 주간',
        start_time: '09:00',
        end_time: '18:00',
        is_active: true,
      },
    ],
    orgTeams: [
      { company_name: '박철홍정형외과', team_name: '외래팀', division: '진료부' },
      { company_name: 'SY INC.', team_name: '인사팀', division: '경영지원' },
    ],
  });
  await seedSession(page, { user: adminUser });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('new-staff-button')).toBeVisible();
  await page.getByTestId('new-staff-button').click();
  const newStaffModal = page.getByTestId('new-staff-modal');
  await expect(newStaffModal).toBeVisible();
  await newStaffModal.getByTestId('new-staff-name-input').fill('온보딩테스트');
  await newStaffModal.getByTestId('new-staff-tab-affiliation').click();
  const joinedAtField = newStaffModal.getByPlaceholder('0000-00-00').first();
  await joinedAtField.click();
  await joinedAtField.pressSequentially('20260329');
  await expect(joinedAtField).toHaveValue('2026-03-29');
  await newStaffModal.getByTestId('new-staff-company-select').selectOption('박철홍정형외과');
  await newStaffModal.getByTestId('new-staff-team-select').selectOption('외래팀');
  await newStaffModal.getByTestId('new-staff-position-select').selectOption('사원');
  await newStaffModal.getByTestId('new-staff-shift-select').selectOption('shift-1');

  const staffInsertRequest = page.waitForRequest((request) => {
    return request.url().includes('/staff_members') && request.method() === 'POST';
  });
  const onboardingChecklistRequest = page.waitForRequest((request) => {
    return request.url().includes('/onboarding_checklists') && request.method() === 'POST';
  });

  await newStaffModal.getByTestId('new-staff-save-button').click();

  await staffInsertRequest;
  await onboardingChecklistRequest;
});

test('offboarding start immediately creates a resignation checklist package', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const activeStaff = {
    ...fakeUser,
    id: 'offboarding-staff-1',
    status: '재직',
  };

  await mockSupabase(page, {
    staffMembers: [activeStaff],
  });
  await seedSession(page, {
    user: activeStaff,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '오프보딩',
      erp_hr_tab: '오프보딩',
      erp_hr_workspace: '인력관리',
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '인사관리', open_subview: '오프보딩' }).toString()}`,
  );

  await expect(page.getByTestId('offboarding-view')).toBeVisible();
  await page.getByTestId('offboarding-staff-select').selectOption(activeStaff.id);
  await page.getByTestId('offboarding-date-input').fill('2026-03-31');
  await page.getByTestId('offboarding-reason-select').selectOption('계약만료');

  const updateRequest = page.waitForRequest((request) => {
    return request.url().includes('/staff_members') && request.method() === 'PATCH';
  });
  const checklistRequest = page.waitForRequest((request) => {
    return request.url().includes('/onboarding_checklists') && request.method() === 'POST';
  });

  await page.getByTestId('offboarding-start-button').click();

  await updateRequest;
  await checklistRequest;
});
