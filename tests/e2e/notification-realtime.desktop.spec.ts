import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

async function installNotificationStubs(page: Page) {
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
}

async function insertLiveNotification(
  page: Page,
  payload: {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
) {
  await page.evaluate(async notificationPayload => {
    const rawUser = window.localStorage.getItem('erp_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (!user?.id) throw new Error('seeded user missing');

    const rows = [
      {
        id: notificationPayload.id,
        user_id: user.id,
        type: notificationPayload.type,
        title: notificationPayload.title,
        body: notificationPayload.body,
        metadata: notificationPayload.metadata ?? {},
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    await fetch('/rest/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    });

    window.dispatchEvent(
      new CustomEvent('erp-mock-notification-insert', {
        detail: { rows },
      })
    );
  }, payload);
}

function getToastCards(page: Page) {
  return page.locator(
    '[data-testid^="notification-toast-"]:not([data-testid="notification-toast-stack"])'
  );
}

async function getNativeNotificationCount(page: Page) {
  return page.evaluate(
    () =>
      (window as Window & { __nativeNotifications?: Array<{ title?: string }> })
        .__nativeNotifications?.length ?? 0
  );
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('single live notification shows one toast and one native popup without duplicates', async ({
  page,
}) => {
  await installNotificationStubs(page);

  await mockSupabase(page, {
    notifications: [],
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await insertLiveNotification(page, {
    id: 'notification-live-1',
    type: 'notification',
    title: '실시간 알림 테스트',
    body: '중복 없이 한 번만 보여야 합니다.',
    metadata: { source: 'notification-realtime-e2e' },
  });

  const liveToast = page.getByTestId('notification-toast-notification-live-1');
  await expect(liveToast).toBeVisible({ timeout: 10000 });
  await expect(liveToast.getByText('실시간 알림 테스트')).toBeVisible();

  const toastCards = getToastCards(page);
  await expect(toastCards).toHaveCount(1, { timeout: 3000 });
  await expect.poll(async () => getNativeNotificationCount(page)).toBe(1);

  await page.waitForTimeout(4500);

  await expect(toastCards).toHaveCount(1, { timeout: 3000 });
  await expect.poll(async () => getNativeNotificationCount(page)).toBe(1);

  await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();
  await expect(page.getByTestId('notification-dropdown')).toBeVisible();
  await expect(page.getByTestId('notification-item-notification-live-1')).toBeVisible();
});

test('live message, approval, and board notifications route to the correct screens', async ({
  page,
}) => {
  await installNotificationStubs(page);

  await mockSupabase(page, {
    notifications: [],
    chatRooms: [
      {
        id: 'room-live-message',
        name: '실시간 알림 채팅방',
        type: 'group',
        members: ['11111111-1111-1111-1111-111111111111'],
        created_at: '2026-03-24T09:00:00.000Z',
        last_message_at: '2026-03-24T09:00:00.000Z',
      },
    ],
    boardPosts: [
      {
        id: 'board-live-1',
        board_type: '공지사항',
        title: '알림 라우팅 게시글',
        content: '게시판 알림 라우팅 테스트',
        author_id: '11111111-1111-1111-1111-111111111111',
        author_name: 'E2E Tester',
        created_at: '2026-03-24T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await insertLiveNotification(page, {
    id: 'notification-message-1',
    type: 'message',
    title: '새 채팅 메시지',
    body: '채팅방으로 이동해야 합니다.',
    metadata: {
      room_id: 'room-live-message',
    },
  });
  await page.getByTestId('notification-toast-notification-message-1').click();
  await expect(page.getByTestId('chat-view')).toBeVisible();

  await insertLiveNotification(page, {
    id: 'notification-approval-1',
    type: 'approval',
    title: '결재 요청',
    body: '결재함으로 이동해야 합니다.',
    metadata: {
      approval_view: '결재함',
    },
  });
  await page.getByTestId('notification-toast-notification-approval-1').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await expect(page.getByRole('button', { name: '결재함' })).toBeVisible();

  await insertLiveNotification(page, {
    id: 'notification-board-1',
    type: 'board',
    title: '게시판 새 글',
    body: '게시판으로 이동해야 합니다.',
    metadata: {
      board_type: '공지사항',
      post_id: 'board-live-1',
    },
  });
  await page.getByTestId('notification-toast-notification-board-1').click();
  await expect(page.getByTestId('board-view')).toBeVisible();
});

test('live notifications show only one native popup across two open tabs', async ({ context }) => {
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();

  await dismissDialogs(firstPage);
  await dismissDialogs(secondPage);
  await installNotificationStubs(firstPage);
  await installNotificationStubs(secondPage);

  await mockSupabase(firstPage, {
    notifications: [],
  });
  await mockSupabase(secondPage, {
    notifications: [],
  });

  await seedSession(firstPage);
  await seedSession(secondPage);
  await firstPage.goto('/main');
  await secondPage.goto('/main');
  await expect(firstPage.getByTestId('main-shell')).toBeVisible();
  await expect(secondPage.getByTestId('main-shell')).toBeVisible();

  const sharedPayload = {
    id: 'notification-cross-tab-1',
    type: 'notification',
    title: '다중 탭 알림',
    body: 'PC 팝업은 한 번만 떠야 합니다.',
    metadata: { source: 'notification-cross-tab' },
  };

  await Promise.all([
    insertLiveNotification(firstPage, sharedPayload),
    insertLiveNotification(secondPage, sharedPayload),
  ]);

  await expect(firstPage.getByTestId('notification-toast-notification-cross-tab-1')).toBeVisible({
    timeout: 10000,
  });
  await expect(secondPage.getByTestId('notification-toast-notification-cross-tab-1')).toBeVisible({
    timeout: 10000,
  });

  await expect
    .poll(async () =>
      (await getNativeNotificationCount(firstPage)) + (await getNativeNotificationCount(secondPage))
    )
    .toBe(1);

  await firstPage.close();
  await secondPage.close();
});
