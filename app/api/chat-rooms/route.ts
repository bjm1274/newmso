// ============================================================
// app/api/chat-rooms/route.ts
// 채팅방 생성/upsert
//
// 권한: 로그인 사용자
// 동작:
//   1) body.id가 있으면: D1 insert + onConflictDoUpdate (NOTICE/SELF 방
//      같은 fixed-id 케이스 idempotent 처리)
//   2) body.id가 없으면: D1 insert with crypto.randomUUID() (created_by는
//      세션 user.id)
//   3) D1 drizzle .returning() 으로 클라이언트 호환 row 반환
//
// Phase 8-E — service-role db 의존 제거. chat_rooms 쓰기는 D1을
// primary 로 한다 (RLS 우회 자동). 외부 시그니처(createOrUpsertChatRoom)는
// 변경 없음.
// members/member_ids 는 jsonb → text(JSON.stringify) 변환.
// ============================================================
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import {
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  sql } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  members: z.array(z.string()).optional(),
  created_by: z.string().nullable().optional(),
  is_announcement: z.boolean().optional() });

type ChatRoomPayload = z.infer<typeof PayloadSchema>;

// D1 binding 필수 — Workers env 가 없으면 throw.
async function requireD1ForChatRooms(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[chat_rooms] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

type ChatRoomInsert = typeof chatRoomsTable.$inferInsert;
type ChatRoomSelect = typeof chatRoomsTable.$inferSelect;

function buildD1Row(payload: ChatRoomPayload, currentUserId: string): ChatRoomInsert {
  return {
    id: payload.id ?? crypto.randomUUID(),
    name: payload.name,
    type: payload.type,
    // members는 D1 스키마에서 text — 배열을 JSON 문자열로 직렬화
    members: JSON.stringify(payload.members ?? []),
    created_by: currentUserId,
    is_announcement: payload.is_announcement ? 1 : 0,
    created_at: new Date().toISOString() };
}

/** 멤버 집합을 순서·중복과 무관한 키로. 같은 대화면 같은 값이 나온다. */
function directMembersKey(members: unknown): string | null {
  let list: unknown = members;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const ids = Array.from(
    new Set(list.map((m) => String(m ?? '').trim()).filter(Boolean)),
  ).sort();
  return ids.length > 0 ? ids.join('|') : null;
}

/**
 * 같은 멤버 조합의 direct 방이 이미 있으면 그것을 돌려준다.
 *
 * 유일성이 클라이언트에만, 그것도 "조회 후 생성" 이라 레이스에 열려 있었다.
 * 그 결과 같은 상대와의 1:1 방이 계속 새로 생겼다 — 2026-08-27 실측 여분 159개,
 * 한 사람의 자기 대화방이 42개, 1초 차이로 생긴 쌍도 있다(9차 P-07).
 * PC·모바일에 각각 생성 경로가 있어 클라이언트 쪽만 고쳐서는 막히지 않는다.
 *
 * 서버에서 한 번 더 확인해 다중 경로·캐시 지연으로 인한 중복을 없앤다.
 *
 * **레이스까지 막으려면** members 정규화 키 컬럼 + UNIQUE 인덱스가 필요한데,
 * 기존 중복 159건이 남아 있는 한 그 인덱스를 만들 수 없다. 병합이 선행돼야 한다.
 */
async function findReusableDirectRoom(
  db: Awaited<ReturnType<typeof requireD1ForChatRooms>>,
  payload: ChatRoomPayload,
): Promise<ChatRoomSelect | null> {
  if (String(payload.type || '').toLowerCase() !== 'direct') return null;
  const wantedKey = directMembersKey(payload.members);
  if (!wantedKey) return null;

  const rows = (await db
    .select()
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.type, 'direct'))) as ChatRoomSelect[];

  const matches = rows.filter((row) => directMembersKey(row.members) === wantedKey);
  if (matches.length === 0) return null;

  // 여러 개면 가장 최근 활동한 방을 고른다 — 목록 화면의 dedup 규칙과 같다.
  const activityOf = (row: ChatRoomSelect) =>
    String(row.last_message_at || row.created_at || '').replace('T', ' ').slice(0, 19);
  return matches.reduce((best, row) => (activityOf(row) > activityOf(best) ? row : best));
}

// 클라이언트 호환을 위해 row의 jsonb-유사 필드(members/member_ids)를 parse 해서 반환.
function presentRoomRow(row: ChatRoomSelect): Record<string, unknown> {
  const parseJson = (raw: string | null | undefined): unknown => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
  return {
    id: row.id,
    name: row.name ?? null,
    type: row.type ?? null,
    members: parseJson(row.members),
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? null,
    last_message_at: row.last_message_at ?? null,
    last_message: row.last_message ?? null,
    last_message_preview: row.last_message_preview ?? null,
    member_ids: parseJson(row.member_ids),
    is_announcement: Boolean(row.is_announcement) };
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

    const admin = isAdminSession(session?.user);
    const requestedNotice =
      String(parsed.data.type || '').toLowerCase() === 'notice' ||
      parsed.data.is_announcement === true;
    if (requestedNotice && !admin) {
      return NextResponse.json({ ok: false, error: 'Notice chat room can only be created by admins' }, { status: 403 });
    }
    if (!admin && !parsed.data.members?.some((member) => String(member).trim() === currentUserId)) {
      return NextResponse.json({ ok: false, error: 'The room creator must be a member' }, { status: 400 });
    }

    const db = await requireD1ForChatRooms('POST');
    const insertRow = buildD1Row(parsed.data, currentUserId);
    const hasFixedId = Boolean(parsed.data.id);

    if (hasFixedId) {
      const fixedId = String(parsed.data.id || '').trim();
      const existingRows = await db
        .select({ created_by: chatRoomsTable.created_by, type: chatRoomsTable.type })
        .from(chatRoomsTable)
        .where(eq(chatRoomsTable.id, fixedId))
        .limit(1);
      const existing = existingRows[0];
      const isNoticeTarget =
        fixedId === '00000000-0000-0000-0000-000000000000' ||
        String(parsed.data.type || '').toLowerCase() === 'notice' ||
        String(existing?.type || '').toLowerCase() === 'notice';
      if (isNoticeTarget && !admin) {
        return NextResponse.json({ ok: false, error: 'Notice chat room can only be modified by admins' }, { status: 403 });
      }
      if (existing && !admin && String(existing.created_by || '').trim() !== currentUserId) {
        return NextResponse.json({ ok: false, error: 'Only the room creator can update this room' }, { status: 403 });
      }

      // idempotent upsert (NOTICE/SELF 방 같은 fixed-id 케이스)
      const upserted = await db
        .insert(chatRoomsTable)
        .values(insertRow)
        .onConflictDoUpdate({
          target: chatRoomsTable.id,
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            members: sql`excluded.members`,
            is_announcement: sql`excluded.is_announcement` } })
        .returning();

      const row = upserted[0];
      if (!row) {
        return NextResponse.json({ ok: false, error: 'Upsert returned no row' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, room: presentRoomRow(row) });
    }

    // 같은 멤버 조합의 direct 방이 이미 있으면 새로 만들지 않고 그것을 돌려준다.
    const reusable = await findReusableDirectRoom(db, parsed.data);
    if (reusable) {
      return NextResponse.json({ ok: true, room: presentRoomRow(reusable), reused: true });
    }

    const inserted = await db.insert(chatRoomsTable).values(insertRow).returning();
    const row = inserted[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Insert returned no row' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, room: presentRoomRow(row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
