/**
 * /api/chat/read-cursors
 *
 * POST — 채팅방 읽음 커서(room_read_cursors) 갱신.
 *   body: { roomIds: string[]; readAt?: string }
 *
 * 클라이언트(브라우저)는 Cloudflare D1 binding에 직접 접근할 수 없다
 * (getD1Binding은 Workers 서버 전용). 메신저.tsx의 persistRoomReadCursors가
 * upsertRoomReadCursors를 클라이언트에서 직접 호출해 항상 실패 → 읽음 커서가
 * 영구 저장되지 않아 안 읽음 배지가 사라졌다 재출현하던 문제를 해결하기 위해,
 * 커서 쓰기를 이 서버 라우트에 위임한다.
 *
 * 보안: user_id는 세션에서만 취득(요청 본문 신뢰 안 함) — 타인 커서 위조 차단.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { upsertRoomReadCursors } from '@/lib/chat-read-cursors';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { canAccessChatRoom, loadChatRoomMembership } from '@/lib/chat-room-membership';

export const dynamic = 'force-dynamic';

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

  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const roomIds = Array.isArray(obj.roomIds)
    ? obj.roomIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const readAt = typeof obj.readAt === 'string' ? obj.readAt : undefined;

  if (roomIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'roomIds required' }, { status: 400 });
  }

  try {
    // 멤버십 필터: 비멤버 방 커서 쓰기를 차단. 존재하지 않거나 비멤버인 방은 제외.
    // (배치 갱신 중 일부 방만 실패해도 멤버 방 커서는 저장)
    const d1 = await getD1Binding();
    let allowedRoomIds = roomIds;
    if (d1) {
      const db = getD1Drizzle(d1);
      const filtered: string[] = [];
      for (const roomId of roomIds) {
        const room = await loadChatRoomMembership(db, roomId);
        if (room && canAccessChatRoom(room, userId)) {
          filtered.push(roomId);
        }
      }
      allowedRoomIds = filtered;
    }

    if (allowedRoomIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Not a member of any requested room' },
        { status: 403 },
      );
    }

    const result = await upsertRoomReadCursors({ userId, roomIds: allowedRoomIds, readAt });
    return NextResponse.json({ ok: result.ok, readAt: result.readAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
