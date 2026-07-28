import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function openHrMenu(page: Page, subMenuId: string) {
  const locator = page.locator(`[data-testid="hr-menu-${subMenuId}"]:visible`).first();
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('attendance calendar supports day week month views with detailed status labels', async ({ page }) => {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const targetDate = `${yearMonth}-06`;

  // 주별 패널 검증용 날짜는 **targetDate 와 같은 주**에서 뽑는다.
  // 예전에는 `-04`·`-05` 를 하드코딩했는데, 6일이 무슨 요일인지에 따라 같은 주가 아닐 수 있어
  // (예: 6일이 월요일이면 일요일 시작 주는 5~11 이라 4일이 빠진다) 달마다 통과/실패가 갈렸다.
  // 주 시작 규칙은 앱(AttendCalendarDetail.weekIsoRange)과 동일하게 **일요일 시작**.
  const weekMates = (() => {
    const base = new Date(`${targetDate}T00:00:00`);
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - base.getDay());
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return iso(d);
    }).filter((d) => d !== targetDate && d.startsWith(yearMonth));
    return { leaveDate: days[0] ?? targetDate, absentDate: days[1] ?? targetDate };
  })();

  const hrUser = {
    ...fakeUser,
    id: 'attendance-hr-1',
    employee_no: 'HR-A-001',
    name: '근태관리자',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
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
      id: 'attendance-staff-1',
      employee_no: 'AT-001',
      name: '근태직원1',
      company: fakeUser.company,
      company_id: fakeUser.company_id,
      department: '외래팀',
      position: '사원',
      role: 'staff',
    },
    {
      ...fakeUser,
      id: 'attendance-staff-2',
      employee_no: 'AT-002',
      name: '근태직원2',
      company: fakeUser.company,
      company_id: fakeUser.company_id,
      department: '병동팀',
      position: '사원',
      role: 'staff',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    attendances: [
      {
        id: 'attendance-day-1',
        staff_id: 'attendance-staff-1',
        work_date: targetDate,
        status: 'present',
        check_in_time: `${targetDate}T09:00:00`,
        check_out_time: `${targetDate}T18:00:00`,
        work_hours_minutes: 540,
      },
      {
        id: 'attendance-day-2',
        staff_id: 'attendance-staff-2',
        work_date: targetDate,
        status: 'late',
        check_in_time: `${targetDate}T09:20:00`,
        check_out_time: `${targetDate}T18:00:00`,
        work_hours_minutes: 520,
      },
      {
        id: 'attendance-day-3',
        staff_id: 'attendance-staff-1',
        work_date: weekMates.leaveDate,
        status: 'annual_leave',
      },
      {
        id: 'attendance-day-4',
        staff_id: 'attendance-staff-2',
        work_date: weekMates.absentDate,
        status: 'absent',
      },
    ],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: 'attend',
      erp_hr_tab: 'attend',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}&open_subview=attend`);

  await openHrMenu(page, 'attend');

  await page.getByRole('tab', { name: '달력' }).click();
  await page.getByRole('button', { name: '일별 상세' }).click();
  await expect(page.getByTestId('attendance-calendar-open-day')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-open-week')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-open-month')).toBeVisible();
  await page.getByTestId(`attendance-calendar-cell-${targetDate}`).click();
  await expect(page.getByTestId('attendance-calendar-detail-modal')).toBeVisible();

  await page.getByTestId('attendance-calendar-detail-day').click();
  await expect(page.getByTestId('attendance-calendar-day-panel')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-day-panel')).toContainText('정상 출근');
  await expect(page.getByTestId('attendance-calendar-day-panel')).toContainText('지각');

  await page.getByTestId('attendance-calendar-detail-week').click();
  await expect(page.getByTestId('attendance-calendar-week-panel')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-week-panel')).toContainText('연차');
  await expect(page.getByTestId('attendance-calendar-week-panel')).toContainText('결근');

  await page.getByTestId('attendance-calendar-detail-month').click();
  await expect(page.getByTestId('attendance-calendar-month-panel')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-month-panel')).toContainText('정상 출근');
  await expect(page.getByTestId('attendance-calendar-month-panel')).toContainText('지각');

  await page.getByTestId('attendance-calendar-detail-close').click();
  await expect(page.getByTestId('attendance-calendar-detail-modal')).toHaveCount(0);

  await page.getByTestId('attendance-calendar-open-week').click();
  await expect(page.getByTestId('attendance-calendar-detail-modal')).toBeVisible();
  await expect(page.getByTestId('attendance-calendar-week-panel')).toBeVisible();
});
