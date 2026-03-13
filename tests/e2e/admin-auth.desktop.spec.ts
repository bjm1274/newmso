import { expect, test } from '@playwright/test';
import { fakeUser, seedSession } from './helpers';

test('legacy admin initial password verifies for protected actions', async ({ page }) => {
  const legacyAdminUser = {
    ...fakeUser,
    id: 'legacy-admin-user',
    employee_no: '1',
    name: 'Legacy Admin',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: 'Management',
    position: '원장',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      mso: true,
    },
  };

  await seedSession(page, { user: legacyAdminUser });
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'qkrcjfghd!!',
        userId: 'legacy-admin-user',
        name: 'Legacy Admin',
        employeeNo: '1',
      }),
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });

  expect(result.status).toBe(200);
  expect(result.payload?.verified).toBe(true);
});
