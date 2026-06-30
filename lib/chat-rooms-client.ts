// ============================================================
// lib/chat-rooms-client.ts
// 클라이언트가 chat_rooms를 변경할 때 사용하는 fetch 래퍼.
//
// Phase 2.11 — 클라이언트가 db.from('chat_rooms').insert/update를
// 직접 호출하던 곳을 이 헬퍼로 위임. 서버 라우트가 dual-write 미러를
// 책임진다.
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
    credentials: 'same-origin' });
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
    credentials: 'same-origin' });
  const data = await readJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}
