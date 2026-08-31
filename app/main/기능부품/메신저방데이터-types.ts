import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';

export type ReactionUsersByMessage = Record<string, Record<string, StaffMember[]>>;

export type RoomSummary = {
  last_message: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
};

export type LoadedMessageCursor = {
  id: string;
  createdAt: string;
};

export type MessageJumpLoadResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'no-room' | 'not-found' | 'failed' | 'room-changed'; error?: unknown };

export type SelectChatMessagesWithFallback = <TData>(
  execute: (selectClause: string) => PromiseLike<{ data: TData | null; error: unknown }>,
) => Promise<{ data: TData | null; error: unknown }>;

export type UseChatRoomDataSyncParams = {
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  fetchDataRequestSeqRef: MutableRefObject<number>;
  deliveryStatesRef: MutableRefObject<Record<string, { status?: string } | undefined>>;
  effectiveChatUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  userId: string | null | undefined;
  requestBottomAlignmentHold?: (roomId: string | null, holdMs?: number) => void;
  setRoom: (roomId: string | null) => void;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  getEffectiveRoomMemberIds: (room: ChatRoom | null | undefined) => string[];
  isRoomAccessibleToCurrentUser: (room: ChatRoom | null | undefined) => boolean;
  repairDirectRooms: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  selectChatMessagesWithFallback?: SelectChatMessagesWithFallback;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLoadingRoomId?: Dispatch<SetStateAction<string | null>>;
  setTimelineRoomId?: Dispatch<SetStateAction<string | null>>;
  setRoomReadCursorMap: Dispatch<SetStateAction<Record<string, string>>>;
  setReadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setBookmarkedIds: Dispatch<SetStateAction<Set<string>>>;
  setPinnedIds: Dispatch<SetStateAction<string[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setReactions: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
  setReactionUsersByMessage: Dispatch<SetStateAction<ReactionUsersByMessage>>;
  setPolls: Dispatch<SetStateAction<any[]>>;
  setPollVotes: Dispatch<SetStateAction<Record<string, Record<number, number>>>>;
};

// D1/SQLite 파라미터 한도 고려
export const CHAT_METADATA_QUERY_CHUNK_SIZE = 95;
/** 채팅방 첫 진입·실시간 갱신 시 가져오는 최근 메시지 수 (오라클 로컬 SQLite 0ms 초고속 서빙) */
export const MESSAGE_PAGE_SIZE = 60;
export const DATE_JUMP_CONTEXT_BEFORE = 30;
export const DATE_JUMP_CONTEXT_AFTER = 50;
export const CHAT_METADATA_REFRESH_TTL_MS = 10_000;
