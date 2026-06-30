import {
  getD1Binding,
  getD1Drizzle,
  room_read_cursors as roomReadCursorsTable } from '@/lib/db';

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
      error: null };
  }

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[chat-read-cursors] D1 binding not available (upsertRoomReadCursors)');
  const db = getD1Drizzle(d1);
  try {
    // [4차 전수조사 lib-10] select-then-insert 경합 제거 → 원자적 upsert.
    // (user_id, room_id) 유니크 인덱스(migration 0014)를 충돌키로 사용. 적용 전까지는
    // 'no matching constraint' 오류가 날 수 있으므로 0014를 배포와 함께 적용할 것.
    if (roomIds.length > 0) {
      await db
        .insert(roomReadCursorsTable)
        .values(
          roomIds.map((roomId) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            room_id: roomId,
            last_read_at: readAt })),
        )
        .onConflictDoUpdate({
          target: [roomReadCursorsTable.user_id, roomReadCursorsTable.room_id],
          set: { last_read_at: readAt } });
    }
    return { ok: true, roomIds, readAt, error: null };
  } catch (error) {
    console.warn('room_read_cursors d1 upsert failed', error);
    return { ok: false, roomIds, readAt, error };
  }
}
