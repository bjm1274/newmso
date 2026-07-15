/**
 * 클라이언트 채팅 푸시 즉시 트리거 (PC 메신저 / 모바일 채팅 공통).
 *
 * - fire-and-forget: 전송 UX를 막지 않는다.
 * - keepalive: 전송 직후 앱이 백그라운드로 전환돼도 요청이 끊기지 않도록 한다.
 * - 실패 시 chat-push-flush 폴백. 서버 d1/mutate 의 chat_push_jobs enqueue + cron 이 최종 회수.
 *
 * enqueue 자체는 서버 전용 `@/lib/chat-push-enqueue` (d1/mutate 핫패스)에서만 수행한다.
 */
/** fire-and-forget 이지만 호출부 타입 호환을 위해 Promise 반환 */
export async function triggerChatPush(roomId: string, messageId: string): Promise<void> {
  const room = String(roomId || '').trim();
  const message = String(messageId || '').trim();
  if (!room || !message) return;

  try {
    const res = await fetch('/api/notifications/chat-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ roomId: room, messageId: message }),
    });
    // 성공/실패 모두 소량 flush (서버 enqueue + cron 이 최종 회수)
    void fetch('/api/notifications/chat-push-flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ limit: res.ok ? 5 : 8 }),
    }).catch(() => {});
  } catch {
    // fetch 자체가 던지는 경우도 서버 enqueue + cron 이 회수.
    try {
      void fetch('/api/notifications/chat-push-flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ limit: 8 }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  }
}
