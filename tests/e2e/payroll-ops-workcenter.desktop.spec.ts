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
