import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (
      text.includes('favicon') ||
      text.includes('Failed to load resource') ||
      text.includes('ERR_ABORTED')
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return errors;
}

const extraFeaturesUser = {
  ...fakeUser,
  department: '병동팀',
  position: '수간호사',
  permissions: {
    ...fakeUser.permissions,
    'extra_\uC870\uC9C1\uB3C4': true,
    'extra_\uBD80\uC11C\uBCC4\uC7AC\uACE0': true,
    'extra_\uADFC\uBB34\uD604\uD669': true,
    'extra_\uC778\uACC4\uB178\uD2B8': true,
    'extra_\uD1F4\uC6D0\uC2EC\uC0AC': true,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
    'extra_\uC9C1\uC6D0\uD3C9\uAC00': true,
    'extra_\uC785\uAE08\uC2E4\uC2DC\uAC04\uC870\uD68C': true,
  },
};

const targetNurse = {
  ...fakeUser,
  id: '66666666-6666-6666-6666-666666666666',
  employee_no: 'E2E-002',
  name: '테스트간호사',
  department: '병동팀',
  position: '간호사',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const supportNurse = {
  ...fakeUser,
  id: '77777777-7777-7777-7777-777777777777',
  employee_no: 'E2E-003',
  name: '지원간호사',
  department: '병동팀',
  position: '간호사',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const adminClerk = {
  ...fakeUser,
  id: '88888888-8888-8888-8888-888888888888',
  employee_no: 'E2E-004',
  name: '행정직원',
  department: '행정팀',
  position: '주임',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const floorStaffUser = {
  ...fakeUser,
  id: '99999999-8888-7777-6666-555555555555',
  employee_no: 'E2E-005',
  name: '일반간호사',
  department: '병동팀',
  position: '간호사',
  role: 'staff',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
  permissions: {
    ...fakeUser.permissions,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
  },
};

const syIncDirectorUser = {
  ...fakeUser,
  id: '12345678-9999-8888-7777-666666666666',
  employee_no: 'E2E-006',
  name: 'SY이사',
  company: 'SY INC.',
  company_id: '44444444-4444-4444-4444-444444444444',
  department: '경영지원팀',
  position: '이사',
  role: 'staff',
  permissions: {
    ...fakeUser.permissions,
    mso: false,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
  },
};

const adminClosingReportUser = {
  ...fakeUser,
  id: '22222222-9999-8888-7777-666666666666',
  employee_no: 'E2E-007',
  name: 'Admin Closing',
  department: '운영',
  position: '관리자',
  role: 'admin',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
  permissions: {
    ...fakeUser.permissions,
    admin: true,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': false,
  },
};

function getTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
}

async function prepareExtraFeature(
  page: Page,
  fixtures: Parameters<typeof mockSupabase>[1],
  cardTestId: string,
  options?: {
    user?:
      | typeof extraFeaturesUser
      | typeof floorStaffUser
      | typeof syIncDirectorUser
      | typeof adminClosingReportUser;
  }
) {
  await page.addInitScript(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });

  await mockSupabase(page, fixtures);
  await seedSession(page, {
    user: options?.user ?? extraFeaturesUser,
    localStorage: {
      erp_last_menu: '추가기능',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('추가기능')}`);
  await expect(page.getByTestId('extra-view')).toBeVisible();
  await page.getByTestId(cardTestId).click();
  await expect(page.getByTestId('extra-subview')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('work status supports real month/day navigation flow', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse, supportNurse, adminClerk],
      workShifts: [
        { id: 'shift-day', name: 'Day', start_time: '07:00:00', end_time: '15:00:00', is_active: true },
        { id: 'shift-evening', name: 'Evening', start_time: '15:00:00', end_time: '23:00:00', is_active: true },
        { id: 'shift-night', name: 'Night', start_time: '23:00:00', end_time: '07:00:00', is_active: true },
      ],
      shiftAssignments: [
        { id: 'assign-1', staff_id: extraFeaturesUser.id, shift_id: 'shift-day', work_date: todayKey },
        { id: 'assign-2', staff_id: targetNurse.id, shift_id: 'shift-evening', work_date: todayKey },
        { id: 'assign-3', staff_id: supportNurse.id, shift_id: 'shift-night', work_date: todayKey },
      ],
      attendance: [
        { id: 'attendance-1', staff_id: extraFeaturesUser.id, date: todayKey, check_in: `${todayKey}T07:01:00` },
      ],
    },
    'extra-card-work-status'
  );

  await expect(page.getByTestId('work-status-view')).toBeVisible();
  await expect(page.getByTestId('work-status-last-sync')).toBeVisible();
  await page.getByTestId('work-status-department-filter').selectOption('행정팀');
  await expect(page.getByText('행정팀 보기')).toBeVisible();
  await page.getByTestId('work-status-department-chip-all').click();
  await expect(page.getByText('전사 보기')).toBeVisible();
  await page.getByTestId('work-status-active-only-toggle').click();
  await page.getByTestId('work-status-next-month').click();
  await page.getByTestId('work-status-prev-month').click();
  await page.getByTestId('work-status-today').click();
  await page.getByTestId(`work-status-day-${todayKey}`).click();
  await expect(page.getByTestId('work-status-detail-modal')).toBeVisible();
  await page.getByTestId('work-status-detail-close').click();
  await expect(page.getByTestId('work-status-detail-modal')).toBeHidden();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('work status renders UTC attendance check-in in local Korea time', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();
  const utcCheckIn = new Date(`${todayKey}T08:17:00+09:00`).toISOString();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser],
      workShifts: [
        { id: 'shift-day', name: 'Day', start_time: '07:00:00', end_time: '15:00:00', is_active: true },
      ],
      shiftAssignments: [
        { id: 'assign-utc-1', staff_id: extraFeaturesUser.id, shift_id: 'shift-day', work_date: todayKey },
      ],
      attendance: [
        { id: 'attendance-utc-1', staff_id: extraFeaturesUser.id, date: todayKey, check_in: utcCheckIn },
      ],
    },
    'extra-card-work-status'
  );

  await expect(page.getByTestId('work-status-view')).toBeVisible();
  await expect(page.getByText(/출근 08:17/)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('work status resolves legacy shift_name assignments to the configured schedule time', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser],
      workShifts: [
        {
          id: 'shift-outpatient-0830',
          name: '외래/검사 월-금',
          start_time: '08:30:00',
          end_time: '17:30:00',
          is_active: true,
        },
      ],
      shiftAssignments: [
        {
          id: 'assign-legacy-name-1',
          staff_id: extraFeaturesUser.id,
          work_date: todayKey,
          shift_name: '외래/검사 월-금',
        },
      ],
      attendance: [
        { id: 'attendance-legacy-name-1', staff_id: extraFeaturesUser.id, date: todayKey, check_in: `${todayKey}T08:05:00` },
      ],
    },
    'extra-card-work-status'
  );

  await expect(page.getByTestId('work-status-view')).toBeVisible();
  await expect(page.getByText('외래/검사 월-금')).toBeVisible();
  await expect(page.getByText('08:30 - 17:30')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('staff evaluation can save a new review entry for a selected nurse', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse],
      staffEvaluations: [],
    },
    'extra-card-staff-evaluation'
  );

  await expect(page.getByTestId('staff-evaluation-view')).toBeVisible();
  await page.getByTestId(`staff-evaluation-select-${targetNurse.id}`).click();
  await page.getByTestId('staff-evaluation-content').fill('야간 인계 정리가 꼼꼼하고 환자 대응이 안정적입니다.');
  await page.getByTestId('staff-evaluation-submit').click();

  await expect(page.getByText('야간 인계 정리가 꼼꼼하고 환자 대응이 안정적입니다.')).toBeVisible();
  await expect(page.locator('[data-testid^="staff-evaluation-item-"]')).toHaveCount(1);
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
