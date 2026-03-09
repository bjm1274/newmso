import { expect, test } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { dismissDialogs, seedSession } from './helpers';
import { SUPABASE_ACCESS_TOKEN_STORAGE_KEY } from '../../lib/supabase-bridge';
import { SESSION_COOKIE_NAME } from '../../lib/server-session';

loadEnvConfig(process.cwd());

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

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

  test('live notification insert appears in the browser without a refresh', async ({ page }) => {
    test.skip(!adminClient, 'Supabase service role 환경변수가 필요합니다.');

    const employeeNo = `E2E${Date.now().toString().slice(-8)}`;
    const { data: company } = await adminClient!
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .single();

    test.skip(!company, '활성 회사 데이터가 필요합니다.');
    if (!company) return;

    const { data: insertedStaff, error: staffInsertError } = await adminClient!
      .from('staff_members')
      .insert({
        employee_no: employeeNo,
        name: 'E2E 라이브 알림',
        company: company.name,
        company_id: company.id,
        department: 'E2E',
        position: '사원',
        role: 'staff',
        status: '재직',
      })
      .select('id, employee_no, name, company, company_id, department, position, role')
      .single();

    expect(staffInsertError).toBeNull();
    expect(insertedStaff?.id).toBeTruthy();

    const liveUser = {
      ...insertedStaff,
      permissions: {},
    };

    try {
      await seedSession(page, { user: liveUser });
      await page.goto('/main');
      await expect(page.getByTestId('main-shell')).toBeVisible();

      const { data: insertedNotification, error: notificationInsertError } = await adminClient!
        .from('notifications')
        .insert({
          user_id: insertedStaff!.id,
          type: 'notification',
          title: '실시간 알림 점검',
          body: '브라우저에 즉시 표시되어야 합니다.',
          metadata: { source: 'playwright-live-check' },
          read_at: null,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      expect(notificationInsertError).toBeNull();
      expect(insertedNotification?.id).toBeTruthy();

      const liveToast = page.getByTestId(`notification-toast-${insertedNotification!.id}`);
      await expect(liveToast).toBeVisible({ timeout: 20000 });
      await expect(liveToast.getByText('실시간 알림 점검')).toBeVisible();

      await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();
      await expect(page.getByTestId(`notification-item-${insertedNotification!.id}`)).toBeVisible({ timeout: 10000 });
    } finally {
      await adminClient!.from('notifications').delete().eq('user_id', insertedStaff!.id);
      await adminClient!.from('staff_members').delete().eq('id', insertedStaff!.id);
    }
  });
});
