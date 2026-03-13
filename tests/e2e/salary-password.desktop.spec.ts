import { expect, test } from '@playwright/test';
import { mockSupabase, seedSession } from './helpers';

test('salary slip verification submits the password exactly as entered', async ({ page }) => {
  await mockSupabase(page);
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
  expect(submittedPassword).toBe(' 1234 ');
});
