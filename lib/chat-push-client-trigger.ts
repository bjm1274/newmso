/**
 * 클라이언트 채팅 푸시 즉시 트리거 (PC 메신저 / 모바일 채팅 공통).
 *
 * - fire-and-forget: 전송 UX를 막지 않는다.
 * - keepalive: 전송 직후 앱이 백그라운드로 전환돼도 요청이 끊기지 않도록 한다.
 * - 실패 시 5분 cron(/api/cron/chat-push-dispatch)이 최종 회수하므로 별도 flush 호출 불필요.
 *
 * D1 비용 절감: 기존에는 chat-push + chat-push-flush 2회 호출했으나,
 * chat-push 응답 안에 flush 로직이 포함되어 있으므로 1회만 호출한다.
 */
/** fire-and-forget 이지만 호출부 타입 호환을 위해 Promise 반환 */
export async function triggerChatPush(roomId: string, messageId: string): Promise<void> {
  const room = String(roomId || '').trim();
  const message = String(messageId || '').trim();
  if (!room || !message) return;

  try {
    await fetch('/api/notifications/chat-push?flush=rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ roomId: room, messageId: message }),
    });
    // chat-push API 내부에서 flush(나머지 큐)도 함께 처리하므로 별도 flush 호출 불필요
  } catch {
    // fetch 실패 시 5분 cron(/api/cron/chat-push-dispatch)이 큐 회수
  }
}
