import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('attendance correction submit works with the legacy attendance_corrections schema', async ({
  page,
}) => {
  const correctionDate = '2026-03-10';

  await mockSupabase(page, {
    approvals: [],
    attendance: [
      {
        id: 'attendance-problem-1',
        staff_id: fakeUser.id,
        date: correctionDate,
        check_in: null,
        check_out: '18:00',
        status: '정상',
      },
    ],
    attendances: [
      {
        id: 'attendances-problem-1',
        staff_id: fakeUser.id,
        work_date: correctionDate,
        status: 'present',
      },
    ],
    attendanceCorrections: [],
    legacyAttendanceCorrectionsSchema: true,
  });

  await seedSession(page);
  await page.goto('/main');

  await page.getByTestId('sidebar-menu-approval').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await page.getByRole('button', { name: '작성하기' }).click();
  await page.getByTestId('approval-form-type-8').click();
  await expect(page.getByTestId('attendance-correction-view')).toBeVisible();

  await page.getByTestId('attendance-correction-toggle').click();
  await expect(
    page.getByTestId(`attendance-correction-date-${correctionDate}`)
  ).toBeVisible();
  await page.getByTestId(`attendance-correction-date-${correctionDate}`).click();
  await page.getByTestId('attendance-correction-reason-input').fill('레거시 스키마 제출 테스트');
  await page.getByTestId('attendance-correction-submit').click();

  await expect(page.getByTestId('attendance-correction-toggle')).toContainText('새 신청');
  await page.getByRole('button', { name: '신청 현황' }).click();
  await expect(page.getByText(correctionDate)).toBeVisible();
  await expect(page.getByText('레거시 스키마 제출 테스트')).toBeVisible();
  await expect(page.getByText('대기')).toBeVisible();
});

test('attendance correction approval updates legacy-schema rows and attendance records', async ({
  page,
}) => {
  const correctionDate = '2026-03-09';
  const adminUser = {
    ...fakeUser,
    id: 'admin-user-id',
    employee_no: 'ADM-001',
    name: '행정 승인자',
    department: '행정팀',
    role: 'admin',
  };

  await mockSupabase(page, {
    staffMembers: [adminUser, fakeUser],
    approvals: [],
    attendance: [],
    attendances: [],
    attendanceCorrections: [
      {
        id: 'attendance-correction-1',
        staff_id: fakeUser.id,
        original_date: correctionDate,
        correction_type: '정상반영',
        reason: '레거시 승인 테스트',
        status: '대기',
        created_at: '2026-03-09T09:00:00.000Z',
      },
    ],
    legacyAttendanceCorrectionsSchema: true,
  });

  await seedSession(page, { user: adminUser });
  await page.goto('/main');

  await page.getByTestId('sidebar-menu-approval').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await page.getByRole('button', { name: '작성하기' }).click();
  await page.getByTestId('approval-form-type-8').click();
  await expect(page.getByTestId('attendance-correction-view')).toBeVisible();

  await page.getByRole('button', { name: '결재 대기' }).click();
  await expect(page.getByText('레거시 승인 테스트')).toBeVisible();
  await page.getByRole('button', { name: '승인' }).first().click();

  const snapshot = await page.evaluate(async ({ correctionId, date, staffId }) => {
    const headers = { Accept: 'application/json' };
    const [correctionsResponse, attendanceResponse, attendancesResponse] = await Promise.all([
      fetch(`/rest/v1/attendance_corrections?id=eq.${correctionId}&select=*`, { headers }),
      fetch(`/rest/v1/attendance?staff_id=eq.${staffId}&date=eq.${date}&select=*`, { headers }),
      fetch(`/rest/v1/attendances?staff_id=eq.${staffId}&work_date=eq.${date}&select=*`, {
        headers,
      }),
    ]);

    return {
      corrections: await correctionsResponse.json(),
      attendance: await attendanceResponse.json(),
      attendances: await attendancesResponse.json(),
    };
  }, {
    correctionId: 'attendance-correction-1',
    date: correctionDate,
    staffId: fakeUser.id,
  });

  expect(snapshot.corrections[0]?.status).toBe('승인');
  expect(snapshot.attendance[0]?.status).toBe('정상');
  expect(snapshot.attendances[0]?.status).toBe('present');
});
