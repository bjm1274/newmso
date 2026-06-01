/**
 * payroll-interim.desktop.spec.ts
 *
 * 중간정산 E2E — 워크센터 기준.
 * 진입 경로: 인사관리 워크센터 → payroll-view → 퇴직 정산 모듈 카드
 *           → ModRetirement → '중간정산 등록' 버튼 → interim-settlement-view
 */

import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

function parseWon(text: string | null | undefined) {
  return Number(String(text || '').replace(/[^\d-]/g, '')) || 0;
}

test('interim settlement prorates vehicle and fixed allowances and stores deductions', async ({ page }) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const interimStaff = {
    id: 'payroll-interim-vehicle-1',
    employee_no: 'PAY-INT-001',
    name: '중간정산 테스트',
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: '주임',
    status: '재직',
    joined_at: '2024-01-10',
    hire_date: '2024-01-10',
    resigned_at: '2026-01-10',
    resign_date: '2026-01-10',
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
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
      erp_hr_workspace: '근태 및 급여',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('인사관리')}`);

  await expect(page.getByTestId('payroll-view')).toBeVisible();

  // 워크센터 네비게이션: 퇴직 정산 모듈 카드 클릭 → ModRetirement
  await page.getByRole('button', { name: /퇴직 정산/ }).click();

  // ModRetirement 내 '중간정산 등록' 버튼 클릭
  await page.getByRole('button', { name: '중간정산 등록' }).click();

  await expect(page.getByTestId('interim-settlement-view')).toBeVisible();

  await page.getByTestId('interim-settlement-date-input').fill('2026-01-10');
  await page.getByTestId('interim-settlement-staff-select').selectOption(interimStaff.id);
  await expect(page.getByText(/10분 단위 1 =/)).toHaveCount(5);
  await page.getByTestId('interim-adjustment-night-duty-increase').click({ delay: 500 });
  await expect(page.getByTestId('interim-adjustment-night-duty-quick-input-panel')).toBeVisible();
  await page.getByTestId('interim-adjustment-night-duty-quick-input').fill('1');
  await page.getByTestId('interim-adjustment-night-duty-quick-apply').click();
  expect(parseWon(await page.getByTestId('interim-adjustment-night-duty').inputValue())).toBeGreaterThan(1);
  await page.getByRole('button', { name: '초기화' }).click();
  await expect(page.getByTestId('interim-adjustment-night-duty')).toHaveValue('0');

  // POST 요청 캡처 (supabase REST 또는 /api/d1/mutate 양쪽 모두 커버)
  const saveRequestPromise = page.waitForRequest(
    (request) =>
      (request.url().includes('/payroll_records') || request.url().includes('/api/d1/mutate')) &&
      (request.method() === 'POST' || request.method() === 'PATCH')
  );

  await page.getByTestId('interim-settlement-save-button').click();

  // useActionDialog 확인 다이얼로그 → "확정 저장" 버튼 클릭
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '확정 저장' }).click();

  const saveRequest = await saveRequestPromise;
  const rawPayload = saveRequest.postDataJSON() as any;
  // supabase REST: body는 배열 또는 단일 객체
  // /api/d1/mutate: body는 { table, op, values } 형태
  let record: any;
  if (rawPayload?.table === 'payroll_records') {
    const values = Array.isArray(rawPayload.values) ? rawPayload.values : [rawPayload.values];
    record = values[0];
  } else {
    const payloads = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
    record = payloads[0];
  }

  expect(record.staff_id).toBe(interimStaff.id);
  expect(record.base_salary).toBe(1000000);
  expect(record.meal_allowance).toBe(100000);
  expect(record.vehicle_allowance).toBe(100000);
  expect(record.extra_allowance).toBe(20000);
  expect(record.severance_pay).toBeGreaterThan(0);
  expect(record.total_taxable).toBeGreaterThan(0);
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
