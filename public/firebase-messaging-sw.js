// SW_VERSION: 2026-04-07-v2
importScripts('/push-notification-shared.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// 새 버전 즉시 적용
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

firebase.initializeApp({
  apiKey: 'AIzaSyBGqA18_a00XlYSRvoRu2KpdKfVJHJnikA',
  authDomain: 'mso-system.firebaseapp.com',
  projectId: 'mso-system',
  storageBucket: 'mso-system.firebasestorage.app',
  messagingSenderId: '873459384687',
  appId: '1:873459384687:web:4fd03a6b1090683a58689a',
});

const messaging = firebase.messaging();

// FCM 백그라운드 메시지
messaging.onBackgroundMessage((payload) => {
  return self.__erpPushShared.showIncomingNotification(payload);
});

// Web Push (non-FCM) 폴백 처리
self.addEventListener('push', (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); }
    catch { data = { body: event.data.text() }; }
    await self.__erpPushShared.showIncomingNotification(data);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(self.__erpPushShared.handleNotificationClick(event));
});

self.addEventListener('message', (event) => {
  event.waitUntil(self.__erpPushShared.handleClientMessage(event));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.__erpPushShared.handlePushSubscriptionChange(event));
});
