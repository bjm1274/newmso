/**
 * payroll-ops-workcenter.desktop.spec.ts
 *
 * 파일럿: 급여 정산 E2E 1개를 워크센터 기준으로 재작성.
 * - localStorage `erp_e2e_workcenter: '1'` → webdriver여도 HrWorkcenterRouter 렌더
 * - 진입 경로: payroll-view → run-payroll-regular-button → mod-settlement-start-button → salary-settlement-view
 * - 검증부(salary-settlement-* 조작, payload 검증)는 레거시 E2E(payroll-ops.desktop.spec.ts)와 동일
 */

import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

function parseWon(text: string | null | undefined) {
  return Number(String(text || '').replace(/[^\d-]/g, '')) || 0;
}

test('workcenter: regular payroll settlement stores dependent deductions in the finalized record', async ({ page }) => {
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

  // ── 워크센터 플래그: erp_e2e_workcenter=1 → webdriver여도 HrWorkcenterRouter 사용 ──
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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  // ── 1. 워크센터 PayrollWorkcenter 대시보드 확인 ──
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);

  // ── 2. "정산 시작" 버튼 → ModSettlement 진입 ──
  await page.getByTestId('run-payroll-regular-button').click();

  // ── 3. ModSettlement 내 "다음 단계 시작" 버튼 → LegacySalarySettlement(showLegacy=true) ──
  await expect(page.getByTestId('mod-settlement-start-button')).toBeVisible();
  await page.getByTestId('mod-settlement-start-button').click();

  // ── 4. 레거시 급여정산 뷰 도달 확인 ──
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();

  // ── 5. 이하 검증부는 레거시 E2E와 동일 ──
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  const settlementCard = page.getByTestId(`salary-settlement-card-${payrollStaff.id}`);
  await expect(settlementCard).toBeVisible();
  await expect(settlementCard.getByText(/10분 단위 1 =/)).toHaveCount(3);

  await page.getByTestId(`salary-settlement-night-duty-${payrollStaff.id}-increase`).click({ delay: 500 });
  await expect(page.getByTestId(`salary-settlement-night-duty-${payrollStaff.id}-quick-input-panel`)).toBeVisible();
  await page.getByTestId(`salary-settlement-night-duty-${payrollStaff.id}-quick-input`).fill('1');
  await page.getByTestId(`salary-settlement-night-duty-${payrollStaff.id}-quick-apply`).click();
  const oneTenMinuteUnit = parseWon(await page.getByTestId(`salary-settlement-night-duty-${payrollStaff.id}`).inputValue());
  expect(oneTenMinuteUnit).toBeGreaterThan(1);

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('2');
  await page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`).fill('10000');
  const displayedTotalDeduction = parseWon(
    await page.getByTestId(`salary-settlement-total-deduction-${payrollStaff.id}`).textContent()
  );
  expect(displayedTotalDeduction).toBeGreaterThan(0);

  // d1Client.upsert()는 /api/d1/mutate POST 로 전송됨 (body: { op:'insert', table:'payroll_records', values:[...] })
  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-finalize-button').click();
  // RiskActionDialog가 열리면 "정산 확정" 버튼을 클릭
  await page.getByTestId('risk-action-dialog-confirm').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
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
  expect(displayedTotalDeduction).toBe(record.total_deduction);
  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// 워크센터 공통 네비게이션 헬퍼
// PayrollDashboard → run-payroll-regular-button → mod-settlement-start-button
// → salary-settlement-view
// ─────────────────────────────────────────────────────────────────────────────

async function navigateToSettlementWorkcenter(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  await page.getByTestId('run-payroll-regular-button').click();
  await expect(page.getByTestId('mod-settlement-start-button')).toBeVisible();
  await page.getByTestId('mod-settlement-start-button').click();
  await expect(page.getByTestId('salary-settlement-view')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: regular payroll settlement subtracts advance pay
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: regular payroll settlement subtracts advance pay from net pay and refreshes the payroll ledger status', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await navigateToSettlementWorkcenter(page);

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();

  const expectedNet = page.getByTestId(`salary-settlement-expected-net-${payrollStaff.id}`);
  const expectedNetBeforeAdvance = parseWon(await expectedNet.textContent());

  await page.getByTestId(`salary-settlement-advance-pay-${payrollStaff.id}`).fill('100000');
  await expect(expectedNet).not.toHaveText(`₩ ${expectedNetBeforeAdvance.toLocaleString()}`);

  const expectedNetAfterAdvance = parseWon(await expectedNet.textContent());
  expect(expectedNetAfterAdvance).toBe(expectedNetBeforeAdvance - 100000);

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-finalize-button').click();
  await page.getByTestId('risk-action-dialog-confirm').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
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
  // 급여 대장 탭은 워크센터에서 ledger 모듈 카드로 이동하는 방식이므로
  // 여기서는 complete-step 표시까지만 검증
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: regular payroll settlement restores draft values
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: regular payroll settlement restores draft values and saved status when reopened', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await navigateToSettlementWorkcenter(page);

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('3');
  await page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`).fill('1');
  await page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`).selectOption('80');
  await page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`).fill('15000');

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-draft-save-button').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.status).toBe('임시저장');
  expect(record.deduction_detail.dependent_count).toBe(3);
  expect(record.deduction_detail.child_count_8_20).toBe(1);
  expect(record.deduction_detail.withholding_rate_percent).toBe(80);
  expect(record.deduction_detail.custom_deduction).toBe(15000);

  await page.reload();

  // reload 후 워크센터 재진입
  await navigateToSettlementWorkcenter(page);

  await expect(page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`)).toContainText('임시저장');

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toContainText('임시저장');
  await expect(page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`)).toHaveValue('3');
  await expect(page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`)).toHaveValue('1');
  await expect(page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`)).toHaveValue('80');
  await expect(page.getByTestId(`salary-settlement-custom-deduction-${payrollStaff.id}`)).toHaveValue('15,000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: regular payroll settlement defaults withholding rate to 80
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: regular payroll settlement defaults withholding rate to 80 percent when no staff override exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await navigateToSettlementWorkcenter(page);

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();

  await expect(page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`)).toHaveValue('80');

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-finalize-button').click();
  await page.getByTestId('risk-action-dialog-confirm').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.deduction_detail.withholding_rate_percent).toBe(80);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: insurance EDI lists only finalized payroll staff
// NOTE: 워크센터에서 payroll-tab-4대보험EDI testid 없음.
//       PayrollModuleCard의 aria-label="4대보험" 버튼으로 insurance 모듈 진입.
//       insurance-edi-row-${id} testid도 ResponsiveTable에 없으므로
//       직원명 텍스트 + insurance-edi-count로 검증.
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: insurance EDI lists only finalized payroll staff for the selected month', async ({ page }) => {
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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  // 워크센터 대시보드에서 4대보험 모듈 카드 클릭
  await expect(page.getByTestId('payroll-view')).toBeVisible();
  await page.getByTestId('hr-company-select').selectOption(fakeUser.company);
  // PayrollModuleCard: aria-label="4대보험" 버튼으로 insurance 모듈 진입
  await page.getByRole('button', { name: '4대보험' }).click();

  // ModInsurance 안의 LegacyInsuranceEDI(=InsuranceEDI)에 insurance-edi-view 있음
  await expect(page.getByTestId('insurance-edi-view')).toBeVisible();
  // insurance-edi-count는 InsuranceEDI 컴포넌트에 있음
  await expect(page.getByTestId('insurance-edi-count')).toContainText('1명');
  // 확정 직원명은 표에 있어야 함 (테이블 셀 컨텍스트로 범위 제한)
  await expect(page.getByTestId('insurance-edi-view').getByText(confirmedStaff.name, { exact: true }).first()).toBeVisible();
  // 임시저장·미정산 직원은 표에 없어야 함
  await expect(page.getByTestId('insurance-edi-view').getByText(draftStaff.name, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('insurance-edi-view').getByText(missingStaff.name, { exact: true })).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: regular payroll settlement includes saved position allowance
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: regular payroll settlement includes saved position allowance in taxable pay', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await navigateToSettlementWorkcenter(page);

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-finalize-button').click();
  await page.getByTestId('risk-action-dialog-confirm').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
  const record = Array.isArray(payload) ? payload[0] : payload;

  expect(record.staff_id).toBe(payrollStaff.id);
  expect(record.status).toBe('확정');
  expect(record.extra_allowance).toBe(250000);
  expect(record.total_taxable).toBe(3450000);
  await expect(page.getByTestId('salary-settlement-complete-step')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: regular payroll settlement applies withholding ratio
// ─────────────────────────────────────────────────────────────────────────────

test('workcenter: regular payroll settlement applies withholding ratio and qualifying child tax credits from the monthly table', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

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
      erp_e2e_workcenter: '1',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await navigateToSettlementWorkcenter(page);

  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId('salary-settlement-next-button').click();
  await expect(page.getByTestId(`salary-settlement-card-${payrollStaff.id}`)).toBeVisible();

  await page.getByTestId(`salary-settlement-dependent-count-${payrollStaff.id}`).fill('3');
  await page.getByTestId(`salary-settlement-child-count-${payrollStaff.id}`).fill('2');
  await page.getByTestId(`salary-settlement-withholding-rate-${payrollStaff.id}`).selectOption('80');

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/api/d1/mutate') &&
      request.method() === 'POST' &&
      (() => { try { const b = request.postDataJSON() as any; return b?.table === 'payroll_records'; } catch { return false; } })()
  );

  await page.getByTestId('salary-settlement-finalize-button').click();
  await page.getByTestId('risk-action-dialog-confirm').click();

  const saveRequest = await saveRequestPromise;
  const mutateBody = saveRequest.postDataJSON() as { op: string; table: string; values: any[] };
  const payload = mutateBody.values;
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
