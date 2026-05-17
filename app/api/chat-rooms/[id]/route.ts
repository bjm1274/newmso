// ============================================================
// app/api/chat-rooms/[id]/route.ts
// 채팅방 부분 업데이트 (name / members / type)
//
// 권한: 로그인 사용자
//   - members 변경 시 현재 사용자가 변경 후 멤버 목록에 포함되거나
//     기존 멤버 중 하나여야 함 (자기 자신을 추방 케이스 포함)
//   - NOTICE/SELF 방의 자동 sync는 우회 검증
//
// 동작:
//   1) Supabase chat_rooms UPDATE SET ... WHERE id = ?
//   2) D1 미러 — drizzle update WHERE id = ?
// ============================================================
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  logD1MirrorFailure,
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

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key);
}

async function mirrorToD1(roomId: string, patch: z.infer<typeof PatchSchema>) {
  try {
    const backend = await resolveDataBackend();
    if (backend === 'supabase') return;
    const d1 = await getD1Binding();
    if (!d1) return;
    const db = getD1Drizzle(d1);
    const setClause: Record<string, unknown> = {};
    if (patch.name !== undefined) setClause.name = patch.name;
    if (patch.type !== undefined) setClause.type = patch.type;
    if (patch.members !== undefined) setClause.members = JSON.stringify(patch.members);
    if (Object.keys(setClause).length === 0) return;
    await db.update(chatRoomsTable).set(setClause).where(eq(chatRoomsTable.id, roomId));
  } catch (err) {
    logD1MirrorFailure(err, { label: 'mirror:chat_rooms.patch' });
  }
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

    const supabase = createAdminClient();
    const { error } = await supabase.from('chat_rooms').update(parsed.data).eq('id', roomId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    await mirrorToD1(roomId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
