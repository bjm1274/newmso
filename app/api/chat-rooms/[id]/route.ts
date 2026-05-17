// ============================================================
// app/api/chat-rooms/[id]/route.ts
// 채팅방 부분 업데이트 (name / members / type)
//
// 권한: 로그인 사용자
//   - members 변경 시 현재 사용자가 변경 후 멤버 목록에 포함되거나
//     기존 멤버 중 하나여야 함 (자기 자신을 추방 케이스 포함)
//   - NOTICE/SELF 방의 자동 sync는 우회 검증
//
// 동작: D1 chat_rooms UPDATE SET ... WHERE id = ?
//       members는 jsonb → JSON.stringify
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    members: z.array(z.string()).optional(),
    type: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required',
  });

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

type ChatRoomsUpdateSet = Partial<typeof chatRoomsTable.$inferInsert>;

function buildChatRoomUpdateSet(patch: z.infer<typeof PatchSchema>): ChatRoomsUpdateSet {
  const set: ChatRoomsUpdateSet = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.members !== undefined) set.members = JSON.stringify(patch.members);
  return set;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readSessionFromRequest(request);
    const currentUserId = userId(session?.user);
    if (!currentUserId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await context.params;
    const roomId = String(id || '').trim();
    if (!roomId) {
      return NextResponse.json({ ok: false, error: 'Invalid room id' }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const setClause = buildChatRoomUpdateSet(parsed.data);
    if (Object.keys(setClause).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);
    await db.update(chatRoomsTable).set(setClause).where(eq(chatRoomsTable.id, roomId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
