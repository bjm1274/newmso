import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const requester = {
  ...fakeUser,
  id: 'approval-requester-advanced-1',
  employee_no: 'APR-100',
  name: '기안 담당자',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '병동팀',
  team: '병동팀',
  position: '간호사',
  role: 'staff',
};

const firstApprover = {
  ...fakeUser,
  id: 'approval-first-approver-1',
  employee_no: 'APR-101',
  name: '1차 결재자',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '행정팀',
  team: '관리팀',
  position: '팀장',
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

const secondApprover = {
  ...fakeUser,
  id: 'approval-second-approver-1',
  employee_no: 'APR-102',
  name: '2차 결재자',
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

async function openApprovalInbox(page: Page) {
  await page.goto('/main?open_menu=전자결재&open_subview=결재함');
  await expect(page.getByTestId('approval-view')).toBeVisible();
}

async function openApprovalCompose(page: Page) {
  await page.goto('/main?open_menu=전자결재&open_subview=작성하기');
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await expect(page.getByTestId('approval-approver-select')).toBeVisible();
}

async function readApprovals(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/rest/v1/approvals?select=*');
    return response.json();
  });
}

async function waitForApprovalInsert(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/rest/v1/approvals')
  );
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('multi-step approval advances to the next approver and finalizes on second approval', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  await mockSupabase(page, {
    staffMembers: [requester, firstApprover, secondApprover],
    approvals: [
      {
        id: 'approval-multistep-1',
        type: '업무협조',
        title: '병동 업무협조 요청',
        content: '병동-행정팀 협조가 필요합니다.',
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        current_approver_id: firstApprover.id,
        approver_line: [firstApprover.id, secondApprover.id],
        status: '대기',
        doc_number: 'APR-202603-0001',
        created_at: '2026-03-17T09:00:00.000Z',
        meta_data: {
          form_slug: 'cooperation',
          form_name: '업무협조',
          approver_line: [firstApprover.id, secondApprover.id],
        },
      },
    ],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: firstApprover,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '결재함',
      erp_permission_prompt_shown: '1',
    },
  });

  await openApprovalInbox(page);
  const approvalCard = page.getByTestId('approval-card-approval-multistep-1');
  await expect(approvalCard).toBeVisible();
  await approvalCard.getByRole('button', { name: '승인' }).click();

  let approvals = await readApprovals(page);
  let updatedRow = approvals.find((item: any) => item.id === 'approval-multistep-1');
  expect(updatedRow?.status).toBe('대기');
  expect(updatedRow?.current_approver_id).toBe(secondApprover.id);

  await seedSession(page, {
    user: secondApprover,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '결재함',
      erp_permission_prompt_shown: '1',
    },
  });

  await openApprovalInbox(page);
  const secondApprovalCard = page.getByTestId('approval-card-approval-multistep-1');
  await expect(secondApprovalCard).toBeVisible();
  await secondApprovalCard.getByRole('button', { name: '승인' }).click();

  approvals = await readApprovals(page);
  updatedRow = approvals.find((item: any) => item.id === 'approval-multistep-1');
  expect(updatedRow?.status).toBe('승인');
  expect(runtimeErrors).toEqual([]);
});

test('rejecting a pending approval stores the reject reason in metadata', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await page.addInitScript(() => {
    window.prompt = () => '근거가 부족합니다.';
  });

  await mockSupabase(page, {
    staffMembers: [requester, firstApprover],
    approvals: [
      {
        id: 'approval-reject-1',
        type: '업무기안',
        title: '반려 대상 기안',
        content: '예산 근거가 비어 있습니다.',
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        current_approver_id: firstApprover.id,
        approver_line: [firstApprover.id],
        status: '대기',
        doc_number: 'APR-202603-0002',
        created_at: '2026-03-17T10:00:00.000Z',
        meta_data: {
          form_slug: 'draft_business',
          form_name: '업무기안',
        },
      },
    ],
  });

  await seedSession(page, {
    user: firstApprover,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '결재함',
      erp_permission_prompt_shown: '1',
    },
  });

  await openApprovalInbox(page);
  const approvalCard = page.getByTestId('approval-card-approval-reject-1');
  await expect(approvalCard).toBeVisible();
  await approvalCard.getByRole('button', { name: '반려' }).click();

  const approvals = await readApprovals(page);
  const updatedRow = approvals.find((item: any) => item.id === 'approval-reject-1');
  expect(updatedRow?.status).toBe('반려');
  expect(updatedRow?.meta_data?.reject_reason).toBe('근거가 부족합니다.');
  expect(runtimeErrors).toEqual([]);
});

test('custom approval form submits and its PDF print HTML is generated', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await page.addInitScript(() => {
    (window as any).__printedHtml = '';
    window.open = () =>
      ({
        document: {
          write: (html: string) => {
            (window as any).__printedHtml = html;
          },
          close: () => {},
        },
      } as any);
  });

  await mockSupabase(page, {
    staffMembers: [requester, firstApprover],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: requester,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '작성하기',
      erp_permission_prompt_shown: '1',
      erp_approval_form_types_custom: JSON.stringify([
        { name: '시설점검', slug: 'facility_check', is_active: true },
      ]),
    },
  });

  await openApprovalCompose(page);
  await page.getByTestId('approval-approver-select').selectOption(firstApprover.id);
  await page.getByTestId('approval-form-type-9').click();
  await page.getByTestId('approval-title-input').fill('E2E 시설점검 상신');
  await page.getByTestId('approval-content-input').fill('시설 점검 요청 본문입니다.');
  const insert = waitForApprovalInsert(page);
  await page.getByTestId('approval-submit-button').click();
  await insert;
  await expect(page.getByTestId('approval-card-approval-1')).toBeVisible();

  const approvals = await readApprovals(page);
  expect(approvals).toHaveLength(1);
  expect(approvals[0].type).toBe('facility_check');
  expect(approvals[0].meta_data?.form_slug).toBe('facility_check');
  expect(approvals[0].meta_data?.form_name).toBe('시설점검');
  expect(String(approvals[0].doc_number || '')).not.toBe('');

  const approvalCard = page.getByTestId('approval-card-approval-1');
  await expect(approvalCard).toBeVisible();
  await approvalCard.getByRole('button', { name: 'PDF' }).click();

  const printedHtml = await page.evaluate(() => (window as any).__printedHtml);
  expect(printedHtml).toContain('E2E 시설점검 상신');
  expect(printedHtml).toContain('시설점검');
  expect(printedHtml).toContain(String(approvals[0].doc_number));
  expect(runtimeErrors).toEqual([]);
});
