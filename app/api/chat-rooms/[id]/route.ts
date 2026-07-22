// ============================================================
// app/api/chat-rooms/[id]/route.ts
// 채팅방 부분 업데이트 (name / members / type)
//
// 권한:
//   - 로그인 필수
//   - admin / manage_company(hr|mso|admin): 전 방 수정
//   - notice type: 로그인 사용자 메타 sync 허용
//   - 그 외: 기존 멤버만
//   - members 변경 시 타인 강퇴는 created_by 또는 특권만 (본인 퇴장은 멤버 허용)
//
// 동작: D1 chat_rooms UPDATE SET ... WHERE id = ?
//       members는 jsonb → JSON.stringify
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser, isAdminSession } from '@/lib/server-session';
import {
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';
import {
  canChangeChatRoomMembers,
  isNoticeRoomType,
  isRoomMember,
  loadChatRoomMembership,
  parseMembersField } from '@/lib/chat-room-membership';

export const dynamic = 'force-dynamic';

const PatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    members: z.array(z.string()).optional(),
    type: z.string().min(1).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field required' });

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

function isPrivilegedSession(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminSession(user)) return true;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  // d1/mutate buildClaimsFromSession 의 erp_can_manage_company 와 정합
  return Boolean(perms.admin || perms.mso || perms.hr);
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

    const room = await loadChatRoomMembership(db, roomId);
    if (!room) {
      return NextResponse.json({ ok: false, error: 'Room not found' }, { status: 404 });
    }

    const privileged = isPrivilegedSession(session?.user);
    const existingNotice = isNoticeRoomType(room.type);
    const requestedNotice = isNoticeRoomType(parsed.data.type);

    // 일반 사용자가 기존 일반 방의 type을 notice로 전환하거나 우회하려는 시도 차단
    if (requestedNotice && !existingNotice && !privileged) {
      return NextResponse.json({ ok: false, error: 'Only admins can convert room to notice type' }, { status: 403 });
    }

    const notice = existingNotice;

    if (!privileged && !notice) {
      if (!isRoomMember(room.members, currentUserId)) {
        return NextResponse.json(
          { ok: false, error: 'Not a member of this room' },
          { status: 403 },
        );
      }
    }

    // notice 방 멤버 sync는 전원 허용(클라 부팅 시 전체 staff 목록 갱신).
    // 일반 방: 타인 강퇴는 생성자/특권만.
    if (parsed.data.members !== undefined && !notice) {
      const nextMembers = parseMembersField(parsed.data.members);
      const allowed = canChangeChatRoomMembers({
        prevMembers: room.members,
        nextMembers,
        userId: currentUserId,
        createdBy: room.created_by,
        isPrivileged: privileged,
      });
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: 'Only the room creator or admin can remove other members' },
          { status: 403 },
        );
      }
    }

    await db.update(chatRoomsTable).set(setClause).where(eq(chatRoomsTable.id, roomId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
