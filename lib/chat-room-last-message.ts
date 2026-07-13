/**
 * 클라이언트에서 메시지 soft-delete 직후 chat_rooms 미리보기를 재계산.
 * 서버 d1/mutate refreshChatRoomLastMessage 와 동일 정책.
 */

import { db } from '@/lib/db-client';
import { invalidateChatRoomsFetchCache } from '@/app/main/기능부품/chatQueryService';

function isDeletedFlag(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function sanitizePreview(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t === '삭제된 메시지입니다.' || t.startsWith('삭제된 메시지')) return '삭제된 메시지입니다.';
  if (/^file:\/\//i.test(t) || /^blob:/i.test(t) || /^[A-Za-z]:[\\/]/.test(t)) return '파일';
  if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|zip|hwp)(\?|#|$)/i.test(t)) {
    return '파일';
  }
  return t.slice(0, 80);
}

export type RoomPreviewResult = {
  preview: string | null;
  last_message_at: string | null;
};

/**
 * room 의 최신 non-deleted 메시지로 last_message / last_message_preview 갱신.
 * 반환값으로 로컬 rooms state 도 즉시 패치 가능.
 */
export async function recomputeChatRoomLastMessageClient(
  roomId: string,
): Promise<RoomPreviewResult> {
  const rid = String(roomId || '').trim();
  if (!rid) return { preview: null, last_message_at: null };

  const { data: rows, error } = await db
    .from('messages')
    .select('content, file_name, file_url, created_at, is_deleted')
    .eq('room_id', rid)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[recomputeChatRoomLastMessageClient]', error);
  }

  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  // 시간 내림차순 limit 50 — 첫 건이 최신
  const latestAny = list[0];

  let preview: string | null = null;
  let at: string | null = null;

  if (latestAny) {
    at = typeof latestAny.created_at === 'string' ? latestAny.created_at : null;
    const deleted =
      isDeletedFlag(latestAny.is_deleted) ||
      String(latestAny.content ?? '').trim() === '삭제된 메시지입니다.' ||
      String(latestAny.content ?? '').trim().startsWith('삭제된 메시지');
    if (deleted) {
      // 최신 메시지가 삭제됨 → 목록에 반드시 삭제 문구 표시
      preview = '삭제된 메시지입니다.';
    } else {
      const c = String(latestAny.content ?? '').trim();
      if (c) preview = sanitizePreview(c);
      else if (latestAny.file_name) preview = sanitizePreview(String(latestAny.file_name));
      else if (latestAny.file_url) preview = '파일';
      else preview = '메시지';
    }
  }

  await db
    .from('chat_rooms')
    .update({
      last_message: preview,
      last_message_preview: preview,
      last_message_at: at,
    })
    .eq('id', rid);

  invalidateChatRoomsFetchCache();
  return { preview, last_message_at: at };
}
