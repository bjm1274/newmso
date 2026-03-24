import { expect, test } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('single live notification shows one toast and one native popup without duplicates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeNotifications: Array<{ title?: string; options?: NotificationOptions }> = [];
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => null,
      },
      showNotification: async (title: string, options?: NotificationOptions) => {
        nativeNotifications.push({ title, options });
      },
    };

    (window as Window & { __nativeNotifications?: typeof nativeNotifications }).__nativeNotifications =
      nativeNotifications;

    function FakeNotification(this: Notification, title?: string, options?: NotificationOptions) {
      nativeNotifications.push({ title, options });
    }

    Object.defineProperty(FakeNotification, 'permission', {
      configurable: true,
      get: () => 'granted',
    });
    Object.defineProperty(FakeNotification, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: FakeNotification,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => fakeRegistration,
        ready: Promise.resolve(fakeRegistration),
      },
    });
  });

  await mockSupabase(page, {
    notifications: [],
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await page.evaluate(async () => {
    const rawUser = window.localStorage.getItem('erp_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (!user?.id) throw new Error('seeded user missing');

    await fetch('/rest/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          id: 'notification-live-1',
          user_id: user.id,
          type: 'notification',
          title: '실시간 알림 테스트',
          body: '중복 없이 한 번만 보여야 합니다.',
          metadata: { source: 'notification-realtime-e2e' },
          read_at: null,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });

  const liveToast = page.getByTestId('notification-toast-notification-live-1');
  await expect(liveToast).toBeVisible({ timeout: 10000 });
  await expect(liveToast.getByText('실시간 알림 테스트')).toBeVisible();

  const toastCards = page.locator(
    '[data-testid^="notification-toast-"]:not([data-testid="notification-toast-stack"])'
  );
  await expect(toastCards).toHaveCount(1, { timeout: 3000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __nativeNotifications?: Array<{ title?: string }> })
            .__nativeNotifications?.length ?? 0
      )
    )
    .toBe(1);

  await page.waitForTimeout(4500);

  await expect(toastCards).toHaveCount(1, { timeout: 3000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __nativeNotifications?: Array<{ title?: string }> })
            .__nativeNotifications?.length ?? 0
      )
    )
    .toBe(1);

  await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();
  await expect(page.getByTestId('notification-dropdown')).toBeVisible();
  await expect(page.getByTestId('notification-item-notification-live-1')).toBeVisible();
});
