import { expect, test } from '@playwright/test';
import { dismissDialogs, seedSession } from './helpers';
import { SUPABASE_ACCESS_TOKEN_STORAGE_KEY } from '../../lib/supabase-bridge';
import { SESSION_COOKIE_NAME } from '../../lib/server-session';

const readOnlyAdminUser = {
  id: null,
  employee_no: 'E2E-REAL',
  name: 'Real DB Smoke',
  company: 'SY INC.',
  company_id: null,
  department: '경영지원팀',
  position: '관리자',
  role: 'admin',
  permissions: {
    hr: true,
    inventory: true,
    approval: true,
    admin: true,
    mso: true,
  },
};

test.describe('@real-db', () => {
  test.beforeEach(async ({ page }) => {
    await dismissDialogs(page);
  });

  test('invalid login stays read-only while exercising the live backend', async ({ page }) => {
    const authResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/master-login') &&
        response.request().method() === 'POST'
    );

    await page.goto('/login');
    await page.getByTestId('login-id-input').fill(`e2e-real-${Date.now()}`);
    await page.getByTestId('login-password-input').fill('definitely-invalid-password');
    await page.getByTestId('login-submit-button').click();

    const authResponse = await authResponsePromise;
    const authPayload = await authResponse.json();
    const cookies = await page.context().cookies('http://127.0.0.1:3000');

    expect(authResponse.ok()).toBeTruthy();
    expect(authPayload.success).toBeFalsy();
    await expect(page).toHaveURL(/\/login$/);
    expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBeFalsy();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('erp_user')))
      .toBeNull();
    await expect
      .poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SUPABASE_ACCESS_TOKEN_STORAGE_KEY))
      .toBeNull();
  });

  test('main shell can load against the configured Supabase project without write traffic', async ({ page }) => {
    const writeRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/rest/v1/') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      ) {
        writeRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await seedSession(page, {
      user: readOnlyAdminUser,
    });

    const staffResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/staff_members') &&
        response.request().method() === 'GET'
    );
    const companiesResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/companies') &&
        response.request().method() === 'GET'
    );

    await page.goto('/main');

    await expect(page.getByTestId('main-shell')).toBeVisible();

    const [staffResponse, companiesResponse] = await Promise.all([
      staffResponsePromise,
      companiesResponsePromise,
    ]);

    expect(staffResponse.status()).toBeLessThan(500);
    expect(companiesResponse.status()).toBeLessThan(500);

    await page.waitForTimeout(1500);

    expect(writeRequests).toEqual([]);
  });
});
