'use client';

/**
 * 모바일 채팅 데이터 훅 모음.
 *  - useChatRoomsForMobile: chat_rooms 전체 + 본인 소속 + unread count + 정렬
 *  - useChatStaffDirectory: staff_members 디렉터리(이름/직급/부서/사진)
 *  - useChatMessagesForRoom: 특정 방 메시지 + 5s polling
 *  - sendMobileTextMessage: text 메시지 1건 insert
 *
 * PC 코드(chatQueryService·메신저데이터유틸·메신저메시지서비스·메신저유틸·polling-bus)를
 * 재사용한다. 컴포넌트 import는 하지 않는다.
 *
 * 제약: JM(파일 1책임 + 500줄 이내), JM2(deps 안정화, 한번에 한 쿼리),
 *      JM3(try/catch + 사용자 toast는 호출측), JM4(any 금지).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  pokeChannel,
  subscribeRealtime,
  type TableFilter,
} from '@/lib/realtime-bus';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { fetchAllChatRooms } from '@/app/main/기능부품/chatQueryService';
import {
  fetchChatUnreadCountsByRoom,
  selectChatMessagesWithFallback,
} from '@/app/main/기능부품/메신저데이터유틸';
import {
  NOTICE_ROOM_ID,
  buildChatMessageInsertPayload,
  isSelfChatRoom,
  normalizeMemberIds,
  sortChatRoomsWithNoticeFirst,
  getRoomDisplayName,
  isGroupChatRoom,
  getGroupChatRoomBadgeText,
  type MessageRetryPayload,
} from '@/app/main/기능부품/메신저유틸';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import { fetchReactionsForMessages, mergeReactionsIntoMessages } from './반응';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';

// ─────────────────────────────────────────────
// 직원 디렉터리 (이름/사진/직급)
// ─────────────────────────────────────────────

type StaffDirectoryEntry = Pick<
  StaffMember,
  'id' | 'name' | 'department' | 'position' | 'photo_url' | 'avatar_url' | 'status' | 'permissions'
>;

export function useChatStaffDirectory(company?: string | null) {
  const [staffs, setStaffs] = useState<StaffDirectoryEntry[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let q = supabase
          .from('staff_members')
          .select('id, name, department, position, photo_url, avatar_url, status, permissions, company');
        if (company && company !== '전체') q = (q as typeof q).eq('company', company);
        const { data, error } = await q;
        if (!active) return;
        if (error || !Array.isArray(data)) {
          setStaffs([]);
          return;
        }
        const normalized = data.map((staff) => normalizeProfileUser(staff));
        setStaffs(normalized as any);
      } catch {
        if (active) setStaffs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [company]);

  return staffs;
}

// ─────────────────────────────────────────────
// 채팅방 목록 + 안 읽은 수
// ─────────────────────────────────────────────

export type MobileChatRoom = ChatRoom & {
  unread_count: number;
};

type UseChatRoomsResult = {
  rooms: MobileChatRoom[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const ROOM_POLL_INTERVAL_MS = 5_000;

function isRoomVisibleToUser(
  room: ChatRoom,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (String(room.id) === NOTICE_ROOM_ID) return true;
  const memberIds = normalizeMemberIds(room.members);
  return memberIds.includes(String(userId));
}

export function useChatRoomsForMobile(
  userId: string | null | undefined,
): UseChatRoomsResult {
  const [rooms, setRooms] = useState<MobileChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) {
      setRooms([]);
      setLoading(false);
      return;
    }
    try {
      const { data: roomsData } = await fetchAllChatRooms();
      const visible = (roomsData || []).filter((room) =>
        isRoomVisibleToUser(room, currentUserId),
      );
      let counts: Record<string, number> = {};
      try {
        counts = await fetchChatUnreadCountsByRoom(supabase, {
          rooms: visible,
          userId: currentUserId,
          activeRoomId: null,
        });
      } catch {
        counts = {};
      }
      const sorted = sortChatRoomsWithNoticeFirst(visible);
      const merged: MobileChatRoom[] = sorted.map((room) => ({
        ...room,
        unread_count: counts[String(room.id)] ?? 0,
      }));
      setRooms(merged);
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  // polling — message INSERT / chat_rooms UPDATE
  useEffect(() => {
    if (!userId) return;
    const tables: TableFilter[] = [
      { table: 'messages', event: 'INSERT' },
      { table: 'chat_rooms', event: '*' },
    ];
    const unsubscribe = subscribeRealtime(
      'mobile-chat-rooms-list',
      tables,
      () => {
        void refresh();
      },
      { pollIntervalMs: ROOM_POLL_INTERVAL_MS },
    );
    return unsubscribe;
  }, [refresh, userId]);

  return { rooms, loading, refresh };
}

// ─────────────────────────────────────────────
// 단일 방 메시지 — 최근 100건 + tail polling
// ─────────────────────────────────────────────

const MESSAGES_LIMIT = 100;
const ROOM_MESSAGE_POLL_INTERVAL_MS = 2_000;

type UseChatMessagesResult = {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
};

export function useChatMessagesForRoom(
  roomId: string | null,
  userId: string | null | undefined,
): UseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const oldestRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);

  const fetchAndMergeReactions = useCallback(
    async (rows: ChatMessage[]): Promise<ChatMessage[]> => {
      const ids = rows
        .map((m) => String(m.id || ''))
        .filter(Boolean);
      if (!ids.length) return rows;
      const map = await fetchReactionsForMessages(ids);
      return mergeReactionsIntoMessages(rows, map);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) {
      setMessages([]);
      setLoading(false);
      setHasMore(true);
      oldestRef.current = null;
      return;
    }
    try {
      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .eq('room_id', currentRoomId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(MESSAGES_LIMIT) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );
      if (error || !Array.isArray(data)) {
        setMessages([]);
        setHasMore(false);
        oldestRef.current = null;
      } else {
        // 화면은 오래된 -> 최신 순으로 정렬
        const ordered = [...data].reverse();
        const withReactions = await fetchAndMergeReactions(ordered);
        setMessages(withReactions);
        setHasMore(data.length >= MESSAGES_LIMIT);
        oldestRef.current = withReactions.length > 0
          ? (withReactions[0].created_at as string | null) || null
          : null;
      }
    } catch {
      setMessages([]);
      setHasMore(false);
      oldestRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [fetchAndMergeReactions]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    const cursor = oldestRef.current;
    if (!cursor) return;
    if (!hasMore) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .eq('room_id', currentRoomId)
            .eq('is_deleted', false)
            .lt('created_at', cursor)
            .order('created_at', { ascending: false })
            .limit(MESSAGES_LIMIT) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );
      if (error || !Array.isArray(data) || data.length === 0) {
        setHasMore(false);
      } else {
        const ordered = [...data].reverse();
        const withReactions = await fetchAndMergeReactions(ordered);
        setMessages((prev) => [...withReactions, ...prev]);
        oldestRef.current = withReactions.length > 0
          ? (withReactions[0].created_at as string | null) || null
          : oldestRef.current;
        if (data.length < MESSAGES_LIMIT) setHasMore(false);
      }
    } catch {
      // 무한스크롤 실패는 silent — 다음 시도 가능
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [fetchAndMergeReactions, hasMore]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      setHasMore(true);
      oldestRef.current = null;
      return;
    }
    setLoading(true);
    setHasMore(true);
    oldestRef.current = null;
    void refresh();
  }, [roomId, refresh]);

  // polling messages for this room
  useEffect(() => {
    if (!roomId) return;
    const channelKey = `mobile-chat-room-${roomId}`;
    const tables: TableFilter[] = [
      { table: 'messages', event: 'INSERT', filter: `room_id=eq.${roomId}` },
      { table: 'messages', event: 'UPDATE', filter: `room_id=eq.${roomId}` },
    ];
    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        void refresh();
      },
      { pollIntervalMs: ROOM_MESSAGE_POLL_INTERVAL_MS },
    );
    return unsubscribe;
    // userId는 송신자 표시 등에 영향이 없어 deps에 안 넣음 — refresh가 안정 ref라 OK
  }, [roomId, refresh]);

  // 읽음 cursor 업데이트 (조회만, 액션 X 정책상 P0에서도 안전)
  useEffect(() => {
    if (!roomId || !userId) return;
    const lastReadAt = new Date().toISOString();
    void (async () => {
      try {
        await supabase
          .from('room_read_cursors')
          .upsert(
            { room_id: roomId, user_id: userId, last_read_at: lastReadAt },
            { onConflict: 'room_id,user_id' },
          );
        pokeChannel('mobile-chat-rooms-list');
      } catch {
        // silent — 읽음 미반영은 사용자 메시지로 노출 안 함
      }
    })();
  }, [roomId, userId, messages.length]);

  return { messages, loading, loadingOlder, hasMore, refresh, loadOlder };
}

// ─────────────────────────────────────────────
// 텍스트 메시지 전송
// ─────────────────────────────────────────────

export type SendTextMessageInput = {
  roomId: string;
  senderId: string;
  content: string;
};

export type SendTextMessageResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

export async function sendMobileTextMessage(
  input: SendTextMessageInput,
): Promise<SendTextMessageResult> {
  const content = input.content.trim();
  if (!content) {
    return { ok: false, error: '내용을 입력해주세요.' };
  }
  if (!input.roomId || !input.senderId) {
    return { ok: false, error: '대화방 정보가 올바르지 않습니다.' };
  }

  const retryPayload: MessageRetryPayload = {
    roomId: input.roomId,
    content,
    fileUrl: null,
    fileName: null,
    fileSizeBytes: null,
    fileKind: null,
    replyToId: null,
    albumId: null,
    albumIndex: null,
    albumTotal: null,
  };
  const payload = buildChatMessageInsertPayload(input.senderId, retryPayload);

  try {
    const { data, error } = await insertChatMessageWithFallback<ChatMessage>(
      supabase,
      payload,
    );
    if (error || !data) {
      const message =
        (error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : '') || '메시지 전송 실패';
      return { ok: false, error: message };
    }
    pokeChannel(`mobile-chat-room-${input.roomId}`);
    pokeChannel('mobile-chat-rooms-list');
    return { ok: true, message: data as ChatMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : '메시지 전송 실패';
    return { ok: false, error: message };
  }
}

// ─────────────────────────────────────────────
// 헬퍼: 표시명·아바타톤
// ─────────────────────────────────────────────

const AVATAR_TONES = ['blue', 'violet', 'pink', 'green', 'orange', 'cyan', 'gray'] as const;
export type AvatarToneKey = (typeof AVATAR_TONES)[number];

export function pickAvatarTone(seed: string | null | undefined): AvatarToneKey {
  const key = String(seed || '').trim();
  if (!key) return 'blue';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[idx];
}

export function getRoomTitle(
  room: ChatRoom,
  staffs: StaffDirectoryEntry[],
  currentUserId: string | null | undefined,
): string {
  return getRoomDisplayName(room, staffs as any, currentUserId);
}

export function getRoomKind(room: ChatRoom): string {
  if (String(room.id) === NOTICE_ROOM_ID) return '공지';
  if (room.type === 'notice') return '채널';
  if (isGroupChatRoom(room)) {
    const count = normalizeMemberIds(room.members).length;
    return count > 0 ? `그룹 · ${count}명` : '그룹';
  }
  return '1:1';
}

export function formatChatTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const now = new Date();
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  if (sameDay) {
    return dt.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    dt.getFullYear() === yesterday.getFullYear() &&
    dt.getMonth() === yesterday.getMonth() &&
    dt.getDate() === yesterday.getDate();
  if (isYesterday) return '어제';
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function formatBubbleTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatBubbleDateLabel(value: string | null | undefined): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]}요일)`;
}

export function isSameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export type { StaffDirectoryEntry };
