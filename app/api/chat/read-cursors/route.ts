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
    //
    // 예전에는 `let allowedRoomIds = roomIds;`(= 전부 통과)로 시작해
    // `if (d1)` 일 때만 좁혔다. 즉 바인딩이 없으면 멤버십 필터가 통째로 사라지는
    // fail-open 구조였다. 지금은 upsertRoomReadCursors 가 D1 없이 throw 해서
    // 결과적으로 500 이 나지만, 나중에 로컬 폴백이 하나 추가되는 순간
    // 비멤버 방 커서 쓰기가 그대로 열린다. 순서를 뒤집어 fail-closed 로 둔다.
    const d1 = await getD1Binding();
    if (!d1) {
      console.error('[chat/read-cursors] D1 binding 없음 — 멤버십 검증 불가로 거부');
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const allowedRoomIds: string[] = [];
    {
      const db = getD1Drizzle(d1);
      for (const roomId of roomIds) {
        const room = await loadChatRoomMembership(db, roomId);
        if (room && canAccessChatRoom(room, userId)) {
          allowedRoomIds.push(roomId);
        }
      }
    }

    if (allowedRoomIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Not a member of any requested room' },
        { status: 403 },
      );
    }

    const result = await upsertRoomReadCursors({ userId, roomIds: allowedRoomIds, readAt });

    // 실시간 신호 발신 — 이게 없어서 상대 화면의 "안 읽음(1)" 표시가 즉시 사라지지 않았다.
    // /api/d1/mutate 를 거치지 않고 D1 에 직접 쓰는 경로라 triggerMutationSignal 이 돌지 않으므로
    // 여기서 같은 채널 규칙(room_read_cursors, room_read_cursors:room_id=eq.X, chat_rooms)으로 직접 쏜다.
    // 발신 실패가 읽음 저장 자체를 실패로 만들지 않도록 오류는 삼킨다.
    if (result.ok) {
      try {
        const { emitRealtimeSignal } = await import('@/lib/realtime/server-signal');
        const channels = ['room_read_cursors', 'chat_rooms'];
        for (const roomId of allowedRoomIds) {
          channels.push(`room_read_cursors:room_id=eq.${roomId}`);
        }
        await emitRealtimeSignal({ channels, source: 'chat-read-cursors' });
      } catch (signalErr) {
        console.error('[chat/read-cursors] realtime signal 실패 (non-fatal):', signalErr);
      }
    }

    return NextResponse.json({ ok: result.ok, readAt: result.readAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
