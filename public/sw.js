// Service Worker: 백그라운드에서 푸시 알림 처리

// 1. 푸시 알림 수신
self.addEventListener('push', (event) => {
  console.log('푸시 알림 수신:', event);
  
  if (!event.data) return;
  
  const data = event.data.json();
  var tag = (data.tag || 'notification') + '-' + (data.data && data.data.message_id ? data.data.message_id : Date.now());
  const options = {
    body: data.body || '새 알림이 있습니다.',
    icon: '/sy-logo.png',
    badge: '/badge-72x72.png',
    tag: tag,
    requireInteraction: false,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '알림', options).then(function() {
      // 일정 시간(5초) 후 해당 알림만 자동 닫힘
      return new Promise(function(resolve) {
        setTimeout(function() {
          self.registration.getNotifications().then(function(notifications) {
            notifications.forEach(function(n) {
              if (n.tag === tag) n.close();
            });
            resolve();
          }).catch(function() { resolve(); });
        }, 5000);
      });
    })
  );
});

// 2. 알림 클릭 처리 — 채팅 알림이면 해당 채팅방으로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  var data = event.notification.data || {};
  var roomId = data.room_id || '';
  var baseUrl = self.registration.scope.replace(/\/$/, '');
  var chatUrl = roomId ? baseUrl + '/main?open_chat_room=' + encodeURIComponent(roomId) : baseUrl + '/main';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(baseUrl) === 0 && 'focus' in client) {
          if (roomId && 'navigate' in client) {
            return client.navigate(chatUrl).then(function(c) { return c ? c.focus() : Promise.resolve(); });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(chatUrl);
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
