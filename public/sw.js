importScripts('/push-notification-shared.js');

self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }

    await self.__erpPushShared.showIncomingNotification(data);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(self.__erpPushShared.handleNotificationClick(event));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
