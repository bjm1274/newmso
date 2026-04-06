import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

function parseWon(text: string | null | undefined) {
  return Number(String(text || '').replace(/[^\d-]/g, '')) || 0;
}

test('regular payroll settlement stores dependent deductions in the finalized record', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-dependent-1',
    employee_no: 'PAY-DEP-001',
    name: '부양가족직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3200000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };
  const shiftAssignments = Array.from({ length: 20 }, (_, index) => ({
    id: `shift-assignment-${index + 1}`,
    staff_id: payrollStaff.id,
    work_date: `${yearMonth}-${String(index + 1).padStart(2, '0')}`,
    shift_id: 'work-shift-day',
  }));
  const workShifts = [
    {
      id: 'work-shift-day',
      name: '주간',
    },
  ];

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    shiftAssignments,
    workShifts,
    attendances: [
      {
        id: 'attendance-1',
        staff_id: payrollStaff.id,
        work_date: `${yearMonth}-03`,
        status: 'absent',
      },
    ],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('2');
  await page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`).fill('10000');

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-finalize-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[];
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.staff_id).toBe(payrollStaff.id);
  expect(record.status).toBe('확정');
  expect(record.attendance_deduction).toBeGreaterThan(0);
  expect(record.deduction_detail.dependent_count).toBe(2);
  expect(record.deduction_detail.dependent_tax_credit).toBe(31170);
  expect(record.deduction_detail.custom_deduction).toBe(10000);
  expect(record.total_deduction).toBe(
    Number(record.deduction_detail.national_pension || 0) +
      Number(record.deduction_detail.health_insurance || 0) +
      Number(record.deduction_detail.long_term_care || 0) +
      Number(record.deduction_detail.employment_insurance || 0) +
      Number(record.deduction_detail.income_tax || 0) +
      Number(record.deduction_detail.local_tax || 0) +
      Number(record.deduction_detail.custom_deduction || 0)
  );
  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
});

test('regular payroll settlement subtracts advance pay from net pay and refreshes the payroll ledger status', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-advance-1',
    employee_no: 'PAY-ADV-001',
    name: '선지급차감직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3200000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();

  const expectedNet = page.getByTestId(`salary-settlement-expected-net-${payrollStaff.id}`);
  const expectedNetBeforeAdvance = parseWon(await expectedNet.textContent());

  await page.getByTestId(`salary-settlement-advance-pay-${payrollStaff.id}`).fill('100000');
  await expect(expectedNet).not.toHaveText(`₩ ${expectedNetBeforeAdvance.toLocaleString()}`);

  const expectedNetAfterAdvance = parseWon(await expectedNet.textContent());
  expect(expectedNetAfterAdvance).toBe(expectedNetBeforeAdvance - 100000);

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-finalize-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.status).toBe('확정');
  expect(record.advance_pay).toBe(100000);
  expect(record.net_pay).toBe(
    Number(record.total_taxable || 0) +
      Number(record.total_taxfree || 0) -
      Number(record.total_deduction || 0) -
      100000
  );

  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
  await page.getByTestId('payroll-tab-급여대장').click();

  const payrollRow = page.locator('tr').filter({
    has: page.getByText(payrollStaff.name, { exact: true }),
  });
  await expect(payrollRow).toContainText('확정');
});

test('regular payroll settlement restores draft values and saved status when reopened', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-draft-1',
    employee_no: 'PAY-DR-001',
    name: '임시저장 직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3300000,
    position_allowance: 150000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('3');
  await page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`).fill('1');
  await page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`).selectOption('80');
  await page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`).fill('15000');

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-draft-save-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.status).toBe('임시저장');
  expect(record.deduction_detail.dependent_count).toBe(3);
  expect(record.deduction_detail.child_count_8_20).toBe(1);
  expect(record.deduction_detail.withholding_rate_percent).toBe(80);
  expect(record.deduction_detail.custom_deduction).toBe(15000);

  await page.reload();

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`)).toContainText('임시저장');

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toContainText('임시저장');
  await expect(page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`)).toHaveValue('3');
  await expect(page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`)).toHaveValue('1');
  await expect(page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`)).toHaveValue('80');
  await expect(page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`)).toHaveValue('15,000');
});

test('regular payroll settlement defaults withholding rate to 80 percent when no staff override exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-default-withholding-1',
    employee_no: 'PAY-WH-001',
    name: '기본원천징수직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3100000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();

  await expect(page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`)).toHaveValue('80');

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-finalize-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.deduction_detail.withholding_rate_percent).toBe(80);
});

test('insurance EDI lists only finalized payroll staff for the selected month', async ({ page }) => {
  const yearMonth = new Date().toISOString().slice(0, 7);

  const confirmedStaff = {
    ...fakeUser,
    id: 'edi-confirmed-1',
    employee_no: 'EDI-001',
    name: '확정직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    base_salary: 3200000,
  };

  const draftStaff = {
    ...fakeUser,
    id: 'edi-draft-1',
    employee_no: 'EDI-002',
    name: '임시직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3100000,
  };

  const missingStaff = {
    ...fakeUser,
    id: 'edi-missing-1',
    employee_no: 'EDI-003',
    name: '미정산직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3000000,
  };

  await mockSupabase(page, {
    staffMembers: [confirmedStaff, draftStaff, missingStaff],
    payrollRecords: [
      {
        id: 'payroll-confirmed-edi',
        staff_id: confirmedStaff.id,
        year_month: yearMonth,
        status: '확정',
        gross_pay: 3450000,
        base_salary: confirmedStaff.base_salary,
      },
      {
        id: 'payroll-draft-edi',
        staff_id: draftStaff.id,
        year_month: yearMonth,
        status: '임시저장',
        gross_pay: 3300000,
        base_salary: draftStaff.base_salary,
      },
      {
        id: 'payroll-other-month-edi',
        staff_id: missingStaff.id,
        year_month: '2026-01',
        status: '확정',
        gross_pay: 3100000,
        base_salary: missingStaff.base_salary,
      },
    ],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: confirmedStaff.company,
      department: confirmedStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 · 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-4대보험EDI').click();

  await expect(page.getByTestId('insurance-edi-view')).toBeVisible();
  await expect(page.getByTestId(`insurance-edi-row-${confirmedStaff.id}`)).toBeVisible();
  await expect(page.getByTestId(`insurance-edi-row-${confirmedStaff.id}`)).toContainText('3,450,000');
  await expect(page.getByTestId(`insurance-edi-row-${draftStaff.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`insurance-edi-row-${missingStaff.id}`)).toHaveCount(0);
  await expect(page.getByTestId('insurance-edi-count')).toContainText('1명');
});

test('regular payroll settlement includes saved position allowance in taxable pay', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-position-1',
    employee_no: 'PAY-POS-001',
    name: '직책수당직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '팀장',
    base_salary: 3200000,
    position_allowance: 250000,
    meal_allowance: 0,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-finalize-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.staff_id).toBe(payrollStaff.id);
  expect(record.status).toBe('확정');
  expect(record.extra_allowance).toBe(250000);
  expect(record.total_taxable).toBe(3450000);
  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
});

test('regular payroll settlement applies withholding ratio and qualifying child tax credits from the monthly table', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-dependent-2',
    employee_no: 'PAY-DEP-002',
    name: '원천징수테스트',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3500000,
    meal_allowance: 0,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('3');
  await page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`).fill('2');
  await page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`).selectOption('80');

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('salary-settlement-finalize-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.status).toBe('확정');
  expect(record.deduction_detail.dependent_count).toBe(3);
  expect(record.deduction_detail.child_count_8_20).toBe(2);
  expect(record.deduction_detail.withholding_rate_percent).toBe(80);
  expect(record.deduction_detail.child_tax_credit).toBe(29160);
  expect(record.deduction_detail.income_tax_before_withholding_ratio).toBe(141950);
  expect(record.deduction_detail.income_tax).toBe(113560);
  expect(record.deduction_detail.local_tax).toBe(11350);
  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
});

test('payroll detail shows taxable allowance rows from the saved breakdown', async ({ page }) => {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const [year, month] = yearMonth.split('-');
  const payrollStaff = {
    id: 'payroll-slip-1',
    employee_no: 'PAY-SLIP-001',
    name: '명세서 과세수당',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    base_salary: 3000000,
    position_allowance: 120000,
    overtime_allowance: 80000,
    night_work_allowance: 60000,
    holiday_work_allowance: 0,
    annual_leave_pay: 140000,
    meal_allowance: 0,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [
      {
        id: 'payroll-slip-record-1',
        staff_id: payrollStaff.id,
        year_month: yearMonth,
        status: '확정',
        base_salary: 3000000,
        extra_allowance: 400000,
        meal_allowance: 0,
        night_duty_allowance: 0,
        vehicle_allowance: 0,
        childcare_allowance: 0,
        research_allowance: 0,
        other_taxfree: 0,
        overtime_pay: 0,
        bonus: 0,
        total_taxable: 3400000,
        total_taxfree: 0,
        total_deduction: 0,
        net_pay: 3400000,
        deduction_detail: {
          national_pension: 0,
          health_insurance: 0,
          long_term_care: 0,
          employment_insurance: 0,
          income_tax: 0,
          local_tax: 0,
          taxable_allowance_breakdown: {
            position_allowance: 120000,
            overtime_allowance: 80000,
            night_work_allowance: 60000,
            holiday_work_allowance: 0,
            annual_leave_pay: 140000,
            manual_extra_allowance: 0,
          },
        },
      },
    ],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여대장').click();

  await expect(page.getByText('직책수당', { exact: true })).toBeVisible();
  await expect(page.getByText('연장수당', { exact: true })).toBeVisible();
  await expect(page.getByText('야간근로수당', { exact: true })).toBeVisible();
  await expect(page.getByText('연차휴가수당', { exact: true })).toBeVisible();
  await expect(page.getByText(`${year}년 ${Number(month)}월 급여명세서`, { exact: true })).toBeVisible();
  await expect(page.getByText('귀하의 노고에 감사드립니다.', { exact: true })).toBeVisible();
  await expect(page.getByText('총 정산금액', { exact: true })).toBeVisible();
  await expect(page.getByText('Premium Payroll')).toHaveCount(0);
  await expect(page.getByText('Payment Summary')).toHaveCount(0);
  await expect(page.getByText('Verified By')).toHaveCount(0);
});

test('payroll ledger shows a pending placeholder instead of a finalized slip when no payroll record exists', async ({
  page,
}) => {
  const payrollStaff = {
    id: 'payroll-pending-1',
    employee_no: 'PAY-PENDING-001',
    name: '정산대기직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 2900000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여대장').click();

  const pendingRow = page.locator('tr').filter({
    has: page.getByText(payrollStaff.name, { exact: true }),
  });
  await expect(pendingRow.getByText('정산중', { exact: true })).toBeVisible();
  await expect(page.getByTestId('payroll-ledger-pending-placeholder')).toContainText(
    `${payrollStaff.name}님의`,
  );
  await expect(page.getByTestId('payroll-ledger-pending-placeholder')).toContainText(
    '급여는 아직 정산중입니다',
  );
  await expect(page.getByTestId('salary-detail-card')).toHaveCount(0);
});

test('payroll ledger still shows finalized records when payroll_records misses optional columns', async ({
  page,
}) => {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const payrollStaff = {
    id: 'payroll-missing-columns-1',
    employee_no: 'PAY-MISSING-001',
    name: '옵션컬럼직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    base_salary: 3000000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [
      {
        id: 'payroll-missing-columns-record-1',
        staff_id: payrollStaff.id,
        year_month: yearMonth,
        status: '확정',
        base_salary: 3000000,
        meal_allowance: 200000,
        extra_allowance: 0,
        overtime_pay: 0,
        bonus: 0,
        total_taxable: 3000000,
        total_taxfree: 200000,
        total_deduction: 120000,
        net_pay: 3080000,
        deduction_detail: {
          national_pension: 0,
          health_insurance: 0,
          long_term_care: 0,
          employment_insurance: 0,
          income_tax: 0,
          local_tax: 0,
        },
      },
    ],
    missingPayrollRecordColumns: ['advance_pay'],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 · 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여대장').click();

  const payrollRow = page.locator('tr').filter({
    has: page.getByText(payrollStaff.name, { exact: true }),
  });
  await expect(payrollRow).toContainText('확정');
  await expect(page.getByTestId('payroll-ledger-pending-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('salary-detail-card')).toBeVisible();
});

test('payroll ledger shows a finalized slip for legacy confirmed records without record_type', async ({
  page,
}) => {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const [year, month] = yearMonth.split('-');
  const payrollStaff = {
    id: 'payroll-legacy-1',
    employee_no: 'PAY-LEGACY-001',
    name: '기존확정직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    base_salary: 3100000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [
      {
        id: 'payroll-legacy-record-1',
        staff_id: payrollStaff.id,
        year_month: yearMonth,
        record_type: null,
        status: '확정',
        base_salary: 3100000,
        meal_allowance: 200000,
        night_duty_allowance: 0,
        vehicle_allowance: 0,
        childcare_allowance: 0,
        research_allowance: 0,
        other_taxfree: 0,
        extra_allowance: 0,
        overtime_pay: 0,
        bonus: 0,
        total_taxable: 3100000,
        total_taxfree: 200000,
        total_deduction: 120000,
        net_pay: 3180000,
        deduction_detail: {
          national_pension: 0,
          health_insurance: 0,
          long_term_care: 0,
          employment_insurance: 0,
          income_tax: 0,
          local_tax: 0,
        },
      },
    ],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여대장').click();

  const payrollRow = page.locator('tr').filter({
    has: page.getByText(payrollStaff.name, { exact: true }),
  });
  await expect(payrollRow).toContainText('확정');
  await expect(page.getByTestId('payroll-ledger-pending-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('salary-detail-card')).toBeVisible();
  await expect(page.getByText(`${year}년 ${Number(month)}월 급여명세서`, { exact: true })).toBeVisible();
});

test('payroll settlement wizard shows the payroll lock card and opens the lock panel', async ({
  page,
}) => {
  const payrollStaff = {
    id: 'payroll-lock-1',
    employee_no: 'PAY-LOCK-001',
    name: '잠금테스트직원',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '사원',
    base_salary: 3000000,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    payrollRecords: [],
    payrollLocks: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-급여정산').click();

  await expect(page.getByTestId('run-payroll-lock-button')).toBeVisible();
  await page.getByTestId('run-payroll-lock-button').click();

  await expect(page.getByText('급여 월 마감 잠금', { exact: true })).toBeVisible();
  await expect(page.getByText('마감 잠금', { exact: true })).toBeVisible();
});

test.skip('interim settlement prorates vehicle and fixed allowances and stores deductions', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const interimStaff = {
    id: 'payroll-interim-1',
    employee_no: 'PAY-INT-001',
    name: '中간정산테스트',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    status: '퇴사',
    resigned_at: '2026-01-10',
    base_salary: 3100000,
    meal_allowance: 310000,
    vehicle_allowance: 310000,
    position_allowance: 62000,
    night_duty_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [interimStaff],
    payrollRecords: [],
    attendances: [],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: interimStaff.company,
      department: interimStaff.department,
    },
    localStorage: {
      erp_last_menu: '?紐꾧텢?온??',
      erp_last_subview: '疫뀀맩肉?',
      erp_hr_tab: '疫뀀맩肉?',
      erp_hr_workspace: '域뱀눛源?獄?疫뀀맩肉?',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '?紐꾧텢?온??' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('hr-status-select').selectOption('?댁궗');
  await page.getByTestId('payroll-tab-湲됱뿬?뺤궛').click();
  await expect(page.getByTestId('run-payroll-wizard')).toBeVisible();
  await page.getByTestId('run-payroll-interim-button').click();
  await expect(page.getByTestId('interim-settlement-view')).toBeVisible();

  await page.getByTestId('interim-settlement-date-input').fill('2026-01-10');
  await page.getByTestId('interim-settlement-staff-select').selectOption(interimStaff.id);

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/payroll_records') && request.method() === 'POST'
  );

  await page.getByTestId('interim-settlement-save-button').click();

  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as any[] | any;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.staff_id).toBe(interimStaff.id);
  expect(record.base_salary).toBe(1000000);
  expect(record.meal_allowance).toBe(100000);
  expect(record.vehicle_allowance).toBe(100000);
  expect(record.extra_allowance).toBe(20000);
  expect(record.total_taxable).toBe(1020000);
  expect(record.total_taxfree).toBe(200000);
  expect(record.total_deduction).toBeGreaterThan(0);
  expect(record.total_deduction).toBe(
    Number(record.deduction_detail.national_pension || 0) +
      Number(record.deduction_detail.health_insurance || 0) +
      Number(record.deduction_detail.long_term_care || 0) +
      Number(record.deduction_detail.employment_insurance || 0) +
      Number(record.deduction_detail.income_tax || 0) +
      Number(record.deduction_detail.local_tax || 0)
  );
  expect(record.net_pay).toBe(record.total_taxable + record.total_taxfree - record.total_deduction);
});

test('payroll sender falls back to in-app notifications when the email queue is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const yearMonth = new Date().toISOString().slice(0, 7);
  const staffOne = {
    ...fakeUser,
    id: 'payroll-send-1',
    employee_no: 'PAY-SEND-001',
    name: '명세서직원1',
    email: 'payroll1@example.com',
  };
  const staffTwo = {
    ...fakeUser,
    id: 'payroll-send-2',
    employee_no: 'PAY-SEND-002',
    name: '명세서직원2',
    email: '',
  };

  await mockSupabase(page, {
    staffMembers: [staffOne, staffTwo],
    payrollRecords: [
      {
        id: 'payroll-send-row-1',
        staff_id: staffOne.id,
        year_month: yearMonth,
        record_type: 'regular',
        status: '확정',
        net_pay: 2900000,
        gross_pay: 3300000,
      },
      {
        id: 'payroll-send-row-2',
        staff_id: staffTwo.id,
        year_month: yearMonth,
        record_type: 'regular',
        status: '확정',
        net_pay: 2800000,
        gross_pay: 3200000,
      },
      {
        id: 'payroll-send-row-interim',
        staff_id: staffOne.id,
        year_month: yearMonth,
        record_type: 'interim',
        status: '확정',
        net_pay: 1000000,
        gross_pay: 1000000,
      },
    ],
  });

  await page.route('**/rest/v1/email_queue*', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PGRST205',
        message: "Could not find the table 'public.email_queue' in the schema cache",
      }),
    });
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: fakeUser.company,
      department: fakeUser.department,
    },
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리' }).toString()}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('payroll-tab-연말퇴직정산').click();
  await expect(page.getByTestId('payroll-email-send-all-button')).toBeVisible();
  await expect(page.getByTestId('payroll-email-eligible-count')).toHaveText('2명');

  await page.getByTestId('payroll-email-send-all-button').click();

  await expect(page.getByTestId('payroll-email-send-summary')).toContainText('사내 알림 2건');
  await expect(page.getByTestId('payroll-email-send-summary')).toContainText('이메일 큐 미설정');
});
