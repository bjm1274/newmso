// Service Worker: 백그라운드 푸시 알림 처리 (Web Push)
// FCM 백그라운드 알림은 /firebase-messaging-sw.js 에서 처리
const BADGE_URL = '/badge-72x72.png';
const ICON_URL = '/sy-logo.png';
const recentlyShownNotifications = new Map();

async function getWindowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

function isVisibleClient(client) {
  return client?.visibilityState === 'visible' || client?.focused === true;
}

async function broadcastPreviewToVisibleClients(payload) {
  const clientList = await getWindowClients();
  const visibleClients = clientList.filter(isVisibleClient);

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

function shouldShowNotification(key) {
  const now = Date.now();
  for (const [entryKey, timestamp] of recentlyShownNotifications.entries()) {
    if (now - timestamp > 2 * 60 * 1000) {
      recentlyShownNotifications.delete(entryKey);
    }
  }
  if (!key) return true;
  if (recentlyShownNotifications.has(key)) return false;
  recentlyShownNotifications.set(key, now);
  return true;
}

// 1. 푸시 알림 수신
self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = { title: '새 알림', body: event.data.text() };
    }

    // firebase-messaging-sw.js와 동일한 tag 형식 사용 → 이중 알림 방지
    const messageId = data.data?.message_id || data.data?.id || '';
    const tag = messageId ? 'chat-msg-' + messageId : (data.data?.type || 'notification') + '-' + Date.now();
    if (!shouldShowNotification(tag)) return;

    const previewPayload = {
      title: data.title || '알림',
      body: data.body || '새 알림이 있습니다.',
      tag,
      data: data.data || {},
    };

    // 앱 아이콘 뱃지 증가 (백그라운드 알림 도착 시)
    try {
      if (self.navigator && 'setAppBadge' in self.navigator) {
        self.navigator.setAppBadge().catch(() => {});
      }
    } catch {}

    const hasVisibleClient = await broadcastPreviewToVisibleClients(previewPayload);
    if (hasVisibleClient) return;

    const options = {
      body: previewPayload.body,
      icon: ICON_URL,
      badge: BADGE_URL,
      tag,
      requireInteraction: true,
      renotify: false,
      silent: false,
      vibrate: [200, 100, 200],
      data: previewPayload.data,
      actions: [
        { action: 'open', title: '확인하기' },
        { action: 'close', title: '닫기' }
      ],
    };

    await self.registration.showNotification(previewPayload.title, options);
  })());
});

// 2. 알림 클릭 시 이동 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // 알림 클릭 시 뱃지 즉시 클리어 (앱 열리면 정확한 카운트로 재동기화됨)
  try {
    if (self.navigator && 'clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  } catch {}

  if (event.action === 'close') return;

  const data = event.notification.data || {};
  const baseUrl = self.registration.scope.replace(/\/$/, '');
  let targetUrl = baseUrl + '/main';

  // 딥링크 라우팅 로직
  if (data.room_id) {
    targetUrl += '?open_chat_room=' + encodeURIComponent(data.room_id);
    if (data.message_id) {
      targetUrl += '&open_msg=' + encodeURIComponent(data.message_id);
    }
  } else if (data.type === 'approval') {
    targetUrl += '?open_menu=전자결재';
  } else if (data.type === 'inventory') {
    targetUrl += '?open_menu=재고관리';
  } else if (data.type === 'board') {
    targetUrl += '?open_menu=게시판';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(c => c?.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// 3. 서비스 워커 활성화 시 제어권 즉시 획득
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
