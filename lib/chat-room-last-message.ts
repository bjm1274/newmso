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
  const latest = list.find((r) => {
    if (isDeletedFlag(r.is_deleted)) return false;
    const c = String(r.content ?? '').trim();
    if (c === '삭제된 메시지입니다.' || c.startsWith('삭제된 메시지')) return false;
    return true;
  });

  let preview: string | null = null;
  let at: string | null = null;

  if (latest) {
    const c = String(latest.content ?? '').trim();
    if (c) preview = sanitizePreview(c);
    else if (latest.file_name) preview = sanitizePreview(String(latest.file_name));
    else if (latest.file_url) preview = '파일';
    else preview = '메시지';
    at = typeof latest.created_at === 'string' ? latest.created_at : null;
  } else if (list.some((r) => isDeletedFlag(r.is_deleted) || String(r.content ?? '').includes('삭제된 메시지'))) {
    // 전부 삭제 — 빈 미리보기(삭제 문구를 계속 보여 혼란을 주지 않음)
    preview = null;
    at = null;
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
