/**
 * seeded-login.desktop.spec.ts — 로컬 D1 시드가 실제로 동작하는지 검증
 *
 * 다른 E2E 스펙 대부분은 `seedSession()` + `mockSupabase()` 로 세션/데이터를
 * 위조하기 때문에 D1 이 통째로 비어 있어도 "통과"한다. 이 스펙은 그 반대로,
 * **mock 을 전혀 쓰지 않고** `scripts/seed-e2e-d1.mjs` 가 넣은 실제 로컬 D1
 * 데이터로 로그인이 되는지를 확인한다. 즉 시드 회귀 감시용이다.
 *
 * 선행: `npm run test:e2e:seed` (npm run test:e2e 는 자동으로 먼저 실행함)
 *
 * CI 에서는 `next build && next start`(production) 로 돌기 때문에
 * `initOpenNextCloudflareForDev()` 가 비활성이라 D1 바인딩 자체가 없다.
 * 따라서 CI 에서는 스킵한다.
 */

import { expect, test } from '@playwright/test';
import { dismissDialogs } from './helpers';

const LOGIN_ID = process.env.E2E_TEST_USER_ID || 'E2E-001';
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePassw0rd!';

test.describe('로컬 D1 시드 기반 실제 로그인', () => {
  test.skip(
    Boolean(process.env.CI) || Boolean(process.env.E2E_SKIP_SEED),
    'CI(production build)에는 로컬 D1 바인딩이 없어 시드 기반 로그인을 검증할 수 없음'
  );

  test.beforeEach(async ({ page }) => {
    await dismissDialogs(page);
    await page.context().clearCookies();
  });

  test('master-login API 가 시드된 계정으로 성공한다', async ({ page }) => {
    const response = await page.request.post('/api/auth/master-login', {
      data: { loginId: LOGIN_ID, password: PASSWORD },
    });

    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      success?: boolean;
      user?: { employee_no?: string; name?: string; company?: string };
      error?: string;
    };

    expect(payload.error ?? null).toBeNull();
    expect(payload.success).toBe(true);
    expect(payload.user?.employee_no).toBe(LOGIN_ID);
    expect(payload.user?.company).toBe('E2E Clinic');
  });

  test('잘못된 비밀번호는 거부된다', async ({ page }) => {
    const response = await page.request.post('/api/auth/master-login', {
      data: { loginId: LOGIN_ID, password: `${PASSWORD}-wrong` },
    });

    const payload = (await response.json()) as { success?: boolean; error?: string };
    expect(payload.success).not.toBe(true);
    expect(payload.error).toBeTruthy();
  });

  test('로그인 폼으로 로그인하면 /main 으로 진입한다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();

    await page.getByTestId('login-id-input').fill(LOGIN_ID);
    await page.getByTestId('login-password-input').fill(PASSWORD);
    await page.getByTestId('login-submit-button').click();

    await expect(page).toHaveURL(/\/main/, { timeout: 20_000 });
    await expect(page.getByTestId('main-shell')).toBeVisible({ timeout: 20_000 });
  });
});
