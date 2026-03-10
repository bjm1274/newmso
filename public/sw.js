// Service Worker: 백그라운드 푸시 알림 처리 (최상급 실시간 경험)
const BADGE_URL = '/badge-72x72.png';
const ICON_URL = '/sy-logo.png';

// 1. 푸시 알림 수신
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: '새 알림', body: event.data.text() };
  }

  const notifType = (data.tag || data.data?.type || 'notification');
  const tag = notifType + '-' + (data.data?.message_id || data.data?.id || Date.now());

  const options = {
    body: data.body || '새 알림이 있습니다.',
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: tag,
    requireInteraction: true,    // 사용자가 확인할 때까지 유지 (카카오톡 방식)
    renotify: true,              // 같은 tag라도 새 알림이면 다시 표시
    silent: false,
    vibrate: [200, 100, 200],    // 프리미엄 진동 패턴
    data: data.data || {},
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' }
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '알림', options)
  );
});

// 2. 알림 클릭 시 이동 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

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
