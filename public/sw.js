// Service Worker: 백그라운드에서 푸시 알림 처리 (카카오톡 수준 실시간)
const BADGE_URL = '/badge-72x72.png';
const ICON_URL = '/sy-logo.png';

// 앱 배지 카운터 (읽지 않은 알림 수)
let badgeCount = 0;

// 1. 푸시 알림 수신
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: '새 알림', body: event.data.text() };
  }

  const notifType = (data.tag || data.data?.type || 'notification');
  const tag = notifType + '-' + (data.data?.message_id || data.data?.id || Date.now());

  const options = {
    body: data.body || '새 알림이 있습니다.',
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: tag,
    requireInteraction: true,    // 사용자가 확인할 때까지 유지 (카카오톡 방식)
    renotify: true,              // 같은 tag라도 새 알림이면 다시 표시
    silent: false,               // 시스템 소리 허용
    vibrate: [200, 100, 200],    // 진동 패턴 (모바일)
    data: data.data || {},
    actions: getActions(notifType),
  };

  badgeCount++;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || '알림', options),
      // 앱 아이콘 배지 업데이트 (지원 브라우저만)
      navigator.setAppBadge
        ? navigator.setAppBadge(badgeCount).catch(() => {})
        : Promise.resolve(),
    ])
  );
});

// 알림 타입별 액션 버튼 정의
function getActions(type) {
  if (type === 'chat-message' || type === 'message' || type === 'mention') {
    return [{ action: 'open', title: '채팅 열기' }];
  }
  if (type === 'approval') {
    return [
      { action: 'open', title: '결재 확인' },
      { action: 'dismiss', title: '닫기' },
    ];
  }
  return [{ action: 'open', title: '확인' }];
}

// 2. 알림 클릭 처리 — 타입별 URL 라우팅 (카카오톡처럼 해당 화면 바로 열기)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // 배지 감소
  if (badgeCount > 0) badgeCount--;
  if (badgeCount === 0 && navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  } else if (navigator.setAppBadge && badgeCount > 0) {
    navigator.setAppBadge(badgeCount).catch(() => {});
  }

  const action = event.action;
  if (action === 'dismiss') return;

  const data = event.notification.data || {};
  const tag = event.notification.tag || '';
  const baseUrl = self.registration.scope.replace(/\/$/, '');

  // 타입 판단 (tag 접두어 또는 data.type 기반)
  let targetUrl = baseUrl + '/main';

  if (tag.startsWith('chat-message') || tag.startsWith('message') || tag.startsWith('mention') || data.room_id) {
    // 채팅 → 해당 채팅방 바로 오픈
    const roomId = data.room_id || '';
    targetUrl = roomId
      ? baseUrl + '/main?open_chat_room=' + encodeURIComponent(roomId)
      : baseUrl + '/main?open_menu=채팅';
  } else if (tag.startsWith('approval') || data.type === 'approval') {
    // 전자결재 → 결재함 바로 오픈
    targetUrl = baseUrl + '/main?open_menu=전자결재';
  } else if (tag.startsWith('inventory') || data.type === 'inventory') {
    // 재고 → 재고관리 바로 오픈
    targetUrl = baseUrl + '/main?open_menu=재고관리';
  } else if (tag.startsWith('payroll') || data.type === 'payroll') {
    // 급여 → 내정보(급여) 바로 오픈
    targetUrl = baseUrl + '/main?open_menu=내정보';
  } else if (tag.startsWith('board') || data.type === 'board') {
    // 게시판 → 해당 게시물 바로 오픈
    const postId = data.post_id || '';
    const boardType = data.board_type || '공지사항';
    targetUrl = postId
      ? baseUrl + '/main?open_post=' + encodeURIComponent(postId) + '&open_board=' + encodeURIComponent(boardType)
      : baseUrl + '/main?open_menu=게시판';
  } else if (tag.startsWith('attendance') || data.type === 'attendance') {
    // 출퇴근 → 내정보
    targetUrl = baseUrl + '/main?open_menu=내정보';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 이미 열린 탭이 있으면 해당 탭을 포커스하고 URL 이동
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(baseUrl) === 0 && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(function (c) {
              return c ? c.focus() : Promise.resolve();
            });
          }
          return client.focus();
        }
      }
      // 열린 탭 없으면 새 탭 열기
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 3. 알림 닫기 이벤트 (X 버튼으로 닫을 때)
self.addEventListener('notificationclose', (event) => {
  if (badgeCount > 0) badgeCount--;
  if (badgeCount === 0 && navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
});

// 4. 백그라운드 동기 — 놓친 알림 복구
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      fetch('/api/sync-notifications')
        .then(response => response.json())
        .catch(err => console.error('동기화 실패:', err))
    );
  }
});

// 5. 서비스워커 활성화 시 기존 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
