import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  room_read_cursors as roomReadCursorsTable,
  eq,
  and,
} from '@/lib/db';

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

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[chat-read-cursors] D1 binding not available (upsertRoomReadCursors)');
    const db = getD1Drizzle(d1);
    try {
      // D1에서 onConflict(user_id, room_id) upsert: 각 room 순차 처리
      for (const roomId of roomIds) {
        const existing = await db
          .select({ id: roomReadCursorsTable.id })
          .from(roomReadCursorsTable)
          .where(
            and(
              eq(roomReadCursorsTable.user_id, userId),
              eq(roomReadCursorsTable.room_id, roomId),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(roomReadCursorsTable)
            .set({ last_read_at: readAt })
            .where(
              and(
                eq(roomReadCursorsTable.user_id, userId),
                eq(roomReadCursorsTable.room_id, roomId),
              ),
            );
        } else {
          await db.insert(roomReadCursorsTable).values({
            id: crypto.randomUUID(),
            user_id: userId,
            room_id: roomId,
            last_read_at: readAt,
          });
        }
      }
      return { ok: true, roomIds, readAt, error: null };
    } catch (error) {
      console.warn('room_read_cursors d1 upsert failed', error);
      return { ok: false, roomIds, readAt, error };
    }
  }

  // 기존 Supabase 경로 — dual-write 모드에서 그대로 사용
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
