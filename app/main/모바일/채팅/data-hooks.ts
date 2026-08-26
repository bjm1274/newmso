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
import { db } from '@/lib/db-client';
import { readViewCache, writeViewCache } from '@/lib/view-cache';
import { pickAvatarTone as pickAvatarToneLib, type AvatarTone } from '@/lib/avatar-tone';
import { bindMockChatMessageInsert } from '@/app/main/기능부품/메신저테스트이벤트';
import {
  pokeChannel,
  subscribeRealtime,
  type TableFilter } from '@/lib/realtime-bus';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { toUtcSqlTimestamp } from '@/lib/chat-read-cursors';
import { parseDbTimestampMs } from '@/lib/date-formatter';
import { fetchAllChatRooms } from '@/app/main/기능부품/chatQueryService';
import {
  fetchChatUnreadCountsByRoom,
  selectChatMessagesWithFallback } from '@/app/main/기능부품/메신저데이터유틸';
import {
  NOTICE_ROOM_ID,
  buildChatMessageInsertPayload,
  isSelfChatRoom,
  normalizeMemberIds,
  sortChatRoomsWithNoticeFirst,
  getRoomDisplayName,
  isGroupChatRoom,
  getGroupChatRoomBadgeText,
  toChatDate,
  getDirectRoomMembersKey,
  getConversationRoomIdsByRoomId,
  getConversationUnreadCountForRoom,
  type MessageRetryPayload } from '@/app/main/기능부품/메신저유틸';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { escapeLikePattern } from '@/lib/like-escape';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import { fetchReactionsForMessages, mergeReactionsIntoMessages } from './반응';
import { triggerChatPush as triggerMobileChatPush } from '@/lib/chat-push-client-trigger';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';

// ─────────────────────────────────────────────
// 직원 디렉터리 (이름/사진/직급)
// ─────────────────────────────────────────────

type StaffDirectoryEntry = Pick<
  StaffMember,
  'id' | 'name' | 'company' | 'department' | 'position' | 'photo_url' | 'avatar_url' | 'status' | 'permissions'
>;

/**
 * 직원 디렉터리 캐시 (모듈 스코프).
 *
 * 예전에는 채팅방을 열 때마다 staff_members 전체를 다시 받았다. 방을 세 번
 * 오가면 같은 62명을 세 번 내려받는다. 이름·부서는 대화 중에 바뀌지 않으므로
 * 한 번 받아 공유하고, 동시 요청은 하나로 합친다.
 */
let staffDirectoryCache: StaffDirectoryEntry[] | null = null;
let staffDirectoryInflight: Promise<StaffDirectoryEntry[]> | null = null;
let staffDirectoryFetchedAt = 0;
const STAFF_DIRECTORY_TTL_MS = 5 * 60 * 1000;

/** 입·퇴사 반영이 필요할 때 호출 (다음 조회에서 다시 받는다). */
export function invalidateChatStaffDirectory() {
  staffDirectoryCache = null;
  staffDirectoryFetchedAt = 0;
}

async function loadChatStaffDirectory(): Promise<StaffDirectoryEntry[]> {
  const fresh = staffDirectoryCache && Date.now() - staffDirectoryFetchedAt < STAFF_DIRECTORY_TTL_MS;
  if (fresh) return staffDirectoryCache!;
  if (staffDirectoryInflight) return staffDirectoryInflight;

  staffDirectoryInflight = (async () => {
    /*
     * permissions 를 다시 받는다.
     *
     * 크기(1인 2KB, 62명 127KB) 때문에 뺐었는데, 이 프로젝트는 프로필 사진 경로를
     * permissions.profile_photo_path 안에 넣어 두고 있다 — 실측하면 photo_url 컬럼은
     * 0명, permissions 안 경로가 56명이다. 빼는 순간 채팅 아바타가 56명분 사라졌다.
     * normalizeProfileUser 가 그 값을 읽어 사진 URL 을 만든다.
     *
     * 전송량은 아래 5분 캐시로 잡는다 — 방을 열 때마다가 아니라 세션당 한 번이다.
     * (D1 게이트웨이는 컬럼 화이트리스트만 허용해 json_extract 로 경로만 뽑을 수 없다.)
     */
    const { data, error } = await db
      .from('staff_members')
      .select('id, name, department, position, photo_url, avatar_url, status, permissions, company');
    if (error || !Array.isArray(data)) return [];
    return data.map((staff) => normalizeProfileUser(staff) as StaffDirectoryEntry);
  })();

  try {
    const rows = await staffDirectoryInflight;
    // 실패(빈 배열)는 캐시하지 않는다 — 다음 진입에서 다시 시도해야 한다.
    if (rows.length > 0) {
      staffDirectoryCache = rows;
      staffDirectoryFetchedAt = Date.now();
    }
    return rows;
  } finally {
    staffDirectoryInflight = null;
  }
}

export function useChatStaffDirectory(_company?: string | null) {
  // 채팅 디렉터리는 회사 격리 대상이 아니다 — MSO 특성상 1:1·그룹 대화 상대가
  // 다른 회사일 수 있어, 회사로 필터하면 상대 이름/발신자가 '알 수 없음'으로 깨진다.
  // (PC 메신저도 staff_members 전체를 로드한다. `_company`는 호환용으로만 유지.)
  const [staffs, setStaffs] = useState<StaffDirectoryEntry[]>(() => staffDirectoryCache ?? []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await loadChatStaffDirectory();
        if (active) setStaffs(rows);
      } catch {
        if (active) setStaffs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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

const ROOM_POLL_INTERVAL_MS = 5000; // polling-bus 채팅 기본값(5초)과 정렬. WS 활성 시 폴링 자체는 꺼짐.

function isRoomVisibleToUser(
  room: ChatRoom,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (String(room.id) === NOTICE_ROOM_ID) return true;
  const memberIds = normalizeMemberIds(room.members);
  return memberIds.includes(String(userId));
}

function roomActivityMs(room: ChatRoom | null | undefined): number {
  // 예전에는 공백을 'T' 로만 치환해 파싱했다 — 접미사가 없어 디바이스 로컬 TZ 로
  // 해석되면서, 같은 값이 PC(+00:00 파서)와 9시간 어긋나 방 정렬이 갈렸다(8차 D10-009).
  const ms = parseDbTimestampMs(room?.last_message_at || room?.created_at || 0);
  return Number.isFinite(ms) ? ms : 0;
}

export function useChatRoomsForMobile(
  userId: string | null | undefined,
  activeRoomId?: string | null,
): UseChatRoomsResult {
  const [rooms, setRooms] = useState<MobileChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // activeRoomId는 unread 계산에만 쓰인다. deps에 넣으면 방 입장마다
  // refresh identity가 바뀌어 목록 전체 재조회·재정렬이 일어난다.
  const activeRoomIdRef = useRef(activeRoomId ?? null);
  activeRoomIdRef.current = activeRoomId ?? null;
  // 8차 D06-010: 커서가 없는 방의 implicit 기준선. PC(메신저방데이터훅)는 갖고 있었고
  // 모바일에는 없어서, 한 번도 열지 않은 방(특히 공지방)의 전 히스토리가 안읽음으로 잡혔다.
  // 기준선은 '처음 본 시점' 값으로 고정돼야 하므로 폴링 간에 살아남는 ref 에 둔다.
  const implicitUnreadBaselineRef = useRef<Record<string, string | null>>({});

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) {
      setRooms([]);
      setLoading(false);
      return;
    }
    try {
      const { data: roomsData } = await fetchAllChatRooms({ force: options?.force });
      const rawRooms = roomsData || [];
      const visible = rawRooms.filter((room) =>
        isRoomVisibleToUser(room, currentUserId),
      );

      // PC와 동일한 direct room deduplication 적용
      const dedupedRooms = new Map<string, ChatRoom>();
      visible.forEach((room) => {
        const roomKey = getDirectRoomMembersKey(room) || `room:${room.id}`;
        const previousRoom = dedupedRooms.get(roomKey);
        const previousTime = roomActivityMs(previousRoom);
        const currentTime = roomActivityMs(room);
        if (!previousRoom || currentTime >= previousTime) {
          dedupedRooms.set(roomKey, room);
        }
      });

      if (!dedupedRooms.has(`room:${NOTICE_ROOM_ID}`)) {
        const noticeRoom = rawRooms.find((room) => String(room.id) === NOTICE_ROOM_ID);
        if (noticeRoom && isRoomVisibleToUser(noticeRoom, currentUserId)) {
          dedupedRooms.set(`room:${NOTICE_ROOM_ID}`, noticeRoom);
        }
      }

      const dedupedList = Array.from(dedupedRooms.values());

      // PC와 동일: 중복 direct 방까지 전부 집계한 뒤 표시 시 합산.
      // dedupedList만 넘기면 형제 방 unread/활성방 zeroing이 누락된다.
      let counts: Record<string, number> = {};
      try {
        counts = await fetchChatUnreadCountsByRoom(db, {
          rooms: visible,
          userId: currentUserId,
          activeRoomId: activeRoomIdRef.current,
          implicitBaselineStore: implicitUnreadBaselineRef.current });
      } catch {
        counts = {};
      }
      const sorted = sortChatRoomsWithNoticeFirst(dedupedList);
      const merged: MobileChatRoom[] = sorted.map((room) => ({
        ...room,
        unread_count: getConversationUnreadCountForRoom(room, counts, visible) }));
      // 폴링이 file:// 로 덮어쓰면 로컬 정리값 유지.
      // 로컬이 「삭제된 메시지입니다.」이면 그것도 폴링 dirty 값보다 우선.
      // last_message_at 은 정렬 안정성을 위해 서버 값을 우선(로컬이 더 최신일 때만 유지).
      setRooms((prev) => {
        const prevById = new Map(prev.map((r) => [String(r.id), r]));
        return merged.map((room) => {
          const old = prevById.get(String(room.id));
          if (!old) return room;
          const newPreview = String(room.last_message_preview || room.last_message || '');
          const oldPreview = String(old.last_message_preview || old.last_message || '');
          const newIsDirty =
            /^file:\/\//i.test(newPreview) ||
            /^blob:/i.test(newPreview) ||
            /^[A-Za-z]:[\\/]/.test(newPreview);
          const oldIsDeleted =
            oldPreview === '삭제된 메시지입니다.' || oldPreview.startsWith('삭제된 메시지');
          const oldAt = roomActivityMs(old);
          const newAt = roomActivityMs(room);
          const preferOldAt = oldAt > newAt;
          const stableAt = preferOldAt
            ? (old.last_message_at || room.last_message_at)
            : (room.last_message_at || old.last_message_at);
          if (newIsDirty && oldPreview && (!/^file:\/\//i.test(oldPreview) || oldIsDeleted)) {
            return {
              ...room,
              last_message: oldIsDeleted ? '삭제된 메시지입니다.' : old.last_message,
              last_message_preview: oldIsDeleted
                ? '삭제된 메시지입니다.'
                : old.last_message_preview,
              last_message_at: stableAt,
            };
          }
          if (oldIsDeleted && newIsDirty) {
            return {
              ...room,
              last_message: '삭제된 메시지입니다.',
              last_message_preview: '삭제된 메시지입니다.',
              last_message_at: stableAt,
            };
          }
          // 서버가 잠깐 과거 타임스탬프를 주면 로컬(더 최신) 미리보기 유지
          if (preferOldAt && oldPreview && !newIsDirty) {
            return {
              ...room,
              last_message: old.last_message,
              last_message_preview: old.last_message_preview,
              last_message_at: old.last_message_at,
            };
          }
          return room;
        });
      });
    } catch {
      // 일시 오류로 목록을 비우면 빈 채팅 리스트가 노출된다 — 이전 스냅샷 유지.
      setRooms((prev) => prev);
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
        void refresh({ force: true });
      },
      { pollIntervalMs: ROOM_POLL_INTERVAL_MS },
    );
    return unsubscribe;
  }, [refresh, userId]);

  return { rooms, loading, refresh };
}

// ─────────────────────────────────────────────
// 단일 방 메시지 — 최근 20건 + loadOlder + tail polling
// (목록 진입은 방 목록만; 방 오픈 시에만 이 훅이 메시지를 조회)
// ─────────────────────────────────────────────

const MESSAGES_LIMIT = 20;
/** 방별 최근 메시지 캐시 스코프 (lib/view-cache) */
const MESSAGES_CACHE_SCOPE = 'chat:messages';
const ROOM_MESSAGE_POLL_INTERVAL_MS = 5000; // polling-bus 채팅 기본값(5초)과 정렬. 개별 방도 동일 간격 적용.

type UseChatMessagesResult = {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  /** Optimistic UI: 임시 메시지를 즉시 리스트 끝에 추가 */
  appendOptimistic: (msg: ChatMessage) => void;
  /** Optimistic UI: tempId를 가진 메시지를 서버 응답으로 교체 */
  replaceOptimistic: (tempId: string, real: ChatMessage) => void;
  /** Optimistic UI: 전송 실패 시 temp 메시지 제거 */
  removeOptimistic: (tempId: string) => void;
  jumpToMessage: (messageId: string) => Promise<void>;
  searchMessageId: string | null;
  setSearchMessageId: (id: string | null) => void;
};

type RoomReadCursorRow = {
  user_id?: string | null;
  last_read_at?: string | null;
};

export function useMobileChatReadCounts(
  roomId: string | null,
  messages: ChatMessage[],
  memberIds: string[]
) {
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});

  // 5초 폴링마다 messages 배열 정체성이 바뀐다. 배열을 그대로 deps 에 넣으면
  // effect 가 매번 해제·재구독되어 커서 조회가 5초마다 한 번씩 더 나가고,
  // 30초 폴백 간격은 리셋만 되다 한 번도 도달하지 못한다.
  // 실제 내용(메시지 id·시각, 멤버)이 바뀔 때만 다시 돌게 키로 좁힌다.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const memberIdsRef = useRef<string[]>(memberIds);
  memberIdsRef.current = memberIds;
  const messagesKey = messages.map((m) => `${m.id}:${m.created_at}`).join('|');
  const memberKey = memberIds.join(',');

  useEffect(() => {
    const messages = messagesRef.current;
    const memberIds = memberIdsRef.current;
    if (!roomId || !messages.length || !memberIds.length) {
      setReadCounts({});
      return;
    }
    const fetchCursors = async () => {
      const { data } = await db
        .from('room_read_cursors')
        .select('user_id, last_read_at')
        .eq('room_id', roomId)
        .in('user_id', memberIdsRef.current);

      const counts: Record<string, number> = {};
      const cursors = (Array.isArray(data) ? data : []) as RoomReadCursorRow[];

      // messages.created_at 과 last_read_at 은 DB 에 두 형식이 섞여 있다
      // ("2026-08-26 05:57:54" 공백형 / "...T05:57:54+00:00" T형).
      // new Date() 는 공백형을 로컬(KST), T형을 UTC 로 파싱해 같은 시각인데도
      // 9시간이 어긋난다 — 그래서 "다 읽었는데 읽음 1" 이 안 내려갔다.
      // 양쪽을 UTC SQL 형식으로 정규화한 뒤 문자열로 비교한다(사전순 = 시간순).
      const cursorByMember = new Map(
        cursors.map((c) => [String(c.user_id), toUtcSqlTimestamp(c.last_read_at)] as const),
      );

      messagesRef.current.forEach((msg) => {
        const msgTime = toUtcSqlTimestamp(msg.created_at);

        // 발신자 제외 수신자 목록
        const recipientIds = memberIdsRef.current.filter((mId) => mId !== String(msg.sender_id));
        const totalRecipients = recipientIds.length;

        let readers = 0;
        recipientIds.forEach((mId) => {
          const cursorTime = cursorByMember.get(mId);
          if (cursorTime && cursorTime >= msgTime) {
            readers++;
          }
        });

        counts[String(msg.id)] = Math.max(0, totalRecipients - readers);
      });
      setReadCounts(counts);
    };

    void fetchCursors();

    const channelKey = `mobile-chat-cursors-${roomId}`;
    const tables: TableFilter[] = [
      { table: 'room_read_cursors', filter: `room_id=eq.${roomId}` }
    ];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        void fetchCursors();
      },
      { pollIntervalMs: 30000 } // fallback poll interval is 30s
    );

    return unsubscribe;
    // messages/memberIds 는 ref 로 읽는다 — 배열 정체성이 아니라 내용 키로만 재실행.
  }, [roomId, messagesKey, memberKey]);

  return readCounts;
}

/** 낙관적 전송 중인 임시 메시지 — 서버 응답 전이라 최신 페이지에 없다. */
function isPendingMessage(message: ChatMessage): boolean {
  return String(message.id || '').startsWith('temp-');
}

/**
 * 목록이 실제로 달라졌는지 — 같으면 setState 를 건너뛰어 리렌더를 막는다.
 * 반응(reactions)은 개수·이모지가 바뀌면 화면이 달라지므로 내용까지 포함한다.
 */
function messageListSignature(list: ChatMessage[]): string {
  return list
    .map((m) => {
      const reactions = (m as { reactions?: unknown }).reactions;
      let reactionKey = '';
      if (reactions) {
        try {
          reactionKey = JSON.stringify(reactions);
        } catch {
          reactionKey = 'x';
        }
      }
      return `${m.id}:${m.created_at}:${m.content ?? ''}:${reactionKey}`;
    })
    .join('|');
}

/**
 * 최신 페이지(refresh 가 받아온 MESSAGES_LIMIT 건)를 기존 목록에 합친다.
 *
 * 그냥 교체하면 안 된다: 이 경로는 5초 폴링도 탄다. 사용자가 무한스크롤로 과거
 * 메시지를 받아 놓고 위로 올려 보던 중이면, 다음 폴링이 최신 20건으로 통째로
 * 덮어써 화면이 맨 아래로 튕긴다.
 *
 * 최신 페이지 구간은 서버 값이 정답이므로 그대로 덮고(삭제된 메시지도 이때
 * 자연히 빠진다), 그보다 과거인 구간과 아직 전송 중인 임시 메시지만 보존한다.
 */
function mergeLatestMessagePage(
  prev: ChatMessage[],
  latest: ChatMessage[],
): { list: ChatMessage[]; keptOlder: boolean } {
  if (prev.length === 0 || latest.length === 0) {
    return { list: latest, keptOlder: false };
  }
  const windowStart = toUtcSqlTimestamp(latest[0].created_at);
  const latestIds = new Set(latest.map((m) => String(m.id || '')));
  const olderKept = prev.filter(
    (m) =>
      !latestIds.has(String(m.id || '')) &&
      !isPendingMessage(m) &&
      toUtcSqlTimestamp(m.created_at) < windowStart,
  );
  const pending = prev.filter(isPendingMessage);
  return {
    list: [...olderKept, ...latest, ...pending],
    keptOlder: olderKept.length > 0,
  };
}

export function useChatMessagesForRoom(
  roomId: string | null,
  userId: string | null | undefined,
): UseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 캐시 렌더가 이미 도착한 네트워크 결과를 덮지 않도록 최신 값을 ref 로도 본다.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const oldestRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  // 방 전환 레이스: 이전 방 fetch 결과가 늦게 도착해 새 방을 덮지 않도록 generation 가드
  const fetchGenRef = useRef(0);

  const isStaleRoom = useCallback((expectedRoomId: string, gen: number) => {
    return fetchGenRef.current !== gen || String(roomIdRef.current || '') !== String(expectedRoomId);
  }, []);

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
    const gen = fetchGenRef.current;
    if (!currentRoomId) {
      setMessages([]);
      setLoading(false);
      setHasMore(true);
      oldestRef.current = null;
      return;
    }
    // 저장분을 먼저 그린다. 방을 다시 열 때 빈 화면 + 스피너를 보지 않게 하려는
    // 것뿐이고, 정답은 아래 네트워크 응답이다(도착하면 그대로 갈아끼운다).
    void (async () => {
      if (messagesRef.current.length > 0) return;
      const cached = await readViewCache<ChatMessage[]>(userId, MESSAGES_CACHE_SCOPE, currentRoomId);
      if (!cached || cached.length === 0) return;
      if (isStaleRoom(currentRoomId, gen)) return;
      // 네트워크 응답이 이미 그려졌으면 캐시로 되돌리지 않는다.
      if (messagesRef.current.length > 0) return;
      setMessages(cached);
      setLoading(false);
    })();

    try {
      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          db
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
      if (isStaleRoom(currentRoomId, gen)) return;
      if (error || !Array.isArray(data)) {
        setMessages([]);
        setHasMore(false);
        oldestRef.current = null;
      } else {
        // 화면은 오래된 -> 최신 순으로 정렬. 메시지는 먼저 그리고, 반응은 2차 패스.
        const ordered = [...data].reverse();
        const { list: merged, keptOlder } = mergeLatestMessagePage(messagesRef.current, ordered);
        // 내용이 그대로면 새 배열로 갈아끼우지 않는다 — 5초 폴링마다 나던
        // 무의미한 전체 리렌더를 막는다.
        setMessages((prev) =>
          messageListSignature(prev) === messageListSignature(merged) ? prev : merged,
        );
        // 무한스크롤로 받아 둔 과거분을 유지했다면 hasMore 를 되돌리지 않는다
        // (이미 맨 처음까지 읽은 방이 폴링마다 again 으로 바뀌는 것 방지).
        if (!keptOlder) {
          setHasMore(data.length >= MESSAGES_LIMIT);
        }
        oldestRef.current = merged.length > 0
          ? (merged[0].created_at as string | null) || null
          : null;
        if (!isStaleRoom(currentRoomId, gen)) {
          setLoading(false);
        }
        const withReactions = await fetchAndMergeReactions(ordered);
        if (isStaleRoom(currentRoomId, gen)) return;
        // 반응은 최신 페이지 구간에만 얹는다 — 과거 구간을 날리지 않도록 교체 대신 매핑.
        const reactionById = new Map(
          withReactions.map((message) => [String(message.id || ''), message] as const),
        );
        setMessages((prev) => {
          const next = prev.map((message) => reactionById.get(String(message.id || '')) || message);
          return messageListSignature(prev) === messageListSignature(next) ? prev : next;
        });
        void writeViewCache(
          userId,
          MESSAGES_CACHE_SCOPE,
          currentRoomId,
          merged.map((message) => reactionById.get(String(message.id || '')) || message),
        );
      }
    } catch {
      if (isStaleRoom(currentRoomId, gen)) return;
      setMessages([]);
      setHasMore(false);
      oldestRef.current = null;
    } finally {
      if (!isStaleRoom(currentRoomId, gen)) {
        setLoading(false);
      }
    }
  }, [fetchAndMergeReactions, isStaleRoom]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;
    const currentRoomId = roomIdRef.current;
    const gen = fetchGenRef.current;
    if (!currentRoomId) return;
    const cursor = oldestRef.current;
    if (!cursor) return;
    if (!hasMore) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      // D1 created_at 과 동일 SQL UTC 포맷으로 비교 (ISO 변환 시 페이지네이션 공집합)
      const cursorSql = toUtcSqlTimestamp(cursor);
      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          db
            .from('messages')
            .select(selectClause)
            .eq('room_id', currentRoomId)
            .eq('is_deleted', false)
            .lt('created_at', cursorSql)
            .order('created_at', { ascending: false })
            .limit(MESSAGES_LIMIT) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );
      if (isStaleRoom(currentRoomId, gen)) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setHasMore(false);
      } else {
        const ordered = [...data].reverse();
        setMessages((prev) => [...ordered, ...prev]);
        oldestRef.current = ordered.length > 0
          ? (ordered[0].created_at as string | null) || null
          : oldestRef.current;
        if (data.length < MESSAGES_LIMIT) setHasMore(false);
        const withReactions = await fetchAndMergeReactions(ordered);
        if (isStaleRoom(currentRoomId, gen)) return;
        // Merge reactions into the page that was just prepended (by message id).
        const reactionById = new Map(
          withReactions.map((message) => [String(message.id || ''), message] as const),
        );
        setMessages((prev) =>
          prev.map((message) => reactionById.get(String(message.id || '')) || message),
        );
      }
    } catch {
      // 무한스크롤 실패는 silent — 다음 시도 가능
    } finally {
      loadingOlderRef.current = false;
      if (!isStaleRoom(currentRoomId, gen)) {
        setLoadingOlder(false);
      }
    }
  }, [fetchAndMergeReactions, hasMore, isStaleRoom]);

  useEffect(() => {
    // 방 전환 즉시 이전 메시지 비움 — 과거 메시지 깜빡임 방지
    fetchGenRef.current += 1;
    loadingOlderRef.current = false;
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      setHasMore(true);
      setLoadingOlder(false);
      oldestRef.current = null;
      return;
    }
    setMessages([]);
    setLoading(true);
    setLoadingOlder(false);
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

  // E2E 모의 실시간 메시지 추가 이벤트 바인딩
  useEffect(() => {
    if (!roomId) return;
    const unbind = bindMockChatMessageInsert((detail) => {
      const inserted = detail.row;
      if (inserted && String(inserted.room_id) === String(roomId)) {
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(inserted.id))) return prev;
          return [...prev, inserted];
        });
      }
    });
    return unbind;
  }, [roomId]);

  // 읽음 cursor 업데이트 (조회만, 액션 X 정책상 P0에서도 안전)
  // 메시지가 실제로 로드된 뒤에만 갱신 — 빈 목록/다른 방 잔여로 인한 조기 poke 방지
  //
  // deps 를 messages.length 로 잡으면 안 된다: refresh() 가 항상 최신
  // MESSAGES_LIMIT(20)건으로 배열을 교체하므로 20건 이상인 방에서는 길이가 20에
  // 고정된다. 새 메시지가 와도 20 -> 20 이라 effect 가 다시 돌지 않고, 커서는
  // 방에 들어온 시각에 멈춰 "다 읽었는데 읽음 1" 이 남았다(운영 실측: 걸린 건이
  // 전부 정확히 1건, 커서가 마지막 메시지보다 수십 초 앞섬).
  // 마지막 메시지의 id + 시각을 키로 잡아야 실제로 새 메시지가 올 때마다 돈다.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMessageId = lastMessage ? String(lastMessage.id || '') : '';
  const lastMessageCreatedAt = lastMessage ? String(lastMessage.created_at || '') : '';
  const lastMessageRoomId = lastMessage ? String(lastMessage.room_id || '') : '';

  useEffect(() => {
    if (!roomId || !userId) return;
    if (loading) return;
    if (!lastMessageId) return;
    // 현재 방 메시지만 신뢰 (레이스 잔여 방어)
    if (lastMessageRoomId && lastMessageRoomId !== String(roomId)) {
      return;
    }
    // 본인 마지막 메시지여도 커서 갱신 — 미읽음 배지 고착 방지
    // PC와 동일: D1 SQL 포맷 + 동일 상대 direct 형제 방까지 일괄 읽음
    const lastReadAt = toUtcSqlTimestamp();
    let cancelled = false;
    void (async () => {
      try {
        let targetRoomIds = [roomId];
        try {
          const { data: roomsData } = await fetchAllChatRooms();
          const expanded = getConversationRoomIdsByRoomId(roomId, roomsData || []);
          if (expanded.length > 0) targetRoomIds = expanded;
        } catch {
          // 캐시 조회 실패 시 현재 방만 갱신
        }
        if (cancelled) return;
        await fetch('/api/chat/read-cursors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomIds: targetRoomIds, readAt: lastReadAt }),
          credentials: 'same-origin' });

        // PC와 동일: 해당 방 message/mention 알림 읽음 (D1 JSONPath 불가 → JS 매칭)
        try {
          const { data: notifRows } = await db
            .from('notifications')
            .select('id, metadata')
            .eq('user_id', userId)
            .in('type', ['message', 'mention'])
            .is('read_at', null)
            .order('created_at', { ascending: false })
            .limit(100);
          const roomSet = new Set(targetRoomIds.map(String));
          const ids: string[] = [];
          for (const row of notifRows || []) {
            const meta =
              row?.metadata && typeof row.metadata === 'object'
                ? (row.metadata as Record<string, unknown>)
                : typeof row?.metadata === 'string'
                  ? (() => {
                      try {
                        return JSON.parse(String(row.metadata)) as Record<string, unknown>;
                      } catch {
                        return {};
                      }
                    })()
                  : {};
            const rid = String(meta.room_id || meta.roomId || '').trim();
            if (rid && roomSet.has(rid) && row?.id) ids.push(String(row.id));
          }
          if (ids.length > 0) {
            // notifications.read_at 은 ISO 가 규약이다(알림인박스·게시판·전자결재 전부 toISOString).
            // 예전에는 방 읽음커서용 공백형(lastReadAt)을 그대로 재사용해 이 컬럼만 두 형식이
            // 다시 섞였고, 30일 보존 크론이 ISO 와 비교하면서 경계일에 하루 일찍 지워질 수
            // 있었다(8차 D06-016). 커서(공백형)와 알림(ISO)은 규약이 다르므로 값을 분리한다.
            await db.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids.slice(0, 50));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('erp-notification-read'));
            }
          }
        } catch {
          // silent
        }

        if (!cancelled) {
          pokeChannel('mobile-chat-rooms-list');
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, userId, lastMessageId, lastMessageCreatedAt, lastMessageRoomId, loading]);

  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);

  const jumpToMessage = useCallback(async (messageId: string) => {
    const currentRoomId = roomIdRef.current;
    const gen = fetchGenRef.current;
    if (!currentRoomId || !messageId) return;

    try {
      setLoading(true);
      const { data: targetRows } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          db
            .from('messages')
            .select(selectClause)
            .eq('id', messageId)
            .limit(1) as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>
      );
      if (isStaleRoom(currentRoomId, gen)) return;
      const targetMessage = Array.isArray(targetRows) ? targetRows[0] : null;
      if (!targetMessage || !targetMessage.created_at) return;

      const targetTime = targetMessage.created_at;

      const { data: beforeRows } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          db
            .from('messages')
            .select(selectClause)
            .eq('room_id', currentRoomId)
            .eq('is_deleted', false)
            .lte('created_at', targetTime)
            .order('created_at', { ascending: false })
            .limit(50) as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>
      );

      const { data: afterRows } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          db
            .from('messages')
            .select(selectClause)
            .eq('room_id', currentRoomId)
            .eq('is_deleted', false)
            .gt('created_at', targetTime)
            .order('created_at', { ascending: true })
            .limit(50) as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>
      );

      if (isStaleRoom(currentRoomId, gen)) return;

      const beforeList = Array.isArray(beforeRows) ? [...beforeRows].reverse() : [];
      const afterList = Array.isArray(afterRows) ? afterRows : [];
      const merged = [...beforeList, ...afterList];

      setMessages(merged);
      setHasMore(beforeList.length >= 50);
      oldestRef.current = merged.length > 0
        ? (merged[0].created_at as string | null) || null
        : null;
      setSearchMessageId(messageId);
      if (!isStaleRoom(currentRoomId, gen)) {
        setLoading(false);
      }

      const withReactions = await fetchAndMergeReactions(merged);
      if (isStaleRoom(currentRoomId, gen)) return;
      setMessages(withReactions);
    } catch (err) {
      console.error('[jumpToMessage] Failed to jump:', err);
    } finally {
      if (!isStaleRoom(currentRoomId, gen)) {
        setLoading(false);
      }
    }
  }, [fetchAndMergeReactions, isStaleRoom]);

  const appendOptimistic = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
      return [...prev, msg];
    });
  }, []);

  const replaceOptimistic = useCallback((tempId: string, real: ChatMessage) => {
    setMessages((prev) => {
      const seenIds = new Set<string>();
      return prev
        .map((m) => (String(m.id) === tempId ? real : m))
        .filter((m) => {
          const id = String(m.id || '');
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
    });
  }, []);

  const removeOptimistic = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => String(m.id) !== String(tempId)));
  }, []);

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    refresh,
    loadOlder,
    appendOptimistic,
    replaceOptimistic,
    removeOptimistic,
    jumpToMessage,
    searchMessageId,
    setSearchMessageId
  };
}

// ─────────────────────────────────────────────
// 메시지 본문 검색 — 방 제목·마지막 메시지뿐 아니라 대화 내용 전체를 검색
// ─────────────────────────────────────────────

export type ChatMessageSearchHit = {
  id: string;
  roomId: string;
  content: string;
  senderId: string | null;
  senderName: string | null;
  createdAt: string | null;
};

const MESSAGE_SEARCH_LIMIT = 50;
const MESSAGE_SEARCH_DEBOUNCE_MS = 220;
const MESSAGE_SEARCH_ROOM_CHUNK = 150;
const MESSAGE_SEARCH_MIN_LEN = 2;

/**
 * 사용자가 속한 방들의 messages.content 를 ilike 로 검색한다.
 * (PC 메신저전역검색과 동일한 ilike 방식. 모바일은 메시지 본문 검색이 없어
 *  방 제목·마지막 메시지만 매칭돼 "검색이 안 된다"는 문제가 있었다.)
 * roomIds 는 사용자가 접근 가능한 방으로 한정 — RLS 보강 + 불필요 조회 방지.
 */
export function useChatMessageSearch(
  roomIds: string[],
  query: string,
): { hits: ChatMessageSearchHit[]; loading: boolean } {
  const [hits, setHits] = useState<ChatMessageSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const roomIdsKey = useMemo(
    () =>
      Array.from(new Set(roomIds.map((id) => String(id || '').trim()).filter(Boolean))).join(','),
    [roomIds],
  );

  useEffect(() => {
    const trimmed = query.trim();
    const ids = roomIdsKey ? roomIdsKey.split(',') : [];
    if (trimmed.length < MESSAGE_SEARCH_MIN_LEN || ids.length === 0) {
      setHits([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const pattern = `%${escapeLikePattern(trimmed)}%`;
        const collected = new Map<string, ChatMessageSearchHit>();

        for (let i = 0; i < ids.length; i += MESSAGE_SEARCH_ROOM_CHUNK) {
          const chunk = ids.slice(i, i + MESSAGE_SEARCH_ROOM_CHUNK);
          const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
            ({ omittedColumns, selectClause }) => {
              let q = db
                .from('messages')
                .select(selectClause)
                .in('room_id', chunk)
                .ilike('content', pattern)
                .order('created_at', { ascending: false })
                .limit(MESSAGE_SEARCH_LIMIT);
              if (!omittedColumns.has('is_deleted')) {
                q = q.eq('is_deleted', false);
              }
              return q as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>;
            },
          );
          if (error) throw error;
          (Array.isArray(data) ? data : []).forEach((m) => {
            const id = String(m.id || '');
            if (!id) return;
            collected.set(id, {
              id,
              roomId: String(m.room_id || ''),
              content: String(m.content || ''),
              senderId: (m.sender_id as string | null | undefined) ?? null,
              senderName: (m.sender_name as string | null | undefined) ?? null,
              createdAt: (m.created_at as string | null | undefined) ?? null });
          });
        }

        if (!active) return;
        const sorted = Array.from(collected.values())
          .sort((a, b) => toChatDate(b.createdAt).getTime() - toChatDate(a.createdAt).getTime())
          .slice(0, MESSAGE_SEARCH_LIMIT);
        setHits(sorted);
      } catch {
        if (active) setHits([]);
      } finally {
        if (active) setLoading(false);
      }
    }, MESSAGE_SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [roomIdsKey, query]);

  return { hits, loading };
}

// ─────────────────────────────────────────────
// 텍스트 메시지 전송
// ─────────────────────────────────────────────

export type SendTextMessageInput = {
  roomId: string;
  senderId: string;
  content: string;
  replyToId?: string | null;
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
    replyToId: input.replyToId || null,
    albumId: null,
    albumIndex: null,
    albumTotal: null };
  const payload = buildChatMessageInsertPayload(input.senderId, retryPayload);

  try {
    const { data, error } = await insertChatMessageWithFallback<ChatMessage>(
      db,
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
    // PC와 동일하게 전송 직후 수신자 푸시를 즉시 트리거 (모바일 누락 버그 수정).
    triggerMobileChatPush(input.roomId, String((data as ChatMessage).id || ''));
    return { ok: true, message: data as ChatMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : '메시지 전송 실패';
    return { ok: false, error: message };
  }
}

// ─────────────────────────────────────────────
// 헬퍼: 표시명·아바타톤
// ─────────────────────────────────────────────

export type AvatarToneKey = AvatarTone;

/** Chat includes gray so empty/neutral seeds stay distinct. */
export function pickAvatarTone(seed: string | null | undefined): AvatarToneKey {
  return pickAvatarToneLib(seed, { includeGray: true });
}

export function getRoomTitle(
  room: ChatRoom,
  staffs: StaffDirectoryEntry[],
  currentUserId: string | null | undefined,
): string {
  return getRoomDisplayName(room, staffs as StaffMember[], currentUserId);
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

// 채팅 시각은 모두 KST(Asia/Seoul) 기준으로 표기한다. D1(SQLite) CURRENT_TIMESTAMP는
// timezone 없는 UTC 문자열이므로 toChatDate로 보정해 파싱하고, 표시도 timeZone을 명시한다.
// (PC 메신저유틸과 동일 규칙 — raw new Date()는 디바이스 타임존에 의존해 최대 9시간 어긋났다.)
const CHAT_TIME_ZONE = 'Asia/Seoul';

export function formatChatTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const dt = toChatDate(value);
  if (Number.isNaN(dt.getTime())) return '';
  const dayKey = formatKoreanDateKey(dt);
  if (dayKey === getKoreanTodayString()) {
    return dt.toLocaleTimeString('ko-KR', {
      timeZone: CHAT_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false });
  }
  const yesterdayKey = formatKoreanDateKey(new Date(Date.now() - 86_400_000));
  if (dayKey === yesterdayKey) return '어제';
  return `${Number(dayKey.slice(5, 7))}/${Number(dayKey.slice(8, 10))}`;
}

export function formatBubbleTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const dt = toChatDate(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('ko-KR', {
    timeZone: CHAT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false });
}

export function formatBubbleDateLabel(value: string | null | undefined): string {
  if (!value) return '';
  const dt = toChatDate(value);
  if (Number.isNaN(dt.getTime())) return '';
  const dayKey = formatKoreanDateKey(dt);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: CHAT_TIME_ZONE,
    weekday: 'long' }).format(dt);
  return `${Number(dayKey.slice(5, 7))}월 ${Number(dayKey.slice(8, 10))}일 (${weekday})`;
}

export function isSameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = toChatDate(a);
  const db = toChatDate(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return formatKoreanDateKey(da) === formatKoreanDateKey(db);
}

export type { StaffDirectoryEntry };
