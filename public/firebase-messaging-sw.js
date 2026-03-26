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

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || '새 알림';
  const body = payload.notification?.body || data.body || '알림이 도착했습니다.';
  const tag = 'chat-msg-' + (data.message_id || data.id || Date.now());

  self.registration.showNotification(title, {
    body,
    icon: '/sy-logo.png',
    badge: '/badge-72x72.png',
    tag,
    requireInteraction: true,
    renotify: false,
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
