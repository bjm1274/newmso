import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { expect, test } from '@playwright/test';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function createPushSharedHarness(options?: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
  clients?: Array<{
    postMessage?: (message: unknown) => void;
    url?: string;
    focus?: () => Promise<unknown>;
    navigate?: (url: string) => Promise<unknown>;
  }>;
}) {
  const openedUrls: string[] = [];
  const postedMessages: Array<unknown> = [];
  const fetchCalls: FetchCall[] = [];
  const subscribeCalls: Array<Record<string, unknown>> = [];
  const shownNotifications: Array<{ title?: string; options?: NotificationOptions }> = [];

  const fetchImpl =
    options?.fetchImpl ||
    (async (url: string) => {
      if (url.endsWith('/api/notifications/push-config')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ vapidPublicKey: 'SGVsbG8' }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    });

  const registeredClients =
    options?.clients ||
    [
      {
        postMessage: (message: unknown) => {
          postedMessages.push(message);
        },
      },
    ];

  const fakeSubscription = {
    endpoint: 'https://push.example/new-subscription',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
    toJSON() {
      return {
        endpoint: this.endpoint,
        keys: this.keys,
      };
    },
  };

  const fakeSelf = {
    navigator: {
      setAppBadge: async () => undefined,
      clearAppBadge: async () => undefined,
    },
    registration: {
      scope: 'http://127.0.0.1:3000/',
      pushManager: {
        subscribe: async (subscriptionOptions: Record<string, unknown>) => {
          subscribeCalls.push(subscriptionOptions);
          return fakeSubscription;
        },
      },
      showNotification: async (title?: string, options?: NotificationOptions) => {
        shownNotifications.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => registeredClients,
      openWindow: async (url: string) => {
        openedUrls.push(url);
        return null;
      },
    },
  } as Record<string, unknown>;

  const scriptPath = path.join(process.cwd(), 'public', 'push-notification-shared.js');
  const scriptSource = fs.readFileSync(scriptPath, 'utf8');

  const sandbox = {
    self: fakeSelf,
    fetch: async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return fetchImpl(url, init);
    },
    URLSearchParams,
    Map,
    Date,
    atob: (input: string) => Buffer.from(input, 'base64').toString('binary'),
    console,
  } as Record<string, unknown>;

  vm.runInNewContext(scriptSource, sandbox, {
    filename: 'push-notification-shared.js',
  });

  return {
    shared: (fakeSelf as { __erpPushShared?: Record<string, (...args: any[]) => Promise<unknown>> })
      .__erpPushShared,
    openedUrls,
    postedMessages,
    fetchCalls,
    subscribeCalls,
    shownNotifications,
  };
}

function createUnifiedServiceWorkerHarness() {
  const importCalls: string[] = [];
  const backgroundPayloads: Array<unknown> = [];
  let backgroundHandler: ((payload: unknown) => Promise<unknown> | unknown) | null = null;
  const firebaseApps: Array<Record<string, unknown>> = [];

  const fakeSelf = {
    __erpPushShared: {
      showIncomingNotification: async (payload: unknown) => {
        backgroundPayloads.push(payload);
      },
      handleNotificationClick: async () => undefined,
      handleClientMessage: async () => undefined,
      handlePushSubscriptionChange: async () => undefined,
      flushRetryQueue: async () => undefined,
    },
    firebase: {
      apps: firebaseApps,
      initializeApp(config: Record<string, unknown>) {
        firebaseApps.push(config);
        return config;
      },
      messaging() {
        return {
          onBackgroundMessage(callback: (payload: unknown) => Promise<unknown> | unknown) {
            backgroundHandler = callback;
          },
        };
      },
    },
    addEventListener: () => undefined,
    clients: {
      claim: async () => undefined,
    },
  } as Record<string, unknown>;

  const scriptPath = path.join(process.cwd(), 'public', 'sw.js');
  const scriptSource = fs.readFileSync(scriptPath, 'utf8');

  const sandbox = {
    self: fakeSelf,
    importScripts: (...urls: string[]) => {
      importCalls.push(...urls);
    },
    URL,
    URLSearchParams,
    caches: {
      open: async () => ({
        put: async () => undefined,
      }),
    },
    Response,
    File,
    Promise,
    Date,
    console,
  } as Record<string, unknown>;

  vm.runInNewContext(scriptSource, sandbox, {
    filename: 'sw.js',
  });

  return {
    importCalls,
    backgroundPayloads,
    runBackgroundMessage: async (payload: unknown) => {
      if (!backgroundHandler) throw new Error('background handler was not registered');
      await backgroundHandler(payload);
    },
  };
}

test('shared push click opens the exact approval, board, and inventory targets', async () => {
  const approvalHarness = createPushSharedHarness({ clients: [] });
  await approvalHarness.shared?.handleNotificationClick({
    action: 'open',
    notification: {
      close: () => undefined,
      data: {
        type: 'approval',
        approval_view: '결재함',
        approval_id: 'approval-from-push-1',
        notification_id: 'notification-approval-1',
      },
    },
  });

  const approvalUrl = new URL(approvalHarness.openedUrls[0]);
  expect(approvalUrl.searchParams.get('open_menu')).toBe('전자결재');
  expect(approvalUrl.searchParams.get('open_subview')).toBe('결재함');
  expect(approvalUrl.searchParams.get('open_approval_id')).toBe('approval-from-push-1');
  expect(
    approvalHarness.fetchCalls.some((call) => call.url.endsWith('/api/notifications/mark-read'))
  ).toBeTruthy();

  const boardHarness = createPushSharedHarness({ clients: [] });
  await boardHarness.shared?.handleNotificationClick({
    action: 'open',
    notification: {
      close: () => undefined,
      data: {
        type: 'notification',
        board_type: '공지사항',
        post_id: 'board-post-1',
        notification_id: 'notification-board-1',
      },
    },
  });

  const boardUrl = new URL(boardHarness.openedUrls[0]);
  expect(boardUrl.searchParams.get('open_menu')).toBe('게시판');
  expect(boardUrl.searchParams.get('open_board')).toBe('공지사항');
  expect(boardUrl.searchParams.get('open_post')).toBe('board-post-1');

  const inventoryHarness = createPushSharedHarness({ clients: [] });
  await inventoryHarness.shared?.handleNotificationClick({
    action: 'open',
    notification: {
      close: () => undefined,
      data: {
        type: 'inventory',
        approval_id: 'inventory-approval-1',
        notification_id: 'notification-inventory-1',
      },
    },
  });

  const inventoryUrl = new URL(inventoryHarness.openedUrls[0]);
  expect(inventoryUrl.searchParams.get('open_menu')).toBe('재고관리');
  expect(inventoryUrl.searchParams.get('open_inventory_view')).toBe('현황');
  expect(inventoryUrl.searchParams.get('open_inventory_approval')).toBe('inventory-approval-1');
});

test('shared push subscription change re-subscribes and syncs the new endpoint', async () => {
  const postedMessages: Array<unknown> = [];
  const harness = createPushSharedHarness({
    clients: [
      {
        postMessage: (message: unknown) => {
          postedMessages.push(message);
        },
        url: 'http://example.com/offline-client',
      },
    ],
  });

  await harness.shared?.handlePushSubscriptionChange({
    oldSubscription: {
      endpoint: 'https://push.example/old-subscription',
    },
    newSubscription: null,
  });

  expect(harness.subscribeCalls).toHaveLength(1);
  expect(harness.fetchCalls.map((call) => call.url)).toContain('/api/notifications/push-config');

  const syncCall = harness.fetchCalls.find(
    (call) =>
      call.url.endsWith('/api/notifications/push-subscription') &&
      String(call.init?.method || 'GET').toUpperCase() === 'POST'
  );
  expect(syncCall).toBeTruthy();
  expect(JSON.parse(String(syncCall?.init?.body || '{}'))).toMatchObject({
    endpoint: 'https://push.example/new-subscription',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  });

  const deleteCall = harness.fetchCalls.find(
    (call) =>
      call.url.endsWith('/api/notifications/push-subscription') &&
      String(call.init?.method || 'GET').toUpperCase() === 'DELETE'
  );
  expect(deleteCall).toBeTruthy();
  expect(JSON.parse(String(deleteCall?.init?.body || '{}'))).toMatchObject({
    endpoint: 'https://push.example/old-subscription',
  });

  expect(postedMessages).toContainEqual({
    type: 'erp-push-subscription-refresh',
    payload: {
      active: true,
    },
  });
});

test('shared push queues failed requests offline and flushes them when the app asks again', async () => {
  let offline = true;
  const postedMessages: Array<unknown> = [];
  const harness = createPushSharedHarness({
    clients: [
      {
        postMessage: (message: unknown) => {
          postedMessages.push(message);
        },
        url: 'http://example.com/offline-queue-client',
      },
    ],
    fetchImpl: async (url: string) => {
      if (url.endsWith('/api/notifications/mark-read')) {
        return {
          ok: !offline,
          status: offline ? 503 : 200,
          json: async () => ({}),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    },
  });

  await harness.shared?.handleNotificationClick({
    action: 'open',
    notification: {
      close: () => undefined,
      data: {
        type: 'approval',
        approval_id: 'approval-queued-1',
        notification_id: 'notification-queued-1',
      },
    },
  });

  const failedReadAttempts = harness.fetchCalls.filter((call) =>
    call.url.endsWith('/api/notifications/mark-read')
  );
  expect(failedReadAttempts.length).toBeGreaterThan(0);
  expect(postedMessages).toContainEqual({
    type: 'erp-push-retry-queue-state',
    payload: {
      pending: true,
    },
  });

  offline = false;
  await harness.shared?.handleClientMessage({
    data: {
      type: 'erp-push-flush-retry-queue',
    },
  });

  const successfulReadAttempts = harness.fetchCalls.filter((call) =>
    call.url.endsWith('/api/notifications/mark-read')
  );
  expect(successfulReadAttempts.length).toBeGreaterThan(failedReadAttempts.length);
  expect(postedMessages).toContainEqual({
    type: 'erp-notification-read-sync',
    payload: {
      notificationId: 'notification-queued-1',
    },
  });
});

test('unified service worker forwards FCM background messages to the shared notification helper', async () => {
  const harness = createUnifiedServiceWorkerHarness();

  expect(harness.importCalls).toContain('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
  expect(harness.importCalls).toContain('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

  await harness.runBackgroundMessage({
    data: {
      type: 'message',
      room_id: 'room-fcm-background',
      message_id: 'message-fcm-background-1',
    },
    notification: {
      title: 'FCM background',
      body: 'background payload',
    },
  });

  expect(harness.backgroundPayloads).toContainEqual({
    data: {
      type: 'message',
      room_id: 'room-fcm-background',
      message_id: 'message-fcm-background-1',
    },
    notification: {
      title: 'FCM background',
      body: 'background payload',
    },
  });
});

test('shared push shows a system notification only when there is no visible client', async () => {
  const backgroundHarness = createPushSharedHarness({
    clients: [
      {
        visibilityState: 'hidden',
        focused: false,
        postMessage: () => undefined,
      } as {
        visibilityState: string;
        focused: boolean;
        postMessage: (message: unknown) => void;
      },
    ],
  });

  await backgroundHarness.shared?.showIncomingNotification({
    title: '잠금화면 테스트',
    body: '백그라운드에서는 시스템 알림이 떠야 합니다.',
    data: {
      type: 'message',
      room_id: 'room-lockscreen',
      message_id: 'message-lockscreen-1',
    },
  });

  expect(backgroundHarness.shownNotifications).toHaveLength(1);
  expect(backgroundHarness.shownNotifications[0]).toMatchObject({
    title: '잠금화면 테스트',
  });

  const foregroundPostedMessages: Array<unknown> = [];
  const foregroundHarness = createPushSharedHarness({
    clients: [
      {
        visibilityState: 'visible',
        focused: true,
        postMessage: (message: unknown) => {
          foregroundPostedMessages.push(message);
        },
      } as {
        visibilityState: string;
        focused: boolean;
        postMessage: (message: unknown) => void;
      },
    ],
  });

  await foregroundHarness.shared?.showIncomingNotification({
    title: '포그라운드 테스트',
    body: '보이는 화면에는 미리보기만 보내야 합니다.',
    data: {
      type: 'message',
      room_id: 'room-foreground',
      message_id: 'message-foreground-1',
    },
  });

  expect(foregroundHarness.shownNotifications).toHaveLength(0);
  expect(foregroundPostedMessages).toContainEqual({
    type: 'erp-push-preview',
    payload: expect.objectContaining({
      title: '포그라운드 테스트',
      body: '보이는 화면에는 미리보기만 보내야 합니다.',
    }),
  });
});
