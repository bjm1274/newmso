importScripts('/push-notification-shared.js');
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
  return self.__erpPushShared.showIncomingNotification(payload);
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(self.__erpPushShared.handleNotificationClick(event));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.__erpPushShared.handlePushSubscriptionChange(event));
});
