/**
 * /api/chat/unread-counts
 *
 * POST — 방별 안 읽은 메시지 수를 서버에서 집계해 돌려준다.
 *   body: { rooms: Array<{ roomId: string; cursor?: string | null }> }
 *   resp: { ok: true, counts: Record<roomId, number> }
 *
 * 왜 라우트가 따로 필요한가:
 * 클라이언트 D1 게이트웨이(/api/d1/query)는 컬럼 화이트리스트(`^[a-zA-Z_]\w*$`)만
 * 허용해 COUNT/GROUP BY 를 쓸 수 없다. 그래서 모바일·PC 모두 안 읽은 메시지의
 * **행 자체를 전부 내려받아** 클라이언트에서 세고 있었다(1000행씩 페이징).
 * 메시지 1800건짜리 방이면 배지 숫자 하나 그리려고 1800행을 받는다 —
 * 그것도 방 목록 폴링마다 5초 간격으로. 집계는 DB 가 할 일이다.
 *
 * 보안:
 *  - user_id 는 세션에서만 취득한다(본문 신뢰 안 함).
 *  - 요청한 방마다 멤버십을 확인하고, 비멤버 방은 결과에서 제외한다.
 *  - D1 바인딩이 없으면 fail-closed (멤버십 검증 불가 → 거부).
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import { canAccessChatRoom, parseMembersField } from '@/lib/chat-room-membership';

export const dynamic = 'force-dynamic';

/** 한 요청에서 집계할 수 있는 방 수 상한 — 무제한 IN 절을 막는다. */
const MAX_ROOMS = 300;

type RoomRequest = { roomId: string; cursor: string | null };

function parseRooms(value: unknown): RoomRequest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RoomRequest[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const roomId = String(row.roomId ?? '').trim();
    if (!roomId || seen.has(roomId)) continue;
    seen.add(roomId);
    const cursorRaw = row.cursor;
    const cursor = typeof cursorRaw === 'string' && cursorRaw.trim() ? cursorRaw.trim() : null;
    out.push({ roomId, cursor });
    if (out.length >= MAX_ROOMS) break;
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await readSessionFromRequest(req);
  const userId = String(session?.user?.id ?? session?.user?.user_id ?? '').trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const rooms = parseRooms((body as Record<string, unknown> | null)?.rooms);
  if (rooms.length === 0) {
    return NextResponse.json({ ok: true, counts: {} });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    console.error('[chat/unread-counts] D1 binding 없음 — 멤버십 검증 불가로 거부');
    return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
  }

  try {
    /*
     * 멤버십은 한 번에 확인한다.
     *
     * 처음에는 방마다 loadChatRoomMembership 을 await 했다. 방이 40개면 워커
     * 안에서 D1 왕복이 40번, 그것도 방 목록 폴링마다 5초 간격으로 — 행을
     * 내려받던 예전보다 오히려 느려졌다. IN 한 문장으로 받는다.
     */
    const roomIds = rooms.map((room) => room.roomId);
    const placeholders = roomIds.map(() => '?').join(', ');
    const membershipRows = await d1
      .prepare(`SELECT id, type, members FROM chat_rooms WHERE id IN (${placeholders})`)
      .bind(...roomIds)
      .all<{ id: string; type: string | null; members: unknown }>();

    const membershipById = new Map<string, { type: string | null; members: string[] }>();
    for (const row of membershipRows.results ?? []) {
      membershipById.set(String(row.id), {
        type: row.type ?? null,
        members: parseMembersField(row.members) });
    }

    const allowed = rooms.filter((room) => {
      const membership = membershipById.get(room.roomId);
      return Boolean(membership) && canAccessChatRoom(membership!, userId);
    });
    if (allowed.length === 0) {
      return NextResponse.json({ ok: true, counts: {} });
    }

    // 커서가 있는 방과 없는 방을 한 문장에서 함께 센다.
    //   (room_id = ? AND created_at > ?)  또는  (room_id = ?)
    // 파라미터 바인딩만 쓴다 — roomId·커서를 SQL 에 문자열로 붙이지 않는다.
    const clauses: string[] = [];
    const binds: string[] = [];
    for (const room of allowed) {
      if (room.cursor) {
        clauses.push('(room_id = ? AND created_at > ?)');
        binds.push(room.roomId, room.cursor);
      } else {
        clauses.push('(room_id = ?)');
        binds.push(room.roomId);
      }
    }

    // sender_id 는 공지방 자동공지(휴가·생일·게시판 브로드캐스트)에서 NULL 이다.
    // SQL 3값 논리로 `NULL <> 'uid'` 는 참이 아니라 UNKNOWN 이라, 그냥 `sender_id <> ?`
    // 로 두면 자동공지가 안읽음 집계에서 통째로 빠진다(10차 CHAT-01 — 공지방 커서 보유
    // 45명 전원에서 누적 1,225건 누락). 내가 보낸 것이 아닌 것을 세는 것이 원래 의도이므로
    // NULL 발신자는 포함해야 한다.
    const sql =
      'SELECT room_id, COUNT(*) AS n FROM messages' +
      ' WHERE is_deleted = 0 AND (sender_id IS NULL OR sender_id <> ?)' +
      ` AND (${clauses.join(' OR ')})` +
      ' GROUP BY room_id';

    const result = await d1
      .prepare(sql)
      .bind(userId, ...binds)
      .all<{ room_id: string; n: number }>();

    const counts: Record<string, number> = {};
    for (const room of allowed) counts[room.roomId] = 0;
    for (const row of result.results ?? []) {
      const roomId = String(row.room_id ?? '').trim();
      if (roomId in counts) counts[roomId] = Number(row.n) || 0;
    }

    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[chat/unread-counts]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
