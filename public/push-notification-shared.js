const ERP_PUSH_BADGE_URL = '/badge-72x72.png';
const ERP_PUSH_ICON_URL = '/sy-logo.png';
const erpRecentlyShownNotifications = new Map();

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

async function erpShowIncomingNotification(rawPayload) {
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
    silent: false,
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' },
    ],
  });
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
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notification_id: notificationId,
      }),
    });
    await erpBroadcastMessage('erp-notification-read-sync', {
      notificationId,
    });
  } catch {
    // ignore read-sync failures
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

    const syncResponse = await fetch('/api/notifications/push-subscription', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
      }),
    });

    if (!syncResponse.ok) {
      throw new Error(`push subscription sync failed (${syncResponse.status})`);
    }

    if (oldEndpoint && oldEndpoint !== payload.endpoint) {
      await fetch('/api/notifications/push-subscription', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: oldEndpoint,
        }),
      }).catch(() => {});
    }

    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: true,
    });
  } catch {
    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: false,
    });
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
  showIncomingNotification: erpShowIncomingNotification,
  handleNotificationClick: erpHandleNotificationClick,
  handlePushSubscriptionChange: erpHandlePushSubscriptionChange,
};
