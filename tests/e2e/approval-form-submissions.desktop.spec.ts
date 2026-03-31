import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, replaceSession, seedSession } from './helpers';

const composeUser = {
  ...fakeUser,
  id: 'approval-author-1',
  employee_no: 'APR-001',
  name: '전자결재 작성자',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '병동팀',
  team: '병동팀',
  position: '간호사',
  role: 'staff',
  schedule_id: 'work-schedule-day',
  annual_leave_total: 15,
  annual_leave_used: 3,
};

const approver = {
  ...fakeUser,
  id: 'approval-approver-1',
  employee_no: 'APR-010',
  name: '최종 결재자',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '행정팀',
  team: '관리팀',
  position: '부장',
  role: 'manager',
};

const supportStaff = {
  ...fakeUser,
  id: 'approval-support-1',
  employee_no: 'APR-020',
  name: '행정 지원',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '행정팀',
  team: '관리팀',
  position: '팀장',
  role: 'manager',
};

const templateReferenceStaff = {
  ...fakeUser,
  id: 'approval-template-reference-1',
  employee_no: 'APR-022',
  name: '템플릿 참조자',
  company: '테스트병원',
  company_id: 'hospital-1',
  department: '원무팀',
  team: '원무팀',
  position: '사원',
  role: 'staff',
};

const supportDirector = {
  ...fakeUser,
  id: 'approval-support-director-1',
  employee_no: 'APR-021',
  name: '백정민',
  company: 'SY INC.',
  company_id: 'mso-company-id',
  department: '경영지원팀',
  team: '경영지원팀',
  position: '이사',
  role: 'admin',
  permissions: {
    ...fakeUser.permissions,
    mso: true,
    approval: true,
    ['menu_전자결재']: true,
    ['approval_결재함']: true,
  },
};

const adminUser = {
  ...fakeUser,
  id: 'approval-admin-1',
  employee_no: 'APR-900',
  name: '권한 관리자',
  company: 'SY INC.',
  company_id: 'mso-company-id',
  department: '경영지원팀',
  team: '경영지원팀',
  position: '부장',
  role: 'admin',
  permissions: {
    ...fakeUser.permissions,
    admin: true,
    mso: true,
    menu_관리자: true,
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

async function openCompose(page: Page) {
  await page.goto('/main?open_menu=전자결재&open_subview=작성하기');
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await expect(page.getByTestId('approval-approver-select')).toBeVisible();
}

async function selectApprover(page: Page) {
  await page.getByTestId('approval-approver-select').selectOption(approver.id);
}

async function selectReference(page: Page) {
  await page.getByTestId('approval-cc-select').selectOption(supportStaff.id);
}

async function waitForApprovalInsert(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/rest/v1/approvals')
  );
}

async function readApprovals(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/rest/v1/approvals?select=*');
    return response.json();
  });
}

async function readNotifications(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/rest/v1/notifications?select=*');
    return response.json();
  });
}

async function expectApproval(page: Page, title: string) {
  const approvals = await readApprovals(page);
  const row = approvals.find((item: any) => item.title === title);
  expect(row, `approval "${title}" should exist`).toBeTruthy();
  return row;
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('approval submission stays blocked until an approver is selected', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: String(composeUser.company), type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);
  await expect(page.getByTestId('approval-approver-required')).toBeVisible();
  await expect(page.getByTestId('approval-submit-button')).toBeDisabled();

  await page.getByTestId('approval-form-type-7').click();
  await expect(page.getByTestId('form-request-view')).toBeVisible();
  await expect(page.getByTestId('form-request-approver-required')).toBeVisible();
  await expect(page.getByTestId('form-request-submit')).toBeDisabled();

  await selectApprover(page);
  await expect(page.getByTestId('approval-approver-required')).toHaveCount(0);
  await expect(page.getByTestId('form-request-approver-required')).toHaveCount(0);
  await expect(page.getByTestId('form-request-submit')).toBeEnabled();

  expect(runtimeErrors).toEqual([]);
});

test('hospital compose includes SY INC. approvers in approval line options across forms', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const supportDirectorWithLegacyCompanyName = {
    ...supportDirector,
    company: 'SYINC',
  };

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff, supportDirectorWithLegacyCompanyName],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: String(composeUser.company), type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);

  const approverSelect = page.getByTestId('approval-approver-select');
  await expect(approverSelect.locator('option', { hasText: supportDirectorWithLegacyCompanyName.name })).toHaveCount(1);

  await page.getByTestId('approval-form-type-5').click();
  await expect(approverSelect.locator('option', { hasText: supportDirectorWithLegacyCompanyName.name })).toHaveCount(1);

  await page.getByTestId('approval-form-type-3').click();
  await expect(page.getByTestId('supplies-add-row-button')).toBeVisible();
  await expect(approverSelect.locator('option', { hasText: supportDirectorWithLegacyCompanyName.name })).toHaveCount(1);

  await approverSelect.selectOption(supportDirectorWithLegacyCompanyName.id);
  await expect(page.getByText(`1. ${supportDirectorWithLegacyCompanyName.name} ${supportDirectorWithLegacyCompanyName.position}`)).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('supply request template load keeps saved reference users', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff, supportDirector, templateReferenceStaff],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: String(composeUser.company), type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);
  await page.getByTestId('approval-form-type-3').click();
  await expect(page.getByTestId('supplies-add-row-button')).toBeVisible();

  await page.getByTestId('approval-approver-select').selectOption(approver.id);
  await page.getByTestId('approval-cc-select').selectOption(templateReferenceStaff.id);
  await expect(page.getByText(`CC ${templateReferenceStaff.name}`)).toBeVisible();

  await page.getByTestId('approval-template-save-open').click();
  await page.getByTestId('approval-template-name-input').fill('물품신청 템플릿 참조자 유지');
  await page.getByTestId('approval-template-save-confirm').click();

  await page.getByTestId('approval-selected-approver-remove-0').click();
  await page.getByTestId('approval-selected-cc-remove-0').click();
  await expect(page.getByText(`CC ${templateReferenceStaff.name}`)).toHaveCount(0);

  await page.getByTestId('approval-template-load-toggle').click();
  await page.getByRole('button', { name: /물품신청 템플릿 참조자 유지/ }).click();

  await expect(page.getByText(`1. ${approver.name} ${approver.position}`)).toBeVisible();
  await expect(page.getByText(`CC ${templateReferenceStaff.name}`)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('supply request stats stay collapsed by default and only show the current department', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff],
    approvals: [
      {
        id: 'approval-supply-stats-ward-1',
        type: '물품신청',
        title: '병동 통계 1',
        content: '병동 거즈 신청',
        sender_id: composeUser.id,
        sender_name: composeUser.name,
        sender_company: composeUser.company,
        company_id: composeUser.company_id,
        status: '승인',
        created_at: '2026-03-18T09:00:00.000Z',
        meta_data: {
          form_slug: 'purchase',
          form_name: '물품신청',
          items: [
            { name: '병동 거즈', qty: 3, dept: '병동팀', purpose: '처치 준비' },
          ],
        },
      },
      {
        id: 'approval-supply-stats-ward-2',
        type: '물품신청',
        title: '병동 통계 2',
        content: '병동 거즈 추가 신청',
        sender_id: composeUser.id,
        sender_name: composeUser.name,
        sender_company: composeUser.company,
        company_id: composeUser.company_id,
        status: '승인',
        created_at: '2026-03-20T09:00:00.000Z',
        meta_data: {
          form_slug: 'purchase',
          form_name: '물품신청',
          items: [
            { name: '병동 거즈', qty: 5, dept: '병동팀', purpose: '처치 준비' },
          ],
        },
      },
      {
        id: 'approval-supply-stats-surgery-1',
        type: '물품신청',
        title: '수술 통계',
        content: '수술 포셉 신청',
        sender_id: composeUser.id,
        sender_name: composeUser.name,
        sender_company: composeUser.company,
        company_id: composeUser.company_id,
        status: '승인',
        created_at: '2026-03-21T09:00:00.000Z',
        meta_data: {
          form_slug: 'purchase',
          form_name: '물품신청',
          items: [
            { name: '수술 포셉', qty: 2, dept: '수술팀', purpose: '수술 준비' },
          ],
        },
      },
    ],
    companies: [
      { id: 'hospital-1', name: String(composeUser.company), type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    inventoryItems: [
      {
        id: 'inventory-stats-1',
        item_name: '병동 거즈',
        quantity: 12,
        stock: 12,
        min_quantity: 2,
        unit: 'BOX',
        company: 'SY INC.',
        company_id: 'mso-company-id',
        department: '경영지원팀',
        category: '소모품',
        created_at: '2026-03-16T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '작성하기',
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);
  await page.getByTestId('approval-form-type-3').click();
  await expect(page.getByTestId('supplies-add-row-button')).toBeVisible();
  await expect(page.getByTestId('supplies-stats-panel')).toHaveCount(0);
  await expect(page.getByTestId('supplies-stats-summary')).toContainText('병동팀');

  await page.getByTestId('supplies-stats-toggle').click();
  const statsPanel = page.getByTestId('supplies-stats-panel');
  await expect(statsPanel).toBeVisible();
  await expect(statsPanel.getByText('병동 거즈')).toBeVisible();
  await expect(statsPanel.getByText('수술 포셉')).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test('shared approval forms submit with real field input', async ({ page }) => {
  test.setTimeout(180_000);

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    inventoryItems: [
      {
        id: 'inventory-item-1',
        item_name: '멸균 거즈',
        quantity: 20,
        stock: 20,
        min_quantity: 5,
        unit: 'BOX',
        spec: '4x4 / 30매',
        company: 'SY INC.',
        company_id: 'mso-company-id',
        department: '경영지원팀',
        category: '소모품',
        created_at: '2026-03-16T09:00:00.000Z',
      },
      {
        id: 'inventory-item-2',
        item_name: '멸균 거즈',
        quantity: 6,
        stock: 6,
        min_quantity: 2,
        company: '테스트병원',
        company_id: 'hospital-1',
        department: '수술팀',
        category: '소모품',
        created_at: '2026-03-16T09:10:00.000Z',
      },
    ],
    attendance: [
      {
        id: 'attendance-overtime-1',
        staff_id: composeUser.id,
        date: '2026-03-16',
        check_in: '2026-03-16T09:00:00',
        check_out: '2026-03-16T20:30:00',
        status: '정상',
      },
    ],
    workSchedules: [
      {
        id: 'work-schedule-day',
        name: '주간근무',
        end_time: '18:00',
      },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '작성하기',
      erp_permission_prompt_shown: '1',
    },
  });

  await test.step('연차/휴가를 실제 입력 후 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-0').click();
    await selectApprover(page);
    await selectReference(page);
    await page.getByTestId('approval-title-input').fill('E2E 연차 신청');
    await page.getByTestId('approval-content-input').fill('연차 신청 사유를 작성합니다.');
    await page.getByTestId('approval-leave-type-select').selectOption({ index: 0 });
    await page.getByTestId('approval-leave-start-date').fill('2026-03-18');
    await page.getByTestId('approval-leave-end-date').fill('2026-03-19');

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, 'E2E 연차 신청');
    expect(row.type).toBe('연차/휴가');
    expect(row.meta_data.vType).toContain('연차');
    expect(row.meta_data.startDate).toBe('2026-03-18');
    expect(row.meta_data.endDate).toBe('2026-03-19');
    expect(row.meta_data.cc_users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: supportStaff.id, name: supportStaff.name }),
      ])
    );
  });

  await test.step('연차계획서를 일정 2건으로 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-1').click();
    await selectApprover(page);
    await page.getByTestId('annual-leave-plan-date-0').fill('2026-04-02');
    await page.getByTestId('annual-leave-plan-add-row').click();
    await page.getByTestId('annual-leave-plan-date-1').fill('2026-04-10');
    await expect(page.getByTestId('approval-title-input')).not.toHaveValue('');
    await page.getByTestId('approval-content-input').fill('미사용 연차 사용 계획을 공유합니다.');

    const title = await page.getByTestId('approval-title-input').inputValue();
    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, title);
    expect(row.type).toBe('연차계획서');
    expect(Array.isArray(row.meta_data.planDates)).toBeTruthy();
    expect(row.meta_data.planDates).toHaveLength(2);
  });

  await test.step('연장근무 기록을 선택해 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-2').click();
    await selectApprover(page);
    await expect(page.getByTestId('approval-overtime-record-0')).toBeVisible();
    await page.getByTestId('approval-overtime-record-0').click();
    await page.getByTestId('approval-content-input').fill('연장근무 수당 청구 사유입니다.');
    const title = await page.getByTestId('approval-title-input').inputValue();

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, title);
    expect(row.type).toBe('연장근무');
    expect(row.meta_data.date).toBe('2026-03-16');
    expect(row.meta_data.hours).toBe(2.5);
  });

  await test.step('물품신청을 품목 상세와 함께 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-3').click();
    await selectApprover(page);
    await page.getByTestId('approval-title-input').fill('E2E 물품 신청');
    await page.getByTestId('approval-content-input').fill('병동 비품 신청 사유입니다.');
    await page.getByTestId('supplies-item-name-0').fill('멸균 거즈');
    await expect(page.getByTestId('supplies-item-unit-0')).toHaveText('BOX');
    await page.getByTestId('supplies-item-qty-0').fill('3');
    await page.getByTestId('supplies-item-purpose-0').fill('병동 처치용');
    await page.getByTestId('supplies-item-dept-0').selectOption('병동팀');

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await expect(page.getByTestId('approval-supply-review-modal')).toBeVisible();
    await page.getByTestId('approval-supply-review-confirm').click();
    await insert;

    const row = await expectApproval(page, 'E2E 물품 신청');
    expect(row.type).toBe('물품신청');
    expect(row.meta_data.items[0].name).toBe('멸균 거즈');
    expect(Number(row.meta_data.items[0].qty)).toBe(3);
    expect(row.meta_data.items[0].unit).toBe('BOX');
  });

  await test.step('수리요청서를 장비 정보와 함께 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-4').click();
    await selectApprover(page);
    await expect(page.getByTestId('repair-request-view')).toBeVisible();
    await page.getByTestId('approval-title-input').fill('E2E 수리 요청');
    await page.getByTestId('approval-content-input').fill('수리요청서 본문 내용입니다.');
    await page.getByTestId('repair-request-equipment-name').fill('복합기');
    await page.getByTestId('repair-request-location').fill('1층 원무과');
    await page.getByTestId('repair-request-desired-date').fill('2026-03-22');
    await page.getByTestId('repair-request-urgency').selectOption('긴급');
    await page.getByTestId('repair-request-content').fill('출력이 되지 않아 업무 차질이 있습니다.');

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, 'E2E 수리 요청');
    expect(row.type).toBe('수리요청서');
    expect(row.meta_data.equipmentName).toBe('복합기');
    expect(row.meta_data.location).toBe('1층 원무과');
  });

  await test.step('업무기안을 실제 본문으로 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-5').click();
    await selectApprover(page);
    await page.getByTestId('approval-title-input').fill('E2E 업무기안');
    await page.getByTestId('approval-content-input').fill('업무기안 본문을 작성합니다.');

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, 'E2E 업무기안');
    expect(row.type).toBe('업무기안');
  });

  await test.step('업무협조를 실제 본문으로 상신한다', async () => {
    await openCompose(page);
    await page.getByTestId('approval-form-type-6').click();
    await selectApprover(page);
    await page.getByTestId('approval-title-input').fill('E2E 업무협조');
    await page.getByTestId('approval-content-input').fill('업무협조 요청 본문입니다.');

    const insert = waitForApprovalInsert(page);
    await page.getByTestId('approval-submit-button').click();
    await insert;

    const row = await expectApproval(page, 'E2E 업무협조');
    expect(row.type).toBe('업무협조');
  });

  expect(runtimeErrors).toEqual([]);
});

test('form request submits through the dedicated flow', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [composeUser, approver, supportStaff],
    approvals: [],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
  });

  await seedSession(page, {
    user: composeUser,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '작성하기',
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);
  await selectApprover(page);
  await selectReference(page);
  await page.getByTestId('approval-form-type-7').click();
  await expect(page.getByTestId('form-request-view')).toBeVisible();
  await page.getByTestId('form-request-type-1').click();
  await page.getByTestId('form-request-purpose').fill('대출 제출용 증명서 발급 신청');
  await page.getByTestId('form-request-urgency-1').click();

  const insert = waitForApprovalInsert(page);
  await page.getByTestId('form-request-submit').click();
  await insert;

  const approvals = await readApprovals(page);
  expect(approvals).toHaveLength(1);
  expect(approvals[0].meta_data.approver_line).toEqual([approver.id]);
  expect(approvals[0].meta_data.cc_users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: supportStaff.id, name: supportStaff.name }),
    ])
  );
  expect(approvals[0].type).toBe('양식신청');
  expect(approvals[0].meta_data.purpose).toBe('대출 제출용 증명서 발급 신청');
  expect(approvals[0].meta_data.urgency).toBe('긴급');
  expect(runtimeErrors).toEqual([]);
});

test('admin-configured default references auto-apply, notify recipients, and appear in the reference inbox', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [adminUser, composeUser, approver, supportStaff],
    approvals: [],
    notifications: [],
    companies: [
      { id: 'hospital-1', name: '테스트병원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    inventoryItems: [
      {
        id: 'inventory-item-default-ref-1',
        item_name: '멸균 거즈',
        quantity: 20,
        stock: 20,
        min_quantity: 5,
        company: 'SY INC.',
        company_id: 'mso-company-id',
        department: '경영지원팀',
        category: '소모품',
        created_at: '2026-03-16T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: '직원권한',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=관리자&open_subview=직원권한');
  await expect(page.getByTestId('staff-permission-view')).toBeVisible();
  await page.getByTestId(`staff-permission-row-${composeUser.id}`).click();
  await page.getByTestId('staff-approval-default-form-select').selectOption('purchase');
  await page.getByTestId('staff-approval-default-recipient-select').selectOption(supportStaff.id);
  await expect(page.getByTestId(`staff-approval-default-recipient-remove-${supportStaff.id}`)).toBeVisible();

  const staffs = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/staff_members?select=*');
    return response.json();
  });
  const updatedComposeUser = staffs.find((staff: any) => staff.id === composeUser.id);
  expect(updatedComposeUser?.permissions?.approval_reference_defaults?.purchase).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: supportStaff.id, name: supportStaff.name }),
    ])
  );

  await replaceSession(page, {
    user: {
      ...composeUser,
      permissions: updatedComposeUser.permissions,
    },
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '작성하기',
      erp_permission_prompt_shown: '1',
    },
  });

  await openCompose(page);
  await page.getByTestId('approval-form-type-3').click();
  await expect(page.getByText(`CC ${supportStaff.name}`)).toBeVisible();
  await selectApprover(page);
  await page.getByTestId('approval-title-input').fill('기본 참조자 물품신청');
  await page.getByTestId('approval-content-input').fill('기본 참조자 자동 세팅 검증');
  await page.getByTestId('supplies-item-name-0').fill('멸균 거즈');
  await expect(page.getByTestId('supplies-item-unit-0')).toHaveText('BOX');
  await page.getByTestId('supplies-item-qty-0').fill('2');
  await page.getByTestId('supplies-item-purpose-0').fill('병동 처치');
  await page.getByTestId('supplies-item-dept-0').selectOption('병동팀');

  const insert = waitForApprovalInsert(page);
  await page.getByTestId('approval-submit-button').click();
  await expect(page.getByTestId('approval-supply-review-modal')).toBeVisible();
  await page.getByTestId('approval-supply-review-confirm').click();
  await insert;

  const approvals = await readApprovals(page);
  const insertedApproval = approvals.find((item: any) => item.title === '기본 참조자 물품신청');
  expect(insertedApproval?.meta_data?.cc_users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: supportStaff.id, name: supportStaff.name }),
    ])
  );

  await expect
    .poll(async () => {
      const notifications = await readNotifications(page);
      return notifications.find(
        (item: any) =>
          item.user_id === supportStaff.id &&
          item.metadata?.approval_id === insertedApproval.id &&
          item.metadata?.approval_view === '참조 문서함'
      ) || null;
    })
    .toBeTruthy();

  await replaceSession(page, {
    user: {
      ...supportStaff,
      permissions: {
        ...fakeUser.permissions,
        approval_참조문서함: true,
      },
    },
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '참조 문서함',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=전자결재&open_subview=참조 문서함');
  await expect(page.getByTestId('approval-view')).toBeVisible();
  const referenceCard = page.getByTestId(`approval-card-${insertedApproval.id}`);
  await expect(referenceCard).toBeVisible();
  await expect(referenceCard.getByText('참조 1명')).toBeVisible();
  await page.getByTestId('approval-keyword-filter').fill('물품신청');
  await expect(referenceCard).toBeVisible();
  await page.getByTestId('approval-keyword-filter').fill('없는검색어');
  await expect(referenceCard).toBeHidden();
  await page.getByTestId('approval-keyword-filter').fill(insertedApproval.title);
  await expect(referenceCard).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
