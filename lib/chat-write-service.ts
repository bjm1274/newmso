import { withMissingColumnsFallback } from './supabase-compat';
import {
  getD1Binding,
  getD1Drizzle,
  chat_push_jobs as chatPushJobsTable,
} from '@/lib/db';

// ============================================================
// chat-upload-constants
// ============================================================
export const CHAT_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;   // 200 MB
export const CHAT_MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

// ============================================================
// chat-message-write
// ============================================================
const MESSAGE_INSERT_OPTIONAL_COLUMNS = [
  'file_name',
  'file_size_bytes',
  'file_kind',
  'reply_to_id',
  'album_id',
  'album_index',
  'album_total',
];

type ChatMessageWriteClient = {
  from: (table: string) => any;
};

export async function insertChatMessageWithFallback<
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  client: ChatMessageWriteClient,
  payload: Record<string, unknown>,
  selectClause = '*',
) {
  const result = await withMissingColumnsFallback<TData>(
    (omittedColumns) => {
      const fallbackPayload = { ...payload };
      omittedColumns.forEach((column) => {
        delete fallbackPayload[column];
      });
      return client.from('messages').insert([fallbackPayload]).select(selectClause).single();
    },
    MESSAGE_INSERT_OPTIONAL_COLUMNS,
  );

  // 서버 측 D1 mutate route가 메시지 INSERT 직후 updateChatRoomLastMessage를
  // fire-and-forget으로 실행하므로, 클라이언트에서 별도로 chat_rooms를 UPDATE할
  // 필요가 없다. 전송 훅(PC)과 data-hooks(모바일)에서 setChatRooms로 로컬 상태를
  // 즉시 갱신하고, 폴링이 DB 값을 회수하는 구조.

  return result;
}

// ============================================================
// chat-push-enqueue
// ============================================================
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
      attempt_count: 0,
    })
    .onConflictDoNothing({ target: chatPushJobsTable.message_id });
}

// ============================================================
// chat-rooms-client
// ============================================================
export interface ChatRoomCreatePayload {
  id?: string;
  name: string;
  type: string;
  members?: string[];
  created_by?: string | null;
  is_announcement?: boolean;
}

export interface ChatRoomPatchPayload {
  name?: string;
  members?: string[];
  type?: string;
}

export interface ChatRoomRow {
  id: string;
  name: string | null;
  type: string | null;
  members: unknown;
  created_by: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_message: string | null;
  last_message_preview: string | null;
  member_ids: unknown;
  is_announcement: boolean | null;
}

type ApiResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function createOrUpsertChatRoom(
  payload: ChatRoomCreatePayload,
): Promise<{ ok: boolean; room?: ChatRoomRow; error?: string }> {
  const res = await fetch('/api/chat-rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{ ok?: boolean; room?: ChatRoomRow; error?: string }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  }
  return { ok: true, room: data.room };
}

export async function patchChatRoom(
  roomId: string,
  patch: ChatRoomPatchPayload,
): Promise<ApiResult> {
  const res = await fetch(`/api/chat-rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
    credentials: 'same-origin',
  });
  const data = await readJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}
