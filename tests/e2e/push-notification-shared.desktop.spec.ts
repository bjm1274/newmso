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
      showNotification: async () => undefined,
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
