import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function openHrWorkspace(page: Page, workspaceId: string) {
  // Workspaces were removed in the redesign; menus are directly available.
}

async function openHrMenu(page: Page, menuId: string) {
  const mapping: Record<string, string> = {
    '구성원': 'member',
    '인사변동': 'member',
    '입퇴사·교육센터': 'member',
    '근태': 'attend',
    '연차/휴가': 'leave',
    '급여': 'payroll',
    '자격·안전센터': 'welfare',
    '경조사': 'welfare',
    '계약': 'docs',
    '문서센터': 'docs',
  };
  const targetId = mapping[menuId] || menuId;
  await page.locator(`[data-testid="hr-menu-${targetId}"]:visible`).first().click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('attendance issue analysis integrates lateness and early leaving in one tab', async ({ page }) => {
  const yearMonth = new Date().toISOString().slice(0, 7);

  const hrUser = {
    ...fakeUser,
    id: 'attendance-issue-hr-1',
    employee_no: 'HR-I-001',
    name: '근태통합관리자',
    department: '경영지원팀',
    team: '관리팀',
    position: '팀장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_근태: true,
    },
  };

  const staffMembers = [
    hrUser,
    {
      ...fakeUser,
      id: 'attendance-issue-staff-1',
      employee_no: 'AT-I-001',
      name: '지각직원',
      department: '외래팀',
      position: '사원',
      role: 'staff',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    attendanceRecords: [
      {
        id: 'attendance-record-1',
        staff_id: 'attendance-issue-staff-1',
        late_minutes: 18,
        early_leave_minutes: 12,
        work_date: `${yearMonth}-03`,
      },
      {
        id: 'attendance-record-2',
        staff_id: 'attendance-issue-staff-1',
        late_minutes: 25,
        early_leave_minutes: 0,
        work_date: `${yearMonth}-05`,
      },
    ],
    earlyLeaveRecords: [
      {
        id: 1,
        staff_id: 101,
        staff_name: '지각직원',
        dept: '외래팀',
        work_date: `${yearMonth}-05`,
        scheduled_end: '18:00',
        actual_end: '17:20',
        early_minutes: 40,
        is_approved: false,
        note: '조기 퇴근 테스트',
        company: fakeUser.company,
      },
    ],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '근태',
      erp_hr_tab: '근태',
      erp_hr_workspace: '근태 · 급여',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await openHrWorkspace(page, '근태 · 급여');
  await openHrMenu(page, '근태');

  await expect(page.getByRole('tab', { name: '지각조퇴분석' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '조기퇴근감지' })).toHaveCount(0);

  await page.getByRole('tab', { name: '근태이상 감지' }).click();
  await expect(page.getByTestId('attendance-analysis-issue-suite')).toBeVisible();
  await expect(page.getByTestId('attendance-analysis-lateness')).toBeVisible();
  await expect(page.getByTestId('attendance-analysis-early-leaving')).toBeVisible();
  await expect(page.getByText('근태 이상 통합 분석')).toBeVisible();
  await expect(page.getByText('조기 퇴근 테스트')).toBeVisible();
});
