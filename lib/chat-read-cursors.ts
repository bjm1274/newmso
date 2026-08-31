import 'server-only';
export * from '@/lib/chat-timestamp';
import { normalizeRoomReadCursorIds, toUtcSqlTimestamp } from '@/lib/chat-timestamp';

export type RoomReadCursorWriteResult = {
  ok: boolean;
  roomIds: string[];
  readAt: string;
  error: unknown | null;
};

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
      error: null };
  }

  const { getD1Binding, getD1Drizzle, room_read_cursors } = await import('@/lib/db');
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[chat-read-cursors] D1 binding not available (upsertRoomReadCursors)');
  const db = getD1Drizzle(d1);
  try {
    // [4차 전수조사 lib-10] select-then-insert 경합 제거 → 원자적 upsert.
    // (user_id, room_id) 유니크 인덱스(migration 0014)를 충돌키로 사용. 적용 전까지는
    // 'no matching constraint' 오류가 날 수 있으므로 0014를 배포와 함께 적용할 것.
    if (roomIds.length > 0) {
      await db
        .insert(room_read_cursors)
        .values(
          roomIds.map((roomId) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            room_id: roomId,
            last_read_at: readAt })),
        )
        .onConflictDoUpdate({
          target: [room_read_cursors.user_id, room_read_cursors.room_id],
          set: { last_read_at: readAt } });
    }
    return { ok: true, roomIds, readAt, error: null };
  } catch (error) {
    console.warn('room_read_cursors d1 upsert failed', error);
    return { ok: false, roomIds, readAt, error };
  }
}
