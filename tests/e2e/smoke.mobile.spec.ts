import { expect, test } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('mobile main shell shows the bottom tab bar', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.goto('/main');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
});
