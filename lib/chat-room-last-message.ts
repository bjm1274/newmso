/**
 * 메시지 soft-delete 직후 chat_rooms 미리보기를 클라이언트 상태에 반영.
 *
 * 8차 D06-015: 예전에는 이 함수가 messages 50건을 직접 내려받아 미리보기를 **재계산하고
 * chat_rooms 를 직접 UPDATE** 했다. 그런데 같은 재계산이 서버 mutate 경로에도 있다 —
 * `/api/d1/mutate` 는 `payload.table === 'messages'` 인 update/delete 마다
 * `refreshChatRoomLastMessage` 를 호출한다(`route.ts:867-881`). 즉 삭제 요청이 끝난 시점에
 * 서버는 이미 값을 갱신했고, 클라이언트 UPDATE 는 그 위에 **다른 규칙으로 덮어쓰는** 두 번째
 * 쓰기였다(실측 차이: 파일만 있는 메시지 '파일' vs '(file)' 등 3건).
 *
 * 규칙 자체는 lib/chat-room-preview 로 통합해 서버가 쓰게 했고, 여기서는 서버가 확정한
 * 값을 한 번 읽어 로컬 사이드바만 맞춘다. 쓰기는 하지 않는다.
 */

import { db } from '@/lib/db-client';
import { invalidateChatRoomsFetchCache } from '@/app/main/기능부품/chatQueryService';

export type RoomPreviewResult = {
  preview: string | null;
  last_message_at: string | null;
};

export async function recomputeChatRoomLastMessageClient(
  roomId: string,
): Promise<RoomPreviewResult> {
  const rid = String(roomId || '').trim();
  if (!rid) return { preview: null, last_message_at: null };

  invalidateChatRoomsFetchCache();

  const { data: rows, error } = await db
    .from('chat_rooms')
    .select('last_message_preview, last_message, last_message_at')
    .eq('id', rid)
    .limit(1);

  if (error) {
    console.error('[recomputeChatRoomLastMessageClient]', error);
    return { preview: null, last_message_at: null };
  }

  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | null;
  if (!row) return { preview: null, last_message_at: null };

  const preview =
    typeof row.last_message_preview === 'string'
      ? row.last_message_preview
      : typeof row.last_message === 'string'
        ? row.last_message
        : null;

  return {
    preview,
    last_message_at: typeof row.last_message_at === 'string' ? row.last_message_at : null };
}
