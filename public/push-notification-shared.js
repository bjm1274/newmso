const ERP_PUSH_BADGE_URL = '/badge-72x72.png';
const ERP_PUSH_ICON_URL = '/sy-logo.png';
const ERP_PUSH_RETRY_DB_NAME = 'erp-push-retry-v1';
const ERP_PUSH_RETRY_STORE = 'requests';
const erpRecentlyShownNotifications = new Map();
let erpRetryFallbackQueue = [];
let erpRetryDbPromise = null;

async function erpGetWindowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

function erpNormalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function erpSetQueryParam(params, key, value) {
  const normalized = erpNormalizeString(value);
  if (!normalized) return;
  params.set(key, normalized);
}

async function erpBroadcastMessage(type, payload) {
  const clientList = await erpGetWindowClients();
  clientList.forEach((client) => {
    try {
      client.postMessage({ type, payload });
    } catch {
      // ignore postMessage failures
    }
  });
}

async function erpOpenRetryDb() {
  if (typeof indexedDB === 'undefined') return null;
  if (erpRetryDbPromise) return erpRetryDbPromise;

  erpRetryDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ERP_PUSH_RETRY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ERP_PUSH_RETRY_STORE)) {
        database.createObjectStore(ERP_PUSH_RETRY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('retry-db-open-failed'));
  }).catch(() => null);

  return erpRetryDbPromise;
}

function erpBuildRetryEntry(type, payload) {
  const normalizedPayload = payload && typeof payload === 'object' ? { ...payload } : {};
  let id = '';

  if (type === 'mark-read') {
    const notificationId = erpNormalizeString(normalizedPayload.notification_id);
    if (!notificationId) return null;
    id = `mark-read:${notificationId}`;
  } else if (type === 'push-subscription-post') {
    const endpoint = erpNormalizeString(normalizedPayload.endpoint);
    if (!endpoint) return null;
    id = `push-subscription-post:${endpoint}`;
  } else if (type === 'push-subscription-delete') {
    const endpoint = erpNormalizeString(normalizedPayload.endpoint);
    if (!endpoint) return null;
    id = `push-subscription-delete:${endpoint}`;
  } else {
    return null;
  }

  return {
    id,
    type,
    payload: normalizedPayload,
    createdAt: new Date().toISOString(),
  };
}

async function erpPutRetryEntry(entry) {
  const database = await erpOpenRetryDb();
  if (!database) {
    erpRetryFallbackQueue = [
      ...erpRetryFallbackQueue.filter((item) => item.id !== entry.id),
      entry,
    ];
    return;
  }

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('retry-db-write-failed'));
    transaction.objectStore(ERP_PUSH_RETRY_STORE).put(entry);
  }).catch(() => {
    erpRetryFallbackQueue = [
      ...erpRetryFallbackQueue.filter((item) => item.id !== entry.id),
      entry,
    ];
  });
}

async function erpReadRetryEntries() {
  const database = await erpOpenRetryDb();
  if (!database) {
    return [...erpRetryFallbackQueue].sort((left, right) =>
      String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
    );
  }

  const entries = await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readonly');
    const request = transaction.objectStore(ERP_PUSH_RETRY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('retry-db-read-failed'));
  }).catch(() => [...erpRetryFallbackQueue]);

  return [...entries].sort((left, right) =>
    String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
  );
}

async function erpDeleteRetryEntries(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) return;
  erpRetryFallbackQueue = erpRetryFallbackQueue.filter((item) => !entryIds.includes(item.id));

  const database = await erpOpenRetryDb();
  if (!database) return;

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('retry-db-delete-failed'));
    const store = transaction.objectStore(ERP_PUSH_RETRY_STORE);
    entryIds.forEach((entryId) => {
      store.delete(entryId);
    });
  }).catch(() => {});
}

async function erpQueueRetryEntry(type, payload) {
  const entry = erpBuildRetryEntry(type, payload);
  if (!entry) return;
  await erpPutRetryEntry(entry);
  await erpBroadcastMessage('erp-push-retry-queue-state', {
    pending: true,
  });
}

async function erpSendRetryEntry(entry) {
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};

  if (entry.type === 'mark-read') {
    const response = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notification_id: erpNormalizeString(payload.notification_id),
      }),
    });
    if (!response.ok) {
      throw new Error(`mark-read failed (${response.status})`);
    }
    await erpBroadcastMessage('erp-notification-read-sync', {
      notificationId: erpNormalizeString(payload.notification_id),
    });
    return;
  }

  if (entry.type === 'push-subscription-post') {
    const response = await fetch('/api/notifications/push-subscription', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`push-subscription-post failed (${response.status})`);
    }
    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: true,
    });
    return;
  }

  if (entry.type === 'push-subscription-delete') {
    const response = await fetch('/api/notifications/push-subscription', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: erpNormalizeString(payload.endpoint),
      }),
    });
    if (!response.ok) {
      throw new Error(`push-subscription-delete failed (${response.status})`);
    }
  }
}

async function erpFlushRetryQueue() {
  const entries = await erpReadRetryEntries();
  if (!entries.length) {
    await erpBroadcastMessage('erp-push-retry-queue-state', {
      pending: false,
    });
    return {
      flushed: 0,
      pending: 0,
    };
  }

  const flushedIds = [];
  for (const entry of entries) {
    try {
      await erpSendRetryEntry(entry);
      flushedIds.push(entry.id);
    } catch {
      // keep the entry in queue for the next online retry
    }
  }

  if (flushedIds.length > 0) {
    await erpDeleteRetryEntries(flushedIds);
  }

  await erpBroadcastMessage('erp-push-retry-queue-state', {
    pending: entries.length - flushedIds.length > 0,
  });

  return {
    flushed: flushedIds.length,
    pending: Math.max(0, entries.length - flushedIds.length),
  };
}

function erpIsVisibleClient(client) {
  return client?.visibilityState === 'visible' || client?.focused === true;
}

async function erpBroadcastPreviewToVisibleClients(payload) {
  const clientList = await erpGetWindowClients();
  const visibleClients = clientList.filter(erpIsVisibleClient);

  visibleClients.forEach((client) => {
    try {
      client.postMessage({
        type: 'erp-push-preview',
        payload,
      });
    } catch {
      // ignore postMessage failures
    }
  });

  return visibleClients.length > 0;
}

function erpShouldShowNotification(key) {
  const now = Date.now();
  for (const [entryKey, timestamp] of erpRecentlyShownNotifications.entries()) {
    if (now - timestamp > 2 * 60 * 1000) {
      erpRecentlyShownNotifications.delete(entryKey);
    }
  }

  if (!key) return true;
  if (erpRecentlyShownNotifications.has(key)) return false;
  erpRecentlyShownNotifications.set(key, now);
  return true;
}

function erpNormalizeNotificationPayload(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const notification = payload.notification && typeof payload.notification === 'object'
    ? payload.notification
    : {};
  const nestedData = payload.data && typeof payload.data === 'object'
    ? payload.data
    : {};

  const title =
    payload.title ||
    notification.title ||
    nestedData.title ||
    '알림';
  const body =
    payload.body ||
    notification.body ||
    nestedData.body ||
    '새 알림이 있습니다.';

  const messageId = nestedData.message_id || nestedData.id || payload.message_id || payload.id || '';
  const type = nestedData.type || payload.type || 'notification';
  const tag =
    payload.tag ||
    notification.tag ||
    nestedData.tag ||
    (messageId ? `chat-msg-${messageId}` : `${type}-${Date.now()}`);

  return {
    title,
    body,
    tag,
    data: nestedData,
  };
}

function erpBuildNotificationOptions(payload) {
  return {
    body: payload.body,
    icon: ERP_PUSH_ICON_URL,
    badge: ERP_PUSH_BADGE_URL,
    tag: payload.tag,
    requireInteraction: false,
    renotify: false,
    vibrate: [1000],
    data: payload.data,
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' },
    ],
  };
}

async function erpDispatchIncomingNotification(rawPayload, options) {
  await erpFlushRetryQueue();
  const payload = erpNormalizeNotificationPayload(rawPayload);
  if (!erpShouldShowNotification(payload.tag)) return;

  try {
    if (self.navigator && 'setAppBadge' in self.navigator) {
      self.navigator.setAppBadge().catch(() => {});
    }
  } catch {
    // ignore badge failures
  }

  const hasVisibleClient = await erpBroadcastPreviewToVisibleClients(payload);
  if (hasVisibleClient) return;

  const allowBrowserManagedDisplay = Boolean(options && options.allowBrowserManagedDisplay);
  const hasNotificationPayload =
    rawPayload &&
    typeof rawPayload === 'object' &&
    rawPayload.notification &&
    typeof rawPayload.notification === 'object';

  if (allowBrowserManagedDisplay && hasNotificationPayload) return;

  await self.registration.showNotification(payload.title, erpBuildNotificationOptions(payload));
}

async function erpShowIncomingNotification(rawPayload) {
  await erpFlushRetryQueue();
  const payload = erpNormalizeNotificationPayload(rawPayload);
  if (!erpShouldShowNotification(payload.tag)) return;

  try {
    if (self.navigator && 'setAppBadge' in self.navigator) {
      self.navigator.setAppBadge().catch(() => {});
    }
  } catch {
    // ignore badge failures
  }

  const hasVisibleClient = await erpBroadcastPreviewToVisibleClients(payload);
  if (hasVisibleClient) return;

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: ERP_PUSH_ICON_URL,
    badge: ERP_PUSH_BADGE_URL,
    tag: payload.tag,
    requireInteraction: false,
    renotify: false,
    vibrate: [1000],
    data: payload.data,
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' },
    ],
  });
}

async function erpShowIncomingNotificationManaged(rawPayload) {
  await erpDispatchIncomingNotification(rawPayload, { allowBrowserManagedDisplay: false });
}

async function erpHandleFcmBackgroundMessage(rawPayload) {
  await erpDispatchIncomingNotification(rawPayload, { allowBrowserManagedDisplay: true });
}

function erpBuildTargetUrl(data) {
  const baseUrl = self.registration.scope.replace(/\/$/, '');
  const params = new URLSearchParams();

  if (data.room_id) {
    params.set('open_chat_room', erpNormalizeString(data.room_id));
    erpSetQueryParam(params, 'open_msg', data.message_id);
    return `${baseUrl}/main?${params.toString()}`;
  }

  if (data.type === 'inventory' || data.inventory_view || data.inventory_approval) {
    params.set('open_menu', '재고관리');
    params.set('open_inventory_view', erpNormalizeString(data.inventory_view) || '현황');
    erpSetQueryParam(params, 'open_inventory_approval', data.inventory_approval || data.approval_id);
    return `${baseUrl}/main?${params.toString()}`;
  }

  if (data.type === 'approval' || data.approval_view || data.approval_id) {
    params.set('open_menu', '전자결재');
    erpSetQueryParam(params, 'open_subview', data.approval_view);
    erpSetQueryParam(params, 'open_approval_id', data.approval_id);
    return `${baseUrl}/main?${params.toString()}`;
  }

  if (data.type === 'board' || data.post_id || data.board_type) {
    params.set('open_menu', '게시판');
    erpSetQueryParam(params, 'open_board', data.board_type);
    erpSetQueryParam(params, 'open_post', data.post_id);
    return `${baseUrl}/main?${params.toString()}`;
  }

  if (data.type === '인사' || data.type === 'payroll' || data.type === 'education' || data.type === 'attendance') {
    params.set('open_menu', '내정보');
    return `${baseUrl}/main?${params.toString()}`;
  }

  return `${baseUrl}/main`;
}

async function erpMarkNotificationAsRead(data) {
  const notificationId = erpNormalizeString(data?.notification_id);
  if (!notificationId) return;

  try {
    await erpSendRetryEntry({
      type: 'mark-read',
      payload: {
        notification_id: notificationId,
      },
    });
  } catch {
    await erpQueueRetryEntry('mark-read', {
      notification_id: notificationId,
    });
  }
}

function erpUrlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    out[index] = raw.charCodeAt(index);
  }
  return out;
}

async function erpHandlePushSubscriptionChange(event) {
  const oldEndpoint = erpNormalizeString(event?.oldSubscription?.endpoint);
  let pendingSubscriptionPayload = null;
  await erpFlushRetryQueue();

  try {
    let nextSubscription = event?.newSubscription || null;

    if (!nextSubscription) {
      const configResponse = await fetch('/api/notifications/push-config', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!configResponse.ok) {
        throw new Error(`push config fetch failed (${configResponse.status})`);
      }

      const config = await configResponse.json().catch(() => ({}));
      const vapidPublicKey = erpNormalizeString(config?.vapidPublicKey);
      if (!vapidPublicKey) {
        throw new Error('missing vapid public key');
      }

      nextSubscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: erpUrlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const payload = nextSubscription?.toJSON ? nextSubscription.toJSON() : null;
    if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
      throw new Error('invalid subscription payload');
    }
    pendingSubscriptionPayload = {
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    };

    await erpSendRetryEntry({
      type: 'push-subscription-post',
      payload: pendingSubscriptionPayload,
    });

    if (oldEndpoint && oldEndpoint !== payload.endpoint) {
      try {
        await erpSendRetryEntry({
          type: 'push-subscription-delete',
          payload: {
            endpoint: oldEndpoint,
          },
        });
      } catch {
        await erpQueueRetryEntry('push-subscription-delete', {
          endpoint: oldEndpoint,
        });
      }
    }

    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: true,
    });
  } catch {
    if (pendingSubscriptionPayload) {
      await erpQueueRetryEntry('push-subscription-post', pendingSubscriptionPayload);
    }
    if (
      pendingSubscriptionPayload &&
      oldEndpoint &&
      oldEndpoint !== erpNormalizeString(pendingSubscriptionPayload.endpoint)
    ) {
      await erpQueueRetryEntry('push-subscription-delete', {
        endpoint: oldEndpoint,
      });
    }
    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: false,
    });
  }
}

async function erpHandleClientMessage(event) {
  const message = event?.data && typeof event.data === 'object' ? event.data : null;
  if (!message?.type) return;

  if (message.type === 'erp-push-flush-retry-queue') {
    await erpFlushRetryQueue();
  }
}

async function erpHandleNotificationClick(event) {
  event.notification.close();

  try {
    if (self.navigator && 'clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  } catch {
    // ignore badge failures
  }

  if (event.action === 'close') return;

  const data = event.notification.data || {};
  await erpMarkNotificationAsRead(data);
  await erpFlushRetryQueue();
  const targetUrl = erpBuildTargetUrl(data);
  const baseUrl = self.registration.scope.replace(/\/$/, '');
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of clientList) {
    if (client.url.startsWith(baseUrl) && 'focus' in client) {
      if ('navigate' in client) {
        const navigated = await client.navigate(targetUrl);
        if (navigated && 'focus' in navigated) {
          return navigated.focus();
        }
      }
      return client.focus();
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }
}

self.__erpPushShared = {
  showIncomingNotification: erpShowIncomingNotificationManaged,
  handleFcmBackgroundMessage: erpHandleFcmBackgroundMessage,
  handleNotificationClick: erpHandleNotificationClick,
  handlePushSubscriptionChange: erpHandlePushSubscriptionChange,
  handleClientMessage: erpHandleClientMessage,
  flushRetryQueue: erpFlushRetryQueue,
};
