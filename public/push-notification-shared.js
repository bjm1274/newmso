const ERP_PUSH_BADGE_URL = '/badge-72x72.png';
const ERP_PUSH_ICON_URL = '/sy-logo.png';
const erpRecentlyShownNotifications = new Map();

async function erpGetWindowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
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
  let targetUrl = `${baseUrl}/main`;

  if (data.room_id) {
    targetUrl += `?open_chat_room=${encodeURIComponent(data.room_id)}`;
    if (data.message_id) {
      targetUrl += `&open_msg=${encodeURIComponent(data.message_id)}`;
    }
    return targetUrl;
  }

  if (data.type === 'approval') return `${targetUrl}?open_menu=전자결재`;
  if (data.type === 'inventory') return `${targetUrl}?open_menu=재고관리`;
  if (data.type === 'board') return `${targetUrl}?open_menu=게시판`;
  return targetUrl;
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
};
