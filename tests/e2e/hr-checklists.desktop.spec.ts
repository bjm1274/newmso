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

test('offboarding finalization succeeds even when legacy columns or cleanup queries fail', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const hrManager = {
    ...fakeUser,
    id: 'hr-manager-1',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      hr_오프보딩: true,
      menu_인사관리: true,
    },
  };

  const pendingStaff = {
    ...fakeUser,
    id: 'offboarding-staff-legacy-1',
    employee_no: 'E2E-LEGACY-001',
    name: '퇴사테스트',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: '진료부',
    position: '사원',
    status: '퇴사예정',
    role: 'staff',
    resigned_at: '2026-04-03',
    permissions: {
      offboarding_original_status: '재직',
      offboarding_original_role: 'staff',
      offboarding_started_at: '2026-04-01T09:00:00.000Z',
      offboarding_reason: '계약만료',
    },
  };

  await mockSupabase(page, {
    staffMembers: [hrManager, pendingStaff],
    notifications: [
      {
        id: 'notification-offboarding-1',
        user_id: pendingStaff.id,
        is_read: false,
        title: '오프보딩 안내',
        body: '미확인 알림',
        created_at: '2026-04-01T09:00:00.000Z',
      },
    ],
    onboardingChecklists: [
      {
        id: 'onboarding-checklist-legacy-1',
        staff_id: pendingStaff.id,
        checklist_type: '퇴사',
        items: [
          { key: 'handover', label: '업무 인수인계 완료', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
          { key: 'account_disable', label: '사내 계정 및 권한 회수', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
          { key: 'asset_return', label: 'PC·노트북·비품 반납 확인', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
          { key: 'card_security_return', label: '카드·보안매체·출입 권한 회수', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
          { key: 'payroll_settlement', label: '최종 급여 및 정산 확인', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
          { key: 'document_close', label: '문서·전자서명·인수 기록 마감', done: true, doneAt: '2026-04-01T09:00:00.000Z' },
        ],
      },
    ],
  });

  let finalizePatchAttempts = 0;
  let finalizeFallbackApplied = false;

  await page.route('**/rest/v1/staff_members*', async (route, request) => {
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (body?.status === '퇴사') {
        finalizePatchAttempts += 1;
        if ('force_logout_at' in body) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'PGRST204',
              details: null,
              hint: null,
              message: "Could not find the 'force_logout_at' column of 'staff_members' in the schema cache",
            }),
          });
        }
        finalizeFallbackApplied = true;
      }
    }

    return route.fallback();
  });

  await page.route('**/rest/v1/push_subscriptions*', async (route, request) => {
    if (request.method() === 'DELETE') {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '42501',
          details: null,
          hint: null,
          message: 'new row violates row-level security policy for table "push_subscriptions"',
        }),
      });
    }

    return route.fallback();
  });

  await page.route('**/rest/v1/notifications*', async (route, request) => {
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if ('read_at' in body) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PGRST204',
            details: null,
            hint: null,
            message: "Could not find the 'read_at' column of 'notifications' in the schema cache",
          }),
        });
      }
    }

    return route.fallback();
  });

  await seedSession(page, {
    user: hrManager,
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
  await expect(page.getByTestId(`offboarding-finalize-${pendingStaff.id}`)).toContainText('최종 퇴사 처리');
  await page.getByTestId(`offboarding-finalize-${pendingStaff.id}`).click();

  await expect(page.getByText(`${pendingStaff.name}님의 최종 퇴사 처리가 완료되었습니다.`)).toBeVisible();
  await expect(page.getByText('퇴사 처리 중 오류가 발생했습니다.')).toHaveCount(0);
  expect(finalizePatchAttempts).toBe(2);
  expect(finalizeFallbackApplied).toBeTruthy();
});
