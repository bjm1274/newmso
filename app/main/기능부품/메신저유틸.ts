import { stripHiddenMessageMetaBlocks } from './메신저첨부';
import type { ChatRoom, StaffMember } from '@/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import { getKoreanTodayString as _getKoreanTodayStringFromSeoul } from '@/lib/seoul-time';
export { NOTICE_ROOM_ID };
export const NOTICE_ROOM_NAME = '공지사항';
export const SELF_ROOM_NAME = '나와의 채팅';
export const CAN_WRITE_NOTICE_POSITIONS = ['대표', '부장', '팀장', '실장', '병원장', '이사', '본부장', '총무부장', '진료부장', '간호부장'];
export const MOBILE_CHAT_MEDIA_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';
export const WARD_QUICK_REPLY_OPTIONS = [
  { id: 'confirm', label: '확인 후 올리겠습니다', text: '확인했습니다. 환자 확인 후 올리겠습니다.' },
  { id: 'delay', label: '준비중으로 지연', text: '현재 환자 준비 중으로 조금 지연되고 있습니다.' },
  { id: 'moving', label: '이동 시작했습니다', text: '환자 이동 시작했습니다. 곧 올리겠습니다.' },
  { id: 'after-care', label: '처치 후 올리겠습니다', text: '처치 마무리 후 바로 올리겠습니다.' },
] as const;
const WARD_MESSAGE_META_PREFIX = '[[WARD_MESSAGE_META]]';
const WARD_MESSAGE_META_SUFFIX = '[[/WARD_MESSAGE_META]]';
const POLL_META_PREFIX = '[[POLL_META]]';
const POLL_META_SUFFIX = '[[/POLL_META]]';
const RESIGNED_STATUSES = new Set(['\uD1F4\uC0AC', '\uD1F4\uC9C1']);

/**
 * 서버(D1) 타임스탬프를 Date로 파싱한다.
 * D1(SQLite)의 CURRENT_TIMESTAMP는 UTC 현재 시각 "YYYY-MM-DD HH:MM:SS" 형식으로 저장되므로
 * timezone 표기가 없는 문자열은 UTC로 간주해 '+00:00' 오프셋을 붙여 파싱해야 올바르게 현지 시간(KST)으로 렌더링됩니다.
 * 이미 'Z'·오프셋이 있는 ISO 문자열(클라이언트 optimistic 메시지 등)은 그대로 파싱.
 */
export function toChatDate(value?: string | number | null): Date {
  if (value === null || value === undefined || value === '') return new Date(0);
  if (typeof value === 'number') return new Date(value);
  const raw = String(value).trim();
  if (!raw) return new Date(0);
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
  // D1(SQLite) CURRENT_TIMESTAMP는 timezone 표기 없는 UTC 문자열
  // → +00:00 오프셋을 붙여 UTC 기준으로 파싱한다.
  if (/\d{2}:\d{2}/.test(raw)) return new Date(`${raw.replace(' ', 'T')}+00:00`);
  return new Date(raw);
}

export type WardMessageMeta = {
  type?: string;
  patient_name?: string;
  chart_no?: string;
  surgery_name?: string;
  schedule_room?: string;
  schedule_time?: string;
};

export type RoomPreference = {
  pinned?: boolean;
  hidden?: boolean;
  notifyMode?: RoomNotificationMode;
  notifyKeyword?: string;
};

export type RoomNotificationMode = 'all' | 'mention_only' | 'keyword' | 'mute';

export type ThreadPreference = {
  followed?: boolean;
  lastOpenedAt?: string | null;
};

export type MessageRetryPayload = {
  roomId: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileKind: 'image' | 'video' | 'file' | null;
  replyToId: string | null;
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
};

export type ChatMessageInsertPayload = {
  room_id: string;
  sender_id: string | null;
  content: string;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  file_kind: 'image' | 'video' | 'file' | null;
  reply_to_id: string | null;
  album_id: string | null;
  album_index: number | null;
  album_total: number | null;
};

export function isMobileChatViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_CHAT_MEDIA_QUERY).matches;
}

export function compareStaffMembers(a: StaffMember, b: StaffMember) {
  return (a.department || '').localeCompare(b.department || '') || (a.name || '').localeCompare(b.name || '');
}

export function extractWardMessageMeta(value: unknown): {
  displayContent: string;
  meta: WardMessageMeta | null;
} {
  const raw = String(value || '');
  const start = raw.indexOf(WARD_MESSAGE_META_PREFIX);
  const end = raw.indexOf(WARD_MESSAGE_META_SUFFIX);

  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: stripHiddenMessageMetaBlocks(raw),
      meta: null,
    };
  }

  const displayContent = stripHiddenMessageMetaBlocks(
    `${raw.slice(0, start)}${raw.slice(end + WARD_MESSAGE_META_SUFFIX.length)}`,
  );
  const metaText = raw.slice(start + WARD_MESSAGE_META_PREFIX.length, end).trim();

  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as WardMessageMeta,
    };
  } catch {
    return {
      displayContent,
      meta: null,
    };
  }
}

export function sortChatRoomsWithNoticeFirst(rooms: ChatRoom[]): ChatRoom[] {
  const notice = rooms.find((room: ChatRoom) => room.id === NOTICE_ROOM_ID);
  const others = rooms.filter((room: ChatRoom) => room.id !== NOTICE_ROOM_ID).sort((a: ChatRoom, b: ChatRoom) => {
    const at = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bt - at;
  });
  return notice ? [notice, ...others] : others;
}

export function normalizeMemberIds(members: unknown): string[] {
  return Array.isArray(members) ? members.map((id: unknown) => String(id)) : [];
}

export function getChatRoomParticipantCount(room: ChatRoom | null | undefined): number {
  return normalizeMemberIds(room?.members).length;
}

export function getGroupChatRoomBadgeText(value: string | null | undefined): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'GR';

  const latinTokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (latinTokens.length > 0) {
    const firstToken = latinTokens[0].toUpperCase();
    if (firstToken.length >= 2) return firstToken.slice(0, 2);

    const secondInitial = (latinTokens[1] || '').slice(0, 1).toUpperCase();
    const combined = `${firstToken}${secondInitial}`.trim();
    if (combined) return combined.slice(0, 2);
  }

  const compact = normalized.replace(/[\s.,/|()[\]{}_-]+/g, '');
  if (!compact) return 'GR';
  return Array.from(compact).slice(0, 2).join('').toUpperCase();
}

export function isGroupChatRoom(room: ChatRoom | null | undefined): boolean {
  if (!room) return false;
  if (String(room.id) === NOTICE_ROOM_ID) return false;
  if (room.type === 'group') return true;
  return getChatRoomParticipantCount(room) > 2;
}

export function isSelfChatRoom(room: ChatRoom | null | undefined, currentUserId: string | null | undefined): boolean {
  if (room?.type !== 'direct') return false;
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!normalizedCurrentUserId) return false;
  const members = normalizeMemberIds(room?.members);
  return members.length === 1 && members[0] === normalizedCurrentUserId;
}

export function isActiveChatMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (RESIGNED_STATUSES.has(status)) return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

export function isMessageReadByCursor(messageCreatedAt: string | null | undefined, lastReadAt: string | null | undefined): boolean {
  if (!messageCreatedAt || !lastReadAt) return false;
  // toChatDate로 양변을 동일 규칙(UTC)으로 파싱한다. D1의 공백 형식과
  // optimistic 메시지의 ISO-Z 형식이 섞이면 raw new Date()는 한쪽만 9시간
  // 어긋나 비교가 깨지고 읽음 표시("1")가 사라지지 않는다.
  const messageTime = toChatDate(messageCreatedAt).getTime();
  const cursorTime = toChatDate(lastReadAt).getTime();
  if (!Number.isFinite(messageTime) || !Number.isFinite(cursorTime)) return false;
  return cursorTime >= messageTime;
}

export function getLatestReadCursor(
  currentValue: string | null | undefined,
  nextValue: string | null | undefined
): string | null {
  if (!nextValue) return currentValue || null;
  if (!currentValue) return nextValue;

  const currentTime = toChatDate(currentValue).getTime();
  const nextTime = toChatDate(nextValue).getTime();
  if (!Number.isFinite(currentTime)) return Number.isFinite(nextTime) ? nextValue : currentValue;
  if (!Number.isFinite(nextTime)) return currentValue;
  return nextTime >= currentTime ? nextValue : currentValue;
}

export function isActiveNoticeMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (RESIGNED_STATUSES.has(status)) return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

export function isRecentPresenceTimestamp(value: string | null | undefined, freshnessMs = 5 * 60 * 1000): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= freshnessMs;
}

export function haveSameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function getDirectRoomMembersKey(room: ChatRoom | null | undefined): string | null {
  if (room?.type !== 'direct') return null;
  const members = normalizeMemberIds(room?.members);
  if (members.length === 0 || members.length > 2) return null;
  return [...members].sort().join('::');
}

export function getConversationRoomIdsByRoomId(
  roomId: string | null | undefined,
  rooms: ChatRoom[]
): string[] {
  const targetRoomId = String(roomId || '').trim();
  if (!targetRoomId) return [];

  const targetRoom = rooms.find((room: ChatRoom) => String(room.id) === targetRoomId) || null;
  const directRoomKey = getDirectRoomMembersKey(targetRoom);
  if (!directRoomKey) return [targetRoomId];

  const relatedRoomIds = rooms
    .filter((room: ChatRoom) => getDirectRoomMembersKey(room) === directRoomKey)
    .map((room: ChatRoom) => String(room.id))
    .filter(Boolean);

  return relatedRoomIds.length > 0 ? Array.from(new Set(relatedRoomIds)) : [targetRoomId];
}

export function getConversationUnreadCountForRoom(
  room: ChatRoom | null | undefined,
  unreadCounts: Record<string, number>,
  rooms: ChatRoom[]
): number {
  const roomId = String(room?.id || '').trim();
  if (!roomId) return 0;

  const directRoomKey = getDirectRoomMembersKey(room);
  if (!directRoomKey) {
    return unreadCounts[roomId] || 0;
  }

  return rooms
    .filter((candidate: ChatRoom) => getDirectRoomMembersKey(candidate) === directRoomKey)
    .reduce((sum, candidate: ChatRoom) => sum + (unreadCounts[String(candidate.id)] || 0), 0);
}

export function getConversationRoomIdSet(
  roomId: string | null | undefined,
  rooms: ChatRoom[]
): Set<string> {
  return new Set(getConversationRoomIdsByRoomId(roomId, rooms));
}

export function buildChatMessageInsertPayload(
  senderId: string | null | undefined,
  payload: MessageRetryPayload,
): ChatMessageInsertPayload {
  return {
    room_id: payload.roomId,
    sender_id: senderId ? String(senderId) : null,
    content: payload.content,
    file_url: payload.fileUrl,
    file_name: payload.fileName,
    file_size_bytes: payload.fileSizeBytes,
    file_kind: payload.fileKind,
    reply_to_id: payload.replyToId,
    album_id: payload.albumId ?? null,
    album_index: payload.albumIndex ?? null,
    album_total: payload.albumTotal ?? null,
  };
}

export function shouldTriggerImmediateChatPush(payload: {
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
}) {
  const albumId = String(payload.albumId || '').trim();
  const albumTotal = Number(payload.albumTotal ?? 0);
  const albumIndex = Number(payload.albumIndex ?? Number.NaN);

  if (!albumId || !Number.isFinite(albumTotal) || albumTotal <= 1) {
    return true;
  }

  if (!Number.isFinite(albumIndex)) {
    return true;
  }

  return albumIndex >= albumTotal - 1;
}

export function getRoomPrefsStorageKey(userId: string | null | undefined): string {
  return STORAGE_KEYS.chatRoomPrefs(userId || 'guest');
}

export function normalizeRoomNotificationMode(value: unknown): RoomNotificationMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mention_only' || normalized === 'keyword' || normalized === 'mute') {
    return normalized;
  }
  return 'all';
}

export function normalizeRoomNotificationKeyword(value: unknown): string {
  return String(value || '').trim().slice(0, 40);
}

export function readStoredRoomPreferences(userId: string | null | undefined): Record<string, RoomPreference> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getRoomPrefsStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, RoomPreference>>((acc, [roomId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return acc;
      const roomPref = value as Record<string, unknown>;
      acc[roomId] = {
        pinned: roomPref.pinned === true,
        hidden: roomPref.hidden === true,
        notifyMode: normalizeRoomNotificationMode(roomPref.notifyMode),
        notifyKeyword: normalizeRoomNotificationKeyword(roomPref.notifyKeyword),
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function isUuidLike(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function getPinnedStorageKey(roomId: string | null | undefined): string {
  return STORAGE_KEYS.chatPinned(roomId || 'none');
}

export function getBookmarkStorageKey(userId: string | null | undefined): string {
  return STORAGE_KEYS.chatBookmarks(userId || 'guest');
}

export function getPinnedRoomOrderStorageKey(userId: string | null | undefined): string {
  return STORAGE_KEYS.chatPinnedRoomOrder(userId || 'guest');
}

export function getThreadPrefsStorageKey(userId: string | null | undefined): string {
  return STORAGE_KEYS.chatThreadPrefs(userId || 'guest');
}

export function readStoredStringArray(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

export function writeStoredStringArray(storageKey: string, values: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // ignore storage failures
  }
}

export function writeStoredPinnedIds(roomId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getPinnedStorageKey(roomId), messageIds.slice(0, 1));
}

export function readStoredBookmarks(userId: string | null | undefined): string[] {
  return readStoredStringArray(getBookmarkStorageKey(userId));
}

export function writeStoredBookmarks(userId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getBookmarkStorageKey(userId), messageIds);
}

export function readStoredThreadPreferences(userId: string | null | undefined): Record<string, ThreadPreference> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getThreadPrefsStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, ThreadPreference>>((acc, [threadId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return acc;
      const record = value as Record<string, unknown>;
      acc[threadId] = {
        followed: record.followed === true,
        lastOpenedAt:
          typeof record.lastOpenedAt === 'string' && record.lastOpenedAt.trim()
            ? record.lastOpenedAt.trim()
            : null,
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function writeStoredThreadPreferences(
  userId: string | null | undefined,
  preferences: Record<string, ThreadPreference>,
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getThreadPrefsStorageKey(userId), JSON.stringify(preferences));
  } catch {
    // ignore storage failures
  }
}

export function arraysMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function getKoreanTodayString() {
  return _getKoreanTodayStringFromSeoul();
}

export function getRoomDisplayName(room: ChatRoom | null | undefined, staffs: StaffMember[], currentUserId: string | null | undefined): string {
  if (!room) return '채팅방';
  if (room.id === NOTICE_ROOM_ID) return room.name || NOTICE_ROOM_NAME;
  if (isSelfChatRoom(room, currentUserId)) return SELF_ROOM_NAME;

  const members = normalizeMemberIds(room.members);
  if (room.type === 'direct' && members.length <= 2) {
    const otherStaff = staffs.find(
      (staff: StaffMember) =>
        members.includes(String(staff.id)) &&
        String(staff.id) !== String(currentUserId)
    );
    if (otherStaff?.name) return otherStaff.name;
  }
  return room.name || '채팅방';
}

export type PollPrize = {
  winnerCount: number;
  name: string;
};

export type PollPrizeWinner = {
  id: string;
  name: string;
};

export type PollMeta = {
  deadlineAt?: string | null;
  prize?: PollPrize | null;
  prizeWinners?: PollPrizeWinner[] | null;
};

export function buildPollQuestionContent(
  question: string,
  meta?: PollMeta | null,
): string {
  const normalizedQuestion = String(question || '').trim();
  const hasMeta =
    (meta?.deadlineAt && String(meta.deadlineAt).trim()) ||
    meta?.prize ||
    meta?.prizeWinners;

  if (!hasMeta) return normalizedQuestion;

  const metaObj: PollMeta = {};
  const deadlineAt = String(meta?.deadlineAt || '').trim();
  if (deadlineAt) metaObj.deadlineAt = deadlineAt;
  if (meta?.prize) metaObj.prize = meta.prize;
  if (meta?.prizeWinners) metaObj.prizeWinners = meta.prizeWinners;

  return `${normalizedQuestion}${normalizedQuestion ? '\n' : ''}${POLL_META_PREFIX}${JSON.stringify(metaObj)}${POLL_META_SUFFIX}`;
}

export function extractPollMetaFromQuestion(value: unknown): {
  displayQuestion: string;
  deadlineAt: string;
  prize: PollPrize | null;
  prizeWinners: PollPrizeWinner[] | null;
} {
  const raw = String(value || '');
  const start = raw.indexOf(POLL_META_PREFIX);
  const end = raw.indexOf(POLL_META_SUFFIX);

  if (start === -1 || end === -1 || end <= start) {
    return { displayQuestion: raw.trim(), deadlineAt: '', prize: null, prizeWinners: null };
  }

  const displayQuestion = raw.slice(0, start).trim();
  const metaText = raw.slice(start + POLL_META_PREFIX.length, end).trim();

  try {
    const parsed = JSON.parse(metaText) as PollMeta;
    return {
      displayQuestion,
      deadlineAt: String(parsed?.deadlineAt || '').trim(),
      prize: parsed?.prize ?? null,
      prizeWinners: parsed?.prizeWinners ?? null,
    };
  } catch {
    return {
      displayQuestion: raw.trim(),
      deadlineAt: '',
      prize: null,
      prizeWinners: null,
    };
  }
}

export function getRoomPreviewText(room: ChatRoom): string {
  return (room?.last_message_preview as string | null | undefined) || (room?.last_message as string | null | undefined) || '대화가 없습니다.';
}

export function sortRoomsForSidebar(
  rooms: ChatRoom[],
  prefs: Record<string, RoomPreference>,
  pinnedRoomOrder: string[]
): ChatRoom[] {
  const notice = rooms.find((room: ChatRoom) => room.id === NOTICE_ROOM_ID);
  const rest = rooms
    .filter((room: ChatRoom) => room.id !== NOTICE_ROOM_ID)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const pinnedOrderIndex = new Map(
    pinnedRoomOrder.map((roomId, index) => [String(roomId), index])
  );
  const pinned = rest
    .filter((room: ChatRoom) => prefs[room.id]?.pinned)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const aIndex = pinnedOrderIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = pinnedOrderIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const regular = rest.filter((room: ChatRoom) => !prefs[room.id]?.pinned);
  return notice ? [notice, ...pinned, ...regular] : [...pinned, ...regular];
}
