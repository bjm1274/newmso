import { expect, test, type Page } from '@playwright/test';
import { fakeUser, seedSession } from './helpers';

function mockSessionRoute(page: Page, user: Record<string, unknown>) {
  return page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user,
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
        supabaseAccessToken: null,
      }),
    });
  });
}

test('verify-password rejects identifiers from a different user', async ({ page }) => {
  await seedSession(page, { user: fakeUser });
  await mockSessionRoute(page, fakeUser);
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'not-used-because-request-should-fail-first',
        userId: 'another-user-id',
        name: '다른 직원',
        employeeNo: 'OTHER-001',
      }),
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(403);
  expect(result.payload?.verified).toBe(false);
});

test('deposit API rejects authenticated users without extra menu access', async ({ page }) => {
  const restrictedUser = {
    ...fakeUser,
    permissions: {
      ...fakeUser.permissions,
      menu_추가기능: false,
      extra_입금실시간조회: false,
    },
  };

  await seedSession(page, { user: restrictedUser });
  await mockSessionRoute(page, restrictedUser);
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/payments/virtual-account-deposits', {
      method: 'GET',
      cache: 'no-store',
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(403);
  expect(result.payload?.error).toBe('권한이 없습니다.');
});
