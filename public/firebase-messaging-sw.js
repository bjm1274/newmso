// Firebase Cloud Messaging Service Worker
// 백그라운드 상태의 웹 앱에서 FCM data 메시지를 받아 알림을 직접 표시한다.
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBGqA18_a00XlYSRvoRu2KpdKfVJHJnikA',
  authDomain: 'mso-system.firebaseapp.com',
  projectId: 'mso-system',
  storageBucket: 'mso-system.firebasestorage.app',
  messagingSenderId: '873459384687',
  appId: '1:873459384687:web:4fd03a6b1090683a58689a',
});

const messaging = firebase.messaging();
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

messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || '새 알림';
  const body = payload.notification?.body || data.body || '알림이 도착했습니다.';
  const tag = 'chat-msg-' + (data.message_id || data.id || Date.now());
  if (!shouldShowNotification(tag)) return;

  // 앱 아이콘 뱃지 증가 (백그라운드 알림 도착 시)
  try {
    if (self.navigator && 'setAppBadge' in self.navigator) {
      self.navigator.setAppBadge().catch(() => {});
    }
  } catch {}

  const hasVisibleClient = await broadcastPreviewToVisibleClients({
    title,
    body,
    tag,
    data,
  });

  if (hasVisibleClient) return;

  self.registration.showNotification(title, {
    body,
    icon: '/sy-logo.png',
    badge: '/badge-72x72.png',
    tag,
    requireInteraction: false,
    renotify: true,   // 새 메시지마다 헤드업(미리보기) 다시 표시
    silent: false,
    vibrate: [200, 100, 200],
    data,
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' },
    ],
  });
});

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

  // 딥링크 라우팅 — page.tsx의 쿼리 파라미터와 일치
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
      // 이미 열린 창이 있으면 포커스 + 딥링크 이동
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then((c) => c && c.focus());
          }
          return client.focus();
        }
      }
      // 열린 창이 없으면 새 창으로
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
