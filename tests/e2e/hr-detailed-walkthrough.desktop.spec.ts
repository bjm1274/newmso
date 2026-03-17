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

async function openHrWorkspace(page: Page, workspaceId: string) {
  await page.getByTestId(`hr-workspace-${workspaceId}`).click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
}

async function openHrMenu(page: Page, menuId: string) {
  await page.locator(`[data-testid="hr-menu-${menuId}"]:visible`).first().click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('hr walkthrough opens each submenu in practical order without runtime errors', async ({ page }) => {
  test.setTimeout(150_000);

  const hrUser = {
    ...fakeUser,
    id: 'hr-manager-1',
    employee_no: 'HR-001',
    name: '인사 점검자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '경영지원팀',
    team: '관리팀',
    position: '팀장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_구성원: true,
      hr_인사발령: true,
      hr_포상징계: true,
      hr_교육: true,
      hr_오프보딩: true,
      hr_근태: true,
      hr_교대근무: true,
      hr_연차휴가: true,
      hr_급여: true,
      hr_건강검진: true,
      hr_경조사: true,
      hr_면허자격증: true,
      hr_의료기기점검: true,
      hr_비품대여: true,
      hr_사고보고서: true,
      hr_계약: true,
      hr_문서보관함: true,
      hr_증명서: true,
      hr_서류제출: true,
      hr_캘린더: true,
      hr_근무형태: true,
    },
  };

  const staffMembers = [
    hrUser,
    {
      ...fakeUser,
      id: 'staff-ward-1',
      employee_no: 'N-001',
      name: '김수지',
      company: '박철홍정형외과',
      company_id: 'hospital-1',
      department: '간호부',
      team: '병동팀',
      position: '간호사',
      role: 'staff',
      joined_at: '2024-03-01',
      annual_leave_total: 15,
      annual_leave_used: 4,
    },
    {
      ...fakeUser,
      id: 'staff-out-1',
      employee_no: 'O-001',
      name: '홍길동',
      company: '박철홍정형외과',
      company_id: 'hospital-1',
      department: '외래',
      team: '외래팀',
      position: '대리',
      role: 'staff',
      joined_at: '2023-05-10',
      annual_leave_total: 16,
      annual_leave_used: 6,
    },
    {
      ...fakeUser,
      id: 'staff-admin-1',
      employee_no: 'A-001',
      name: '박민정',
      company: '박철홍정형외과',
      company_id: 'hospital-1',
      department: '원무',
      team: '관리팀',
      position: '사원',
      role: 'staff',
      joined_at: '2025-01-15',
      annual_leave_total: 11,
      annual_leave_used: 1,
    },
  ];

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers,
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    orgTeams: [
      { id: 'team-1', company_id: 'hospital-1', company: '박철홍정형외과', name: '병동팀', division: '간호부' },
      { id: 'team-2', company_id: 'hospital-1', company: '박철홍정형외과', name: '외래팀', division: '진료부' },
      { id: 'team-3', company_id: 'hospital-1', company: '박철홍정형외과', name: '관리팀', division: '경영지원부' },
      { id: 'team-4', company_id: 'hospital-1', company: '박철홍정형외과', name: '영양팀', division: '원무부' },
    ],
    workShifts: [
      {
        id: 'shift-day',
        name: '외래/검사월-금',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        start_time: '08:30',
        end_time: '17:30',
        is_active: true,
        is_weekend_work: false,
      },
      {
        id: 'shift-ward-d',
        name: '병동3교대/D',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        start_time: '07:20',
        end_time: '15:20',
        is_active: true,
        is_weekend_work: true,
      },
      {
        id: 'shift-ward-e',
        name: '병동3교대/E',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        start_time: '14:00',
        end_time: '22:00',
        is_active: true,
        is_weekend_work: true,
      },
      {
        id: 'shift-ward-n',
        name: '병동3교대/N',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        start_time: '21:00',
        end_time: '08:00',
        is_active: true,
        is_weekend_work: true,
      },
      {
        id: 'shift-admin',
        name: '통상상근',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        start_time: '09:00',
        end_time: '18:00',
        is_active: true,
        is_weekend_work: false,
      },
    ],
    leaveRequests: [
      {
        id: 'leave-1',
        staff_id: 'staff-out-1',
        leave_type: '연차',
        start_date: '2026-03-18',
        end_date: '2026-03-19',
        status: '승인',
        reason: '가족 일정',
      },
      {
        id: 'leave-2',
        staff_id: 'staff-admin-1',
        leave_type: '반차',
        start_date: '2026-03-20',
        end_date: '2026-03-20',
        status: '대기',
        reason: '은행 방문',
      },
    ],
    attendances: [
      {
        id: 'att-1',
        staff_id: 'staff-ward-1',
        work_date: '2026-03-16',
        status: '출근',
        check_in: '2026-03-16T07:15:00.000Z',
        check_out: '2026-03-16T15:25:00.000Z',
        shift_name: '병동3교대/D',
      },
      {
        id: 'att-2',
        staff_id: 'staff-out-1',
        work_date: '2026-03-16',
        status: '출근',
        check_in: '2026-03-16T08:28:00.000Z',
        check_out: '2026-03-16T17:31:00.000Z',
        shift_name: '외래/검사월-금',
      },
    ],
    payrollRecords: [
      {
        id: 'payroll-1',
        staff_id: 'staff-out-1',
        company: '박철홍정형외과',
        year_month: '2026-03',
        net_pay: 2500000,
        gross_pay: 2800000,
      },
    ],
    generatedContracts: [
      {
        id: 'contract-1',
        staff_id: 'staff-admin-1',
        company: '박철홍정형외과',
        contract_type: '근로계약',
        created_at: '2026-03-10T09:00:00.000Z',
      },
    ],
    insuranceRecords: [
      {
        id: 'insurance-1',
        staff_id: 'staff-admin-1',
        company: '박철홍정형외과',
        status: '가입',
        created_at: '2026-03-01T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '구성원',
      erp_hr_tab: '구성원',
      erp_hr_workspace: '인력관리',
      erp_hr_company: '박철홍정형외과',
      erp_hr_status: '재직',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=인사관리');
  await expect(page.getByTestId('hr-view')).toBeVisible();

  await openHrWorkspace(page, '인력관리');

  await openHrMenu(page, '구성원');
  await expect(page.getByTestId('new-staff-button')).toBeVisible();

  await openHrMenu(page, '인사발령');
  await expect(page.getByRole('heading', { name: /인사발령 관리/ })).toBeVisible();

  await openHrMenu(page, '포상/징계');
  await expect(page.getByRole('heading', { name: /포상/ })).toBeVisible();

  await openHrMenu(page, '교육');
  await expect(page.getByText(/Compliance/)).toBeVisible();

  await openHrMenu(page, '오프보딩');
  await expect(page.getByTestId('offboarding-view')).toBeVisible();

  await openHrWorkspace(page, '근태 · 급여');

  await openHrMenu(page, '근태');
  await expect(page.getByText(/전문 근태 통합 관리/)).toBeVisible();
  await page.getByRole('button', { name: '연차소멸알림' }).click();
  await expect(page.getByTestId('attendance-analysis-leave-expiry')).toBeVisible();
  await page.getByRole('button', { name: '지각조퇴분석' }).click();
  await expect(page.getByTestId('attendance-analysis-lateness')).toBeVisible();
  await page.getByRole('button', { name: '근무형태이력' }).click();
  await expect(page.getByTestId('attendance-analysis-worktype-history')).toBeVisible();
  await page.getByRole('button', { name: '조기퇴근감지' }).click();
  await expect(page.getByTestId('attendance-analysis-early-leaving')).toBeVisible();

  await openHrMenu(page, '교대근무');
  await expect(page.getByTestId('shift-suite-bar')).toBeVisible();
  await page.getByTestId('shift-suite-0').click();
  await expect(page.getByText(/교대근무 및 스케줄링 간트 차트/)).toBeVisible();
  await page.getByTestId('shift-suite-1').click();
  await expect(page.getByTestId('roster-pattern-planner')).toBeVisible();
  await page.getByTestId('shift-suite-2').click();
  await expect(page.getByTestId('roster-rule-manager')).toBeVisible();
  await page.getByTestId('shift-suite-3').click();
  await expect(page.getByTestId('roster-pattern-manager')).toBeVisible();

  await openHrMenu(page, '연차/휴가');
  await expect(page.getByTestId('leave-management-view')).toBeVisible();
  await page.getByTestId('leave-tab-연차-휴가-신청내역').click();
  await expect(page.getByText(/근로기준법 기준 연차·휴가 안내/)).toBeVisible();
  await page.getByTestId('leave-tab-연차-대시보드').click();
  await expect(page.getByText(/연차 종합 대시보드/)).toBeVisible();
  await page.getByTestId('leave-tab-연차사용촉진-자동화').click();
  await expect(page.getByRole('heading', { name: /연차사용촉진 자동화 시스템/ })).toBeVisible();
  await page.getByTestId('leave-tab-연차-자동부여-설정').click();
  await expect(page.getByText(/연차 자동 부여 로직 설정/)).toBeVisible();
  await page.getByTestId('leave-tab-공휴일-달력').click();
  await expect(page.getByRole('heading', { name: /공휴일 자동 반영 달력/ })).toBeVisible();

  await openHrMenu(page, '급여');
  await page.getByRole('button', { name: '급여 메인' }).click();
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  for (const payrollTabId of [
    '대시보드',
    '급여정산',
    '급여대장',
    '연말퇴직정산',
    '통합설정',
    '급여시뮬레이터',
    '4대보험EDI',
    '퇴직연금',
    '임금피크제',
    '최저임금',
    '통상임금',
    '비과세체크',
    '총인건비예측',
    '세전세후',
    '미지급수당',
    '급여고도화',
    '무급결근차감',
  ]) {
    await page.getByTestId(`payroll-tab-${payrollTabId}`).click();
    await expect(page.getByTestId('payroll-view')).toBeVisible();
  }
  await page.getByRole('button', { name: '원천징수파일' }).click();
  await expect(page.getByTestId('payroll-utility-tax-file')).toBeVisible();
  await page.getByRole('button', { name: '4대보험 / EDI' }).click();
  await expect(page.getByTestId('payroll-utility-insurance')).toBeVisible();

  await openHrWorkspace(page, '복지 · 문서');

  await openHrMenu(page, '건강검진');
  await expect(page.getByRole('heading', { name: /건강검진 관리/ })).toBeVisible();

  await openHrMenu(page, '경조사');
  await expect(page.getByRole('heading', { name: /경조사 관리/ })).toBeVisible();

  await openHrMenu(page, '면허/자격증');
  await expect(page.getByRole('heading', { name: /면허·자격증 관리/ })).toBeVisible();

  await openHrMenu(page, '의료기기점검');
  await expect(page.getByRole('heading', { name: /의료기기 정기점검 관리/ })).toBeVisible();

  await openHrMenu(page, '비품대여');
  await expect(page.getByRole('heading', { name: /비품\/장비 대여 관리/ })).toBeVisible();

  await openHrMenu(page, '사고보고서');
  await expect(page.getByRole('heading', { name: /사고 보고서 관리/ })).toBeVisible();

  await openHrMenu(page, '계약');
  await expect(page.getByRole('heading', { name: /전자 계약 및 법적 비과세 관리/ })).toBeVisible();
  await page.getByRole('button', { name: '계약서 자동생성' }).click();
  await expect(page.getByTestId('contract-utility-auto-generator')).toBeVisible();

  await openHrMenu(page, '문서보관함');
  await expect(page.getByRole('heading', { name: /문서 보관함/ })).toBeVisible();

  await openHrMenu(page, '증명서');
  await expect(page.getByRole('heading', { name: /증명서 발급 센터/ })).toBeVisible();

  await openHrMenu(page, '서류제출');
  await expect(page.getByRole('heading', { name: /스마트 서류 제출/ })).toBeVisible();

  await openHrMenu(page, '캘린더');
  await expect(page.getByRole('heading', { name: '공유 캘린더' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '캘린더 동기화' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
