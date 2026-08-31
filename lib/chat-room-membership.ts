// ============================================================
// lib/chat-room-membership.ts
// 채팅방 멤버십 검사 공용 헬퍼.
//
// quick-reply(route) 패턴을 공통화:
//   - notice type 방은 멤버 목록 예외(전원 접근)
//   - 그 외는 members JSON 배열에 userId 포함 여부
//
// 사용처: d1/mutate policies asyncGuard, chat-rooms PATCH,
//         chat/typing · read-cursors · upload, quick-reply
// ============================================================

import 'server-only';
export * from '@/lib/chat-members-parser';
import { parseMembersField } from '@/lib/chat-members-parser';

type D1Client = any;

export type ChatRoomMembership = {
  id: string;
  type: string | null;
  members: string[];
  created_by: string | null;
};

export function isNoticeRoomType(type: string | null | undefined): boolean {
  return String(type ?? '').trim() === 'notice';
}

export function isRoomMember(members: readonly string[], userId: string): boolean {
  const me = String(userId || '').trim();
  if (!me) return false;
  return members.some((m) => String(m) === me);
}

/**
 * 방 접근(메시지 전송·타이핑·커서 등): notice 예외, 그 외 멤버만.
 */
export function canAccessChatRoom(
  room: Pick<ChatRoomMembership, 'type' | 'members'>,
  userId: string,
): boolean {
  if (isNoticeRoomType(room.type)) return true;
  return isRoomMember(room.members, userId);
}

export async function loadChatRoomMembership(
  db: D1Client,
  roomId: string,
): Promise<ChatRoomMembership | null> {
  const rid = String(roomId || '').trim();
  if (!rid) return null;

  const { eq } = await import('drizzle-orm');
  const { chat_rooms } = await import('@/lib/db/schema');

  const rows = await db
    .select({
      id: chat_rooms.id,
      type: chat_rooms.type,
      members: chat_rooms.members,
      created_by: chat_rooms.created_by })
    .from(chat_rooms)
    .where(eq(chat_rooms.id, rid))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    members: parseMembersField(row.members),
    created_by: row.created_by ?? null };
}

export type ChatRoomMemberAssertResult =
  | { ok: true; room: ChatRoomMembership }
  | { ok: false; status: 403 | 404; error: string };

/**
 * 방 존재 + 멤버십(notice 예외) 검사. API 라우트에서 403/404 응답용.
 */
export async function assertChatRoomMember(
  db: D1Client,
  roomId: string,
  userId: string,
): Promise<ChatRoomMemberAssertResult> {
  const room = await loadChatRoomMembership(db, roomId);
  if (!room) {
    return { ok: false, status: 404, error: 'Room not found' };
  }
  if (!canAccessChatRoom(room, userId)) {
    return { ok: false, status: 403, error: 'Not a member of this room' };
  }
  return { ok: true, room };
}

/**
 * members 변경 시 역할 규칙:
 * - 본인만 제거(퇴장): 기존 멤버면 허용
 * - 타인 제거: created_by 또는 관리 권한 필요
 * - 추가/이름 등: 기존 멤버면 허용(호출 전에 멤버십 확인)
 *
 * prev/next 모두 string[] (정규화 후).
 */
export function canChangeChatRoomMembers(args: {
  prevMembers: readonly string[];
  nextMembers: readonly string[];
  userId: string;
  createdBy: string | null | undefined;
  isPrivileged: boolean;
}): boolean {
  if (args.isPrivileged) return true;

  const me = String(args.userId || '').trim();
  if (!me) return false;

  const prev = new Set(args.prevMembers.map(String));
  const next = new Set(args.nextMembers.map(String));

  const removed: string[] = [];
  for (const id of prev) {
    if (!next.has(id)) removed.push(id);
  }

  const removingOthers = removed.some((id) => id !== me);
  if (removingOthers) {
    const creator = String(args.createdBy ?? '').trim();
    return creator !== '' && creator === me;
  }

  return true;
}
