import { expect, test } from '@playwright/test';
import { fakeUser, mockSupabase, seedSession } from './helpers';

test('salary slip verification submits the password exactly as entered', async ({ page }) => {
  const current = new Date();
  const currentYearMonth = current.toISOString().slice(0, 7);
  const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);

  await mockSupabase(page, {
    payrollRecords: [
      {
        id: 'salary-slip-issued-1',
        staff_id: fakeUser.id,
        year_month: currentYearMonth,
        record_type: 'regular',
        status: '확정',
        base_salary: 2800000,
        total_taxable: 2800000,
        total_taxfree: 200000,
        total_deduction: 250000,
        net_pay: 2750000,
      },
      {
        id: 'salary-slip-draft-1',
        staff_id: fakeUser.id,
        year_month: previous,
        record_type: 'regular',
        status: '임시저장',
        base_salary: 2700000,
        total_taxable: 2700000,
        total_taxfree: 200000,
        total_deduction: 240000,
        net_pay: 2660000,
      },
    ],
    notifications: [
      {
        id: 'salary-slip-notification-1',
        user_id: fakeUser.id,
        type: '급여명세',
        title: `${current.getFullYear()}년 ${current.getMonth() + 1}월 급여명세서 발송`,
        body: `${currentYearMonth} 급여명세서가 발송되었습니다.`,
        created_at: `${currentYearMonth}-25T09:00:00.000Z`,
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uB0B4\uC815\uBCF4',
      erp_mypage_tab: 'records',
      erp_mypage_records_view: 'salary',
      erp_permission_prompt_shown: '1',
    },
  });

  let submittedPassword = '';

  await page.route('**/api/auth/verify-password', async (route) => {
    const body = route.request().postDataJSON() as { password?: string } | null;
    submittedPassword = String(body?.password ?? '');

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ verified: submittedPassword === ' 1234 ' }),
    });
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uB0B4\uC815\uBCF4')}`);

  await page.getByRole('button', { name: '\uAE09\uC5EC\u00B7\uC99D\uBA85\uC11C' }).click();
  await page.getByRole('button', { name: '\uC6D4\uBCC4 \uC815\uC0B0 \uCE74\uB4DC' }).click();

  await expect(page.getByTestId('mypage-salary-tab')).toBeVisible();
  await expect(page.getByTestId('salary-password-input')).toBeVisible();

  await page.getByTestId('salary-password-input').fill(' 1234 ');
  await page.getByTestId('salary-password-submit').click();

  await expect(page.getByRole('button', { name: /A4/ })).toBeVisible();
  await expect(page.getByTestId('mypage-salary-month-select')).toBeVisible();
  await expect(page.locator('[data-testid="mypage-salary-month-select"] option')).toHaveCount(1);
  await expect(page.getByTestId('mypage-salary-month-select')).toHaveValue(currentYearMonth);
  expect(submittedPassword).toBe(' 1234 ');
});
