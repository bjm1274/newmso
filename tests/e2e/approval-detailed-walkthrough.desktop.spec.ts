import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function buildSubMenuTestId(mainMenuId: string, subMenuId: string) {
  const slug = `${mainMenuId}-${subMenuId}`
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      const isAsciiLetter =
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      return isAsciiLetter ? char.toLowerCase() : `u${code.toString(16)}`;
    })
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `submenu-${slug}`;
}

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

async function openApprovalSubMenu(page: Page, subMenuId: string) {
  const locator = page.getByTestId(buildSubMenuTestId('전자결재', subMenuId));
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await expect(page.getByTestId('approval-view')).toBeVisible();
}

async function selectComposeFormTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('approval walkthrough opens each submenu in order without runtime errors', async ({ page }) => {
  test.setTimeout(150_000);

  const approvalUser = {
    ...fakeUser,
    id: 'approval-manager-1',
    employee_no: 'APR-001',
    name: 'Approval Manager',
    company: '테스트병원',
    company_id: 'hospital-1',
    department: '행정팀',
    team: '관리팀',
    position: '부장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      approval: true,
      ['menu_전자결재']: true,
      ['approval_기안함']: true,
      ['approval_결재함']: true,
      ['approval_작성하기']: true,
    },
  };

  const directApprover = {
    ...fakeUser,
    id: 'approval-line-1',
    employee_no: 'APR-010',
    name: 'Director Approver',
    company: '테스트병원',
    company_id: 'hospital-1',
    department: '행정팀',
    team: '관리팀',
    position: '원장',
    role: 'manager',
  };

  const requester = {
    ...fakeUser,
    id: 'approval-requester-1',
    employee_no: 'APR-020',
    name: 'Ward Requester',
    company: '테스트병원',
    company_id: 'hospital-1',
    department: '병동팀',
    team: '병동팀',
    position: '간호사',
    role: 'staff',
  };

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [approvalUser, directApprover, requester],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    inventoryItems: [
      {
        id: 'inventory-item-approval-1',
        item_name: '전자결재 테스트 거즈',
        quantity: 10,
        stock: 10,
        min_quantity: 3,
        company: '테스트병원',
        company_id: 'hospital-1',
        department: '병동팀',
        category: '소모품',
        created_at: '2026-03-16T09:00:00.000Z',
      },
    ],
    approvals: [
      {
        id: 'approval-draft-pending-1',
        type: '연차/휴가',
        title: '사전 연차 요청',
        content: '개인 일정으로 반차를 요청합니다.',
        sender_id: approvalUser.id,
        sender_name: approvalUser.name,
        sender_company: approvalUser.company,
        company_id: approvalUser.company_id,
        current_approver_id: directApprover.id,
        approver_line: [directApprover.id],
        status: '대기',
        doc_number: 'LV-202603-000101',
        created_at: '2026-03-14T09:00:00.000Z',
        meta_data: {
          form_slug: 'leave',
          form_name: '연차/휴가',
        },
      },
      {
        id: 'approval-draft-approved-1',
        type: '업무기안',
        title: '업무 보고 초안',
        content: '주간 운영 보고입니다.',
        sender_id: approvalUser.id,
        sender_name: approvalUser.name,
        sender_company: approvalUser.company,
        company_id: approvalUser.company_id,
        current_approver_id: directApprover.id,
        approver_line: [directApprover.id],
        status: '승인',
        doc_number: 'GEN-202603-000102',
        created_at: '2026-03-13T09:00:00.000Z',
        meta_data: {
          form_slug: 'draft_business',
          form_name: '업무기안',
        },
      },
      {
        id: 'approval-inbox-pending-1',
        type: '물품신청',
        title: '병동 물품 요청',
        content: '야간 근무용 거즈가 필요합니다.',
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        current_approver_id: approvalUser.id,
        approver_line: [approvalUser.id, directApprover.id],
        status: '대기',
        doc_number: 'SUP-202603-000103',
        created_at: '2026-03-15T09:00:00.000Z',
        meta_data: {
          form_slug: 'purchase',
          form_name: '물품신청',
          items: [
            {
              name: '전자결재 테스트 거즈',
              qty: 2,
              dept: '병동팀',
              purpose: '야간 근무 준비',
            },
          ],
        },
      },
    ],
  });

  await seedSession(page, {
    user: approvalUser,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '기안함',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=전자결재&open_subview=기안함');
  await expect(page.getByTestId('approval-view')).toBeVisible();

  await openApprovalSubMenu(page, '기안함');
  await expect(page.locator('h2', { hasText: '기안함' })).toBeVisible();
  await expect(page.getByTestId('approval-document-filter')).toBeVisible();
  await expect(page.getByTestId('approval-card-approval-draft-pending-1')).toBeVisible();
  await expect(page.getByTestId('approval-card-approval-draft-approved-1')).toBeVisible();
  await page.getByTestId('approval-card-approval-draft-pending-1').click();
  await expect(page.getByRole('heading', { name: '사전 연차 요청' }).last()).toBeVisible();
  await page.getByRole('button', { name: '✕' }).last().click();

  await openApprovalSubMenu(page, '결재함');
  await expect(page.locator('h2', { hasText: '결재함' })).toBeVisible();
  await expect(page.getByRole('button', { name: '일괄 승인' })).toBeVisible();
  await expect(page.getByRole('button', { name: '일괄 반려' })).toBeVisible();
  const inboxCard = page.getByTestId('approval-card-approval-inbox-pending-1');
  await expect(inboxCard).toBeVisible();
  await expect(inboxCard.getByRole('button', { name: '승인' })).toBeVisible();
  await expect(inboxCard.getByRole('button', { name: '반려' })).toBeVisible();

  await openApprovalSubMenu(page, '작성하기');
  await expect(page.getByTestId('approval-approver-select')).toBeVisible();
  await page.getByTestId('approval-approver-select').selectOption(directApprover.id);
  await expect(page.getByText(`1. ${directApprover.name} ${directApprover.position}`)).toBeVisible();

  await selectComposeFormTab(page, '연차/휴가');
  await expect(page.getByTestId('approval-leave-type-select')).toBeVisible();
  await expect(page.getByTestId('approval-leave-start-date')).toBeVisible();
  await expect(page.getByTestId('approval-title-input')).toBeVisible();
  await expect(page.getByTestId('approval-submit-button')).toBeVisible();

  await selectComposeFormTab(page, '물품신청');
  await expect(page.getByTestId('supplies-add-row-button')).toBeVisible();
  await expect(page.getByTestId('supplies-item-name-0')).toBeVisible();

  await selectComposeFormTab(page, '보고서작성');
  await expect(page.getByTestId('approval-report-view')).toBeVisible();

  await selectComposeFormTab(page, '양식신청');
  await expect(page.getByTestId('form-request-view')).toBeVisible();

  await selectComposeFormTab(page, '출결정정');
  await expect(page.getByTestId('attendance-correction-view')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
