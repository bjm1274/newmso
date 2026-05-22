import {
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

/**
 * 읽음 커서 시각을 D1(SQLite) CURRENT_TIMESTAMP와 동일한 "YYYY-MM-DD HH:MM:SS"
 * UTC 형식으로 정규화한다. messages.created_at(D1 기본값)과 형식을 맞춰야
 * 안 읽음 집계의 문자열 비교(created_at > last_read_at)가 올바르게 동작한다.
 * ISO("...Z") 입력은 UTC 기준으로 변환한다.
 */
function toUtcSqlTimestamp(value?: string | null): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return base.toISOString().slice(0, 19).replace('T', ' ');
}

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
  params: {
    userId: string | null | undefined;
    roomIds: Array<string | null | undefined>;
    readAt?: string | null;
  },
): Promise<RoomReadCursorWriteResult> {
  const userId = String(params.userId || '').trim();
  const roomIds = normalizeRoomReadCursorIds(params.roomIds);
  const readAt = toUtcSqlTimestamp(params.readAt);

  if (!userId || roomIds.length === 0) {
    return {
      ok: false,
      roomIds,
      readAt,
      error: null,
    };
  }

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
