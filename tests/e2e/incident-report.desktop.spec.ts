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

test('incident report allows editing and deleting existing reports', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  const hrUser = {
    ...fakeUser,
    id: 'incident-manager-1',
    employee_no: 'HR-I-001',
    name: '안전 담당자',
    company: 'E2E Clinic',
    company_id: 'hospital-incident-1',
    department: '경영지원팀',
    team: '관리팀',
    position: '팀장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_사고보고서: true,
      hr_건강검진: true,
      hr_면허자격증: true,
      hr_의료기기자격: true,
    },
  };

  const staffMembers = [
    hrUser,
    {
      ...fakeUser,
      id: 'incident-staff-1',
      employee_no: 'N-101',
      name: '김간호',
      company: 'E2E Clinic',
      company_id: 'hospital-incident-1',
      department: '간호부',
      team: '병동',
      position: '간호사',
      role: 'staff',
    },
  ];

  await mockSupabase(page, {
    staffMembers,
    companies: [
      { id: 'hospital-incident-1', name: 'E2E Clinic', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    incidentReports: [
      {
        id: 'incident-1',
        incident_date: '2026-04-01',
        incident_time: '09:10',
        location: '3층 처치실',
        type: '부상',
        severity: '중간',
        description: '초기 사고 경위입니다.',
        involved_persons: ['김간호'],
        immediate_action: '응급 처치 진행',
        root_cause: '바닥 미끄럼',
        preventive_measures: '미끄럼 방지 패드 교체',
        reporter_id: hrUser.id,
        reporter_name: hrUser.name,
        status: '접수',
        created_at: '2026-04-01T09:20:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '자격·안전센터',
      erp_hr_tab: '자격·안전센터',
      erp_hr_workspace: '복지 · 문서',
      erp_hr_company: 'E2E Clinic',
      erp_hr_status: '재직',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=인사관리');
  await expect(page.getByTestId('hr-view')).toBeVisible();

  await openHrWorkspace(page, '복지 · 문서');
  await openHrMenu(page, '자격·안전센터');
  await page.getByTestId('compliance-suite-3').click();

  await expect(page.getByTestId('incident-report-view')).toBeVisible();
  await expect(page.getByTestId('incident-report-card-incident-1')).toContainText('3층 처치실');

  await page.getByTestId('incident-report-edit-incident-1').click();
  await expect(page.getByTestId('incident-report-editing-banner')).toBeVisible();

  await page.getByTestId('incident-report-location').fill('4층 수술실');
  await page.getByTestId('incident-report-description').fill('수정된 사고 경위입니다.');
  await page.getByTestId('incident-report-save').click();

  await expect(page.getByText('사고 보고서를 수정했습니다.')).toBeVisible();
  await expect(page.getByTestId('incident-report-card-incident-1')).toContainText('4층 수술실');
  await expect(page.getByTestId('incident-report-card-incident-1')).toContainText('수정된 사고 경위입니다.');

  page.removeAllListeners('dialog');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('incident-report-delete-incident-1').click();

  await expect(page.getByText('사고 보고서를 삭제했습니다.')).toBeVisible();
  await expect(page.getByTestId('incident-report-card-incident-1')).toHaveCount(0);
  await expect(page.getByText('등록된 사고 보고서가 없습니다.')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
