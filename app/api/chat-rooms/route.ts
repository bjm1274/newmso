// ============================================================
// app/api/chat-rooms/route.ts
// 채팅방 생성/upsert
//
// 권한: 로그인 사용자
// 동작:
//   1) body.id가 있으면: Supabase upsert (id 충돌 시 name/type/members
//      update). NOTICE/SELF 방 idempotent 처리에 사용.
//   2) body.id가 없으면: Supabase insert (id 자동 생성, created_by는
//      세션 user.id)
//   3) D1 미러 — members/member_ids jsonb → text 변환
//
// Phase 2.11 — 클라이언트 supabase.from('chat_rooms').insert/update
// 호출 제거를 위한 신규 라우트
// ============================================================
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  mirrorRowsToD1,
  chat_rooms as chatRoomsTable,
  sql,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  members: z.array(z.string()).optional(),
  created_by: z.string().nullable().optional(),
  is_announcement: z.boolean().optional(),
});

type ChatRoomPayload = z.infer<typeof PayloadSchema>;

const SELECT_FIELDS =
  'id, name, type, members, created_by, created_at, last_message_at, last_message, last_message_preview, member_ids, is_announcement';

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

function buildInsertRow(payload: ChatRoomPayload, currentUserId: string) {
  const row: Record<string, unknown> = {
    name: payload.name,
    type: payload.type,
    members: payload.members ?? [],
    created_by: payload.created_by ?? currentUserId,
  };
  if (payload.id) row.id = payload.id;
  if (typeof payload.is_announcement === 'boolean') {
    row.is_announcement = payload.is_announcement;
  }
  return row;
}

async function mirrorToD1(row: Record<string, unknown>) {
  await mirrorRowsToD1(
    chatRoomsTable,
    {
      id: String(row.id),
      name: (row.name as string | null | undefined) ?? null,
      type: (row.type as string | null | undefined) ?? null,
      members:
        row.members === null || row.members === undefined
          ? null
          : JSON.stringify(row.members),
      is_announcement: row.is_announcement ? 1 : 0,
      created_by: (row.created_by as string | null | undefined) ?? null,
      created_at:
        typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      last_message_at: (row.last_message_at as string | null | undefined) ?? null,
      last_message: (row.last_message as string | null | undefined) ?? null,
      last_message_preview: (row.last_message_preview as string | null | undefined) ?? null,
      member_ids:
        row.member_ids === null || row.member_ids === undefined
          ? null
          : JSON.stringify(row.member_ids),
    },
    {
      label: 'mirror:chat_rooms.upsert',
      onConflict: 'update',
      target: [chatRoomsTable.id],
      set: {
        name: sql`excluded.name`,
        type: sql`excluded.type`,
        members: sql`excluded.members`,
        is_announcement: sql`excluded.is_announcement`,
        last_message_at: sql`excluded.last_message_at`,
        last_message: sql`excluded.last_message`,
        last_message_preview: sql`excluded.last_message_preview`,
        member_ids: sql`excluded.member_ids`,
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const currentUserId = userId(session?.user);
    if (!currentUserId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const insertRow = buildInsertRow(parsed.data, currentUserId);
    const hasFixedId = Boolean(parsed.data.id);

    if (hasFixedId) {
      // idempotent upsert (NOTICE/SELF 방 같은 fixed-id 케이스)
      const upsertResult = await supabase
        .from('chat_rooms')
        .upsert(insertRow, { onConflict: 'id' })
        .select(SELECT_FIELDS)
        .maybeSingle();
      if (upsertResult.error || !upsertResult.data) {
        return NextResponse.json(
          { ok: false, error: upsertResult.error?.message || 'Upsert failed' },
          { status: 500 },
        );
      }
      await mirrorToD1(upsertResult.data as Record<string, unknown>);
      return NextResponse.json({ ok: true, room: upsertResult.data });
    }

    const insertResult = await supabase
      .from('chat_rooms')
      .insert([insertRow])
      .select(SELECT_FIELDS)
      .single();
    if (insertResult.error || !insertResult.data) {
      return NextResponse.json(
        { ok: false, error: insertResult.error?.message || 'Insert failed' },
        { status: 500 },
      );
    }
    await mirrorToD1(insertResult.data as Record<string, unknown>);
    return NextResponse.json({ ok: true, room: insertResult.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
