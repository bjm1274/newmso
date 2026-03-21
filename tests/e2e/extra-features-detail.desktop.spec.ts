import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (
      text.includes('favicon') ||
      text.includes('Failed to load resource') ||
      text.includes('ERR_ABORTED')
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return errors;
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

const extraFeaturesUser = {
  ...fakeUser,
  permissions: {
    ...fakeUser.permissions,
    'extra_\uC870\uC9C1\uB3C4': true,
    'extra_\uBD80\uC11C\uBCC4\uC7AC\uACE0': true,
    'extra_\uADFC\uBB34\uD604\uD669': true,
    'extra_\uC778\uACC4\uB178\uD2B8': true,
    'extra_\uD1F4\uC6D0\uC2EC\uC0AC': true,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
    'extra_\uC9C1\uC6D0\uD3C9\uAC00': true,
    'extra_\uC785\uAE08\uC2E4\uC2DC\uAC04\uC870\uD68C': true,
  },
};

const partnerCompanyStaff = {
  ...fakeUser,
  id: '99999999-9999-9999-9999-999999999999',
  employee_no: 'E2E-099',
  name: 'Cross Viewer',
  company: 'Partner Hospital',
  company_id: '33333333-3333-3333-3333-333333333333',
  department: '영상의학과',
  position: '사원',
  role: 'staff',
};

test('extra features cards open one by one in a practical click-through flow', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [extraFeaturesUser, partnerCompanyStaff],
  });
  await seedSession(page, {
    user: extraFeaturesUser,
    localStorage: {
      erp_last_menu: '추가기능',
    },
  });

  await page.route('**/api/payments/virtual-account-deposits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deposits: [] }),
    });
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('추가기능')}`);

  await expect(page.getByTestId('extra-view')).toBeVisible();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  await page.getByTestId('extra-card-org-chart').click();
  await expect(page.getByTestId('extra-subview')).toBeVisible();
  await expect(page.getByTestId('org-chart-pyramid-view')).toBeVisible();
  await expect(page.getByText('Cross Viewer')).toBeVisible();
  await page.getByRole('button', { name: 'Partner Hospital' }).click();
  await expect(page.getByText('Cross Viewer')).toBeVisible();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  const internalCards = [
    'department-inventory',
    'work-status',
    'handover-note',
    'discharge-review',
    'closing-report',
    'staff-evaluation',
    'realtime-deposit',
  ] as const;

  for (const testId of internalCards) {
    await page.getByTestId(`extra-card-${testId}`).click();
    await expect(page.getByTestId('extra-subview')).toBeVisible();
    await expect(page.getByTestId('extra-back-button')).toBeVisible();
    await page.getByTestId('extra-back-button').click();
    await expect(page.getByTestId('extra-features-list')).toBeVisible();
  }

  expect(runtimeErrors).toEqual([]);
});
