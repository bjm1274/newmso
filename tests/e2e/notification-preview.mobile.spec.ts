import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function installPushRegistrationRetryStubs(page: Page) {
  await page.addInitScript(() => {
    const registrationCounts = { register: 0 };
    const fakeRegistration = {
      scope: '/',
      active: { scriptURL: '/sw.js' },
      waiting: null,
      installing: null,
      unregister: async () => true,
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => null,
      },
      showNotification: async () => undefined,
    };

    (
      window as Window & {
        __pushRegistrationCounts?: typeof registrationCounts;
      }
    ).__pushRegistrationCounts = registrationCounts;

    function FakeNotification(this: Notification) {}

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
        register: async () => {
          registrationCounts.register += 1;
          return fakeRegistration;
        },
        ready: Promise.resolve(fakeRegistration),
        getRegistration: async () => fakeRegistration,
        getRegistrations: async () => [fakeRegistration],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
}

async function getPushRegistrationCount(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __pushRegistrationCounts?: { register?: number };
        }
      ).__pushRegistrationCounts?.register ?? 0
  );
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
  await page.evaluate(async (notificationPayload) => {
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

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('mobile chat preview banner shows the message preview and opens the chat room', async ({ page }) => {
  await mockSupabase(page, {
    notifications: [],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-03-31T08:30:00.000Z',
        last_message_at: '2026-03-31T08:30:00.000Z',
      },
      {
        id: 'room-live-message',
        name: '메시지 미리보기 방',
        type: 'group',
        members: [fakeUser.id, 'chat-preview-peer'],
        created_at: '2026-03-31T08:30:00.000Z',
        last_message_at: '2026-03-31T08:45:00.000Z',
        last_message_preview: '이전 메시지',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: 'chat-preview-peer',
        name: 'Chat Preview Peer',
        employee_no: 'E2E-CHAT-PREVIEW-001',
      },
    ],
    messages: [
      {
        id: 'msg-existing-1',
        room_id: 'room-live-message',
        sender_id: 'chat-preview-peer',
        content: '이전 메시지',
        created_at: '2026-03-31T08:45:00.000Z',
        is_deleted: false,
        staff: { name: 'Chat Preview Peer', photo_url: null },
      },
    ],
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await insertLiveNotification(page, {
    id: 'notification-mobile-message-preview-1',
    type: 'message',
    title: 'Chat Preview Peer',
    body: '카카오톡처럼 상단 메시지 미리보기가 떠야 합니다.',
    metadata: {
      room_id: 'room-live-message',
      message_id: 'msg-live-preview-1',
      sender_name: 'Chat Preview Peer',
      room_name: '메시지 미리보기 방',
      type: 'message',
    },
  });

  await expect(page.getByTestId('chat-preview-banner')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('chat-preview-title')).toHaveText('Chat Preview Peer');
  await expect(page.getByTestId('chat-preview-body')).toContainText('카카오톡처럼 상단 메시지 미리보기');
  await expect(page.getByTestId('chat-preview-room')).toContainText('메시지 미리보기 방');
  await expect(page.getByTestId('notification-toast-notification-mobile-message-preview-1')).toHaveCount(0);

  await page.getByTestId('chat-preview-banner').click();

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-message-input')).toBeVisible();
});

test('mobile notification service retries push registration when focus returns without an active subscription', async ({
  page,
}) => {
  await installPushRegistrationRetryStubs(page);
  await mockSupabase(page, {
    notifications: [],
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await expect.poll(async () => getPushRegistrationCount(page)).toBeGreaterThan(0);
  const initialCount = await getPushRegistrationCount(page);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await expect.poll(async () => getPushRegistrationCount(page)).toBe(initialCount + 1);
});

test('notification settings shows push status and lets the user retry registration', async ({
  page,
}) => {
  await installPushRegistrationRetryStubs(page);
  await mockSupabase(page, {
    notifications: [],
  });

  await seedSession(page);
  await page.goto('/main?open_menu=알림');
  await expect(page.getByTestId('notifications-view')).toBeVisible();

  await page.getByRole('button', { name: '⚙️ 설정' }).click();
  await expect(page.getByTestId('notification-settings-push-status')).toBeVisible();
  await expect(page.getByTestId('notification-settings-push-permission')).toHaveText('허용됨');
  await expect(page.getByTestId('notification-settings-push-connection')).toContainText('구독이 끊겨');
  await expect(page.getByTestId('notification-settings-ios-guide')).toContainText('홈 화면에 추가');

  await expect.poll(async () => getPushRegistrationCount(page)).toBeGreaterThan(0);
  const initialCount = await getPushRegistrationCount(page);

  await page.getByTestId('notification-settings-push-action').click();

  await expect.poll(async () => getPushRegistrationCount(page)).toBe(initialCount + 1);
});
