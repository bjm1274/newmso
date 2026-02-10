// Service Worker: 백그라운드에서 푸시 알림 처리

// 1. 푸시 알림 수신
self.addEventListener('push', (event) => {
  console.log('푸시 알림 수신:', event);
  
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || '새 알림이 있습니다.',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'notification',
    requireInteraction: true,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '알림', options)
  );
});

// 2. 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('알림 클릭:', event);
  
  event.notification.close();

  // 해당 페이지로 포커스 이동
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// 3. 백그라운드 동기 (선택사항)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      fetch('/api/sync-notifications')
        .then(response => response.json())
        .catch(err => console.error('동기화 실패:', err))
    );
  }
});
