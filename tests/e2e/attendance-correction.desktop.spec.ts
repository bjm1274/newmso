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

  await expect(
    page.getByTestId(`attendance-correction-date-${correctionDate}`)
  ).toBeVisible();
  await page.getByTestId(`attendance-correction-date-${correctionDate}`).click();
  await page.getByTestId('attendance-correction-reason-input').fill('레거시 스키마 제출 테스트');
  await page.getByTestId('attendance-correction-submit').click();

  await page.getByRole('button', { name: '신청 현황' }).click();
  await expect(page.getByText(correctionDate)).toBeVisible();
  await expect(page.getByText('레거시 스키마 제출 테스트')).toBeVisible();
  await expect(page.getByText('대기')).toBeVisible();
});

test('attendance correction form keeps pending items out of the compose screen and uses request/status views only', async ({
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

  await expect(page.getByRole('button', { name: '결재 대기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '신청하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '신청 현황' })).toBeVisible();

  await page.getByRole('button', { name: '신청 현황' }).click();
  await expect(page.getByText('신청한 출결 정정 문서가 없습니다.')).toBeVisible();
});
