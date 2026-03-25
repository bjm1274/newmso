// Firebase Cloud Messaging Service Worker
// 앱이 완전히 닫혀 있을 때 백그라운드 푸시 알림 처리 (안드로이드/iOS)
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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '새 알림';
  const body = payload.notification?.body || '새 알림이 있습니다.';
  const data = payload.data || {};
  const tag = 'fcm-' + (data.message_id || data.id || Date.now());

  self.registration.showNotification(title, {
    body,
    icon: '/sy-logo.png',
    badge: '/badge-72x72.png',
    tag,
    requireInteraction: true,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    data,
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' },
    ],
  });
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.room_id ? `/main?tab=chat&room=${data.room_id}` : '/main';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/main') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
