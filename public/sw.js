// SW_VERSION: 2026-05-15-v1-deep-link
importScripts('/push-notification-shared.js');

// 새 버전 배포 시 즉시 구 SW를 교체 (탭 닫기 불필요)
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

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
// 정적 자산 캐시 이름 (SW_VERSION과 연동)
const STATIC_CACHE = 'erp-static-v1';
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|png|jpg|svg|ico|webp)(\?|$)/;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Share target POST 처리
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    // 아래 share-target 코드로 계속
  }
  // 정적 자산: stale-while-revalidate (캐시 우선, 백그라운드 갱신)
  else if (event.request.method === 'GET' && url.origin === self.location.origin && STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  } else {
    return;
  }

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
  const CURRENT_CACHES = ['erp-share-target-v1', 'erp-static-v1'];
  event.waitUntil(Promise.all([
    // 오래된 캐시 정리
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )
    ),
    // 모든 탭을 즉시 이 SW가 제어하도록 claim
    self.clients.claim(),
    self.__erpPushShared.flushRetryQueue(),
  ]));
});
