'use client';

/**
 * 모바일 채팅 메시지 전송 직후 푸시 디스패치를 트리거한다.
 * PC 트리(기능부품/메신저전송훅 → triggerChatPush)와 동등한 역할을 모바일 트리에 제공한다.
 *
 * - fire-and-forget: 전송 UX를 막지 않는다. 실패해도 chat_push_jobs 큐 + cron/flush가 회수한다.
 * - keepalive: 전송 직후 앱이 백그라운드로 전환돼도 요청이 끊기지 않도록 한다(모바일 특화).
 *
 * 제약: JM(단일 책임), JM3(실패 격리).
 */
export function triggerMobileChatPush(roomId: string, messageId: string): void {
  const room = String(roomId || '').trim();
  const message = String(messageId || '').trim();
  if (!room || !message) return;

  try {
    void fetch('/api/notifications/chat-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ roomId: room, messageId: message }),
    }).catch(() => {
      // 트리거 실패는 무시 — 메시지 INSERT 시 적재된 chat_push_jobs 큐를 cron/flush가 회수한다.
    });
  } catch {
    // fetch 자체가 던지는 경우(드묾)도 큐 폴백에 의존.
  }
}
