/**
 * chat_push_jobs 큐 적재 전용 경량 헬퍼.
 *
 * 책임 분리 이유: lib/chat-push-dispatch.ts 는 FCM/WebPush 암호화(node:crypto, web-push)
 * 의존성이 무거워, 메시지 INSERT 핫패스(app/api/d1/mutate)에 그대로 끌어오면
 * 번들/콜드스타트 비용이 커진다. 적재는 D1 insert만 필요하므로 이 모듈로 분리한다.
 *
 * 배경: 과거 Supabase 시절 messages AFTER INSERT 트리거(enqueue_chat_push_job)가
 * 큐를 채웠으나 D1 컷오버 후 사라졌다. 그 결과 큐가 영구히 비어 즉시발송 실패 시
 * 재시도/폴백이 전무했다. 이 헬퍼를 메시지 INSERT 경로에서 호출해 동등성을 복원한다.
 */
import {
  getD1Binding,
  getD1Drizzle,
  chat_push_jobs as chatPushJobsTable } from '@/lib/db';

export async function enqueueChatPushJob(params: {
  messageId: string;
  roomId: string;
  senderId?: string | null;
}): Promise<void> {
  const messageId = String(params.messageId || '').trim();
  const roomId = String(params.roomId || '').trim();
  if (!messageId || !roomId) return;

  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  const nowIso = new Date().toISOString();

  // message_id UNIQUE(idx_chat_push_jobs_message_id) — 중복 적재는 무시.
  // next_attempt_at=now 로 즉시 ready 상태가 되어야 cron/flush 의 lte(next_attempt_at, now) 에 잡힌다.
  await db
    .insert(chatPushJobsTable)
    .values({
      id: crypto.randomUUID(),
      message_id: messageId,
      room_id: roomId,
      sender_id: params.senderId ? String(params.senderId).trim() || null : null,
      created_at: nowIso,
      next_attempt_at: nowIso,
      attempt_count: 0 })
    .onConflictDoNothing({ target: chatPushJobsTable.message_id });
}
