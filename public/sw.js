importScripts('/push-notification-shared.js');

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(self.__erpPushShared.handleNotificationClick(event));
});

try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

  if (self.firebase?.apps?.length === 0) {
    self.firebase.initializeApp({
      apiKey: 'AIzaSyBGqA18_a00XlYSRvoRu2KpdKfVJHJnikA',
      authDomain: 'mso-system.firebaseapp.com',
      projectId: 'mso-system',
      storageBucket: 'mso-system.firebasestorage.app',
      messagingSenderId: '873459384687',
      appId: '1:873459384687:web:4fd03a6b1090683a58689a',
    });
  }

  if (self.firebase?.messaging) {
    const messaging = self.firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      if (self.__erpPushShared.handleFcmBackgroundMessage) {
        return self.__erpPushShared.handleFcmBackgroundMessage(payload);
      }
      return self.__erpPushShared.showIncomingNotification(payload);
    });
  }
} catch (error) {
  console.warn('[SW] Firebase messaging init skipped:', error);
}

// ── Web Share Target: 다른 앱에서 파일/텍스트 공유 시 처리 ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname !== '/share-target' || event.request.method !== 'POST') return;

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const files = formData.getAll('files');
      const title = formData.get('title') || '';
      const text = formData.get('text') || '';
      const sharedUrl = formData.get('url') || '';

      // 파일을 임시 캐시에 저장
      const cache = await caches.open('erp-share-target-v1');
      const shareId = Date.now().toString();

      if (files.length > 0) {
        await Promise.all(files.map(async (file, i) => {
          if (!(file instanceof File)) return;
          const buf = await file.arrayBuffer();
          await cache.put(
            `/share-target-file/${shareId}/${i}?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`,
            new Response(buf, { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } })
          );
        }));
      }

      // 클라이언트에 메시지 전달 (채팅창 열기)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({
          type: 'ERP_SHARE_TARGET',
          shareId,
          fileCount: files.length,
          title: String(title),
          text: String(text),
          url: String(sharedUrl),
        });
      }

      // 채팅 페이지로 리다이렉트
      const redirectUrl = `/main?open_menu=채팅&share_id=${shareId}&share_file_count=${files.length}` +
        (title ? `&share_title=${encodeURIComponent(String(title))}` : '') +
        (text ? `&share_text=${encodeURIComponent(String(text).slice(0, 300))}` : '') +
        (sharedUrl ? `&share_url=${encodeURIComponent(String(sharedUrl))}` : '');

      return Response.redirect(redirectUrl, 303);
    } catch (err) {
      console.error('[SW] share-target 처리 실패:', err);
      return Response.redirect('/main?open_menu=채팅', 303);
    }
  })());
});

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

self.addEventListener('message', (event) => {
  event.waitUntil(self.__erpPushShared.handleClientMessage(event));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.__erpPushShared.handlePushSubscriptionChange(event));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    self.__erpPushShared.flushRetryQueue(),
  ]));
});
