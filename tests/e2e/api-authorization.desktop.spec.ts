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

function buildRestrictedUser(permissionOverrides: Record<string, boolean>) {
  return {
    ...fakeUser,
    permissions: {
      ...fakeUser.permissions,
      ...permissionOverrides,
    },
  };
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
  const restrictedUser = buildRestrictedUser({
    menu_추가기능: false,
    extra_입금실시간조회: false,
  });

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

test('discharge review API rejects authenticated users without extra feature access', async ({ page }) => {
  const restrictedUser = buildRestrictedUser({
    menu_추가기능: false,
    extra_퇴원심사: false,
  });

  await seedSession(page, { user: restrictedUser });
  await mockSessionRoute(page, restrictedUser);
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/discharge-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName: '테스트 환자',
        admissionDate: '2026-03-01',
        dischargeDate: '2026-03-02',
        checkedItems: [],
        allItems: [],
      }),
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(403);
  expect(result.payload?.error).toBe('Forbidden');
});

test('consultation transcription API rejects authenticated users without extra feature access', async ({ page }) => {
  const restrictedUser = buildRestrictedUser({
    menu_추가기능: false,
    extra_수술상담: false,
  });

  await seedSession(page, { user: restrictedUser });
  await mockSessionRoute(page, restrictedUser);
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/consultation/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: 'dGVzdA==',
        mimeType: 'audio/webm',
      }),
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(403);
  expect(result.payload?.error).toBe('Forbidden');
});

test('board upload API rejects authenticated users without board write access', async ({ page }) => {
  const restrictedUser = buildRestrictedUser({
    menu_게시판: true,
    board_공지사항_read: true,
    board_공지사항_write: false,
  });

  await seedSession(page, { user: restrictedUser });
  await mockSessionRoute(page, restrictedUser);
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const formData = new FormData();
    formData.append('boardType', '공지사항');
    formData.append('file', new File(['test'], 'memo.txt', { type: 'text/plain' }));

    const response = await fetch('/api/board/upload', {
      method: 'POST',
      body: formData,
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(403);
  expect(result.payload?.error).toBe('Forbidden');
});
