import type { SupabaseClient } from '@supabase/supabase-js';

export type RoomReadCursorWriteResult = {
  ok: boolean;
  roomIds: string[];
  readAt: string;
  error: unknown | null;
};

export function normalizeRoomReadCursorIds(roomIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      roomIds
        .map((roomId) => String(roomId || '').trim())
        .filter(Boolean),
    ),
  );
}

export async function upsertRoomReadCursors(
  client: SupabaseClient,
  params: {
    userId: string | null | undefined;
    roomIds: Array<string | null | undefined>;
    readAt?: string | null;
  },
): Promise<RoomReadCursorWriteResult> {
  const userId = String(params.userId || '').trim();
  const roomIds = normalizeRoomReadCursorIds(params.roomIds);
  const readAt = String(params.readAt || '').trim() || new Date().toISOString();

  if (!userId || roomIds.length === 0) {
    return {
      ok: false,
      roomIds,
      readAt,
      error: null,
    };
  }

  try {
    const { error } = await client.from('room_read_cursors').upsert(
      roomIds.map((roomId) => ({
        user_id: userId,
        room_id: roomId,
        last_read_at: readAt,
      })),
      { onConflict: 'user_id,room_id' },
    );

    if (error) {
      console.warn('room_read_cursors upsert failed', error);
      return {
        ok: false,
        roomIds,
        readAt,
        error,
      };
    }

    return {
      ok: true,
      roomIds,
      readAt,
      error: null,
    };
  } catch (error) {
    console.warn('room_read_cursors upsert failed', error);
    return {
      ok: false,
      roomIds,
      readAt,
      error,
    };
  }
}
