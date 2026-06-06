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

test('contract sending succeeds even when employment_contracts misses optional contract columns', async ({
  page,
}) => {
  const hrUser = {
    ...fakeUser,
    id: 'hr-contract-1',
    employee_no: 'HR-C-001',
    name: '계약담당자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '경영지원팀',
    team: '관리팀',
    position: '실장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_계약: true,
    },
  };

  const targetStaff = {
    ...fakeUser,
    id: 'contract-target-1',
    employee_no: 'CT-001',
    name: '계약대상자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '외래팀',
    team: '외래팀',
    position: '사원',
    role: 'staff',
    joined_at: '2026-03-01',
  };

  await mockSupabase(page, {
    staffMembers: [hrUser, targetStaff],
    companies: [{ id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true }],
    employmentContracts: [],
    missingEmploymentContractColumns: [
      'conditions_applied_at',
      'contract_start_date',
      'shift_id',
      'shift_start_time',
      'shift_end_time',
      'break_start_time',
      'break_end_time',
      'probation_months',
      'working_hours_per_week',
      'working_days_per_week',
    ],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '계약',
      erp_hr_tab: '계약',
      erp_hr_workspace: '복지 · 문서',
      erp_hr_company: '박철홍정형외과',
      erp_hr_status: '재직',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=인사관리');
  await expect(page.getByTestId('hr-view')).toBeVisible();

  await openHrWorkspace(page, '복지 · 문서');
  await openHrMenu(page, '계약');
  await expect(page.getByRole('heading', { name: '계약 현황 (만료 임박 우선)' })).toBeVisible();

  await page.locator('tbody input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: /근로계약서 발송/ }).click();
  await page.getByTestId('risk-action-dialog-confirm').click();

  await expect(page.getByText(/계약서가 발송되었습니다/)).toBeVisible();
  await expect(page.getByText(/계약서 발송 실패/)).toHaveCount(0);
  await expect(page.getByText('서명대기', { exact: true }).first()).toBeVisible();
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
      hr_연차휴가: true,
      hr_급여: true,
      hr_건강검진: true,
      hr_경조사: true,
      hr_면허자격증: true,
      hr_의료기기점검: true,
      hr_사고보고서: true,
      hr_계약: true,
      hr_문서보관함: true,
      hr_증명서: true,
      hr_서류제출: true,
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

  await openHrMenu(page, '인사변동');
  await page.getByRole('tab', { name: '인사발령' }).click();
  await page.getByRole('button', { name: '발령 등록 및 상세 관리 열기' }).click();
  await expect(page.getByRole('heading', { name: /인사발령 관리/ })).toBeVisible();

  await openHrMenu(page, '입퇴사·교육센터');
  await page.getByRole('tab', { name: '교육·자격' }).click();
  await page.getByRole('button', { name: '교육 등록 및 상세 관리 열기' }).click();
  await expect(page.getByRole('heading', { name: '직종별 필수교육 이수율' })).toBeVisible();

  await page.getByRole('tab', { name: '오프보딩' }).click();
  await expect(page.getByTestId('offboarding-view')).toBeVisible();

  await openHrWorkspace(page, '근태 · 급여');

  await openHrMenu(page, '근태');
  await expect(page.getByRole('heading', { name: '부서별 출근 현황' })).toBeVisible();

  await page.getByRole('tab', { name: '근무표 편성' }).click();
  await page.getByRole('button', { name: '상세 편성 도구' }).click();

  const scheduleButton = page.getByRole('button', { name: '근무표 생성' });
  if (await scheduleButton.count()) {
    await scheduleButton.click();
    await expect(page.getByText(/근무표 생성/)).toBeVisible();
    const wizardButton = page.getByRole('button', { name: /3교대 마법사/ });
    if (await wizardButton.count()) {
      await wizardButton.click();
      await expect(page.getByText(/3교대 마법사|병동 3교대 근무표/)).toBeVisible();
      await page.getByTitle('근태관리로 돌아가기').click();
    }
  }

  await page.getByRole('button', { name: '워크센터 대시보드로 돌아가기' }).click();

  await page.getByRole('tab', { name: '근태이상 감지' }).click();
  await expect(page.getByTestId('attendance-analysis-issue-suite')).toBeVisible();
  await expect(page.getByTestId('attendance-analysis-lateness')).toBeVisible();
  await expect(page.getByTestId('attendance-analysis-early-leaving')).toBeVisible();

  await openHrMenu(page, '연차/휴가');
  await expect(page.getByTestId('leave-workcenter-view')).toBeVisible();
  await expect(page.getByRole('heading', { name: '직원별 연차 현황' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '월간 캘린더' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /소멸 예정 알림/ })).toBeVisible();

  await openHrMenu(page, '급여');
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  for (const moduleName of [
    '급여 정산',
    '급여 대장',
    '급여 시뮬레이터',
    '퇴직 정산',
    '퇴직연금',
    '4대보험',
    '원천징수',
    '임금피크제',
    '최저임금 점검',
    '비과세 점검',
    '통상임금 계산기',
    '미지급 수당 점검',
    '무급결근 차감',
  ]) {
    await page.getByRole('button', { name: moduleName, exact: true }).click();
    await expect(page.getByTestId('payroll-view')).toBeVisible();
    await page.getByRole('button', { name: '급여 워크센터 대시보드로 돌아가기' }).click();
  }
  await expect(page.getByRole('button', { name: '최저임금', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '비과세체크', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '총인건비예측', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '세전세후', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '원천징수', exact: true }).click();
  await expect(page.getByTestId('payroll-utility-tax-file').first()).toBeVisible();
  await page.getByRole('button', { name: '급여 워크센터 대시보드로 돌아가기' }).click();

  await page.getByRole('button', { name: '4대보험', exact: true }).click();
  await expect(page.getByTestId('insurance-edi-view')).toBeVisible();
  await page.getByRole('button', { name: '급여 워크센터 대시보드로 돌아가기' }).click();

  await openHrWorkspace(page, '복지 · 문서');

  await openHrMenu(page, '자격·안전센터');
  await page.getByTestId('compliance-suite-0').click();
  await expect(page.getByRole('heading', { name: /건강검진 현황/ })).toBeVisible();

  await page.getByTestId('compliance-suite-1').click();
  await expect(page.getByRole('heading', { name: /면허·자격/ })).toBeVisible();

  await page.getByTestId('compliance-suite-2').click();
  await expect(page.getByRole('heading', { name: /의료기기 점검/ })).toBeVisible();

  await page.getByTestId('compliance-suite-3').click();
  await expect(page.getByTestId('incident-report-view')).toBeVisible();

  await openHrMenu(page, '경조사');
  await page.getByRole('tab', { name: '경조사' }).click();
  await expect(page.getByRole('heading', { name: /최근 경조사/ })).toBeVisible();

  await openHrMenu(page, '계약');
  await expect(page.getByRole('heading', { name: '계약 현황 (만료 임박 우선)' })).toBeVisible();
  await page.getByRole('tab', { name: '계약서 자동생성' }).click();
  await expect(page.getByTestId('contract-utility-auto-generator')).toBeVisible();

  await openHrMenu(page, '문서센터');
  await page.getByRole('tab', { name: '문서보관함' }).click();
  await expect(page.getByRole('heading', { name: /문서 보관함/ })).toBeVisible();

  await page.getByRole('tab', { name: '증명서 발급' }).click();
  await expect(page.getByRole('button', { name: '발급 이력 조회' })).toBeVisible();

  await page.getByRole('tab', { name: '서류 제출' }).click();
  await expect(page.getByText('스마트 스캔 기능이 활성화되었습니다.')).toBeVisible();

  await expect(page.locator('[data-testid="hr-menu-calendar"]:visible')).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});
