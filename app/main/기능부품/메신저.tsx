'use client';
import { toast } from '@/lib/toast';
import { useDeferredValue, useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import SmartDatePicker from './공통/SmartDatePicker';
import type { StaffMember, ChatRoom, ChatMessage } from '@/types';

type PollItem = {
  id: string;
  room_id?: string | null;
  creator_id?: string | null;
  question: string;
  options: string[];
  created_at?: string | null;
  [key: string]: unknown;
};

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const NOTICE_ROOM_NAME = '공지메시지';
const CAN_WRITE_NOTICE_POSITIONS = ['대표', '부장', '팀장', '실장', '병원장', '이사', '본부장', '총무부장', '진료부장', '간호부장'];
const CHAT_ROOM_KEY = 'erp_chat_last_room';
const CHAT_ACTIVE_ROOM_KEY = 'erp_chat_active_room';
const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';
const MOBILE_CHAT_MEDIA_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';

function isMobileChatViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_CHAT_MEDIA_QUERY).matches;
}

/** 원본 파일명으로 다운로드되도록 프록시 URL 생성 */
function buildDownloadUrl(fileUrl: string, fileName: string): string {
  return `/api/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}`;
}
const CHAT_ROOM_PREFS_KEY = 'erp_chat_room_prefs';
const CHAT_PINNED_KEY = 'erp_chat_pinned_messages';
const CHAT_BOOKMARK_KEY = 'erp_chat_bookmarks';
const CHAT_PINNED_ROOM_ORDER_KEY = 'erp_chat_pinned_room_order';
// 운영 DB의 legacy `message_reads`는 아직 `chat_messages`를 참조하고 있어
// 현재 `messages` 기반 채팅과 직접 호환되지 않는다. 읽음 계산은
// `room_read_cursors`로 이미 처리하므로, 충돌만 일으키는 legacy 쓰기는 비활성화한다.
const MESSAGE_READ_WRITES_ENABLED = false;

function sortChatRoomsWithNoticeFirst(rooms: ChatRoom[]): ChatRoom[] {
  const notice = rooms.find(( r: ChatRoom) => r.id === NOTICE_ROOM_ID);
  const others = rooms.filter(( r: ChatRoom) => r.id !== NOTICE_ROOM_ID).sort((a: ChatRoom, b: ChatRoom) => {
    const at = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bt - at;
  });
  return notice ? [notice, ...others] : others;
}

function isImageUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase();
  return /^(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(ext || '');
}

function isVideoUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase();
  return /^(mp4|webm|mov|m4v|avi|mkv)$/.test(ext || '');
}

function extractFileNameFromUrl(url: string | null | undefined): string {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return '첨부파일';
  try {
    const parsed = new URL(rawUrl);
    const lastSegment = decodeURIComponent(parsed.pathname.split('/').pop() || '') || '첨부파일';
    // {타임스탬프}_{UUID}__{원본파일명} 패턴: 원본 파일명 추출
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    // {타임스탬프}_{UUID}.ext 패턴: "첨부파일.ext" 로 표시
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  } catch {
    const withoutQuery = rawUrl.split('?')[0] || '';
    const lastSegment = decodeURIComponent(withoutQuery.split('/').pop() || '') || '첨부파일';
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  }
}

function guessFileExtension(file: File): string {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  const mime = String(file.type || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/zip': 'zip',
  };
  return mimeMap[mime] || 'bin';
}

function getAttachmentDisplayName(fileName: string | null | undefined, fileUrl?: string | null): string {
  const rawName = String(fileName || '').trim();
  if (rawName) return rawName;
  return extractFileNameFromUrl(fileUrl);
}

function getMessageDisplayText(
  content: string | null | undefined,
  fileName?: string | null,
  fileUrl?: string | null,
  fallback: unknown = ''
): string {
  const rawContent = String(content || '').trim();
  if (rawContent) return rawContent;
  if (String(fileName || '').trim() || String(fileUrl || '').trim()) {
    return getAttachmentDisplayName(fileName, fileUrl);
  }
  return String(fallback ?? '');
}

function getPendingAttachmentDisplayName(file: File): string {
  const rawName = String(file.name || '').trim();
  if (rawName) return rawName;
  const extension = guessFileExtension(file);
  if (String(file.type || '').startsWith('image/')) return `붙여넣은 이미지.${extension}`;
  if (String(file.type || '').startsWith('video/')) return `붙여넣은 동영상.${extension}`;
  return `첨부파일.${extension}`;
}

function normalizeMemberIds(members: unknown): string[] {
  return Array.isArray(members) ? members.map((id: unknown) => String(id)) : [];
}

function isActiveChatMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (status === '퇴사' || status === '퇴직') return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

function isMessageReadByCursor(messageCreatedAt: string | null | undefined, lastReadAt: string | null | undefined): boolean {
  if (!messageCreatedAt || !lastReadAt) return false;
  const messageTime = new Date(messageCreatedAt).getTime();
  const cursorTime = new Date(lastReadAt).getTime();
  if (!Number.isFinite(messageTime) || !Number.isFinite(cursorTime)) return false;
  return cursorTime >= messageTime;
}

function isActiveNoticeMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (status === '퇴사') return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

function isRecentPresenceTimestamp(value: string | null | undefined, freshnessMs = 5 * 60 * 1000): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= freshnessMs;
}

function haveSameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function getDirectRoomMembersKey(room: ChatRoom | null | undefined): string | null {
  if (room?.type !== 'direct') return null;
  const members = normalizeMemberIds(room?.members);
  if (members.length !== 2) return null;
  return [...members].sort().join('::');
}

type RoomPreference = {
  pinned?: boolean;
  hidden?: boolean;
};

type PresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

type AttachmentPreviewKind = 'image' | 'video' | 'file';

type AttachmentPreview = {
  url: string;
  name: string;
  kind: AttachmentPreviewKind;
};

type MessageRetryPayload = {
  roomId: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileKind: 'image' | 'video' | 'file' | null;
  replyToId: string | null;
};

type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  retryPayload?: MessageRetryPayload;
  error?: string | null;
};

type ChatRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type GlobalSearchTab = 'all' | 'member' | 'room' | 'message' | 'file';

type AttachmentQuickActionsVariant = 'pill' | 'subtle' | 'overlay';

type AttachmentQuickActionsProps = {
  url: string;
  name: string;
  onPreview: () => void;
  variant?: AttachmentQuickActionsVariant;
  className?: string;
};

function AttachmentQuickActions({
  url,
  name,
  onPreview,
  variant = 'pill',
  className = '',
}: AttachmentQuickActionsProps) {
  const handleShare = async (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했습니다.');
    } catch {
      toast('공유 링크 복사에 실패했습니다.', 'error');
    }
  };

  const actionClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: 'px-2 py-1 rounded-md text-[10px] font-bold',
    subtle: 'text-[10px] font-bold hover:underline underline-offset-2',
    overlay: 'pointer-events-auto px-2 py-1 rounded-[var(--radius-md)] bg-black/40 hover:bg-black/60 text-white text-[10px] font-bold',
  };

  const previewClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-blue-50 dark:bg-blue-900/30 text-[var(--accent)] hover:text-blue-600`,
    subtle: `${actionClassByVariant.subtle} text-[var(--accent)] hover:text-blue-600`,
    overlay: actionClassByVariant.overlay,
  };

  const shareClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    subtle: `${actionClassByVariant.subtle} text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    overlay: actionClassByVariant.overlay,
  };

  const downloadClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:text-emerald-700`,
    subtle: `${actionClassByVariant.subtle} text-emerald-600 hover:text-emerald-700`,
    overlay: actionClassByVariant.overlay,
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPreview();
        }}
        className={previewClassByVariant[variant]}
      >
        미리보기
      </button>
      <button type="button" onClick={handleShare} className={shareClassByVariant[variant]}>
        공유
      </button>
      <a
        href={buildDownloadUrl(url, name)}
        onClick={(event) => event.stopPropagation()}
        className={downloadClassByVariant[variant]}
      >
        다운로드
      </a>
    </div>
  );
}

function getRoomPrefsStorageKey(userId: string | null | undefined): string {
  return `${CHAT_ROOM_PREFS_KEY}:${userId || 'guest'}`;
}

function isUuidLike(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getPinnedStorageKey(roomId: string | null | undefined): string {
  return `${CHAT_PINNED_KEY}:${roomId || 'none'}`;
}

function getBookmarkStorageKey(userId: string | null | undefined): string {
  return `${CHAT_BOOKMARK_KEY}:${userId || 'guest'}`;
}

function getPinnedRoomOrderStorageKey(userId: string | null | undefined): string {
  return `${CHAT_PINNED_ROOM_ORDER_KEY}:${userId || 'guest'}`;
}

function readStoredStringArray(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeStoredStringArray(storageKey: string, values: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(new Set(values.map((value) => String(value))))));
  } catch {
    // ignore
  }
}

function writeStoredPinnedIds(roomId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getPinnedStorageKey(roomId), messageIds.slice(0, 1));
}

function readStoredBookmarks(userId: string | null | undefined): string[] {
  return readStoredStringArray(getBookmarkStorageKey(userId));
}

function writeStoredBookmarks(userId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getBookmarkStorageKey(userId), messageIds);
}

function arraysMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getKoreanTodayString() {
  const now = new Date();
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return koreaNow.toISOString().split('T')[0];
}

function getRoomDisplayName(room: ChatRoom | null | undefined, staffs: StaffMember[], currentUserId: string | null | undefined): string {
  if (!room) return '채팅방';
  if (room.id === NOTICE_ROOM_ID) return NOTICE_ROOM_NAME;
  // 2명 초과(그룹화된 방)면 room.name 우선 사용
  const members = normalizeMemberIds(room.members);
  if (room.type === 'direct' && members.length <= 2) {
    const otherStaff = staffs.find(
      ( staff: StaffMember) =>
        members.includes(String(staff.id)) &&
        String(staff.id) !== String(currentUserId)
    );
    if (otherStaff?.name) return otherStaff.name;
  }
  return room.name || '채팅방';
}

function getRoomPreviewText(room: ChatRoom): string {
  return (room?.last_message_preview as string | null | undefined) || (room?.last_message as string | null | undefined) || '대화가 없습니다.';
}

function sortRoomsForSidebar(
  rooms: ChatRoom[],
  prefs: Record<string, RoomPreference>,
  pinnedRoomOrder: string[]
): ChatRoom[] {
  const notice = rooms.find(( room: ChatRoom) => room.id === NOTICE_ROOM_ID);
  const rest = rooms
    .filter(( room: ChatRoom) => room.id !== NOTICE_ROOM_ID)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const pinnedOrderIndex = new Map(
    pinnedRoomOrder.map((roomId, index) => [String(roomId), index])
  );
  const pinned = rest
    .filter(( room: ChatRoom) => prefs[room.id]?.pinned)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const aIndex = pinnedOrderIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = pinnedOrderIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const regular = rest.filter(( room: ChatRoom) => !prefs[room.id]?.pinned);
  return notice ? [notice, ...pinned, ...regular] : [...pinned, ...regular];
}

interface ChatViewProps {
  user: StaffMember | null;
  onRefresh?: () => void;
  staffs?: StaffMember[];
  initialOpenChatRoomId?: string | null;
  initialOpenMessageId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
}
export default function ChatView({ user, onRefresh, staffs = [], initialOpenChatRoomId, initialOpenMessageId, onConsumeOpenChatRoomId }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const pendingScrollMsgIdRef = useRef<string | null>(null);
  const pendingBottomAlignRoomIdRef = useRef<string | null>(null);
  const timelineItemCountRef = useRef(0);
  const [omniSearch, setOmniSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const deferredOmniSearch = useDeferredValue(omniSearch);
  const deferredChatSearch = useDeferredValue(chatSearch);
  const [inputMsg, setInputMsg] = useState('');
  const [activeActionMsg, setActiveActionMsg] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [deliveryStates, setDeliveryStates] = useState<Record<string, DeliveryState>>({});
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origClass = el.className;
      el.classList.add('bg-[var(--toss-blue-light)]', 'rounded-xl', 'transition-colors', 'duration-500');
      setTimeout(() => {
        el.className = origClass;
      }, 2000);
    }
  };

  const renderMessageContent = (content: string, isMine = false) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-words transition-colors ${
              isMine
                ? 'text-white decoration-white/70 hover:text-white/85'
                : 'text-blue-500 decoration-blue-400/70 hover:text-blue-600'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i} className="break-words whitespace-pre-wrap">{part}</span>;
    });
  };

  const lastReadAtRef = useRef<string | null>(null);
  const isFocusedRef = useRef(true);

  const [viewMode, setViewMode] = useState<'chat' | 'org'>('chat');
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [roomReadCursorMap, setRoomReadCursorMap] = useState<Record<string, string>>({});
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const [roomNotifyOn, setRoomNotifyOn] = useState(true);
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [roomPrefs, setRoomPrefs] = useState<Record<string, RoomPreference>>({});
  const [pinnedRoomOrder, setPinnedRoomOrder] = useState<string[]>([]);
  const [showHiddenRooms, setShowHiddenRooms] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchTab, setGlobalSearchTab] = useState<GlobalSearchTab>('all');
  const [globalSearchResults, setGlobalSearchResults] = useState<ChatMessage[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery);


  const chatRoomsRef = useRef<any[]>([]);
  const deliveryStatesRef = useRef<Record<string, DeliveryState>>({});
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingPeersTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const readWriteInFlightRef = useRef<Set<string>>(new Set());
  const incomingRealtimeMessageIdsRef = useRef<Map<string, number>>(new Map());
  const isNearBottomRef = useRef(true);
  const lastTimelineTailRef = useRef('');
  const selectedRoomIdRef = useRef<string | null>(null);
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);
  const globalRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 방별 입력 draft 저장소 */
  const draftMapRef = useRef<Map<string, string>>(new Map());
  /** 현재 inputMsg 최신값을 ref로 유지 (setRoom 클로저에서 사용) */
  const inputMsgRef = useRef('');

  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);

  const [unreadModalMsg, setUnreadModalMsg] = useState<any | null>(null);
  const [unreadUsers, setUnreadUsers] = useState<StaffMember[]>([]);
  const [unreadLoading, setUnreadLoading] = useState(false);
  const [globalRealtimeState, setGlobalRealtimeState] = useState<ChatRealtimeState>('connecting');
  const [roomRealtimeState, setRoomRealtimeState] = useState<ChatRealtimeState>('idle');
  const [globalRealtimeRetryToken, setGlobalRealtimeRetryToken] = useState(0);
  const [roomRealtimeRetryToken, setRoomRealtimeRetryToken] = useState(0);
  const [chatDirectoryStaffs, setChatDirectoryStaffs] = useState<StaffMember[]>([]);
  const [persistedPinnedMessages, setPersistedPinnedMessages] = useState<ChatMessage[]>([]);

  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true || user?.role === 'admin';
  const canWriteNotice = isMso || Boolean(user?.position && CAN_WRITE_NOTICE_POSITIONS.includes(user.position));
  const allKnownStaffs = useMemo(() => {
    const merged = new Map<string, any>();
    [...chatDirectoryStaffs, ...(Array.isArray(staffs) ? staffs : [])].forEach(( staff: StaffMember) => {
      if (!staff?.id) return;
      const staffId = String(staff.id);
      const previous = merged.get(staffId) || {};
      merged.set(staffId, normalizeProfileUser({ ...previous, ...staff }));
    });
    return Array.from(merged.values());
  }, [chatDirectoryStaffs, staffs]);
  const allKnownStaffMap = useMemo(() => {
    const next = new Map<string, StaffMember>();
    allKnownStaffs.forEach((staff: StaffMember) => {
      if (!staff?.id) return;
      next.set(String(staff.id), staff);
    });
    return next;
  }, [allKnownStaffs]);
  const noticeRoomMembers = useMemo(
    () => allKnownStaffs.filter((staff: StaffMember) => isActiveNoticeMember(staff)),
    [allKnownStaffs]
  );
  const noticeRoomMemberIds = useMemo(
    () => noticeRoomMembers.map((staff: StaffMember) => String(staff.id)),
    [noticeRoomMembers]
  );
  const findKnownStaffById = useCallback(
    (staffId: string | null | undefined) =>
      allKnownStaffMap.get(String(staffId)) || null,
    [allKnownStaffMap]
  );
  const isStaffCurrentlyOnline = useCallback(
    (staff: StaffMember | null | undefined) => {
      if (!staff?.id) return false;
      if (presenceMap[String(staff.id)]) return true;
      const presenceStatus = String(staff.presence_status || '').trim().toLowerCase();
      if (presenceStatus !== 'online') return false;
      const dynamicStaff = staff as Record<string, unknown>;
      const lastSeenAt =
        String(dynamicStaff.last_seen_at || dynamicStaff.online_at || dynamicStaff.updated_at || '').trim();
      return isRecentPresenceTimestamp(lastSeenAt);
    },
    [presenceMap]
  );
  const resolveStaffProfile = useCallback(
    (staffId: string | null | undefined, fallbackName?: string | null) => {
      const knownStaff = findKnownStaffById(staffId);
      if (knownStaff) {
        return {
          ...knownStaff,
          photo_url: getProfilePhotoUrl(knownStaff),
        };
      }
      if (String(staffId) === String(user?.id) && user?.name) {
        return {
          id: user.id,
          name: user.name,
          company: user.company || '',
          department: user.department || '',
          position: user.position || '',
          photo_url: getProfilePhotoUrl(user),
        };
      }
      const safeName = String(fallbackName || '').trim();
      if (!safeName) return null;
      return {
        id: staffId,
        name: safeName,
        company: '',
        department: '',
        position: '',
        photo_url: null,
      };
    },
    [findKnownStaffById, user?.avatar_url, user?.company, user?.department, user?.id, user?.name, user?.position]
  );
  const resolveRoomMemberProfile = useCallback(
    ( room: ChatRoom, memberId: string) => {
      const knownStaff = resolveStaffProfile(memberId);
      if (knownStaff) return knownStaff;
      if (room?.type === 'direct' && String(memberId) !== String(effectiveChatUserId || user?.id || '')) {
        return {
          id: memberId,
          name: room?.name || '이름 없음',
          company: '',
          department: '',
          position: '',
          photo_url: null,
        };
      }
      return {
        id: memberId,
        name: '이름 없음',
        company: '',
        department: '',
        position: '',
        photo_url: null,
      };
    },
    [resolveStaffProfile, user?.id]
  );
  const currentStaffProfile = useMemo(() => {
    if (!Array.isArray(allKnownStaffs) || allKnownStaffs.length === 0) return null;
    const sessionUserId = String(user?.id || '').trim();
    if (sessionUserId) {
      const exactMatch = allKnownStaffs.find(( staff: StaffMember) => String(staff.id) === sessionUserId);
      if (exactMatch) return exactMatch;
    }
    const sessionUserName = String(user?.name || '').trim();
    if (sessionUserName) {
      return allKnownStaffs.find(( staff: StaffMember) => String(staff.name || '').trim() === sessionUserName) || null;
    }
    return null;
  }, [allKnownStaffs, user?.id, user?.name]);

  useEffect(() => {
    let active = true;
    const loadChatDirectory = async () => {
      try {
        const { data, error } = await supabase
          .from('staff_members')
          .select('id, name, company, department, position, presence_status, last_seen_at, status, permissions');
        if (error) throw error;
        if (active) {
          setChatDirectoryStaffs(Array.isArray(data) ? data.map(( staff: StaffMember) => normalizeProfileUser(staff)) : []);
        }
      } catch (error) {
        console.error('채팅 직원 디렉터리 로드 실패:', error);
        if (active) {
          setChatDirectoryStaffs([]);
        }
      }
    };
    void loadChatDirectory();
    return () => {
      active = false;
    };
  }, []);
  const effectiveTodoUserId = useMemo(() => {
    if (isUuidLike(user?.id)) {
      return String(user!.id);
    }
    if (currentStaffProfile?.id) {
      return String(currentStaffProfile.id);
    }
    return String(user?.id || '').trim();
  }, [currentStaffProfile?.id, user?.id]);
  const effectiveChatUserId = useMemo(() => {
    const currentStaffId = String(currentStaffProfile?.id || '').trim();
    if (currentStaffId) {
      return currentStaffId;
    }
    return String(user?.id || '').trim();
  }, [currentStaffProfile?.id, user?.id]);
  const getEffectiveRoomMemberIds = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return [];
    if (String(room.id) === NOTICE_ROOM_ID) return noticeRoomMemberIds;

    const seenIds = new Set<string>();
    const memberIds: string[] = [];
    normalizeMemberIds(room.members).forEach((memberId) => {
      if (!memberId || seenIds.has(memberId)) return;
      seenIds.add(memberId);

      if (memberId === effectiveChatUserId) {
        memberIds.push(memberId);
        return;
      }

      const knownStaff = allKnownStaffMap.get(memberId);
      // staff 정보가 없는 경우(다른 회사 등)도 방 접근 허용 — 정보가 있으면 활성 여부 체크
      if (!knownStaff || isActiveChatMember(knownStaff)) {
        memberIds.push(memberId);
      }
    });
    return memberIds;
  }, [allKnownStaffMap, effectiveChatUserId, noticeRoomMemberIds]);

  const isRoomAccessibleToCurrentUser = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return false;
    if (String(room.id) === NOTICE_ROOM_ID) return true;
    return getEffectiveRoomMemberIds(room).includes(effectiveChatUserId);
  }, [effectiveChatUserId, getEffectiveRoomMemberIds]);

  const repairDirectRooms = useCallback(async (rooms: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : [];
    const orphanRooms = sourceRooms.filter(( room: ChatRoom) =>
      room?.type === 'direct' && (!Array.isArray(room.members) || room.members.length === 0)
    );
    if (orphanRooms.length === 0) {
      return sourceRooms;
    }

    try {
      const orphanRoomIds = orphanRooms
        .map(( room: ChatRoom) => String(room?.id || '').trim())
        .filter(Boolean);
      if (orphanRoomIds.length === 0) {
        return sourceRooms;
      }

      const { data: roomMessages, error } = await supabase
        .from('messages')
        .select('room_id, sender_id, created_at')
        .in('room_id', orphanRoomIds)
        .not('sender_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const senderIdsByRoom = new Map<string, Set<string>>();
      (roomMessages || []).forEach(( message: Record<string, unknown>) => {
        const roomId = String(message?.room_id || '').trim();
        const senderId = String(message?.sender_id || '').trim();
        if (!roomId || !senderId || senderId === 'null' || senderId === 'undefined') return;
        const senders = senderIdsByRoom.get(roomId) || new Set<string>();
        senders.add(senderId);
        senderIdsByRoom.set(roomId, senders);
      });

      const repairedRooms = [...sourceRooms];
      for (const room of orphanRooms) {
        const roomId = String(room?.id || '').trim();
        const inferredMembers = Array.from(senderIdsByRoom.get(roomId) || []);
        if (inferredMembers.length !== 2) continue;

        const { error: updateError } = await supabase
          .from('chat_rooms')
          .update({ members: inferredMembers })
          .eq('id', roomId);
        if (updateError) throw updateError;

        const roomIndex = repairedRooms.findIndex((candidate: ChatRoom) => String(candidate?.id) === roomId);
        if (roomIndex >= 0) {
          repairedRooms[roomIndex] = {
            ...repairedRooms[roomIndex],
            members: inferredMembers,
          };
        }
      }

      return repairedRooms;
    } catch (error) {
      console.error('repairDirectRooms failed', error);
      return sourceRooms;
    }
  }, []);

  const setRoom = (roomId: string | null) => {
    // 현재 방의 입력 draft 저장
    if (selectedRoomIdRef.current && selectedRoomIdRef.current !== roomId) {
      draftMapRef.current.set(selectedRoomIdRef.current, inputMsgRef.current);
    }
    pendingBottomAlignRoomIdRef.current = roomId;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    if (selectedRoomIdRef.current !== roomId) {
      lastTimelineTailRef.current = '';
      setMessages([]);
      setReadCounts({});
      setRoomReadCursorMap({});
      setReactions({});
      setPolls([]);
      setPollVotes({});
      setPinnedIds([]);
      setPersistedPinnedMessages([]);
      setBookmarkedIds(new Set());
      // sent 상태 메시지의 deliveryState 정리 (메모리 누적 방지)
      setDeliveryStates((prev) => {
        const next: Record<string, DeliveryState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.status !== 'sent') next[k] = v;
        }
        return next;
      });
    }
    setSelectedRoomId(roomId);
    // 새 방의 저장된 draft 복원
    const savedDraft = (roomId ? draftMapRef.current.get(roomId) : '') || '';
    inputMsgRef.current = savedDraft;
    setInputMsg(savedDraft);
    // 채팅방 열 때 해당 방 관련 미읽 알림/안읽음 개수 즉시 정리
    if (roomId && effectiveChatUserId) {
      const readAt = new Date().toISOString();
      setRoomUnreadCounts((prev) => {
        if (!prev[roomId]) return prev;
        return { ...prev, [roomId]: 0 };
      });
      void (async () => {
        try {
          await Promise.allSettled([
            supabase
              .from('notifications')
              .update({ read_at: readAt })
              .eq('user_id', effectiveChatUserId)
              .in('type', ['message', 'mention'])
              .is('read_at', null)
              .filter('metadata->>room_id', 'eq', roomId),
            persistRoomReadCursor(roomId, readAt),
          ]);
          broadcastChatSync('message-read', roomId);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp-notification-read'));
          }
        } catch { /* ignore */ }
      })();
    }
    if (typeof window === 'undefined') return;
    try {
      if (roomId) {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, roomId);
      } else {
        window.localStorage.removeItem(CHAT_ROOM_KEY);
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedRoomId) {
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, selectedRoomId);
      } else {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
    }
    return () => {
      try {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      } catch {
      }
    };
  }, [selectedRoomId]);

  const roomPrefsUserId = effectiveChatUserId || user?.id || null;

  const updateRoomPreference = useCallback((roomId: string, patch: RoomPreference) => {
    setRoomPrefs((prev) => {
      const next = {
        ...prev,
        [roomId]: {
          ...(prev[roomId] || {}),
          ...patch,
        },
      };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(getRoomPrefsStorageKey(roomPrefsUserId), JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [roomPrefsUserId]);

  const persistPinnedRoomOrder = useCallback((nextOrder: string[]) => {
    const normalized = Array.from(new Set(nextOrder.map((roomId) => String(roomId))));
    setPinnedRoomOrder(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          getPinnedRoomOrderStorageKey(roomPrefsUserId),
          JSON.stringify(normalized)
        );
      } catch {
        // ignore
      }
    }
  }, [roomPrefsUserId]);

  const toggleRoomPinned = useCallback((roomId: string, shouldPin: boolean) => {
    updateRoomPreference(roomId, { pinned: shouldPin });
    persistPinnedRoomOrder(
      shouldPin
        ? [...pinnedRoomOrder.filter((id) => String(id) !== String(roomId)), String(roomId)]
        : pinnedRoomOrder.filter((id) => String(id) !== String(roomId))
    );
  }, [persistPinnedRoomOrder, pinnedRoomOrder, updateRoomPreference]);

  const movePinnedRoom = useCallback((roomId: string, direction: 'up' | 'down') => {
    const currentOrder = [...pinnedRoomOrder];
    const currentIndex = currentOrder.findIndex((id) => String(id) === String(roomId));
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const [moved] = currentOrder.splice(currentIndex, 1);
    currentOrder.splice(targetIndex, 0, moved);
    persistPinnedRoomOrder(currentOrder);
  }, [persistPinnedRoomOrder, pinnedRoomOrder]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const listEl = messageListRef.current;
    if (listEl) {
      if (behavior === 'auto') {
        listEl.scrollTop = listEl.scrollHeight;
      } else {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior });
      }
    } else {
      scrollRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
    if (!isMobileChatViewport()) {
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({
          behavior,
          block: 'end',
          inline: 'nearest',
        });
      });
    }
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  const alignRoomToLatest = useCallback((roomId: string | null | undefined, behavior: ScrollBehavior = 'auto') => {
    if (!roomId) return;

    let attempts = 0;
    const maxAttempts = 4;

    const tryAlign = () => {
      if (selectedRoomIdRef.current !== roomId) return;

      const hasTimelineItems = timelineItemCountRef.current > 0;
      if (!hasTimelineItems) {
        return;
      }

      scrollToBottom(attempts === 0 ? behavior : 'auto');

      const listEl = messageListRef.current;
      if (!listEl) {
        if (pendingBottomAlignRoomIdRef.current === roomId) {
          pendingBottomAlignRoomIdRef.current = null;
        }
        return;
      }

      const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      if (distanceFromBottom > 24 && attempts < maxAttempts) {
        attempts += 1;
        requestAnimationFrame(() => {
          requestAnimationFrame(tryAlign);
        });
        return;
      }

      if (pendingBottomAlignRoomIdRef.current === roomId) {
        pendingBottomAlignRoomIdRef.current = null;
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryAlign);
    });

    window.setTimeout(tryAlign, 120);
    window.setTimeout(tryAlign, 260);
  }, [scrollToBottom]);

  const alignRoomToLatestImmediately = useCallback((roomId: string | null | undefined) => {
    if (!roomId) return;
    if (selectedRoomIdRef.current !== roomId) return;

    const listEl = messageListRef.current;
    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight;
    } else {
      scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    if (!isMobileChatViewport()) {
      composerRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
        inline: 'nearest',
      });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);

    if (pendingBottomAlignRoomIdRef.current === roomId) {
      pendingBottomAlignRoomIdRef.current = null;
    }
  }, []);

  const persistMessageReads = useCallback(async (messageIds: string[]) => {
    if (!effectiveChatUserId || messageIds.length === 0) return;
    if (!MESSAGE_READ_WRITES_ENABLED) return;

    const uniqueMessageIds = Array.from(new Set(messageIds.map((id) => String(id))));
    const candidateIds = uniqueMessageIds.filter((id) => !readWriteInFlightRef.current.has(id));
    if (candidateIds.length === 0) return;
    candidateIds.forEach((id) => readWriteInFlightRef.current.add(id));

    try {
      const readAt = new Date().toISOString();
      const { error } = await supabase.from('message_reads').upsert(
        candidateIds.map((id) => ({
          reader_id: effectiveChatUserId,
          user_id: effectiveChatUserId,
          message_id: id,
          read_at: readAt,
        })),
        { onConflict: 'user_id,message_id' }
      );
      if (error && error.code !== '23503' && error.code !== '42P10') {
        console.warn('message_reads upsert skipped', error);
      }
    } finally {
      candidateIds.forEach((id) => readWriteInFlightRef.current.delete(id));
    }
  }, [effectiveChatUserId]);

  const persistRoomReadCursor = useCallback(async (roomId: string | null | undefined, readAt?: string | null) => {
    if (!effectiveChatUserId || !roomId) return;
    try {
      await supabase.from('room_read_cursors').upsert({
        user_id: effectiveChatUserId,
        room_id: roomId,
        last_read_at: readAt || new Date().toISOString(),
      }, { onConflict: 'user_id,room_id' });
    } catch (error) {
      console.warn('room_read_cursors upsert skip', error);
    }
  }, [effectiveChatUserId]);

  const updateScrollPositionState = useCallback(() => {
    const listEl = messageListRef.current;
    if (!listEl) return;
    const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 96;
    isNearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom && Boolean(selectedRoomId));
  }, [selectedRoomId]);

  const broadcastChatSync = useCallback((action: string, roomId?: string | null) => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-chat-sync', {
          detail: {
            action,
            roomId: roomId || selectedRoomId || null,
            at: Date.now(),
          },
        }));
      }
      if (!syncChannelRef.current) return;
      syncChannelRef.current.postMessage({
        action,
        roomId: roomId || selectedRoomId || null,
        at: Date.now(),
      });
    } catch {
      // ignore
    }
  }, [selectedRoomId]);

  const triggerChatPush = useCallback(async (roomId: string, messageId: string) => {
    try {
      const response = await fetch('/api/notifications/chat-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, messageId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `push trigger failed (${response.status})`);
      }
    } catch (error) {
      console.error('chat push trigger failed', error);
    }
  }, []);

  const emitTypingState = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current || !selectedRoomId || !effectiveChatUserId) return;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        roomId: selectedRoomId,
        userId: String(effectiveChatUserId),
        name: user?.name || 'Unknown',
        isTyping,
      },
    });
  }, [selectedRoomId, effectiveChatUserId, user?.name]);

  const handleComposerChange = useCallback((value: string, caret: number) => {
    inputMsgRef.current = value;
    setInputMsg(value);
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/@([^\s@]{0,20})$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
      setMentionQuery('');
    }

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }

    if (value.trim()) {
      emitTypingState(true);
      typingClearRef.current = setTimeout(() => {
        emitTypingState(false);
        typingClearRef.current = null;
      }, 1800);
    } else {
      emitTypingState(false);
    }
  }, [emitTypingState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(getRoomPrefsStorageKey(roomPrefsUserId));
      setRoomPrefs(raw ? JSON.parse(raw) : {});
    } catch {
      setRoomPrefs({});
    }
    try {
      const rawPinnedOrder = window.localStorage.getItem(getPinnedRoomOrderStorageKey(roomPrefsUserId));
      const parsedPinnedOrder = rawPinnedOrder ? JSON.parse(rawPinnedOrder) : [];
      setPinnedRoomOrder(Array.isArray(parsedPinnedOrder) ? parsedPinnedOrder.map((value) => String(value)) : []);
    } catch {
      setPinnedRoomOrder([]);
    }
  }, [roomPrefsUserId]);

  useEffect(() => {
    deliveryStatesRef.current = deliveryStates;
  }, [deliveryStates]);

  useEffect(() => {
    const composerEl = composerRef.current;
    if (!composerEl) return;
    composerEl.style.height = '0px';
    composerEl.style.height = `${Math.min(120, composerEl.scrollHeight)}px`;
  }, [inputMsg]);

  const [polls, setPolls] = useState<PollItem[]>([]);
  const [pollVotes, setPollVotes] = useState<Record<string, Record<number, number>>>({});
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
const [pollOptions, setPollOptions] = useState<string[]>(['찬성', '반대']);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSourceMsg, setForwardSourceMsg] = useState<ChatMessage | null>(null);

  useEffect(() => {
    timelineItemCountRef.current = messages.length + polls.length + persistedPinnedMessages.length;
  }, [messages.length, persistedPinnedMessages.length, polls.length]);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const deferredAddMemberSearch = useDeferredValue(addMemberSearch);
  const [addMemberSelectingIds, setAddMemberSelectingIds] = useState<string[]>([]);
  // 기본 접힌 상태 — 펼쳐진 팀만 별도 추적
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const toggleDept = (key: string) =>
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview(null);
  }, []);

  const openAttachmentPreview = useCallback(
    (url: string | null | undefined, fileName?: string | null, forcedKind?: AttachmentPreviewKind) => {
      const resolvedUrl = String(url || '').trim();
      if (!resolvedUrl) return;

      const resolvedKind: AttachmentPreviewKind =
        forcedKind || (isImageUrl(resolvedUrl) ? 'image' : isVideoUrl(resolvedUrl) ? 'video' : 'file');

      setAttachmentPreview({
        url: resolvedUrl,
        name: getAttachmentDisplayName(fileName, resolvedUrl),
        kind: resolvedKind,
      });
    },
    []
  );

  const imagePreviewUrl = attachmentPreview?.kind === 'image' ? attachmentPreview.url : null;
  const setImagePreviewUrl = useCallback(
    (nextUrl: string | null) => {
      if (nextUrl) {
        openAttachmentPreview(nextUrl, null, 'image');
        return;
      }
      closeAttachmentPreview();
    },
    [closeAttachmentPreview, openAttachmentPreview]
  );

  const [threadRoot, setThreadRoot] = useState<any | null>(null);

  const [slashCommand, setSlashCommand] = useState<'annual_leave' | 'purchase' | null>(null);
  const [showSlashModal, setShowSlashModal] = useState(false);
  const [slashForm, setSlashForm] = useState<{ startDate: string; endDate: string; reason: string; itemName: string; quantity: number }>({
    startDate: '',
    endDate: '',
    reason: '',
    itemName: '',
    quantity: 1,
  });

  const updateUnreadForRooms = useCallback(
    async (rooms: ChatRoom[]) => {
      if (!effectiveChatUserId || !rooms?.length) return;
      try {
        // 내가 멤버인 방만 카운트 (NOTICE_ROOM_ID 포함)
        const myRooms = rooms.filter(( r: ChatRoom) => {
          if (r.id === NOTICE_ROOM_ID) return true;
          if (Array.isArray(r.members)) {
            return r.members.some((id: unknown) => String(id) === effectiveChatUserId);
          }
          return false;
        });
        if (!myRooms.length) return;
        const roomIds = myRooms.map(( r: ChatRoom) => r.id);
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('room_id, last_read_at')
          .eq('user_id', effectiveChatUserId)
          .in('room_id', roomIds);

        const cursorMap: Record<string, string | null> = {};
        (cursors || []).forEach((c: Record<string, unknown>) => {
          cursorMap[c.room_id as string] = c.last_read_at as string | null;
        });

        const counts: Record<string, number> = {};
        for (const roomId of roomIds) {
          const last = cursorMap[roomId];
          let query = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .neq('sender_id', effectiveChatUserId)
            .eq('is_deleted', false);
          if (last) query = query.gt('created_at', last);
          const { count } = await query;
          counts[roomId] = count || 0;
        }
        setRoomUnreadCounts(counts);
      } catch (e) {
        console.error('채팅방별 안읽은 메시지 계산 실패:', e);
      }
    },
    [effectiveChatUserId]
  );

  const syncChatRoomsState = useCallback(async (rooms: ChatRoom[]) => {
    const repairedRooms = await repairDirectRooms(rooms);
    const list = sortChatRoomsWithNoticeFirst(repairedRooms || []);
    setChatRooms(list);
    await updateUnreadForRooms(list);
    return list;
  }, [repairDirectRooms, updateUnreadForRooms]);

  const claimIncomingRealtimeMessage = useCallback((messageId: string | null | undefined) => {
    const nextId = String(messageId || '').trim();
    if (!nextId) return false;

    const now = Date.now();
    const seen = incomingRealtimeMessageIdsRef.current;
    seen.forEach((timestamp, key) => {
      if (now - timestamp > 15000) {
        seen.delete(key);
      }
    });

    const previous = seen.get(nextId);
    if (previous && now - previous < 5000) {
      return false;
    }

    seen.set(nextId, now);
    return true;
  }, []);

  const isRoomInSelectedConversation = useCallback((roomId: string | null | undefined, rooms?: ChatRoom[]) => {
    const nextRoomId = String(roomId || '').trim();
    const selectedId = String(selectedRoomIdRef.current || '').trim();
    if (!nextRoomId || !selectedId) return false;
    if (nextRoomId === selectedId) return true;

    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const selectedRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === selectedId) || null;
    const incomingRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === nextRoomId) || null;
    if (!selectedRoom || !incomingRoom) return false;

    const selectedRoomKey = getDirectRoomMembersKey(selectedRoom);
    if (!selectedRoomKey) return false;
    return selectedRoomKey === getDirectRoomMembersKey(incomingRoom);
  }, []);

  const scheduleRealtimeReconnect = useCallback((scope: 'global' | 'room') => {
    const retryRef = scope === 'global' ? globalRealtimeRetryTimerRef : roomRealtimeRetryTimerRef;
    if (retryRef.current) return;

    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      if (scope === 'global') {
        setGlobalRealtimeRetryToken((prev) => prev + 1);
      } else {
        setRoomRealtimeRetryToken((prev) => prev + 1);
      }
    }, 1200);
  }, []);

  const handleIncomingRealtimeMessage = useCallback(async (row: ChatMessage) => {
    if (!row?.id || !row.room_id) return;
    if (!claimIncomingRealtimeMessage(row.id)) return;

    const roomId = String(row.room_id);
    const currentRooms = chatRoomsRef.current;
    const currentRoom = currentRooms.find((room: ChatRoom) => String(room.id) === roomId) || null;
    if (currentRoom && !isRoomAccessibleToCurrentUser(currentRoom)) return;

    const currentConversationRoomId = String(selectedRoomIdRef.current || roomId);
    const isCurrentRoom = isRoomInSelectedConversation(roomId, currentRooms);
    const isOwnMessage = String(row.sender_id || '') === String(effectiveChatUserId || '');
    const previewText = getMessageDisplayText(
      row.content,
      row.file_name,
      row.file_url,
      currentRoom?.last_message_preview || currentRoom?.last_message || ''
    );

    setChatRooms((prev) => {
      if (!prev.some((room: ChatRoom) => String(room.id) === roomId)) return prev;
      return sortChatRoomsWithNoticeFirst(
        prev.map((room: ChatRoom) =>
          String(room.id) === roomId
            ? {
                ...room,
                last_message: previewText || room.last_message,
                last_message_preview: previewText || room.last_message_preview,
                last_message_at: row.created_at || new Date().toISOString(),
              }
            : room
        )
      );
    });

    if (isCurrentRoom) {
      pendingBottomAlignRoomIdRef.current = currentConversationRoomId;
      setMessages((prev) => {
        if (prev.some((message: ChatMessage) => String(message.id) === String(row.id))) return prev;
        const newMsg = {
          ...row,
          staff: resolveStaffProfile(row.sender_id, row.sender_name) || { name: '이름 없음', photo_url: null },
        };
        const optimisticIndex = prev.findIndex((message: ChatMessage) => {
          if (!String(message.id || '').startsWith('temp-')) return false;
          if (String(message.room_id || '') !== String(row.room_id || '')) return false;
          if (String(message.sender_id || '') !== String(row.sender_id || '')) return false;
          return (
            (message.content || '') === (row.content || '') &&
            (message.file_url || null) === (row.file_url || null)
          );
        });
        if (optimisticIndex >= 0) {
          return prev.map((message: ChatMessage, index: number) =>
            index === optimisticIndex ? newMsg : message
          );
        }
        return [...prev, newMsg];
      });

      if (!isOwnMessage && user?.id) {
        const readAt = new Date().toISOString();
        void persistMessageReads([String(row.id)])
          .then(async () => {
            await persistRoomReadCursor(roomId, readAt);
            broadcastChatSync('message-read', roomId);
          })
          .catch(() => {});
        setRoomUnreadCounts((prev) => {
          const next = { ...prev, [roomId]: 0 };
          if (currentConversationRoomId && currentConversationRoomId !== roomId) {
            next[currentConversationRoomId] = 0;
          }
          return next;
        });
      }
      void fetchDataRef.current?.();
      return;
    }

    // 인앱 토스트 알림: 다른 방 메시지 or 앱이 백그라운드 상태일 때
    if (!isOwnMessage) {
      setRoomUnreadCounts((prev) => ({
        ...prev,
        [roomId]: Math.max(1, (prev[roomId] || 0) + 1),
      }));
    }
  }, [
    broadcastChatSync,
    claimIncomingRealtimeMessage,
    effectiveChatUserId,
    isRoomAccessibleToCurrentUser,
    persistMessageReads,
    persistRoomReadCursor,
    updateUnreadForRooms,
    user?.id,
    isRoomInSelectedConversation,
  ]);

  const syncNoticeRoomMembers = useCallback(async (rooms?: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const noticeRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID);
    if (!noticeRoom) return;

    const currentMemberIds = normalizeMemberIds(noticeRoom.members);
    if (haveSameMembers(currentMemberIds, noticeRoomMemberIds)) return;

    try {
      const { error } = await supabase
        .from('chat_rooms')
        .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
        .eq('id', NOTICE_ROOM_ID);
      if (error) throw error;
    } catch (error) {
      console.error('공지방 참여자 동기화 실패:', error);
    }
  }, [noticeRoomMemberIds]);

  useEffect(() => {
    chatRoomsRef.current = chatRooms;
  }, [chatRooms]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(CHAT_ROOM_KEY);
      if (saved && saved !== 'null' && saved !== 'undefined') {
        pendingBottomAlignRoomIdRef.current = saved;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setSelectedRoomId(saved);
      } else {
        pendingBottomAlignRoomIdRef.current = NOTICE_ROOM_ID;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setSelectedRoomId(NOTICE_ROOM_ID);
      }
    } catch {
      pendingBottomAlignRoomIdRef.current = NOTICE_ROOM_ID;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      setSelectedRoomId(NOTICE_ROOM_ID);
    }
  }, []);

  useEffect(() => {
    if (initialOpenChatRoomId) {
      setRoom(initialOpenChatRoomId);
      if (initialOpenMessageId) {
        pendingScrollMsgIdRef.current = initialOpenMessageId;
      }
      onConsumeOpenChatRoomId?.();
    }
  }, [initialOpenChatRoomId, initialOpenMessageId]);

  useEffect(() => {
    const targetMsgId = pendingScrollMsgIdRef.current;
    if (targetMsgId && messages.length > 0) {
      if (messages.some(m => m.id === targetMsgId)) {
        setTimeout(() => {
          scrollToMessage(targetMsgId);
          pendingScrollMsgIdRef.current = null;
        }, 500);
      }
    }
  }, [messages]);

  const fetchData = useCallback(async () => {
    if (!selectedRoomId) return;
    const roomIdForFetch = String(selectedRoomId);
    const { data: roomRows } = await supabase.from('chat_rooms').select('*');
    const repairedRooms = await repairDirectRooms(roomRows || []);
    const selectedRoomRecord =
      repairedRooms.find(( room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    const list = await syncChatRoomsState(repairedRooms);

    if (!selectedRoomRecord || !isRoomAccessibleToCurrentUser(selectedRoomRecord)) {
      const fallbackRoomId =
        list.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID && isRoomAccessibleToCurrentUser(room))?.id ||
        list.find((room: ChatRoom) => isRoomAccessibleToCurrentUser(room))?.id ||
        null;
      if (String(fallbackRoomId || '') !== roomIdForFetch) {
        setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
      } else if (!fallbackRoomId) {
        setRoom(null);
      }
      return;
    }

    const selectedRoomKey = getDirectRoomMembersKey(selectedRoomRecord);
    const canonicalDirectRoom = selectedRoomKey
      ? repairedRooms
          .filter(( room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
          .sort((a: ChatRoom, b: ChatRoom) =>
            new Date(b.last_message_at || b.created_at || 0).getTime() -
            new Date(a.last_message_at || a.created_at || 0).getTime()
          )[0]
      : null;
    if (canonicalDirectRoom?.id && String(canonicalDirectRoom.id) !== roomIdForFetch) {
      setRoom(String(canonicalDirectRoom.id));
    }
    const roomIdsToLoad = Array.from(
      new Set(
        selectedRoomKey
          ? repairedRooms
              .filter(( room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
              .map(( room: ChatRoom) => String(room.id))
          : [roomIdForFetch]
      )
    );

    const query = supabase
      .from('messages')
      .select('*')
      .in('room_id', roomIdsToLoad)
      .order('created_at', { ascending: true });
    const { data: msgs } = await query;
    if (msgs) {
      const enrichedMessages = msgs.map((msg: ChatMessage) => {
        const matchedStaff = resolveStaffProfile(msg.sender_id);
        return {
          ...msg,
          staff: msg.staff || matchedStaff,
        };
      });
      setMessages((prev) => {
        const localOnly = prev.filter((msg: ChatMessage) => {
          const id = String(msg.id || '');
          return id.startsWith('temp-') && deliveryStatesRef.current[id]?.status !== 'sent';
        });
        return [...enrichedMessages, ...localOnly].sort(
          (a: ChatRoom, b: ChatRoom) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      });
    }

    if (msgs?.length) {
      const ids = msgs.map(( m: ChatMessage) => String(m.id));
      const roomMemberIds = getEffectiveRoomMemberIds(selectedRoomRecord);
      const nextRoomReadCursorMap: Record<string, string> = {};
      if (roomMemberIds.length > 0) {
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('user_id, last_read_at')
          .eq('room_id', roomIdForFetch)
          .in('user_id', roomMemberIds);
        (cursors || []).forEach((cursor: Record<string, unknown>) => {
          const memberId = String(cursor.user_id || '');
          const lastReadAt = String(cursor.last_read_at || '');
          if (!memberId || !lastReadAt) return;
          nextRoomReadCursorMap[memberId] = lastReadAt;
        });
      }
      setRoomReadCursorMap(nextRoomReadCursorMap);

      const counts: Record<string, number> = {};
      (msgs || []).forEach((message: ChatMessage) => {
        const messageId = String(message.id || '');
        if (!messageId) return;
        const messageRecipientIds = roomMemberIds.filter((memberId) => memberId !== String(message.sender_id || ''));
        const readersCount = messageRecipientIds.filter((memberId) =>
          isMessageReadByCursor(message.created_at, nextRoomReadCursorMap[memberId])
        ).length;
        counts[messageId] = readersCount;
      });
      setReadCounts(counts);
      if (effectiveTodoUserId) {
        try {
          const { data: bookmarks, error: bookmarkError } = await supabase
            .from('message_bookmarks')
            .select('message_id')
            .eq('user_id', effectiveTodoUserId)
            .in('message_id', ids);
          if (bookmarkError) throw bookmarkError;
          const nextBookmarkIds = (bookmarks || []).map((bookmark: Record<string, unknown>) => String(bookmark.message_id));
          setBookmarkedIds(new Set(nextBookmarkIds));
          writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
        } catch {
          setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId).filter((bookmarkId) => ids.includes(bookmarkId))));
        }
      }
    } else {
      setReadCounts({});
      setRoomReadCursorMap({});
      setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId)));
    }

    try {
      const { data: pinned, error: pinnedError } = await supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('room_id', roomIdForFetch);
      if (pinnedError) throw pinnedError;
      const nextPinnedIds = (pinned || []).map((item: Record<string, unknown>) => String(item.message_id)).slice(-1);
      setPinnedIds(nextPinnedIds);
      writeStoredPinnedIds(roomIdForFetch, nextPinnedIds);
      if (nextPinnedIds.length > 0) {
        const pinnedLookup = new Map<string, any>();
        (msgs || []).forEach((msg: ChatMessage) => {
          const messageId = String(msg.id);
          if (!nextPinnedIds.includes(messageId)) return;
          pinnedLookup.set(messageId, {
            ...msg,
            staff: msg.staff || resolveStaffProfile(msg.sender_id),
          });
        });
        const missingPinnedIds = nextPinnedIds.filter((messageId) => !pinnedLookup.has(messageId));
        if (missingPinnedIds.length > 0) {
          const { data: pinnedRows, error: pinnedRowsError } = await supabase
            .from('messages')
            .select('*')
            .in('id', missingPinnedIds);
          if (pinnedRowsError) throw pinnedRowsError;
          (pinnedRows || []).forEach((msg: ChatMessage) => {
            pinnedLookup.set(String(msg.id), {
              ...msg,
              staff: resolveStaffProfile(msg.sender_id),
            });
          });
        }
        setPersistedPinnedMessages(
          nextPinnedIds
            .map((messageId) => pinnedLookup.get(messageId))
            .filter(Boolean)
        );
      } else {
        setPersistedPinnedMessages([]);
      }
    } catch (error) {
      console.error('공지 메시지 불러오기 실패:', error);
      setPersistedPinnedMessages([]);
    }

    try {
      const { data: reacts } = await supabase.from('message_reactions').select('message_id, emoji');
      const reactMap: Record<string, Record<string, number>> = {};
      reacts?.forEach(( r: Record<string, unknown>) => {
        const msgId = r.message_id as string;
        const emoji = r.emoji as string;
        if (!reactMap[msgId]) reactMap[msgId] = {};
        reactMap[msgId][emoji] = (reactMap[msgId][emoji] || 0) + 1;
      });
      setReactions(reactMap);

      const { data: dbPolls } = await supabase.from('polls').select('*').eq('room_id', roomIdForFetch);
      if (dbPolls?.length) {
        setPolls(dbPolls);
      } else {
        setPolls([]);
      }
      const { data: votes } = await supabase.from('poll_votes').select('poll_id, option_index');
      const vMap: Record<string, Record<number, number>> = {};
      votes?.forEach((v: Record<string, unknown>) => {
        const pollId = v.poll_id as string;
        const optIdx = v.option_index as number;
        if (!vMap[pollId]) vMap[pollId] = {};
        vMap[pollId][optIdx] = (vMap[pollId][optIdx] || 0) + 1;
      });
      setPollVotes(vMap);
    } catch (error) {
      console.error('반응/투표 데이터 불러오기 실패:', error);
    }

    // 읽음 커서/message_reads 쓰기는 방 선택 시(setRoom)와 실시간 새 메시지 수신 시에만 수행.
    // fetchData 내부에서 호출하면 realtime → fetchData 무한 루프 발생하므로 제거.
    if (roomIdForFetch) {
      setRoomUnreadCounts(prev => {
        if (!prev[roomIdForFetch]) return prev;
        return { ...prev, [roomIdForFetch]: 0 };
      });
    }

    if (pendingBottomAlignRoomIdRef.current === roomIdForFetch) {
      if ((msgs?.length || 0) > 0) {
        alignRoomToLatest(roomIdForFetch, 'auto');
      } else {
        pendingBottomAlignRoomIdRef.current = null;
      }
    }
  }, [selectedRoomId, user?.id, effectiveChatUserId, effectiveTodoUserId, repairDirectRooms, syncChatRoomsState, resolveStaffProfile, alignRoomToLatest, getEffectiveRoomMemberIds, isRoomAccessibleToCurrentUser]);

  const roomNotifyRef = useRef(true);
  useEffect(() => { roomNotifyRef.current = roomNotifyOn; }, [roomNotifyOn]);

  // fetchDataRef를 항상 최신 fetchData로 동기화
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    return () => {
      if (globalRealtimeRetryTimerRef.current) {
        clearTimeout(globalRealtimeRetryTimerRef.current);
        globalRealtimeRetryTimerRef.current = null;
      }
      if (roomRealtimeRetryTimerRef.current) {
        clearTimeout(roomRealtimeRetryTimerRef.current);
        roomRealtimeRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const loadRooms = async () => {
      const { data: noticeRoom } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('id', NOTICE_ROOM_ID)
        .maybeSingle();

      if (!noticeRoom) {
        await supabase.from('chat_rooms').insert([
          { id: NOTICE_ROOM_ID, name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds },
        ]);
      } else {
        await supabase
          .from('chat_rooms')
          .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
          .eq('id', NOTICE_ROOM_ID);
      }
      const { data: rooms } = await supabase.from('chat_rooms').select('*');
      await syncChatRoomsState(rooms || []);
    };
    loadRooms();
    // selectedRoomId는 의도적으로 제외 — 채팅방 목록은 마운트 시 1회만 로드
  }, [noticeRoomMemberIds, syncChatRoomsState]);

  useEffect(() => {
    if (!chatRooms.some((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)) return;
    void syncNoticeRoomMembers(chatRooms);
  }, [chatRooms, syncNoticeRoomMembers]);

  useEffect(() => {
    const channel = supabase.channel('chat-rooms-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => {
        supabase.from('chat_rooms').select('*').then(async ({ data: rooms }) => {
          if (!rooms) return;
          await syncChatRoomsState(rooms);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [syncChatRoomsState]);

  useEffect(() => {
    if (!(effectiveChatUserId || user?.id)) return;

    const channel = supabase.channel('chat-presence-hub', {
      config: { presence: { key: String(effectiveChatUserId || user?.id) } },
    });

    const syncPresence = () => {
      const next: Record<string, PresenceInfo> = {};
      const state = channel.presenceState();
      Object.values(state).forEach((entries: unknown[]) => {
        if (!Array.isArray(entries) || entries.length === 0) return;
        const latest = entries[entries.length - 1] as Partial<PresenceInfo>;
        if (!latest?.userId) return;
        next[String(latest.userId)] = {
          userId: String(latest.userId),
          name: latest.name || 'Unknown',
          roomId: latest.roomId || null,
          onlineAt: latest.onlineAt || new Date().toISOString(),
        };
      });
      setPresenceMap(next);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status: string) => {
        if (status !== 'SUBSCRIBED') return;
        presenceChannelRef.current = channel;
        await channel.track({
          userId: String(effectiveChatUserId || user?.id),
          name: user?.name || 'Unknown',
          roomId: selectedRoomId || null,
          onlineAt: new Date().toISOString(),
        });
      });

    return () => {
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [effectiveChatUserId, selectedRoomId, user?.id, user?.name]);

  useEffect(() => {
    if (!presenceChannelRef.current || !(effectiveChatUserId || user?.id)) return;
    presenceChannelRef.current.track({
      userId: String(effectiveChatUserId || user?.id),
      name: user?.name || 'Unknown',
      roomId: selectedRoomId || null,
      onlineAt: new Date().toISOString(),
    });
  }, [selectedRoomId, effectiveChatUserId, user?.id, user?.name]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = window.localStorage.getItem(CHAT_FOCUS_KEY);
      if (key) {
        setOmniSearch(key);
        window.localStorage.removeItem(CHAT_FOCUS_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let disposed = false;
    setGlobalRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    const channel = supabase
      .channel('chat-global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: Record<string, unknown>) => {
          const msg = payload.new as ChatMessage;
          if (!msg) return;
          await handleIncomingRealtimeMessage(msg);
        }
      )
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          setGlobalRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setGlobalRealtimeState('reconnecting');
          scheduleRealtimeReconnect('global');
          return;
        }
        if (status === 'CLOSED') {
          setGlobalRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
    // selectedRoomId는 의도적으로 제외 — 전역 메시지 채널은 user 기준으로만 구독
  }, [globalRealtimeRetryToken, handleIncomingRealtimeMessage, scheduleRealtimeReconnect, user?.id]);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoomRealtimeState('idle');
      return;
    }
    let disposed = false;
    setRoomRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    fetchData();
    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: Record<string, unknown>) => {
        const row = payload.new as ChatMessage;
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_read_cursors', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_bookmarks', filter: `user_id=eq.${effectiveTodoUserId || user?.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => fetchData())
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          setRoomRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRoomRealtimeState('reconnecting');
          scheduleRealtimeReconnect('room');
          return;
        }
        if (status === 'CLOSED') {
          setRoomRealtimeState('reconnecting');
        }
      });
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, roomRealtimeRetryToken, fetchData, effectiveTodoUserId, user?.id, handleIncomingRealtimeMessage, scheduleRealtimeReconnect]);

  useEffect(() => {
    if (!selectedRoomId) {
      setTypingUsers({});
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`chat-typing-${selectedRoomId}`);
    typingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: Record<string, unknown> }) => {
          if (!payload || payload.roomId !== selectedRoomId || payload.userId === String(effectiveChatUserId || user?.id || '')) return;

        const peerId = String(payload.userId);
        if (typingPeersTimeoutRef.current[peerId]) {
          clearTimeout(typingPeersTimeoutRef.current[peerId]);
          delete typingPeersTimeoutRef.current[peerId];
        }

        if (!payload.isTyping) {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          return;
        }

        setTypingUsers((prev) => ({
          ...prev,
          [peerId]: (payload.name as string) || 'Unknown',
        }));

        typingPeersTimeoutRef.current[peerId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          delete typingPeersTimeoutRef.current[peerId];
        }, 2500);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          emitTypingState(false);
        }
      });

    return () => {
      if (typingClearRef.current) {
        clearTimeout(typingClearRef.current);
        typingClearRef.current = null;
      }
      Object.values(typingPeersTimeoutRef.current).forEach((timer) => clearTimeout(timer));
      typingPeersTimeoutRef.current = {};
      setTypingUsers({});
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, effectiveChatUserId, user?.id, emitTypingState]);

  useEffect(() => {
    const onFocus = () => { isFocusedRef.current = true; };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('erp-chat-sync');
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data;
      if (!payload?.roomId) return;
      // ref를 통해 항상 최신 selectedRoomId와 fetchData를 참조 (채널 재생성 없이)
      if (isRoomInSelectedConversation(String(payload.roomId), chatRoomsRef.current)) {
        fetchDataRef.current?.();
      } else if (chatRoomsRef.current.length > 0) {
        updateUnreadForRooms(chatRoomsRef.current);
      }
    };
    return () => {
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
      channel.close();
    };
    // 마운트 시 1회만 실행 — selectedRoomId·fetchData는 ref로 최신값 참조
  }, [isRoomInSelectedConversation, updateUnreadForRooms]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMockRealtimeInsert = (event: Event) => {
      const detail = (event as CustomEvent<{ rows?: ChatMessage[]; row?: ChatMessage }>).detail;
      const rows = Array.isArray(detail?.rows) ? detail.rows : detail?.row ? [detail.row] : [];
      rows.forEach((row) => {
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      });
    };

    window.addEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
    return () => {
      window.removeEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
    };
  }, [handleIncomingRealtimeMessage]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshRealtimeFallback = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (selectedRoomId) {
        fetchData();
      } else if (chatRoomsRef.current.length > 0) {
        updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    const interval = setInterval(refreshRealtimeFallback, 15000);
    window.addEventListener('focus', refreshRealtimeFallback);
    document.addEventListener('visibilitychange', refreshRealtimeFallback);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshRealtimeFallback);
      document.removeEventListener('visibilitychange', refreshRealtimeFallback);
    };
  }, [selectedRoomId, user?.id, fetchData, updateUnreadForRooms]);

  useEffect(() => {
    if (!selectedRoomId || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const tailSignature = `${messages.length}:${String(lastMessage?.id || '')}:${String(lastMessage?.created_at || '')}`;
    const tailChanged = lastTimelineTailRef.current !== tailSignature;
    lastTimelineTailRef.current = tailSignature;
    const isOwnNewestMessage = String(lastMessage?.sender_id) === String(effectiveChatUserId || user?.id || '');
    const shouldStick =
      isNearBottomRef.current ||
      String(lastMessage?.id || '').startsWith('temp-') ||
      (tailChanged && isOwnNewestMessage);
    if (shouldStick) {
      // 채팅방 전환 중(pendingBottomAlignRoomIdRef 활성)이면 즉시 이동, 아니면 부드럽게
      const isRoomSwitch = !!pendingBottomAlignRoomIdRef.current;
      requestAnimationFrame(() => scrollToBottom(
        (!pendingBottomAlignRoomIdRef.current && isOwnNewestMessage)
          ? 'smooth'
          : 'auto'
      ));
    } else {
      setShowScrollToLatest(true);
    }
  }, [messages, selectedRoomId, scrollToBottom, effectiveChatUserId, user?.id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    alignRoomToLatest(selectedRoomId, 'auto');
  }, [alignRoomToLatest, selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId) {
      pendingBottomAlignRoomIdRef.current = null;
      return;
    }
    if (pendingBottomAlignRoomIdRef.current !== selectedRoomId) return;
    alignRoomToLatestImmediately(selectedRoomId);
  }, [alignRoomToLatestImmediately, selectedRoomId, messages.length, polls.length, pinnedIds.length, persistedPinnedMessages.length]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(String(m.id))),
    [messages, pinnedIds]
  );

  const noticeMessages = useMemo(
    () => (persistedPinnedMessages.length > 0 ? persistedPinnedMessages : pinnedMessages),
    [persistedPinnedMessages, pinnedMessages]
  );

  const currentNoticeMessage = useMemo(
    () => noticeMessages[noticeMessages.length - 1] || null,
    [noticeMessages]
  );


  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    if (selectedRoomId === NOTICE_ROOM_ID) return noticeRoomMembers;
    const room = chatRooms.find(( r: ChatRoom) => r.id === selectedRoomId);
    const memberIds = getEffectiveRoomMemberIds(room || null);
    if (!room || memberIds.length === 0) return [];
    return memberIds.map((id: string) => resolveRoomMemberProfile(room, id));
  }, [chatRooms, getEffectiveRoomMemberIds, noticeRoomMembers, resolveRoomMemberProfile, selectedRoomId]);

  const selectedRoom = useMemo(
    () => chatRooms.find(( r: ChatRoom) => r.id === selectedRoomId && isRoomAccessibleToCurrentUser(r)) || null,
    [chatRooms, isRoomAccessibleToCurrentUser, selectedRoomId]
  );

  const selectedRoomLabel = useMemo(
    () => getRoomDisplayName(selectedRoom, allKnownStaffs, effectiveChatUserId),
    [selectedRoom, allKnownStaffs, effectiveChatUserId]
  );

  const addableMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const currentMemberIds = new Set(
      Array.isArray(selectedRoom.members)
        ? selectedRoom.members.map((id: unknown) => String(id))
        : []
    );
    return allKnownStaffs
      .filter(( s: StaffMember) => s.status !== '퇴사' && s.status !== '퇴직')
      .filter(( s: StaffMember) => !currentMemberIds.has(String(s.id)))
      .filter(( s: StaffMember) => {
        if (!deferredAddMemberSearch.trim()) return true;
        const key = deferredAddMemberSearch.trim();
        return (
          s.name?.includes(key) ||
          s.department?.includes(key) ||
          s.position?.includes(key)
        );
      });
  }, [selectedRoom, allKnownStaffs, deferredAddMemberSearch]);

  const visibleRooms = useMemo(
    () => {
      const dedupedRooms = new Map<string, any>();
      chatRooms.forEach(( room: ChatRoom) => {
        if (!isRoomAccessibleToCurrentUser(room)) return;
        const roomKey = getDirectRoomMembersKey(room) || `room:${room.id}`;
        const previousRoom = dedupedRooms.get(roomKey);
        const previousTime = new Date(previousRoom?.last_message_at || previousRoom?.created_at || 0).getTime();
        const currentTime = new Date(room?.last_message_at || room?.created_at || 0).getTime();
        if (!previousRoom || currentTime >= previousTime) {
          dedupedRooms.set(roomKey, room);
        }
      });
      if (!dedupedRooms.has(`room:${NOTICE_ROOM_ID}`)) {
        const noticeRoom = chatRooms.find(( room: ChatRoom) => room.id === NOTICE_ROOM_ID);
        if (noticeRoom && isRoomAccessibleToCurrentUser(noticeRoom)) {
          dedupedRooms.set(`room:${NOTICE_ROOM_ID}`, noticeRoom);
        }
      }
      return Array.from(dedupedRooms.values());
    },
    [chatRooms, isRoomAccessibleToCurrentUser]
  );

  useEffect(() => {
    if (!selectedRoomId || chatRooms.length === 0) return;
    if (selectedRoom) return;

    const fallbackRoomId =
      visibleRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)?.id ||
      visibleRooms[0]?.id ||
      null;

    if (String(fallbackRoomId || '') !== String(selectedRoomId || '')) {
      setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
    } else if (!fallbackRoomId) {
      setRoom(null);
    }
  }, [chatRooms.length, selectedRoom, selectedRoomId, visibleRooms]);

  const roomLabelMap = useMemo(() => {
    const next = new Map<string, string>();
    visibleRooms.forEach((room: ChatRoom) => {
      next.set(String(room.id), getRoomDisplayName(room, allKnownStaffs, effectiveChatUserId));
    });
    return next;
  }, [visibleRooms, allKnownStaffs, effectiveChatUserId]);

  const sidebarRooms = useMemo(() => {
    const keyword = deferredOmniSearch.trim().toLowerCase();
    const filtered = visibleRooms.filter(( room: ChatRoom) => {
      const label = (roomLabelMap.get(String(room.id)) || '').toLowerCase();
      const isHidden = roomPrefs[room.id]?.hidden === true;
      if (isHidden && !showHiddenRooms) return false;
      if (!keyword) return true;
      return label.includes(keyword);
    });
    return sortRoomsForSidebar(filtered, roomPrefs, pinnedRoomOrder);
  }, [visibleRooms, deferredOmniSearch, roomPrefs, showHiddenRooms, roomLabelMap, pinnedRoomOrder]);
  const effectivePinnedRoomOrder = useMemo(() => {
    const pinnedIds = visibleRooms
      .filter((room: ChatRoom) => roomPrefs[room.id]?.pinned)
      .map((room: ChatRoom) => String(room.id));
    const preserved = pinnedRoomOrder.filter((roomId) => pinnedIds.includes(String(roomId)));
    const missing = pinnedIds.filter((roomId) => !preserved.includes(roomId));
    return [...preserved, ...missing];
  }, [visibleRooms, roomPrefs, pinnedRoomOrder]);
  useEffect(() => {
    if (arraysMatch(effectivePinnedRoomOrder, pinnedRoomOrder)) return;
    setPinnedRoomOrder(effectivePinnedRoomOrder);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          getPinnedRoomOrderStorageKey(roomPrefsUserId),
          JSON.stringify(effectivePinnedRoomOrder)
        );
      } catch {
        // ignore
      }
    }
  }, [effectivePinnedRoomOrder, pinnedRoomOrder, roomPrefsUserId]);
  const forwardTargetRooms = useMemo(
    () =>
      visibleRooms.filter(( room: ChatRoom) => {
        if (String(room.id) === String(selectedRoomId || '')) return false;
        if (roomPrefs[room.id]?.hidden === true) return false;
        return true;
      }),
    [roomPrefs, selectedRoomId, visibleRooms]
  );
  const sidebarRoomItems = useMemo(() => {
    const pinnedOrderIndex = new Map(
      effectivePinnedRoomOrder.map((roomId, index) => [String(roomId), index])
    );
    const pinnedCount = effectivePinnedRoomOrder.length;
    return sidebarRooms.map((room: ChatRoom) => {
      const roomId = String(room.id);
      const members = normalizeMemberIds(room.members);
      const peer =
        room.type === 'direct'
          ? members
              .map((memberId) => allKnownStaffMap.get(memberId))
              .find(
                (staff: StaffMember | undefined) =>
                  Boolean(staff) && String(staff!.id) !== effectiveChatUserId
              ) || null
          : null;

      return {
        room,
        roomId,
        unread: roomUnreadCounts[room.id] || 0,
        isSelected: selectedRoomId === room.id,
        isNoticeChannel: room.id === NOTICE_ROOM_ID,
        label: roomLabelMap.get(roomId) || '',
        preview: getRoomPreviewText(room),
        isPeerOnline: peer ? isStaffCurrentlyOnline(peer) : false,
        isPinned: roomPrefs[room.id]?.pinned === true,
        isHidden: roomPrefs[room.id]?.hidden === true,
        pinnedIndex: pinnedOrderIndex.get(roomId) ?? -1,
        pinnedCount,
      };
    });
  }, [
    allKnownStaffMap,
    effectivePinnedRoomOrder,
    effectiveChatUserId,
    isStaffCurrentlyOnline,
    roomLabelMap,
    roomPrefs,
    roomUnreadCounts,
    selectedRoomId,
    sidebarRooms,
  ]);
  const visibleRoomIds = useMemo(
    () => visibleRooms.map((room: ChatRoom) => room.id),
    [visibleRooms]
  );
  const normalizedGlobalSearchQuery = deferredGlobalSearchQuery.trim().toLowerCase();
  const closeGlobalSearch = useCallback(() => {
    setShowGlobalSearch(false);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setGlobalSearchTab('all');
    setGlobalSearchLoading(false);
  }, []);
  const openGlobalSearch = useCallback(() => {
    setGlobalSearchTab('all');
    setShowGlobalSearch(true);
  }, []);
  const globalSearchMemberResults = useMemo(() => {
    if (!normalizedGlobalSearchQuery) return [];
    return allKnownStaffs
      .filter((staff: StaffMember) => String(staff.id) !== String(effectiveChatUserId || ''))
      .filter((staff: StaffMember) => {
        const haystack = [
          staff.name,
          staff.company,
          staff.department,
          staff.position,
          (staff as Record<string, unknown>).employee_no,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [allKnownStaffs, effectiveChatUserId, normalizedGlobalSearchQuery]);
  const globalSearchRoomResults = useMemo(() => {
    if (!normalizedGlobalSearchQuery) return [];
    return visibleRooms
      .map((room: ChatRoom) => {
        const roomId = String(room.id);
        return {
          room,
          roomId,
          label: roomLabelMap.get(roomId) || '',
          preview: getRoomPreviewText(room),
          memberCount: normalizeMemberIds(room.members).length,
          isHidden: roomPrefs[room.id]?.hidden === true,
          isNoticeChannel: room.id === NOTICE_ROOM_ID,
        };
      })
      .filter(({ label, preview }) => {
        const haystack = `${String(label || '').toLowerCase()} ${String(preview || '').toLowerCase()}`;
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [normalizedGlobalSearchQuery, roomLabelMap, roomPrefs, visibleRooms]);
  const globalSearchMessageResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => !String(message.file_url || '').trim()),
    [globalSearchResults]
  );
  const globalSearchFileResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => Boolean(String(message.file_url || '').trim())),
    [globalSearchResults]
  );
  const globalSearchCounts = useMemo(
    () => ({
      all:
        globalSearchMemberResults.length +
        globalSearchRoomResults.length +
        globalSearchMessageResults.length +
        globalSearchFileResults.length,
      member: globalSearchMemberResults.length,
      room: globalSearchRoomResults.length,
      message: globalSearchMessageResults.length,
      file: globalSearchFileResults.length,
    }),
    [globalSearchFileResults.length, globalSearchMemberResults.length, globalSearchMessageResults.length, globalSearchRoomResults.length]
  );
  const openGroupFromGlobalSearch = useCallback(() => {
    closeGlobalSearch();
    setShowGroupModal(true);
  }, [closeGlobalSearch]);
  const openRoomFromGlobalSearch = useCallback((roomId: string) => {
    setRoom(roomId);
    closeGlobalSearch();
  }, [closeGlobalSearch]);

  const typingNoticeText = useMemo(() => {
    const names = Object.values(typingUsers).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return `${names[0]}님이 입력 중`;
    return `${names[0]} 외 ${names.length - 1}명이 입력 중`;
  }, [typingUsers]);

  const selectedPeer = useMemo(() => {
    if (!selectedRoom || selectedRoom.type !== 'direct') return null;
    return roomMembers.find((member: StaffMember) => String(member.id) !== effectiveChatUserId) || null;
  }, [selectedRoom, roomMembers, effectiveChatUserId]);

  const selectedPeerIsOnline = useMemo(
    () => (selectedPeer ? isStaffCurrentlyOnline(selectedPeer) : false),
    [selectedPeer, isStaffCurrentlyOnline]
  );
  const realtimeConnectionMeta = useMemo(() => {
    const state = selectedRoomId ? roomRealtimeState : globalRealtimeState;
    if (state === 'connected') {
      return {
        label: '실시간 연결됨',
        dotClassName: 'bg-emerald-500',
        textClassName: 'text-emerald-500',
      };
    }
    if (state === 'reconnecting') {
      return {
        label: '실시간 재연결 중',
        dotClassName: 'bg-amber-500',
        textClassName: 'text-amber-500',
      };
    }
    if (state === 'connecting') {
      return {
        label: '실시간 연결 중',
        dotClassName: 'bg-sky-500',
        textClassName: 'text-sky-500',
      };
    }
    return {
      label: '실시간 대기 중',
      dotClassName: 'bg-[var(--toss-gray-4)]',
      textClassName: 'text-[var(--toss-gray-4)]',
    };
  }, [globalRealtimeState, roomRealtimeState, selectedRoomId]);

  const threadMessages = useMemo(() => {
    if (!threadRoot) return [];
    const rootId = threadRoot.id;
    return messages
      .filter(
        ( m: ChatMessage) =>
          m.id === rootId ||
          m.reply_to_id === rootId
      )
      .sort(
        (a: ChatMessage, b: ChatMessage) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
  }, [threadRoot, messages]);

  const [readUsers, setReadUsers] = useState<StaffMember[]>([]);
  const loadReadStatusForMessage = useCallback(
    async (msg: ChatMessage) => {
      if (!msg?.id || !selectedRoom) return;
      setUnreadLoading(true);
      setUnreadUsers([]);
      setReadUsers([]);
      setUnreadModalMsg(msg);
      try {
        const roomMemberIds = getEffectiveRoomMemberIds(selectedRoom);
        const allRoomStaffs = allKnownStaffs.filter(( s: StaffMember) => roomMemberIds.includes(String(s.id)));

        const readers: StaffMember[] = [];
        const nonReaders: StaffMember[] = [];

        allRoomStaffs.forEach(( s: StaffMember) => {
          if (String(s.id) === String(msg.sender_id)) return;
          if (isMessageReadByCursor(msg.created_at, roomReadCursorMap[String(s.id)])) {
            readers.push(s);
          } else {
            nonReaders.push(s);
          }
        });

        const sorter = (a: StaffMember, b: StaffMember) => (a.department || '').localeCompare(b.department || '') || (a.name || '').localeCompare(b.name || '');
        setReadUsers(readers.sort(sorter));
        setUnreadUsers(nonReaders.sort(sorter));
      } catch (e) {
        console.error('loadReadStatusForMessage error', e);
        toast('읽음 현황을 불러오지 못했습니다.');
      } finally {
        setUnreadLoading(false);
      }
    },
    [selectedRoom, allKnownStaffs, getEffectiveRoomMemberIds, roomReadCursorMap]
  );

  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    if (selectedRoom.id === NOTICE_ROOM_ID) {
      toast('공지 메시지 방은 나갈 수 없습니다.', 'warning');
      return;
    }
    if (!confirm('이 채팅방에서 나가시겠습니까? 나간 뒤에는 다시 초대를 받아야 입장할 수 있습니다.')) return;

    try {
      const currentMembers: string[] = Array.isArray(selectedRoom.members)
        ? selectedRoom.members
        : [];
      const newMembers = currentMembers.filter(
        (id: unknown) => String(id) !== String(effectiveChatUserId || user?.id || '')
      );

      await supabase
        .from('chat_rooms')
        .update({ members: newMembers })
        .eq('id', selectedRoom.id);

      const leaverName = user?.name || '이름 없음';
      const leaveContent = `[퇴장] ${leaverName}님이 채팅방을 나갔습니다.`;
      let leaveNoticeFailed = false;

      try {
        const { data: leaveMessage, error: leaveMessageError } = await supabase
          .from('messages')
          .insert([
            {
              room_id: selectedRoom.id,
              sender_id: effectiveChatUserId || user?.id,
              content: leaveContent,
            },
          ])
          .select('id, room_id')
          .single();
        if (leaveMessageError) throw leaveMessageError;
        if (leaveMessage?.id && leaveMessage?.room_id) {
          void triggerChatPush(String(leaveMessage.room_id), String(leaveMessage.id));
        }
      } catch (leaveNoticeError) {
        leaveNoticeFailed = true;
        console.error('leave room system message error', leaveNoticeError);
      }

      const leftRoomId = selectedRoom.id;
      // 방 목록에서 즉시 제거 (실시간 재로드로 덮어쓰이기 전에)
      setChatRooms((prev) => prev.filter(( room: ChatRoom) => room.id !== leftRoomId));
      setRoomUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[leftRoomId];
        return next;
      });
      setRoom(null);
      setMessages([]);
      toast(
        leaveNoticeFailed
          ? '채팅방에서 나갔지만 퇴장 안내 메시지 저장은 실패했습니다.'
          : '채팅방에서 나갔습니다.'
      );
    } catch {
      toast('채팅방 나가기 중 오류가 발생했습니다.', 'error');
    }
  };

  const removeRoomMember = async (memberId: string) => {
    if (!selectedRoom) return;
    if (selectedRoom?.created_by !== (effectiveChatUserId || user?.id)) return;
    if (String(memberId) === String(effectiveChatUserId || user?.id || '')) return;
    if (!confirm('이 참여자를 채팅방에서 제거하시겠습니까?')) return;

    try {
      const currentMembers: string[] = Array.isArray(selectedRoom.members)
        ? selectedRoom.members
        : [];
      const newMembers = currentMembers.filter(
        (id: unknown) => String(id) !== String(memberId)
      );

      await supabase
        .from('chat_rooms')
        .update({ members: newMembers })
        .eq('id', selectedRoom.id);

      const removedName =
        resolveRoomMemberProfile(selectedRoom, String(memberId))?.name ||
        resolveStaffProfile(memberId)?.name ||
        '이름 없음';
      const removerName = user?.name || '이름 없음';
      const systemContent = `[제거] ${removerName}님이 ${removedName}님을 채팅방에서 제거했습니다.`;
      const { data: removedMessage } = await supabase
        .from('messages')
        .insert([
          {
            room_id: selectedRoom.id,
            sender_id: effectiveChatUserId || user?.id,
            content: systemContent,
          },
        ])
        .select('id, room_id')
        .single();

      if (removedMessage?.id && removedMessage?.room_id) {
        void triggerChatPush(String(removedMessage.room_id), String(removedMessage.id));
      }

      setChatRooms((prev) =>
        prev.map(( room: ChatRoom) =>
          room.id === selectedRoom.id ? { ...room, members: newMembers } : room
        )
      );
      await fetchData();
      toast('참여자를 제거했습니다.');
    } catch (error) {
      console.error('remove member error', error);
      toast('참여자 제거 중 오류가 발생했습니다.', 'error');
    }
  };


  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;   // 일반 파일: 20MB
  const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 동영상: 200MB
  const insertChatMessage = useCallback(
    <TData extends Record<string, unknown> = Record<string, unknown>>(
      payload: Record<string, unknown>,
      selectClause = '*',
    ) =>
      withMissingColumnFallback<TData>(
        () => supabase.from('messages').insert([payload]).select(selectClause).single(),
        () => {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.file_name;
          return supabase.from('messages').insert([fallbackPayload]).select(selectClause).single();
        },
        'file_name',
      ),
    [],
  );
  const handleSendMessage = useCallback(async (
    fileUrl?: string,
    fileSizeBytes?: number,
    fileKind?: 'image' | 'video' | 'file',
    retryMessageId?: string,
    fileName?: string,
  ) => {
    const retryPayload = retryMessageId
      ? deliveryStatesRef.current[retryMessageId]?.retryPayload || null
      : null;
    const trimmed = inputMsg.trim();
    const roomId = retryPayload?.roomId || selectedRoomId;
    const content = retryPayload ? retryPayload.content : trimmed;
    const resolvedFileUrl = retryPayload?.fileUrl ?? fileUrl ?? null;
    const resolvedFileName = retryPayload?.fileName ?? fileName ?? null;
    const resolvedFileSizeBytes = retryPayload?.fileSizeBytes ?? fileSizeBytes ?? null;
    const resolvedFileKind = retryPayload?.fileKind ?? fileKind ?? null;
    const resolvedReplyToId = retryPayload?.replyToId ?? replyTo?.id ?? null;
    if (!content && !resolvedFileUrl) return;
    if (!roomId) return;
    if (roomId !== NOTICE_ROOM_ID && !visibleRoomIds.includes(String(roomId))) {
      toast('참여 중인 채팅방에서만 메시지를 보낼 수 있습니다.', 'warning');
      setRoom(selectedRoom ? String(selectedRoom.id) : NOTICE_ROOM_ID);
      return;
    }

    if (!resolvedFileUrl && content.startsWith('/')) {
      if (content.startsWith('/연차')) {
        setSlashCommand('annual_leave');
        setSlashForm({
          startDate: '',
          endDate: '',
          reason: content.replace('/연차', '').trim(),
          itemName: '',
          quantity: 1,
        });
        setShowSlashModal(true);
        return;
      }
      if (content.startsWith('/발주')) {
        setSlashCommand('purchase');
        setSlashForm({
          startDate: '',
          endDate: '',
          reason: '',
          itemName: content.replace('/발주', '').trim(),
          quantity: 1,
        });
        setShowSlashModal(true);
        return;
      }
    }
    if (roomId === NOTICE_ROOM_ID) {
      if (!canWriteNotice) {
        toast('공지 메시지 방에는 부서장 이상만 작성할 수 있습니다.');
        return;
      }
    }

    const retrySnapshot: MessageRetryPayload = {
      roomId,
      content,
      fileUrl: resolvedFileUrl,
      fileName: resolvedFileName,
      fileSizeBytes: resolvedFileSizeBytes,
      fileKind: resolvedFileKind,
      replyToId: resolvedReplyToId,
    };

    const optimisticId = retryMessageId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: optimisticId,
      room_id: roomId,
      sender_id: effectiveChatUserId || user!.id,
      content,
      file_url: resolvedFileUrl,
      file_name: resolvedFileName,
      file_size_bytes: resolvedFileSizeBytes,
      file_kind: resolvedFileKind,
      reply_to_id: resolvedReplyToId,
      created_at: new Date().toISOString(),
      is_deleted: false,
      staff: { name: user!.name, photo_url: getProfilePhotoUrl(user!) },
    };

    if (retryMessageId) {
      setMessages((prev) =>
        prev.map(( message: ChatMessage) =>
          message.id === retryMessageId
            ? { ...message, created_at: optimisticMessage.created_at }
            : message
        )
      );
    } else {
      setMessages((prev) => [...prev, optimisticMessage]);
    }

    setDeliveryStates((prev) => ({
      ...prev,
      [optimisticId]: {
        status: 'sending',
        retryPayload: retrySnapshot,
        error: null,
      },
    }));
    inputMsgRef.current = '';
    setInputMsg('');
    if (selectedRoomIdRef.current) {
      draftMapRef.current.delete(selectedRoomIdRef.current);
    }
    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom('smooth'));

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    emitTypingState(false);

    const payload: Record<string, unknown> = {
      room_id: roomId,
      sender_id: effectiveChatUserId || user!.id,
      content,
      file_url: resolvedFileUrl,
      file_name: resolvedFileName,
      file_size_bytes: resolvedFileSizeBytes,
      file_kind: resolvedFileKind,
      reply_to_id: resolvedReplyToId,
    };
    const { data: inserted, error } = await insertChatMessage<ChatMessage>(payload);
    if (!error && inserted) {
      const optimisticMsg = {
        ...inserted,
        staff: { name: user!.name, photo_url: getProfilePhotoUrl(user!) },
      };
      setMessages((prev) => {
        const seenIds = new Set<string>();
        return prev
          .map(( message: ChatMessage) =>
            message.id === optimisticId ? optimisticMsg : message
          )
          .filter(( message: ChatMessage) => {
            const normalizedId = String(message.id || '');
            if (seenIds.has(normalizedId)) return false;
            seenIds.add(normalizedId);
            return true;
          });
      });
      setDeliveryStates((prev) => {
        const next = { ...prev };
        delete next[optimisticId];
        next[String(inserted.id)] = {
          status: 'sent',
          retryPayload: retrySnapshot,
          error: null,
        };
        return next;
      });
      setChatRooms((prev) =>
        sortChatRoomsWithNoticeFirst(
          prev.map(( room: ChatRoom) =>
            room.id === roomId
              ? {
                  ...room,
                  last_message: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message
                  ),
                  last_message_preview: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message_preview
                  ),
                  last_message_at: inserted.created_at || new Date().toISOString(),
                }
              : room
          )
        )
      );
      broadcastChatSync('message-sent', roomId);
      void triggerChatPush(String(inserted.room_id), String(inserted.id));
    } else {
      setDeliveryStates((prev) => ({
        ...prev,
        [optimisticId]: {
          status: 'failed',
          retryPayload: retrySnapshot,
          error: error?.message || '메시지 전송 실패',
        },
      }));
      console.error('message send failed', error);
    }
  }, [selectedRoomId, user?.id, user?.name, user?.avatar_url, replyTo, inputMsg, canWriteNotice, scrollToBottom, broadcastChatSync, emitTypingState, triggerChatPush, selectedRoom, visibleRoomIds, insertChatMessage]);

  const retryFailedMessage = useCallback(async (messageId: string) => {
    await handleSendMessage(undefined, undefined, undefined, messageId);
  }, [handleSendMessage]);

  const [fileUploading, setFileUploading] = useState(false);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const getFileKind = (mime: string): 'image' | 'video' | 'file' => {
    if (!mime) return 'file';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  };
  const [isDragging, setIsDragging] = useState(false);

  const processFileUpload = async (file: File) => {
    if (file.type.startsWith('image/')) {
      // 이미지: 크기 제한 없음
    } else if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_SIZE_BYTES) {
        toast('동영상 크기는 200MB 이하여야 합니다.');
        return;
      }
    } else {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast('파일 크기는 20MB 이하여야 합니다.');
        return;
      }
    }
    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || '파일 업로드에 실패했습니다.');
      }

      const publicUrl = payload.url;
      const fileKind = getFileKind(file.type || '');
      await handleSendMessage(publicUrl, file.size, fileKind, undefined, getPendingAttachmentDisplayName(file));
    } catch (err: unknown) {
      console.error('파일 업로드 실패:', err);
      const msg = (err as Error)?.message || String(err);
      const hint = msg.includes('Unauthorized')
        ? '로그인 세션이 만료되었을 수 있습니다. 다시 로그인 후 시도해 주세요.'
        : msg.includes('버킷') || msg.includes('bucket') || msg.includes('not found')
          ? 'Supabase Storage에 pchos-files 또는 board-attachments 버킷이 실제로 생성되어 있는지 확인해 주세요.'
          : msg;
      toast(`파일 업로드에 실패했습니다.\n\n${hint}`, 'error');
    } finally {
      setFileUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileUpload(file);
    e.target.value = '';
  };

  const confirmPendingAttachmentUpload = useCallback(async () => {
    if (pendingAttachmentFiles.length === 0) return;
    const queuedFiles = [...pendingAttachmentFiles];
    setPendingAttachmentFiles([]);
    for (const attachmentFile of queuedFiles) {
      await processFileUpload(attachmentFile);
    }
  }, [pendingAttachmentFiles, processFileUpload]);

  const cancelPendingAttachmentUpload = useCallback(() => {
    setPendingAttachmentFiles([]);
  }, []);

  const handleComposerPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(e.clipboardData?.items || []);
    if (clipboardItems.length === 0) return;

    const imageFiles = clipboardItems
      .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);

    if (imageFiles.length === 0) return;

    e.preventDefault();
    setPendingAttachmentFiles((prev) => [...prev, ...imageFiles]);
  }, []);

  const queueDroppedFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setPendingAttachmentFiles((prev) => [...prev, ...files]);
  }, []);

  useEffect(() => {
    setPendingAttachmentFiles([]);
  }, [selectedRoomId]);

  const handleAction = async (type: 'task') => {
    if (!activeActionMsg) return;
    if (type === 'task') {
      if (!effectiveTodoUserId) {
        toast('연결된 직원 계정을 찾지 못했습니다.');
        setActiveActionMsg(null);
        return;
      }
      const content =
        getMessageDisplayText(
          activeActionMsg.content,
          activeActionMsg.file_name,
          activeActionMsg.file_url
        ) || '첨부 파일 확인';
      const { error } = await supabase.from('todos').insert([{
        user_id: effectiveTodoUserId,
        content: `[채팅] ${content}`,
        is_complete: false,
        task_date: getKoreanTodayString(),
        source_message_id: activeActionMsg.id,
        source_room_id: activeActionMsg.room_id,
      }]);
      if (!error) {
        toast('할 일 등록 완료', 'success');
        if (onRefresh) onRefresh();
      } else {
        toast('할 일 등록 중 오류가 발생했습니다.', 'error');
      }
    }
    setActiveActionMsg(null);
  };

  const createGroupChat = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return toast('방 이름과 멤버를 선택해 주세요.', 'warning');
    if (!effectiveChatUserId) return toast('연결된 직원 계정을 찾지 못했습니다.', 'error');
    const { data: room, error } = await supabase.from('chat_rooms').insert([{
      name: groupName,
      type: 'group',
      created_by: effectiveChatUserId,
      members: [effectiveChatUserId, ...selectedMembers]
    }]).select().single();

    if (!error && room) {
      setGroupName('');
      setSelectedMembers([]);
      setShowGroupModal(false);
      setRoom(room.id);
      fetchData();
      setTimeout(() => fetchData(), 300);
    }
  };

  const groupedStaffs = useMemo(() => {
    const grouped: Record<string, Record<string, any[]>> = {};
    allKnownStaffs.forEach(( s: StaffMember) => {
      if (s.status === '퇴사' || s.status === '퇴직') return;
      const company = s.company || '기타';
      const dept = s.department || '미지정';
      if (!grouped[company]) grouped[company] = {};
      if (!grouped[company][dept]) grouped[company][dept] = [];
      grouped[company][dept].push(s);
    });
    return grouped;
  }, [allKnownStaffs]);

  useEffect(() => {
    if (viewMode !== 'org') return;
    setExpandedDepts((prev) => {
      if (prev.size > 0) return prev;
      return new Set(
        Object.entries(groupedStaffs).flatMap(([company, depts]) =>
          Object.keys(depts as Record<string, StaffMember[]>).map((dept) => `${company}::${dept}`)
        )
      );
    });
  }, [groupedStaffs, viewMode]);

  const openDirectChat = useCallback(async ( staff: StaffMember) => {
    const otherId = String(staff?.id || '').trim();
    if (!effectiveChatUserId || !otherId) {
      toast('채팅 상대를 찾지 못했습니다.');
      return;
    }

    try {
      const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('type', 'direct');
      if (error) throw error;

      const repairedRooms = await repairDirectRooms(rooms || []);
      const targetMembers = new Set([effectiveChatUserId, otherId]);
      const foundRoom = repairedRooms
        .filter(( room: ChatRoom) => {
          const members = Array.isArray(room?.members)
            ? room.members.map((memberId: unknown) => String(memberId))
            : [];
          return members.length === targetMembers.size && [...targetMembers].every((memberId) => members.includes(memberId));
        })
        .sort((a: ChatRoom, b: ChatRoom) =>
          new Date(b.last_message_at || b.created_at || 0).getTime() -
          new Date(a.last_message_at || a.created_at || 0).getTime()
        )[0];

      if (foundRoom) {
        setChatRooms((prev) =>
          sortChatRoomsWithNoticeFirst([
            ...prev.filter(( room: ChatRoom) => String(room.id) !== String(foundRoom.id)),
            foundRoom,
          ])
        );
        setRoom(foundRoom.id);
      } else {
        const { data: room, error: insertError } = await supabase
          .from('chat_rooms')
          .insert([{ name: `${staff.name}`, type: 'direct', members: [effectiveChatUserId, otherId] }])
          .select('*')
          .single();
        if (insertError) throw insertError;
        if (room) {
          setChatRooms((prev) =>
            sortChatRoomsWithNoticeFirst([
              ...prev.filter((candidate: ChatRoom) => String(candidate.id) !== String(room.id)),
              room,
            ])
          );
          setRoom(room.id);
          await fetchData();
        }
      }

      setViewMode('chat');
    } catch (error) {
      console.error('openDirectChat failed', error);
      toast('채팅방을 여는 중 오류가 발생했습니다.', 'error');
    }
  }, [effectiveChatUserId, fetchData, repairDirectRooms]);
  const openMemberFromGlobalSearch = useCallback(async (staff: StaffMember) => {
    closeGlobalSearch();
    await openDirectChat(staff);
  }, [closeGlobalSearch, openDirectChat]);

  const mediaMessages = useMemo(() => {
    return messages.filter(( m: ChatMessage) => m.file_url);
  }, [messages]);

  const filteredMediaMessages = useMemo(() => {
    if (mediaFilter === 'all') return mediaMessages;
    return mediaMessages.filter(( m: ChatMessage) => {
      if (mediaFilter === 'image') return isImageUrl(m.file_url || '');
      if (mediaFilter === 'video') return isVideoUrl(m.file_url || '');
      return !isImageUrl(m.file_url || '') && !isVideoUrl(m.file_url || '');
    });
  }, [mediaMessages, mediaFilter]);

  const sharedMediaPreviewMessages = useMemo(
    () => messages.filter((message) => message.file_kind === 'image' || message.file_kind === 'video').slice(-6),
    [messages]
  );

  const sharedFilePreviewMessages = useMemo(
    () =>
      messages
        .filter((message) => {
          const fileUrl = String(message.file_url || '');
          if (!fileUrl) return false;
          if (message.file_kind === 'file') return true;
          return !isImageUrl(fileUrl) && !isVideoUrl(fileUrl);
        })
        .slice(-6),
    [messages]
  );

  const sharedLinkPreviewMessages = useMemo(
    () => messages.filter((message) => message.content && message.content.includes('http')).slice(-3),
    [messages]
  );

  const mentionCandidates = useMemo(() => {
    if (!showMentionList) return [];
    const base =
      Array.isArray(roomMembers) && roomMembers.length > 0
        ? roomMembers
        : staffs;
    const q = mentionQuery.trim();
    if (!q) return base.slice(0, 8);
    return base
      .filter(( s: StaffMember) =>
        (s.name || '').toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 8);
  }, [showMentionList, mentionQuery, roomMembers, staffs]);

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim()) { toast('질문을 입력해 주세요.', 'warning'); return; }
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) { toast('선택지는 최소 2개 이상 입력해 주세요.', 'warning'); return; }
    try {
        const { data: poll, error } = await supabase.from('polls').insert([{
        room_id: selectedRoomId, creator_id: effectiveChatUserId || user?.id, question: pollQuestion, options
      }]).select().single();
      if (!error && poll) {
        setPolls((p) => [...p, poll as PollItem]);
        setPollQuestion('');
        setPollOptions(['찬성', '반대']);
        setShowPollModal(false);
      } else throw new Error();
    } catch {
      const id = Date.now().toString();
      setPolls((p) => [...p, { id, room_id: selectedRoomId, question: pollQuestion, options }]);
      setPollQuestion('');
      setPollOptions(['찬성', '반대']);
      setShowPollModal(false);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      // 이전 투표 옵션 확인
      const { data: prevVote } = await supabase
        .from('poll_votes')
        .select('option_index')
        .eq('poll_id', pollId)
        .eq('user_id', effectiveChatUserId || user?.id)
        .maybeSingle();
      const prevOptionIndex = prevVote?.option_index as number | null | undefined;

      const { error } = await supabase.from('poll_votes').upsert(
        { poll_id: pollId, user_id: effectiveChatUserId || user?.id, option_index: optionIndex },
        { onConflict: 'poll_id,user_id' }
      );
      if (!error) {
        // 낙관적 업데이트: 이전 옵션 -1, 새 옵션 +1
        setPollVotes((prev) => {
          const ex = { ...(prev[pollId] || {}) };
          if (prevOptionIndex != null && prevOptionIndex !== optionIndex) {
            ex[prevOptionIndex] = Math.max((ex[prevOptionIndex] || 0) - 1, 0);
          }
          if (prevOptionIndex !== optionIndex) {
            ex[optionIndex] = (ex[optionIndex] || 0) + 1;
          }
          return { ...prev, [pollId]: ex };
        });
        fetchData();
      }
    } catch (_) { }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      const { data: myReact } = await supabase.from('message_reactions').select('id').eq('message_id', messageId).eq('user_id', effectiveChatUserId || user!.id).eq('emoji', emoji).maybeSingle();
      if (myReact) {
        await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', effectiveChatUserId || user!.id).eq('emoji', emoji);
      } else {
        await supabase.from('message_reactions').insert([{ message_id: messageId, user_id: effectiveChatUserId || user!.id, emoji }]);
      }
      await fetchData();
    } catch (error) {
      console.error('toggleReaction error', error);
    }
  };

  const togglePin = async (messageId: string) => {
    const normalizedMessageId = String(messageId);
    const isPinned = pinnedIds.includes(normalizedMessageId);
    try {
      if (isPinned) {
        const { error } = await supabase
          .from('pinned_messages')
          .delete()
          .eq('room_id', selectedRoomId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
        setPinnedIds([]);
        writeStoredPinnedIds(selectedRoomId, []);
      } else {
        const { error: clearError } = await supabase.from('pinned_messages').delete().eq('room_id', selectedRoomId);
        if (clearError) throw clearError;
        const { error: insertError } = await supabase
          .from('pinned_messages')
          .insert([{ room_id: selectedRoomId, message_id: normalizedMessageId, pinned_by: effectiveChatUserId || user?.id }]);
        if (insertError) throw insertError;
        setPinnedIds([normalizedMessageId]);
        writeStoredPinnedIds(selectedRoomId, [normalizedMessageId]);
      }
      await fetchData();
    } catch (error) {
      console.error('공지 등록 상태 변경 실패:', error);
      toast(isPinned ? '공지 해제에 실패했습니다.' : '공지 등록에 실패했습니다.', 'error');
    }
  };

  const toggleBookmark = async (messageId: string) => {
    const normalizedMessageId = String(messageId);
    const isBookmarked = bookmarkedIds.has(normalizedMessageId);
    const nextBookmarkIds = isBookmarked
      ? Array.from(bookmarkedIds).filter((id) => id !== normalizedMessageId)
      : [...Array.from(bookmarkedIds), normalizedMessageId];
    try {
      if (!effectiveTodoUserId) {
        throw new Error('missing-user');
      }
      if (isBookmarked) {
        const { error } = await supabase
          .from('message_bookmarks')
          .delete()
          .eq('user_id', effectiveTodoUserId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_bookmarks').insert([
          {
            user_id: effectiveTodoUserId,
            message_id: normalizedMessageId,
            room_id: selectedRoomId,
          },
        ]);
        if (error) throw error;
      }
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
      await fetchData();
    } catch (error) {
      console.error('toggleBookmark error', error);
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
    }
  };

  const markMessageRead = async (msg: ChatMessage) => {
    if (String(msg.sender_id) === effectiveChatUserId) return;
    try {
        await persistMessageReads([msg.id]);
        await persistRoomReadCursor(msg.room_id, new Date().toISOString());
        broadcastChatSync('message-read', msg.room_id);
        fetchData();
    } catch (_) { }
  };

  const handleGlobalSearch = useCallback(async (rawQuery?: string) => {
    const q = String(rawQuery ?? globalSearchQuery).trim();
    if (!q) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    setGlobalSearchLoading(true);
    try {
      if (visibleRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      // 대화내용 + 파일URL(파일명·사진명) 통합 OR 검색
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('room_id', visibleRoomIds)
        .or(`content.ilike.%${q}%,file_url.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const messageRows = Array.isArray(data) ? data : [];
      const relatedRoomIds = Array.from(new Set(messageRows.map(( message: ChatMessage) => String(message.room_id)).filter(Boolean)));
      if (relatedRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      const { data: roomRows, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, name, type, members')
        .in('id', relatedRoomIds);
      if (roomError) throw roomError;

      const roomMap = new Map<string, any>();
      (roomRows || []).forEach(( room: ChatRoom) => {
        roomMap.set(String(room.id), room);
      });

      const enrichedRows = messageRows.map(( message: ChatMessage) => ({
        ...message,
        staff: resolveStaffProfile(message.sender_id, message.sender_name),
        chat_rooms: roomMap.get(String(message.room_id)) || null,
      }));

      setGlobalSearchResults(enrichedRows);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [globalSearchQuery, resolveStaffProfile, visibleRoomIds]);
  useEffect(() => {
    if (!showGlobalSearch) return;
    const q = deferredGlobalSearchQuery.trim();
    if (!q) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      void handleGlobalSearch(q);
    }, 180);
    return () => clearTimeout(timer);
  }, [deferredGlobalSearchQuery, handleGlobalSearch, showGlobalSearch]);

  const visibleTimelineMessages = useMemo(() => {
    const msgs = messages;
    if (deferredChatSearch.trim()) {
      const q = deferredChatSearch.toLowerCase();
      return msgs.filter((m) =>
        ((m.is_deleted ? '삭제된 메시지입니다' : (m.content || ''))).toLowerCase().includes(q) ||
        ((m.staff as { name?: string } | null | undefined)?.name || '').toLowerCase().includes(q)
      );
    }
    return msgs;
  }, [messages, deferredChatSearch]);
  const selectedRoomPollTimelineItems = useMemo(
    () =>
      polls
      .filter((p: Record<string, unknown>) => p.room_id === selectedRoomId)
      .map(p => ({ ...p, type: 'poll', created_at: p.created_at || new Date().toISOString() })),
    [polls, selectedRoomId]
  );
  const combinedTimeline = useMemo(() => {
    const ms = visibleTimelineMessages.map(m => ({ ...m, type: 'message' }));
    const ps = selectedRoomPollTimelineItems;
    return [...ms, ...ps].sort((a, b) => new Date((a as Record<string,unknown>).created_at as string || 0).getTime() - new Date((b as Record<string,unknown>).created_at as string || 0).getTime());
  }, [selectedRoomPollTimelineItems, visibleTimelineMessages]);

  useEffect(() => {
    const load = async () => {
      if (!(effectiveChatUserId || user?.id) || !selectedRoomId) {
        setRoomNotifyOn(true);
        return;
      }
      const { data, error } = await supabase
        .from('room_notification_settings')
        .select('notifications_enabled')
        .eq('user_id', effectiveChatUserId || user?.id)
        .eq('room_id', selectedRoomId)
        .maybeSingle();
      if (error) {
        setRoomNotifyOn(true);
        return;
      }
      setRoomNotifyOn(data?.notifications_enabled !== false);
    };
    load();
  }, [selectedRoomId, effectiveChatUserId, user?.id]);
  const toggleRoomNotify = async () => {
    if (!(effectiveChatUserId || user?.id) || !selectedRoomId) return;
    setRoomNotifyOn((p) => !p);
    await supabase.from('room_notification_settings').upsert({ user_id: effectiveChatUserId || user?.id, room_id: selectedRoomId, notifications_enabled: !roomNotifyOn }, { onConflict: 'user_id,room_id' });
  };

  const deleteMessage = async (msg: ChatMessage) => {
    if (selectedRoom?.id === NOTICE_ROOM_ID && !isMso) {
      toast('공지 채널 메시지는 삭제할 수 없습니다.', 'success');
      return;
    }
    if (String(msg.sender_id) !== String(effectiveChatUserId || user?.id || '') && !isMso) return;
    if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
    setMessages((prev) =>
      prev.map((message: ChatMessage) =>
        String(message.id) === String(msg.id)
          ? {
              ...message,
              is_deleted: true,
            }
          : message
      )
    );
    await supabase.from('messages').update({ is_deleted: true }).eq('id', msg.id);
    // 감사 로그 기록
    try {
      await supabase.from('audit_logs').insert([
        {
          user_id: user?.id,
          user_name: user?.name,
          action: 'message_delete',
          target_type: 'message',
          target_id: msg.id,
          details: {
            room_id: selectedRoomId,
            content: msg.content,
          },
        },
      ]);
    } catch {
    }
    fetchData();
    setActiveActionMsg(null);
  };

  const openMessageActions = useCallback((msg: ChatMessage) => {
    markMessageRead(msg);
    setActiveActionMsg(msg);
  }, [markMessageRead]);

  const startReplyToMessage = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    setActiveActionMsg(null);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      if (!isMobileChatViewport()) {
        composerRef.current?.scrollIntoView({ block: 'nearest' });
      }
    });
  }, []);


  const startForwardMessage = useCallback((msg: ChatMessage) => {
    setForwardSourceMsg(msg);
    setShowForwardModal(true);
    setActiveActionMsg(null);
  }, []);

  const openReadStatusPanel = useCallback((msg: ChatMessage) => {
    void loadReadStatusForMessage(msg);
    setActiveActionMsg(null);
  }, [loadReadStatusForMessage]);

  const openThreadPanel = useCallback((msg: ChatMessage) => {
    setThreadRoot(msg);
    setActiveActionMsg(null);
  }, []);

  const deleteMessageFromActions = useCallback(async (msg: ChatMessage) => {
    await deleteMessage(msg);
  }, [deleteMessage]);

  const startEditMessage = useCallback((msg: ChatMessage) => {
    if (String(msg.sender_id) !== String(effectiveChatUserId || user?.id || '') && !isMso) return;
    setEditingMessage(msg);
    setEditingMessageDraft(msg.content || '');
    setActiveActionMsg(null);
  }, [effectiveChatUserId, isMso, user?.id]);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessage) return;
    const targetMessage = editingMessage;
    const nextContent = editingMessageDraft.trim();
    if (!nextContent) {
      toast('메시지 내용을 입력해 주세요.', 'warning');
      return;
    }

    const messageId = String(targetMessage.id);
    setEditingMessage(null);
    setEditingMessageDraft('');
    setMessages((prev) =>
      prev.map((message: ChatMessage) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      )
    );
    setPersistedPinnedMessages((prev) =>
      prev.map((message: ChatMessage) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      )
    );

    const { error } = await supabase
      .from('messages')
      .update({ content: nextContent })
      .eq('id', targetMessage.id);

    if (error) {
      toast('메시지 수정 실패', 'error');
      fetchData();
      return;
    }
  }, [editingMessage, editingMessageDraft, fetchData]);

  return (
    <div data-testid="chat-view" className="flex flex-1 min-h-0 overflow-hidden relative font-sans bg-[var(--background)] md:h-[100dvh] md:max-h-[100dvh] md:bg-[var(--card)]">

      <aside className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-[var(--border)] dark:border-zinc-800 bg-[var(--card)] dark:bg-zinc-950 flex-col shrink-0 z-50 transition-all`}>
        <div className="p-3 md:p-3 space-y-3 flex flex-col min-h-0">
          <div className="flex items-center gap-1">
            <div className="flex flex-1 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-800 p-1 rounded-xl glass">
              <button
                data-testid="chat-tab-chat"
                onClick={() => setViewMode('chat')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'chat'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
                  }`}
              >
                채팅
              </button>
              <button
                data-testid="chat-tab-org"
                onClick={() => setViewMode('org')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'org'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
                  }`}
              >
                조직도
              </button>
            </div>
            {/* 통합 검색 버튼 — 항상 노출 */}
            <button
              data-testid="chat-open-group-modal-legacy"
              type="button"
              onClick={() => setShowGroupModal(true)}
              title="새 그룹 채팅방 만들기"
              className="hidden"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4v12"/><path d="M4 10h12"/>
              </svg>
            </button>
            <button
              data-testid="chat-open-global-search"
              onClick={openGlobalSearch}
              title="대화내용·파일·사진 통합 검색"
              className="shrink-0 flex items-center justify-center w-9 h-8 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--accent)] hover:bg-[var(--toss-blue-light)] transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="5.5"/><line x1="12.5" y1="12.5" x2="18" y2="18"/><path d="M15 3v4"/><path d="M13 5h4"/>
              </svg>
            </button>
          </div>

        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-0.5 custom-scrollbar">
          {viewMode === 'chat' ? (
            <>
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                  {showHiddenRooms ? '숨김 대화 포함' : '숨김 대화 제외'}
                </span>
                <button
                  type="button"
                  data-testid="chat-toggle-hidden-rooms"
                  onClick={() => setShowHiddenRooms((prev) => !prev)}
                  className="text-[10px] font-semibold text-blue-500 hover:text-blue-600"
                >
                  {showHiddenRooms ? '숨김방 닫기' : '숨김방 보기'}
                </button>
              </div>
              {sidebarRoomItems.map(({ room, roomId, unread, isSelected, isNoticeChannel, label, preview, isPeerOnline, isPinned, isHidden, pinnedIndex, pinnedCount }) => {
                  return (
                    <div
                      key={roomId}
                      data-testid={`chat-room-${roomId}`}
                      onClick={() => setRoom(room.id)}
                      className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 border relative overflow-hidden ${isSelected
                        ? 'bg-zinc-800 border-zinc-700 shadow-sm'
                        : 'bg-[var(--card)] dark:bg-zinc-900 border-transparent hover:border-[var(--border)] dark:hover:border-zinc-800'
                        }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                      )}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isNoticeChannel ? 'bg-blue-100 text-blue-600' : 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)]'}`}>
                          {isNoticeChannel ? '📢' : '💬'}
                          {!isNoticeChannel && isPeerOnline && (
                            <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-zinc-900" />
                          )}
                        </div>                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {unread > 0 && (
                              <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-[var(--radius-md)] bg-blue-600 text-white text-[9px] font-bold shadow-soft">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                            <p className={`text-[12px] font-bold truncate ${isSelected ? 'text-white' : 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]'}`}>
                              {label}
                            </p>
                            {isPinned && <span className="text-[9px] font-bold text-amber-400">PIN</span>}
                            {isHidden && <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">HIDE</span>}
                          </div>
                          <p className="text-[10px] text-[var(--toss-gray-3)] font-medium truncate">
                            {preview}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isNoticeChannel && (
                          <>
                            <button
                              type="button"
                               data-testid={`chat-room-pin-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                 toggleRoomPinned(room.id, !isPinned);
                              }}
                              className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'}`}
                              title={isPinned ? '고정 해제' : '상단 고정'}
                            >
                              {isPinned ? '해제' : '고정'}
                            </button>
                            {isPinned && (
                              <>
                                <button
                                  type="button"
                                  data-testid={`chat-room-pin-up-${roomId}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePinnedRoom(room.id, 'up');
                                  }}
                                  disabled={pinnedIndex <= 0}
                                  className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'} disabled:cursor-not-allowed`}
                                  title="고정방 위로"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  data-testid={`chat-room-pin-down-${roomId}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePinnedRoom(room.id, 'down');
                                  }}
                                  disabled={pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1}
                                  className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'} disabled:cursor-not-allowed`}
                                  title="고정방 아래로"
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                               data-testid={`chat-room-hide-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateRoomPreference(room.id, { hidden: !isHidden });
                              }}
                              className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'}`}
                              title={isHidden ? '숨김 해제' : '대화 숨김'}
                            >
                              {isHidden ? '표시' : '숨김'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </>
          ) : (
            <div data-testid="chat-org-list" className="space-y-3">
              {Object.entries(groupedStaffs).map(([company, depts]) => (
                <div key={company} className="space-y-1">
                  {/* 회사 헤더 */}
                  <div className="flex items-center gap-2 px-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <h3 className="text-[11px] font-black text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] uppercase tracking-wider truncate">{company}</h3>
                    <div className="flex-1 h-[1px] bg-[var(--tab-bg)] dark:bg-zinc-800/50" />
                  </div>
                  {/* 팀(부서) — 클릭 시 접기/펼치기 */}
                  <div className="space-y-0.5 pl-1">
                    {Object.entries(depts as Record<string, StaffMember[]>).map(([dept, members]) => {
                      const key = `${company}::${dept}`;
                      const collapsed = !expandedDepts.has(key);
                      return (
                        <div key={dept}>
                          {/* 팀 헤더 (토글 버튼) */}
                          <button
                            type="button"
                            onClick={() => toggleDept(key)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <span className={`text-[9px] text-[var(--toss-gray-3)] transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}>▼</span>
                            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)] flex-1 truncate">{dept}</span>
                            <span className="text-[9px] font-semibold text-[var(--toss-gray-3)] shrink-0">{(members as StaffMember[]).length}명</span>
                          </button>
                          {/* 팀원 목록 (접힐 때 숨김) */}
                          {!collapsed && (
                            <div className="space-y-0.5 pl-2 pt-0.5 pb-1">
                              {(members as StaffMember[]).map((s: StaffMember) => (
                                <div key={s.id} className="flex items-center gap-2.5 px-2 py-2 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border-subtle)] dark:border-zinc-800/50 rounded-xl hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-all group cursor-default">
                                  <div className="w-7 h-7 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-lg flex items-center justify-center text-[11px] font-bold text-[var(--toss-gray-3)] overflow-hidden shrink-0">
                                    {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-full h-full object-cover" /> : s.name?.[0]}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      <p className="text-[11px] font-bold text-foreground truncate">{s.name}</p>
                                      <span className="text-[9px] font-medium text-[var(--toss-gray-3)] shrink-0">{s.position}</span>
                                    </div>
                                  </div>
                                  <button
                                    data-testid={`chat-direct-${s.id}`}
                                    onClick={() => void openDirectChat(s)}
                                    className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md text-[9px] font-bold opacity-100 transition-all border border-blue-100 dark:border-blue-800/50 shrink-0"
                                  >
                                    대화
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className={`${!selectedRoomId ? 'hidden md:flex' : 'flex'} flex-1 min-h-0 flex-col overflow-hidden bg-[var(--muted)] relative`}>
        {selectedRoomId && selectedRoom && (
          <header className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border)]/50 dark:border-zinc-800/50 glass glass-border shrink-0 z-40">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setRoom(null)} className="md:hidden text-[var(--toss-gray-3)]">뒤로</button>
              <div className="w-9 h-9 rounded-lg bg-[var(--tab-bg)] dark:bg-zinc-800 flex items-center justify-center text-lg">
                {selectedRoom.id === NOTICE_ROOM_ID ? '📢' : '💬'}
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] font-bold text-foreground truncate">
                  {selectedRoomLabel}
                </h3>
                <div className="flex items-center gap-1.5 text-[10px] font-medium">
                  <p className="text-[var(--toss-gray-4)]">
                    {typingNoticeText
                      ? typingNoticeText
                      : selectedPeer
                        ? selectedPeerIsOnline
                          ? '온라인'
                          : '오프라인'
                        : `${roomMembers.length || 0}명 참여중`}
                  </p>
                  <span className="text-[var(--toss-gray-4)]">·</span>
                  <span className={`inline-flex items-center gap-1 ${realtimeConnectionMeta.textClassName}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${realtimeConnectionMeta.dotClassName}`} />
                    <span>{realtimeConnectionMeta.label}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                data-testid="chat-open-drawer"
                onClick={() => setShowDrawer(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-foreground"
                title="채팅방 정보 및 참여자 보기"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M4 5.5H16" />
                  <path d="M4 10H16" />
                  <path d="M4 14.5H16" />
                </svg>
              </button>
            </div>
          </header>
        )}

        {selectedRoomId && noticeMessages.length > 0 && (
          <div className="shrink-0 border-b border-orange-100 bg-orange-50/80 px-4 py-3 md:px-4">
            <div className="flex flex-wrap gap-2">
              {noticeMessages.map((pinnedMessage) => (
                <button
                  key={`pin-${pinnedMessage.id}`}
                  type="button"
                  onClick={() => scrollToMessage(pinnedMessage.id)}
                  className="min-w-0 max-w-full rounded-[var(--radius-lg)] border border-orange-200 bg-[var(--card)] px-3 py-2 text-left shadow-sm transition-colors hover:bg-orange-100"
                >
                  <p className="text-[10px] font-bold text-orange-500">공지 메시지</p>
                  <p className="mt-1 max-w-[280px] truncate text-xs font-semibold text-[var(--foreground)]">
                    {getMessageDisplayText(
                      pinnedMessage.content,
                      pinnedMessage.file_name,
                      pinnedMessage.file_url,
                      '첨부 파일 메시지'
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={messageListRef}
          data-testid="chat-message-list"
          onScroll={updateScrollPositionState}
          className="flex-1 min-h-0 overflow-y-auto px-2 py-0.5 pb-1 md:px-4 md:py-2 md:pb-2 space-y-0 custom-scrollbar"
        >
          {!selectedRoomId ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
              <span className="text-4xl mb-2">💬</span>
              <p className="text-sm font-bold">채팅방을 선택하세요.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <span className="text-6xl mb-4">💬</span>
              <p className="font-semibold text-sm">대화 내용이 없습니다.</p>
            </div>
          ) : (
            (() => {
              let lastDateLabel = '';
              let lastSenderId = '';
              return combinedTimeline.map((item) => {
                if (item.type === 'poll') {
                  const pollItem = item as unknown as PollItem;
                  const votes = pollVotes[pollItem.id] || {};
                  const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                  return (
                    <div data-testid={`chat-poll-${pollItem.id}`} key={`poll-${pollItem.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 shadow-soft">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="text-sm">🗳️</span> 투표
                      </p>
                      <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{pollItem.question}</p>
                      <div className="space-y-1.5">
                        {(pollItem.options || []).map((opt: string, idx: number) => (
                          <button
                            data-testid={`chat-poll-vote-${pollItem.id}-${idx}`}
                            key={idx}
                            onClick={() => handleVote(pollItem.id, idx)}
                            className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-[var(--card)] dark:bg-zinc-800/50 border border-blue-200/50 dark:border-blue-700/30 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-[11px] font-medium group"
                          >
                            <span className="text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{opt}</span>
                            <span className="text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                              {votes[idx] || 0}
                              {totalVotes > 0 && <span className="ml-1 opacity-60 font-medium">({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                type MsgItem = ChatMessage & { staff?: { name?: string; position?: string; photo_url?: string | null } | null; reply_to_id?: string | null };
                const msg = item as unknown as MsgItem;
                const isMine = String(msg.sender_id) === effectiveChatUserId;
                const isDeletedMessage = Boolean(msg.is_deleted);
                const msgReacts = reactions[msg.id] || {};
                const hasReacts = Object.keys(msgReacts).some(e => (msgReacts[e] || 0) > 0);

                const readersCount = readCounts[msg.id] || 0;
                const totalRecipients = Math.max(
                  0,
                  roomMembers.filter((member: StaffMember) => String(member.id) !== String(msg.sender_id || '')).length
                );
                const unreadRecipients = Math.max(0, totalRecipients - readersCount);
                const deliveryStateInfo = deliveryStates[msg.id];
                const deliveryState = deliveryStateInfo?.status || (String(msg.id).startsWith('temp-') ? 'sending' : 'sent');
                const deliveryStateLabel = isMine && deliveryState === 'sending'
                  ? '전송 중'
                  : isMine && deliveryState === 'failed'
                    ? '전송 실패'
                    : null;
                const deliveryErrorText = isMine && deliveryState === 'failed'
                  ? String(deliveryStateInfo?.error || '').trim()
                  : '';
                const readStatusSummary = totalRecipients > 0 && unreadRecipients > 0
                  ? `${unreadRecipients}`
                  : null;
                const canOpenReadStatus = Boolean(
                  deliveryState === 'sent' &&
                  totalRecipients > 0
                );
                const displayedReadStatusSummary = !isMine && !readStatusSummary && totalRecipients > 0 && readersCount > 0
                  ? `${readersCount}`
                  : readStatusSummary;

                const TOOLBAR_EMOJIS = ['👍', '❤️', '👏', '🎉', '🔥', '✅', '👀', '🙏'];

                const created = new Date(msg.created_at || 0);
                const dateLabel = created.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                });
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;

                const isSystemInvite = typeof msg.content === 'string' && msg.content.startsWith('[초대]');
                const systemText = isSystemInvite ? (msg.content as string).replace(/^\[초대\]\s*/, '') : '';
                const isContinuous = !showDateDivider && !isSystemInvite && String(msg.sender_id) === lastSenderId;
                lastSenderId = String(msg.sender_id);

                return (
                  <div key={msg.id} className={isContinuous ? 'mt-0.5' : 'mt-1 md:mt-2'}>
                    {showDateDivider && (
                      <div className="my-0.5 flex items-center justify-center gap-1 md:my-2 md:gap-2">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">
                          {dateLabel}
                        </span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>
                    )}
                    {isSystemInvite ? (
                      <div className="flex justify-center my-1">
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--toss-blue-light)] text-[10px] font-semibold text-[var(--accent)]">
                          초대 {systemText}
                        </span>
                      </div>
                    ) : (
                      <div
                        ref={el => { msgRefs.current[msg.id] = el; }}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        {!isMine && !isContinuous && (
                          <span className="mb-0.5 px-1 text-[10px] font-semibold leading-none text-[var(--toss-gray-3)]">
                            {msg.staff?.name} {msg.staff?.position}
                          </span>
                        )}
                        <div
                          data-testid={isDeletedMessage ? `chat-message-deleted-${msg.id}` : `chat-message-${msg.id}`}
                          onClick={(e) => {
                            if (isDeletedMessage) return;
                            e.stopPropagation();
                            openMessageActions(msg);
                          }}
                          className={`group relative ${
                            isDeletedMessage
                              ? 'border border-dashed border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[var(--toss-gray-3)] italic md:px-3'
                              : !msg.content
                                ? 'p-0 bg-transparent shadow-none border-none'
                                : 'border px-2 py-1 md:px-3'
                          } rounded-[var(--radius-md)] text-[13px] md:text-sm ${isDeletedMessage ? 'cursor-default' : 'cursor-pointer'} transition-all max-w-[78%] md:max-w-[72%] ${
                            isDeletedMessage
                              ? isMine
                                ? 'rounded-tr-sm'
                                : 'rounded-tl-sm'
                              : !msg.content
                                ? ''
                                : isMine
                                  ? 'bg-[var(--accent)] text-white border-transparent rounded-tr-sm'
                                  : 'bg-[var(--card)] dark:bg-zinc-800 border-[var(--border)] dark:border-zinc-700 rounded-tl-sm hover:border-blue-300 dark:hover:border-blue-700 text-foreground'
                          }`}
                          role="button"
                          tabIndex={isDeletedMessage ? -1 : 0}
                          onKeyDown={(e) => {
                            if (isDeletedMessage) return;
                            if (e.key === 'Enter') markMessageRead(msg);
                          }}
                          aria-label={`${msg.staff?.name || '이름 없음'} ${isDeletedMessage ? '삭제된 메시지' : '메시지'}`}
                        >
                          {!isDeletedMessage && msg.reply_to_id && (() => {
                            const parent = messages.find(( m: ChatMessage) => m.id === msg.reply_to_id);
                            return parent ? (
                              <div
                                className={`mb-1 p-1.5 rounded-[var(--radius-md)] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isMine ? 'bg-white/10 border-white/40 text-white/90' : 'bg-[var(--muted)] border-[var(--accent)]/40 text-[var(--foreground)]'
                                  }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  scrollToMessage(msg.reply_to_id!);
                                }}
                              >
                                <span className="font-bold opacity-80">답글 {(parent.staff as { name?: string } | null | undefined)?.name}: </span>
                                <span className="truncate block mt-0.5">
                                  {getMessageDisplayText(
                                    parent.content,
                                    parent.file_name,
                                    parent.file_url,
                                    '첨부 파일'
                                  )}
                                </span>
                              </div>
                            ) : null;
                          })()}
                          <div className={`leading-relaxed ${(msg.content && !isDeletedMessage) ? 'mb-0.5' : ''}`}>
                            {isDeletedMessage ? '삭제된 메시지입니다.' : renderMessageContent(msg.content || '', isMine)}
                          </div>
                          {!isDeletedMessage && msg.file_url && (() => { const furl = msg.file_url!; const attachmentName = getAttachmentDisplayName(msg.file_name, furl); return (
                            <div className="space-y-1 mt-2" onClick={(e) => e.stopPropagation()}>
                              {isImageUrl(furl) ? (
                                <div className="relative group inline-block">
                                  <button type="button" className="block" onClick={() => openAttachmentPreview(furl, attachmentName, 'image')}>
                                    <img
                                      src={furl}
                                      alt="첨부 이미지"
                                      className={`max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] object-cover cursor-zoom-in ${msg.content ? 'border border-[var(--border)]' : 'shadow-sm'}`}
                                    />
                                  </button>
                                  <div className="absolute opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity inset-0 flex items-center justify-center bg-black/40 rounded-[var(--radius-md)] gap-2 pointer-events-none">
                                    <AttachmentQuickActions
                                      url={furl}
                                      name={attachmentName}
                                      onPreview={() => setImagePreviewUrl(furl)}
                                      variant="overlay"
                                    />
                                  </div>
                                  <p className={`mt-1 max-w-[200px] md:max-w-[240px] truncate text-[10px] font-semibold ${isMine ? 'text-white/85' : 'text-[var(--toss-gray-4)]'}`}>{attachmentName}</p>
                                </div>
                              ) : isVideoUrl(furl) ? (
                                <div className="block">
                                  <video controls className={`max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] bg-black ${msg.content ? 'border border-[var(--border)]' : 'shadow-sm'}`}>
                                    <source src={furl} />
                                  </video>
                                  <AttachmentQuickActions
                                    url={furl}
                                    name={attachmentName}
                                    onPreview={() => openAttachmentPreview(furl, attachmentName, 'video')}
                                    variant="subtle"
                                    className="mt-2"
                                  />
                                  <p className={`mt-1 max-w-[200px] md:max-w-[240px] truncate text-[10px] font-semibold ${isMine ? 'text-white/85' : 'text-[var(--toss-gray-4)]'}`}>{attachmentName}</p>
                                </div>
                              ) : (
                                <div className={`p-3 rounded-[var(--radius-md)] border ${isMine ? 'bg-white/95 border-white/40 text-slate-900' : 'bg-[var(--toss-gray-0)] border-[var(--border)] text-[var(--foreground)]'} flex items-start gap-3 shadow-sm min-w-0 sm:min-w-[200px]`}>
                                  <div className="text-3xl">📎</div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="font-bold text-[12px] truncate mb-1 text-[var(--foreground)]">{attachmentName}</p>
                                    <AttachmentQuickActions
                                      url={furl}
                                      name={attachmentName}
                                      onPreview={() => openAttachmentPreview(furl, attachmentName, 'file')}
                                      variant="pill"
                                      className="mt-2"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ); })()}

                          {!isDeletedMessage && hasReacts && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                              <span className="flex gap-1 flex-wrap">
                                {Object.entries(msgReacts).map(([emoji, cnt]) =>
                                ((cnt as number) > 0 ? (
                                  <span
                                    key={emoji}
                                    className={`px-1.5 py-0.5 rounded text-[11px] ${isMine ? 'bg-[var(--card)]/20' : 'bg-[var(--muted)]'
                                      }`}
                                  >
                                    {emoji} {cnt as number}
                                  </span>
                                ) : null)
                                )}
                              </span>
                            </div>
                          )}

                          <div
                            className={`absolute bottom-0 z-10 ${isMine ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'
                              } flex flex-col gap-0.5 whitespace-nowrap`}
                          >
                            {displayedReadStatusSummary && (
                              canOpenReadStatus ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadReadStatusForMessage(msg);
                                  }}
                                  className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 underline underline-offset-2"
                                >
                                  {displayedReadStatusSummary}
                                </button>
                              ) : (
                                <span className={`text-[10px] font-bold ${deliveryState === 'failed' ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {displayedReadStatusSummary}
                                </span>
                              )
                            )}
                            <span className="text-[8px] font-bold text-[var(--toss-gray-4)]">
                              {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        {isMine && deliveryStateLabel && (
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                deliveryState === 'failed'
                                  ? 'bg-red-50 text-red-500'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {deliveryStateLabel}
                            </span>
                            {deliveryState === 'failed' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryFailedMessage(String(msg.id));
                                }}
                                className="px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-red-50 text-red-500 hover:bg-red-100"
                                aria-label="재전송"
                              >
                                재전송
                              </button>
                            )}
                          </div>
                        )}
                        {isMine && deliveryState === 'failed' && deliveryErrorText && (
                          <p className="mt-1 max-w-[78%] text-right text-[10px] text-red-500 break-words">
                            {deliveryErrorText}
                          </p>
                        )}
                        <div
                          className={`mt-0.5 hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex ${isMine ? 'flex-row-reverse' : ''}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { startReplyToMessage(msg); }}
                            className="p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-blue-500 transition-colors"
                          >
                            답장
                          </button>
                          <button
                            type="button"
                            onClick={() => { openMessageActions(msg); }}
                            className="p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors"
                          >
                            더보기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}

          <div ref={scrollRef} />
        </div>

        {showScrollToLatest && selectedRoomId && (
          <div className="absolute right-4 bottom-4 z-20">
            <button
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] shadow-sm text-[11px] font-bold text-[var(--foreground)]"
            >
              최신 메시지
            </button>
          </div>
        )}

        <div
          data-testid="chat-upload-dropzone"
          className={`relative z-10 shrink-0 bg-[var(--card)] px-1 py-0.5 pb-[calc(env(safe-area-inset-bottom)+4px)] md:px-2.5 md:py-1.5 md:pb-1.5 transition-all ${isDragging ? 'border-t-2 border-[var(--accent)] border-dashed bg-blue-50 dark:bg-blue-900/20' : 'border-t border-[var(--border)]'}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={async (e) => {
            e.preventDefault(); e.stopPropagation(); setIsDragging(false);
            const files = Array.from(e.dataTransfer.files || []).filter((file): file is File => !!file);
            queueDroppedFiles(files);
          }}
        >
          {replyTo && (
            <div className="mb-1 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)] px-2 py-1 animate-in slide-in-from-bottom-2">
              <p className="text-[11px] font-bold text-[var(--accent)]">@{(replyTo.staff as { name?: string } | null | undefined)?.name}님에게 답글 작성 중...</p>
              <button onClick={() => setReplyTo(null)} className="text-[var(--accent)] hover:text-[var(--accent)] font-semibold">닫기</button>
            </div>
          )}

          {pendingAttachmentFiles.length > 0 && (
            <div
              data-testid="chat-pending-upload-panel"
              className="mb-1 flex flex-col gap-1 rounded-[var(--radius-lg)] border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] text-blue-900"
            >
              <p className="font-semibold">
                선택한 파일 {pendingAttachmentFiles.length}개를 채팅방에 전송할까요?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pendingAttachmentFiles.map((file, index) => {
                  const displayName = getPendingAttachmentDisplayName(file);
                  return (
                    <span
                      key={`${displayName}-${index}`}
                      data-testid={`chat-pending-upload-file-${index}`}
                      className="max-w-full truncate rounded-full border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-900"
                      title={displayName}
                    >
                      {displayName}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="chat-pending-upload-cancel-button"
                  onClick={cancelPendingAttachmentUpload}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="chat-pending-upload-send-button"
                  onClick={() => void confirmPendingAttachmentUpload()}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  전송
                </button>
              </div>
            </div>
          )}

          <div
            aria-live="polite"
            className="mb-0.5 min-h-[8px] px-1 text-[10px] font-medium"
          >
            {typingNoticeText ? (
              <span className="text-blue-500">{typingNoticeText}</span>
            ) : null}
          </div>

          <div className={`flex items-end gap-1 rounded-[var(--radius-lg)] border px-1 py-1 md:gap-2 md:px-2.5 md:py-2 transition-all ${selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice
            ? 'bg-[var(--muted)] border-[var(--border)] opacity-80 pointer-events-none'
            : 'bg-[var(--muted)] border-[var(--border)] focus-within:bg-[var(--card)] focus-within:ring-2 focus-within:ring-[var(--accent)]/50'
            }`}>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              title="파일 첨부"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] transition-colors hover:text-[var(--accent)] disabled:opacity-50 md:h-8 md:w-8"
            >
              {fileUploading ? <span className="animate-pulse text-xs">...</span> : <span className="text-[11px] font-bold md:text-xs">첨부</span>}
            </button>
            <div className="relative flex-1">
              <textarea
                ref={composerRef}
                data-testid="chat-message-input"
                rows={1}
                className="block min-h-[28px] w-full min-w-0 resize-none bg-transparent px-1 py-0.5 text-[16px] font-bold leading-5 outline-none md:min-h-[22px] md:px-2 md:py-1 md:text-sm md:leading-5"
                style={{ fontSize: '16px' }}
                placeholder={selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice ? "부서장 이상만 공지 작성 가능" : "메시지를 입력하세요... (@이름 멘션 가능)"}
                value={inputMsg}
                onChange={e => {
                  const value = e.target.value;
                  handleComposerChange(value, e.target.selectionStart ?? value.length);
                }}
                onPaste={handleComposerPaste}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (e.nativeEvent.isComposing) return;

                  const isMobileComposer = isMobileChatViewport();

                  if (isMobileComposer || e.shiftKey) {
                    return;
                  }

                  e.preventDefault();
                  void handleSendMessage();
                }}
              />
              {showMentionList && mentionCandidates.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm z-20 text-xs">
                  {mentionCandidates.map(( m: StaffMember) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        const value = inputMsg;
                        const match = value.match(/@([^\s@]{0,20})$/);
                        if (match) {
                          const replaced = value.replace(/@([^\s@]{0,20})$/, `@${m.name} `);
                          setInputMsg(replaced);
                        }
                        setShowMentionList(false);
                        setMentionQuery('');
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--toss-blue-light)] text-left"
                    >
                      <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">{m.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] truncate">
                        {(m.department || '')}{m.position ? ` · ${m.position}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              data-testid="chat-send-button"
              onClick={() => handleSendMessage()}
              className="flex h-7 min-w-[52px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[12px] font-bold text-white shadow-sm transition-all hover:scale-105 active:scale-95 md:h-8 md:min-w-[56px] md:px-3 md:text-sm"
            >
              전송
            </button>
          </div>
        </div>

        {showDrawer && (
          <>
            <div className="absolute inset-0 bg-black/10 z-50 animate-in fade-in duration-200" onClick={() => setShowDrawer(false)} aria-hidden="true" />
            <div data-testid="chat-room-drawer" className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-[var(--card)] dark:bg-zinc-900 shadow-sm z-[60] flex flex-col animate-in slide-in-from-right duration-300 border-l border-[var(--border)]">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]">
                <span className="text-sm font-bold">채팅방 정보</span>
              <button onClick={() => setShowDrawer(false)} className="p-2 text-[var(--toss-gray-3)] hover:text-black dark:hover:text-white rounded-[var(--radius-md)]">닫기</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <div className="flex items-center justify-between p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-2xl">
                  <span className="text-sm font-semibold">알림 설정</span>
                  <button
                    onClick={() => setRoomNotifyOn(!roomNotifyOn)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${roomNotifyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-[var(--card)] rounded-full transition-all ${roomNotifyOn ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <button data-testid="chat-open-poll-modal" onClick={() => { setShowPollModal(true); setShowDrawer(false); }} className="w-full flex items-center justify-between p-3.5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🗳️</span>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">새 투표 만들기</span>
                  </div>
                  <span className="text-[10px] text-blue-400 font-bold group-hover:translate-x-1 transition-transform">열기</span>
                </button>

                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">상단 공지</p>
                  <div data-testid="chat-drawer-notice" className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/30">
                    <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">공지</p>
                    <p className="text-xs text-orange-900/70 dark:text-orange-200/50 leading-relaxed whitespace-pre-wrap">
                      {currentNoticeMessage?.content || '등록된 공지가 없습니다.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">사진 및 동영상</p>
                    <button onClick={() => { setMediaFilter('all'); setShowMediaPanel(true); }} className="text-[10px] font-bold text-[var(--accent)]">전체보기</button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                    {sharedMediaPreviewMessages.map((m) => (
                      <div key={m.id} className="aspect-square bg-[var(--tab-bg)] dark:bg-zinc-800 relative group cursor-pointer" onClick={() => m.file_url && openAttachmentPreview(m.file_url, m.file_name || null, m.file_kind === 'video' ? 'video' : m.file_kind === 'image' ? 'image' : 'file')}>
                        {m.file_kind === 'image' ? (
                          <img src={m.file_url || ''} alt="Attached image" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>
                        )}
                        {m.file_url && (
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-black/40 flex items-center justify-center rounded-[inherit] pointer-events-none px-2">
                            <AttachmentQuickActions
                              url={m.file_url}
                              name={getAttachmentDisplayName(m.file_name, m.file_url)}
                              onPreview={() => openAttachmentPreview(m.file_url, m.file_name || null, m.file_kind === 'video' ? 'video' : m.file_kind === 'image' ? 'image' : 'file')}
                              variant="overlay"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    {sharedMediaPreviewMessages.length === 0 && (
                      <div className="col-span-3 py-5 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-2xl border border-dashed border-[var(--border)] dark:border-zinc-700">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">주고받은 미디어가 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">파일</p>
                    <button onClick={() => { setMediaFilter('file'); setShowMediaPanel(true); }} className="text-[10px] font-bold text-[var(--accent)]">전체보기</button>
                  </div>
                  <div className="space-y-2">
                    {sharedFilePreviewMessages.map((m) => {
                      const fileUrl = String(m.file_url || '');
                      const attachmentName = getAttachmentDisplayName(m.file_name, fileUrl);
                      return (
                        <div key={m.id} className="p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--card)] dark:bg-zinc-900 flex items-center justify-center text-lg shrink-0">📎</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground truncate">{attachmentName}</p>
                              <p className="text-[10px] text-[var(--toss-gray-4)] truncate mt-0.5">
                                {(m.staff as { name?: string } | null | undefined)?.name || '알 수 없음'} · {new Date(m.created_at || 0).toLocaleDateString()}
                              </p>
                              <AttachmentQuickActions
                                url={fileUrl}
                                name={attachmentName}
                                onPreview={() => openAttachmentPreview(fileUrl, attachmentName, 'file')}
                                variant="subtle"
                                className="mt-2"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {sharedFilePreviewMessages.length === 0 && (
                      <div className="py-4 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 파일이 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">링크</p>
                  <div className="space-y-2">
                    {sharedLinkPreviewMessages.map((m) => {
                      const urlMatch = (m.content || '').match(/https?:\/\/[^\s]+/);
                      const url = urlMatch ? urlMatch[0] : '';
                      return (
                        <a key={m.id} href={url} target="_blank" rel="noreferrer" className="block p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800 hover:border-emerald-500 transition-colors">
                          <p className="text-[11px] font-bold truncate text-emerald-600 mb-0.5">{url}</p>
                          <p className="text-[10px] text-[var(--toss-gray-4)] truncate">{(m.staff as { name?: string } | null | undefined)?.name} · {new Date(m.created_at || 0).toLocaleDateString()}</p>
                        </a>
                      );
                    })}
                    {sharedLinkPreviewMessages.length === 0 && (
                      <div className="py-4 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 링크가 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">참여자 ({roomMembers.length || 0})</p>
              {selectedRoom?.id !== NOTICE_ROOM_ID && (
                <button data-testid="chat-open-add-member-modal" onClick={() => setShowAddMemberModal(true)} className="w-6 h-6 flex items-center justify-center bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-[var(--radius-md)] text-[var(--toss-gray-4)] hover:text-emerald-500 transition-colors">+</button>
              )}
                  </div>
                  <div className="space-y-3">
                    {roomMembers.map((member) => {
                      const memberId = String(member.id);
                      const s =
                        selectedRoom?.id === NOTICE_ROOM_ID
                          ? member
                          : resolveRoomMemberProfile(selectedRoom!, memberId);
                      const isOwner = selectedRoom?.id !== NOTICE_ROOM_ID && selectedRoom?.created_by === (effectiveChatUserId || user?.id);
                      return (
                        <div data-testid={`chat-room-member-${memberId}`} key={memberId} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] font-bold text-emerald-600">
                              {s?.photo_url ? <img src={s.photo_url} alt={`${s.name}'s profile`} className="w-full h-full rounded-full object-cover" /> : (s?.name?.[0] || '?')}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground">{s?.name || '이름 없음'}</p>
                              <p className="text-[10px] text-[var(--toss-gray-4)] font-medium">{[s?.department, s?.position].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                          {isOwner && String(memberId) !== String(effectiveChatUserId || user?.id || '') && (
                            <button data-testid={`chat-remove-member-${memberId}`} onClick={() => { void removeRoomMember(String(memberId)); }} className="opacity-0 group-hover:opacity-100 p-1 text-red-500 text-[10px] font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all">내보내기</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[var(--tab-bg)] dark:bg-zinc-800/50 border-t border-[var(--border)] flex flex-col gap-2">
                {/* 이름 수정 인라인 폼 */}
                {editingRoomName ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={roomNameDraft}
                      onChange={e => setRoomNameDraft(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const name = roomNameDraft.trim();
                          if (!name || !selectedRoom) return;
                          await supabase.from('chat_rooms').update({ name }).eq('id', selectedRoom.id);
                          setChatRooms(prev => prev.map((r: ChatRoom) => r.id === selectedRoom.id ? { ...r, name } : r));
                          setEditingRoomName(false);
                          toast('채팅방 이름이 변경되었습니다.');
                        }
                        if (e.key === 'Escape') setEditingRoomName(false);
                      }}
                      placeholder="새 채팅방 이름"
                      className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={async () => {
                        const name = roomNameDraft.trim();
                        if (!name || !selectedRoom) return;
                        await supabase.from('chat_rooms').update({ name }).eq('id', selectedRoom.id);
                        setChatRooms(prev => prev.map((r: ChatRoom) => r.id === selectedRoom.id ? { ...r, name } : r));
                        setEditingRoomName(false);
                        toast('채팅방 이름이 변경되었습니다.');
                      }}
                      className="px-3 py-2 bg-[var(--accent)] text-white rounded-xl text-xs font-bold"
                    >저장</button>
                    <button onClick={() => setEditingRoomName(false)} className="px-3 py-2 bg-[var(--muted)] rounded-xl text-xs font-bold">취소</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {selectedRoom?.id !== NOTICE_ROOM_ID && (
                      <button onClick={() => { setShowDrawer(false); handleLeaveRoom(); }} className="flex-1 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-[11px] font-bold hover:bg-red-100 transition-colors">방 나가기</button>
                    )}
                    {/* 이름 수정: 그룹방 or 멤버 3명 이상(direct→그룹 전환) */}
                    {selectedRoom?.id !== NOTICE_ROOM_ID &&
                      (selectedRoom?.type !== 'direct' || (Array.isArray(selectedRoom?.members) && selectedRoom.members.length > 2)) && (
                      <button onClick={() => { setEditingRoomName(true); setRoomNameDraft(selectedRoom?.name || ''); }} className="flex-1 py-2.5 bg-[var(--muted)] text-foreground rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-colors">이름 수정</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeActionMsg && (
          <>
            <div className="absolute inset-0 bg-black/10 z-30 animate-in fade-in duration-200" onClick={() => { setActiveActionMsg(null); }} aria-hidden="true" />

            <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[var(--card)] dark:bg-zinc-900 rounded-t-[24px] shadow-sm z-40 flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[70vh] overflow-hidden">
              <div className="w-12 h-1.5 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
              <div className="px-4 pb-8 space-y-4 overflow-y-auto">
                <div className="flex justify-between items-center bg-[var(--tab-bg)] dark:bg-zinc-800/50 p-2 rounded-[var(--radius-xl)] gap-1 px-4">
                  {['👍', '❤️', '👏', '🎉', '🔥', '✅', '👀', '🙏'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); setActiveActionMsg(null); }} className="text-2xl hover:scale-110 transition-transform p-1">{emoji}</button>
                  ))}
                </div>
                <div className="space-y-1">
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">✅</span>
                    <span className="text-sm font-bold">할 일 추가</span>
                  </button>
                  <button onClick={() => { if (!activeActionMsg) return; void togglePin(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📢</span>
                    <span className="text-sm font-bold">{pinnedIds.includes(String(activeActionMsg.id)) ? '공지 해제' : '공지 등록'}</span>
                  </button>
                  <button data-testid="chat-message-action-bookmark-mobile" onClick={() => { if (!activeActionMsg) return; void toggleBookmark(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">🔖</span>
                    <span className="text-sm font-bold">{bookmarkedIds.has(String(activeActionMsg.id)) ? '북마크 해제' : '북마크 등록'}</span>
                  </button>
                  <button onClick={async () => { await navigator.clipboard?.writeText(activeActionMsg.content || ''); toast('복사했습니다.'); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📋</span>
                    <span className="text-sm font-bold">복사</span>
                  </button>
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && !activeActionMsg.is_deleted && (
                    <button data-testid="chat-message-action-edit-mobile" onClick={() => { startEditMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                      <span className="text-xl">✏️</span>
                      <span className="text-sm font-bold">수정</span>
                    </button>
                  )}
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && (
                    <button onClick={() => { void deleteMessageFromActions(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[var(--radius-md)] transition-colors text-red-500">
                      <span className="text-xl">🗑️</span>
                      <span className="text-sm font-bold">삭제</span>
                    </button>
                  )}
                  <button onClick={() => { startReplyToMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">↩️</span>
                    <span className="text-sm font-bold">답장</span>
                  </button>
                  <button onClick={() => { startForwardMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📤</span>
                    <span className="text-sm font-bold">전달</span>
                  </button>
                </div>
              </div>
            </div>

            <div data-testid="chat-message-actions-panel" className="hidden md:flex absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-40 flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">메시지 작업</span>
            <button onClick={() => { setActiveActionMsg(null); }} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">닫기</button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">빠른 반응</p>
                <div className="flex gap-2 flex-wrap">
                  {['👍', '❤️', '👏', '🔥', '🙏'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); }} className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] hover:bg-[var(--toss-blue-light)] text-xl transition-colors" title={emoji}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase pt-2">기능</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { startReplyToMessage(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    답글 달기
                  </button>
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && !activeActionMsg.is_deleted && (
                    <button data-testid="chat-message-action-edit" onClick={() => { startEditMessage(activeActionMsg); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">메시지 수정</button>
                  )}
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && (
                    <button data-testid="chat-message-action-delete" onClick={() => { void deleteMessageFromActions(activeActionMsg); }} className="w-full p-3 text-left hover:bg-red-50 rounded-[var(--radius-md)] text-xs font-semibold text-red-600 transition-colors">메시지 삭제</button>
                  )}
                  <button data-testid="chat-message-action-pin" onClick={() => { void togglePin(activeActionMsg.id); setActiveActionMsg(null); }} className={`w-full p-3 text-left rounded-[var(--radius-md)] text-xs font-semibold transition-colors ${pinnedIds.includes(String(activeActionMsg.id)) ? 'hover:bg-[var(--muted)] text-[var(--toss-gray-3)]' : 'hover:bg-orange-50 text-orange-500'}`}>{pinnedIds.includes(String(activeActionMsg.id)) ? '공지 해제' : '공지로 등록'}</button>
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">할 일로 등록</button>
                  <button
                    data-testid="chat-message-action-read-status"
                    onClick={() => { openReadStatusPanel(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    읽음 확인
                  </button>
                  <button
                    data-testid="chat-message-action-forward"
                    onClick={() => { startForwardMessage(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    다른 채팅방으로 전달
                  </button>
                  <button data-testid="chat-message-action-thread" onClick={() => { openThreadPanel(activeActionMsg); }} className="w-full p-3 text-left hover:bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] text-xs font-semibold text-[var(--accent)] transition-colors">이 메시지 스레드 보기</button>
                  <button onClick={async () => { try { const base = `[채팅] ${(activeActionMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'} (${new Date(activeActionMsg.created_at || 0).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[전자결재 메모]\n${base}`); toast('전자결재용으로 복사했습니다.'); } catch { toast('복사 실패', 'error'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">전자결재용 내용 복사</button>
                  <button onClick={async () => { try { const base = `[채팅] ${(activeActionMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'} (${new Date(activeActionMsg.created_at || 0).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[게시판 메모]\n${base}`); toast('게시판용으로 복사했습니다.'); } catch { toast('복사 실패', 'error'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">게시판용 내용 복사</button>
                  <button data-testid="chat-message-action-bookmark" onClick={() => { void toggleBookmark(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">{bookmarkedIds.has(String(activeActionMsg.id)) ? '북마크 해제' : '중요 메시지 북마크'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {editingMessage && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[115] p-4" onClick={() => setEditingMessage(null)}>
            <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm border border-[var(--border)] space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">메시지 수정</h3>
                <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">전송한 메시지를 수정한 뒤 다시 저장합니다.</p>
              </div>
              <textarea
                data-testid="chat-message-edit-input"
                value={editingMessageDraft}
                onChange={(e) => setEditingMessageDraft(e.target.value)}
                rows={4}
                className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm font-medium outline-none resize-none focus:border-[var(--accent)]"
                placeholder="수정할 메시지를 입력하세요."
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingMessage(null)} className="flex-1 py-3 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-sm">
                  취소
                </button>
                <button data-testid="chat-message-edit-save" type="button" onClick={() => { void saveEditedMessage(); }} className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm">
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {showGroupModal && (
          <div data-testid="chat-group-modal" className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[110] p-4" onClick={() => setShowGroupModal(false)}>
            <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm space-y-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-semibold text-[var(--foreground)] italic">새 그룹 채팅방</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">방 이름</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]" placeholder="예: 운영팀 공지방" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">멤버 선택 ({selectedMembers.length}명)</label>
                  <div className="h-48 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] p-4 space-y-2 custom-scrollbar bg-[var(--muted)]/30">
                    {allKnownStaffs.filter(( s: StaffMember) => String(s.id) !== String(effectiveChatUserId || user?.id || '') && s.status !== '퇴사' && s.status !== '퇴직').map(( s: StaffMember) => (
                      <label key={s.id} className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-all">
                        <input type="checkbox" checked={selectedMembers.includes(s.id)} onChange={e => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, s.id]);
                          else setSelectedMembers(selectedMembers.filter(id => id !== s.id));
                        }} className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]" />
                        <span className="text-xs font-bold text-[var(--foreground)]">{s.name} ({s.company ? `${s.company} · ` : ''}{s.position})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGroupModal(false)} className="flex-1 py-4 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-xs">취소</button>
                  <button onClick={createGroupChat} className="flex-2 py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm shadow-[var(--accent)]">채팅방 생성</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showPollModal && (
        <div data-testid="chat-poll-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">새 투표 만들기</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              질문과 선택지를 입력해 주세요. 선택지는 항목별로 따로 입력합니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">질문</label>
                <input
                  data-testid="chat-poll-question"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full mt-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">선택지</label>
                <div className="mt-1 space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        data-testid={`chat-poll-option-${idx}`}
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        className="flex-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                        placeholder={`선택지 ${idx + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-xs font-bold text-[var(--toss-gray-4)] hover:text-blue-500 hover:border-blue-300"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                data-testid="chat-poll-submit"
                type="button"
                onClick={handleCreatePoll}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
              >
                투표 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {showSlashModal && slashCommand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setShowSlashModal(false)}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {slashCommand === 'annual_leave' ? '연차 요청 초안 만들기' : '발주 요청 초안 만들기'}
            </h3>
            {slashCommand === 'annual_leave' ? (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  시작일, 종료일, 사유를 입력하면 전자결재용 연차/휴가 초안을 생성합니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">시작일</label>
                      <input
                        type="date"
                        value={slashForm.startDate}
                        onChange={e => setSlashForm((f) => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">종료일</label>
                      <input
                        type="date"
                        value={slashForm.endDate}
                        onChange={e => setSlashForm((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">사유(선택)</label>
                    <input
                      type="text"
                      value={slashForm.reason}
                      onChange={e => setSlashForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="예: 개인 일정, 병원 방문"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.startDate || !slashForm.endDate) {
                        toast('시작일과 종료일을 입력해 주세요.', 'warning');
                        return;
                      }
                      try {
                        const title = `[채팅]/연차 자동 기안 - ${user?.name}`;
                        const contentLines = [
                          `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
                          `기간: ${slashForm.startDate} ~ ${slashForm.endDate}`,
                          slashForm.reason ? `사유: ${slashForm.reason}` : '',
                          '',
                          '이 요청서는 채팅 명령어(/연차)로 자동 생성되었습니다.',
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: effectiveChatUserId || user?.id,
                            sender_name: user?.name,
                            sender_company: user?.company,
                            type: '연차/휴가',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        toast('연차/휴가 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
                      } catch {
                        toast('연차 초안 생성 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  품목명과 수량을 입력하면 비품구매(발주) 결재 초안을 생성합니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">품목명</label>
                    <input
                      type="text"
                      value={slashForm.itemName}
                      onChange={e => setSlashForm((f) => ({ ...f, itemName: e.target.value }))}
                      placeholder="예: A4 용지, 프린터 토너"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">수량</label>
                      <input
                        type="number"
                        min={1}
                        value={slashForm.quantity}
                        onChange={e => setSlashForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">비고(선택)</label>
                      <input
                        type="text"
                        value={slashForm.reason}
                        onChange={e => setSlashForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="예: 재고 부족, 교체 주기 도래"
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.itemName || !slashForm.quantity) {
                        toast('품목명과 수량을 입력해 주세요.', 'warning');
                        return;
                      }
                      try {
                        const title = `[채팅]/발주 자동 기안 - ${slashForm.itemName} x ${slashForm.quantity}`;
                        const contentLines = [
                          `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
                          `품목: ${slashForm.itemName}`,
                          `수량: ${slashForm.quantity}`,
                          slashForm.reason ? `비고: ${slashForm.reason}` : '',
                          '',
                          '이 요청서는 채팅 명령어(/발주)로 자동 생성되었습니다.',
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: effectiveChatUserId || user?.id,
                            sender_name: user?.name,
                            sender_company: user?.company,
                            type: '비품구매',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        toast('비품구매 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
                      } catch {
                        toast('발주 초안 생성 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {threadRoot && (
        <>
          <div
            className="absolute inset-0 bg-black/10 z-40"
            onClick={() => setThreadRoot(null)}
            aria-hidden="true"
          />
          <aside data-testid="chat-thread-panel" className="absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  스레드
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-2">
                  {getMessageDisplayText(
                    threadRoot.content,
                    threadRoot.file_name,
                    threadRoot.file_url,
                    '첨부 파일 메시지'
                  )}
                </p>
              </div>
              <button
                onClick={() => setThreadRoot(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 text-center">
                  이 메시지에 연결된 대화가 없습니다.
                </p>
              ) : (
                threadMessages.map(( m: ChatMessage) => {
                  const isRoot = m.id === threadRoot.id;
                  const staff = (m.staff as { name?: string; position?: string } | null | undefined) || resolveStaffProfile(m.sender_id);
                  const createdAt = new Date(m.created_at || 0);
                  return (
                    <div
                      key={m.id}
                      className={`border rounded-[var(--radius-md)] p-3 text-[11px] space-y-1 ${isRoot ? 'bg-[var(--toss-blue-light)] border-[var(--accent)]' : 'bg-[var(--muted)] border-[var(--border)]'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--foreground)] truncate">
                          {staff?.name || '이름 없음'} {staff?.position || ''}
                        </span>
                        <span className="text-[11px] text-[var(--toss-gray-3)]">
                          {createdAt.toLocaleDateString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                          })}{' '}
                          {createdAt.toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--foreground)] whitespace-pre-wrap break-words">
                        {getMessageDisplayText(
                          m.content,
                          m.file_name,
                          m.file_url,
                          '첨부 파일 메시지'
                        )}
                      </p>
                      {m.file_url && (() => {
                        const attachmentUrl = String(m.file_url);
                        return (
                          <AttachmentQuickActions
                            url={attachmentUrl}
                            name={getAttachmentDisplayName(m.file_name, attachmentUrl)}
                            onPreview={() => openAttachmentPreview(attachmentUrl, m.file_name, isImageUrl(attachmentUrl) ? 'image' : isVideoUrl(attachmentUrl) ? 'video' : 'file')}
                            variant="subtle"
                            className="mt-2"
                          />
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      {unreadModalMsg && (
        <div data-testid="chat-read-status-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setUnreadModalMsg(null)}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  읽음 확인 상세
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-1 opacity-60">
                  {getMessageDisplayText(
                    unreadModalMsg.content,
                    unreadModalMsg.file_name,
                    unreadModalMsg.file_url,
                    '첨부 파일 메시지'
                  )}
                </p>
              </div>
              <button
                onClick={() => setUnreadModalMsg(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>

            <div className="border-t border-[var(--border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
              {unreadLoading ? (
                <div className="py-5 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">읽지 않음 ({unreadUsers.length})</p>
                    </div>
                    {unreadUsers.length === 0 ? (
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">모두 읽었습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {unreadUsers.map((u: StaffMember) => (
                          <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800/30">
                            <div className="w-7 h-7 rounded-lg bg-[var(--tab-bg)] dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-[var(--toss-gray-3)] overflow-hidden">
                              {u.photo_url ? <img src={u.photo_url} alt={`${u.name}'s profile`} className="w-full h-full object-cover" /> : u.name[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground truncate">{u.name}</p>
                              <p className="text-[9px] font-bold text-[var(--toss-gray-3)] truncate">{(u.department || '')} {u.position}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">읽음 ({readUsers.length})</p>
                    </div>
                    {readUsers.length === 0 ? (
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">아직 읽은 사람이 없습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {readUsers.map((u: StaffMember) => (
                          <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800/30">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] font-bold text-emerald-600 overflow-hidden">
                              {u.photo_url ? <img src={u.photo_url} alt={`${u.name}'s profile`} className="w-full h-full object-cover" /> : u.name[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground truncate">{u.name}</p>
                              <p className="text-[9px] font-bold text-[var(--toss-gray-3)] truncate">{(u.department || '')} {u.position}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showForwardModal && forwardSourceMsg && (
        <div data-testid="chat-forward-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">다른 채팅방으로 전달</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              선택한 메시지를 전달할 채팅방을 선택하세요.
            </p>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
              {forwardTargetRooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
                  전달할 수 있는 채팅방이 없습니다.
                </div>
              ) : (
                forwardTargetRooms.map(( room: ChatRoom) => (
                  <button
                    data-testid={`chat-forward-target-${room.id}`}
                    key={room.id}
                    type="button"
                    onClick={async () => {
                      try {
                        const { data: forwardedMessage, error } = await insertChatMessage<Pick<ChatMessage, 'id' | 'room_id'>>(
                          {
                            room_id: room.id,
                            sender_id: effectiveChatUserId || user?.id,
                            content:
                              `[전달] ${(forwardSourceMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'}: ` +
                              getMessageDisplayText(
                                forwardSourceMsg.content,
                                forwardSourceMsg.file_name,
                                forwardSourceMsg.file_url,
                                '첨부 파일'
                              ),
                            file_url: forwardSourceMsg.file_url || null,
                            file_name: forwardSourceMsg.file_name || null,
                          },
                          'id, room_id'
                        );
                        if (error) throw error;
                        if (forwardedMessage?.id && forwardedMessage?.room_id) {
                          void triggerChatPush(String(forwardedMessage.room_id), String(forwardedMessage.id));
                        }
                        toast(`"${room.name || '채팅방'}"으로 메시지를 전달했습니다.`);
                      } catch {
                        toast('메시지 전달 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowForwardModal(false);
                        setForwardSourceMsg(null);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--toss-blue-light)] text-left text-xs font-bold text-[var(--foreground)]"
                  >
                    <span className="truncate">
                      {room.id === NOTICE_ROOM_ID ? '공 ' : '채 '}
                      {room.name || '채팅방'}
                    </span>
                    <span className="text-[11px] text-[var(--toss-gray-3)]">
                      {roomUnreadCounts[room.id] ? String(roomUnreadCounts[room.id]) : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddMemberModal && selectedRoom && (
        <div
          data-testid="chat-add-member-modal"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
          onClick={() => {
            setShowAddMemberModal(false);
            setAddMemberSelectingIds([]);
          }}
        >
          <div
            className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              참여자 추가
            </h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              현재 채팅방에 새로 초대할 직원을 선택하세요.
            </p>
            <input
              data-testid="chat-add-member-search"
              type="text"
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="이름, 부서, 직급으로 검색"
            />
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
              {addableMembers.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
                  추가할 수 있는 직원이 없습니다.
                </p>
              ) : (
                addableMembers.map(( s: StaffMember) => {
                  const checked = addMemberSelectingIds.includes(s.id);
                  return (
                    <label
                      data-testid={`chat-add-member-option-${s.id}`}
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAddMemberSelectingIds((prev) =>
                              prev.includes(s.id) ? prev : [...prev, s.id]
                            );
                          } else {
                            setAddMemberSelectingIds((prev) =>
                              prev.filter((id) => id !== s.id)
                            );
                          }
                        }}
                        className="w-3 h-3"
                      />
                      <span className="flex-1">
                        <span className="font-semibold text-[var(--foreground)]">
                          {s.name}
                        </span>
                        <span className="ml-1 text-[var(--toss-gray-3)]">
                          {s.position ? ` ${s.position}` : ''}
                          {s.company || s.department
                            ? ` · ${s.company || s.department}`
                            : ''}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                data-testid="chat-add-member-cancel"
                type="button"
                onClick={() => {
                  setShowAddMemberModal(false);
                  setAddMemberSelectingIds([]);
                }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                data-testid="chat-add-member-submit"
                type="button"
                disabled={addMemberSelectingIds.length === 0}
                onClick={async () => {
                  if (!selectedRoom) return;
                  try {
                    const currentMembers: string[] = Array.isArray(
                      selectedRoom.members
                    )
                      ? selectedRoom.members
                      : [];
                    const setIds = new Set(
                      currentMembers.map((id: unknown) => String(id))
                    );
                    addMemberSelectingIds.forEach((id) =>
                      setIds.add(String(id))
                    );
                    const newMembers = Array.from(setIds);

                    await supabase
                      .from('chat_rooms')
                      .update({ members: newMembers })
                      .eq('id', selectedRoom.id);

                    const invitedNames = addMemberSelectingIds
                      .map((id) => resolveStaffProfile(id)?.name || '이름 없음')
                      .join(', ');
                    const inviterName = user?.name || '이름 없음';
                    const systemContent = `[초대] ${inviterName}님이 ${invitedNames}님을 초대했습니다.`;
                    const { data: inviteMessage, error: inviteMessageError } = await supabase.from('messages').insert([{
                      room_id: selectedRoom.id,
                      sender_id: effectiveChatUserId || user?.id,
                      content: systemContent,
                    }]).select('id, room_id').single();
                    if (inviteMessageError) throw inviteMessageError;
                    if (inviteMessage?.id && inviteMessage?.room_id) {
                      void triggerChatPush(String(inviteMessage.room_id), String(inviteMessage.id));
                    }

                    setChatRooms((prev) =>
                      prev.map(( room: ChatRoom) =>
                        room.id === selectedRoom.id
                          ? { ...room, members: newMembers }
                          : room
                      )
                    );
                    setShowAddMemberModal(false);
                    setAddMemberSelectingIds([]);
                    fetchData();
                    toast('참여자가 추가되었습니다.');
                  } catch (e) {
                    console.error('add members error', e);
                    toast('참여자 추가 중 오류가 발생했습니다.', 'error');
                  }
                }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-white bg-[var(--accent)] disabled:bg-[var(--toss-gray-3)] hover:bg-[var(--accent)]"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaPanel && (
        <>
          <div className="fixed inset-0 bg-black/5 z-[100] md:z-30 animate-in fade-in" onClick={() => setShowMediaPanel(false)} />
          <aside className="fixed top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-[101] md:z-40 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-black text-[var(--toss-gray-4)] uppercase tracking-widest">파일/링크 내역</span>
            <button onClick={() => setShowMediaPanel(false)} className="p-2 text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-xl">닫기</button>
            </div>

            <div className="flex p-2 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-900 border-b border-[var(--border)]">
              {(['all', 'image', 'video', 'file'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMediaFilter(f)}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mediaFilter === f ? 'bg-[var(--card)] dark:bg-zinc-800 text-blue-600 shadow-soft' : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'}`}
                >
                  {f === 'all' ? '전체' : f === 'image' ? '이미지' : f === 'video' ? '동영상' : '파일'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {filteredMediaMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-[var(--toss-gray-3)]">
                  <span className="text-4xl mb-2">📭</span>
                  <p className="text-[11px] font-bold">내역이 없습니다.</p>
                </div>
              ) : (
                filteredMediaMessages.map(( m: ChatMessage) => {
                  const furl = (m.file_url || '') as string;
                  const attachmentName = getAttachmentDisplayName(m.file_name, furl);
                  return (
                  <div key={m.id} className="p-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 border border-[var(--border-subtle)] dark:border-zinc-800 rounded-xl hover:border-blue-300 transition-all group">
                    {isImageUrl(furl) ? (
                      <img src={furl} alt="Attached media" className="w-full h-24 object-cover rounded-lg mb-2 cursor-zoom-in" onClick={() => setImagePreviewUrl(furl)} />
                    ) : (
                      <div className="w-full h-12 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-lg mb-2 flex items-center justify-center text-xl">📄</div>
                    )}
                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{attachmentName}</p>
                      {m.content && (
                        <p className="text-[10px] text-[var(--toss-gray-4)] line-clamp-2">{m.content}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">{new Date(m.created_at || 0).toLocaleDateString()}</span>
                        <AttachmentQuickActions
                          url={furl}
                          name={attachmentName}
                          onPreview={() => openAttachmentPreview(furl, attachmentName, isImageUrl(furl) ? 'image' : isVideoUrl(furl) ? 'video' : 'file')}
                          variant="subtle"
                        />
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      {showGlobalSearch && (
        <div data-testid="chat-global-search-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-4 animate-in fade-in" onClick={closeGlobalSearch}>
          <div className="bg-[var(--card)] dark:bg-zinc-900 w-full max-w-3xl rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-[var(--border)] dark:border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-[var(--border)] dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--toss-gray-3)]">
                  <circle cx="8" cy="8" r="5.5"/><line x1="12.5" y1="12.5" x2="18" y2="18"/><path d="M15 3v4"/><path d="M13 5h4"/>
                </svg>
                <input
                  data-testid="chat-global-search-input"
                  autoFocus
                  value={globalSearchQuery}
                  onChange={e => setGlobalSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleGlobalSearch(globalSearchQuery)}
                  placeholder="멤버, 채팅방, 메시지, 파일을 통합 검색"
                  className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-[var(--toss-gray-3)] placeholder:font-normal"
                />
                <button
                  data-testid="chat-open-group-modal"
                  type="button"
                  onClick={openGroupFromGlobalSearch}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  새 그룹
                </button>
                <button
                  data-testid="chat-global-search-submit"
                  onClick={() => { void handleGlobalSearch(globalSearchQuery); }}
                  className="px-3 py-1.5 bg-[var(--accent)] text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  검색
                </button>
                <button onClick={closeGlobalSearch} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-lg font-bold leading-none px-1">×</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', '전체', globalSearchCounts.all],
                  ['member', '멤버', globalSearchCounts.member],
                  ['room', '채팅방', globalSearchCounts.room],
                  ['message', '메시지', globalSearchCounts.message],
                  ['file', '파일', globalSearchCounts.file],
                ] as const).map(([tab, label, count]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setGlobalSearchTab(tab)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${globalSearchTab === tab ? 'bg-[var(--accent)] text-white' : 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)]'}`}
                  >
                    {label}{count > 0 ? ` ${count}` : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--tab-bg)] dark:bg-zinc-950 p-3">
              {!globalSearchQuery.trim() ? (
                <div className="h-40 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-2">
                  <p className="text-sm font-bold">통합 검색으로 멤버, 채팅방, 메시지, 파일을 한 번에 찾을 수 있습니다.</p>
                  <button
                    type="button"
                    onClick={openGroupFromGlobalSearch}
                    className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                  >
                    새 그룹 채팅 만들기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {globalSearchLoading && (
                    <div className="px-1 text-[11px] font-bold text-[var(--toss-gray-3)]">메시지와 파일을 검색하고 있습니다…</div>
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'member') && (
                    globalSearchMemberResults.length > 0 ? (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">멤버</p>}
                        {globalSearchMemberResults.slice(0, globalSearchTab === 'all' ? 4 : globalSearchMemberResults.length).map((staff: StaffMember) => (
                          <button
                            key={`member-${staff.id}`}
                            type="button"
                            onClick={() => void openMemberFromGlobalSearch(staff)}
                            className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800 overflow-hidden flex items-center justify-center text-[12px] font-bold text-[var(--toss-gray-3)] shrink-0">
                                {staff.photo_url ? <img src={staff.photo_url} alt={staff.name} className="w-full h-full object-cover" /> : staff.name?.[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-foreground truncate">{staff.name}</p>
                                <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{[staff.company, staff.department, staff.position].filter(Boolean).join(' · ')}</p>
                              </div>
                              <span className="text-[10px] font-bold text-blue-600 shrink-0">대화</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : globalSearchTab === 'member' ? (
                      <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">멤버 검색 결과가 없습니다.</div>
                    ) : null
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'room') && (
                    globalSearchRoomResults.length > 0 ? (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">채팅방</p>}
                        {globalSearchRoomResults.slice(0, globalSearchTab === 'all' ? 4 : globalSearchRoomResults.length).map(({ room, roomId, label, preview, memberCount, isHidden, isNoticeChannel }) => (
                          <button
                            key={`room-${roomId}`}
                            type="button"
                            onClick={() => openRoomFromGlobalSearch(String(room.id))}
                            className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-[12px] font-bold text-foreground truncate">{label}</p>
                                  {isNoticeChannel && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold shrink-0">공지</span>}
                                  {isHidden && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-bold shrink-0">숨김</span>}
                                </div>
                                <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{preview || '대화가 없습니다.'}</p>
                              </div>
                              <span className="text-[10px] font-bold text-[var(--toss-gray-3)] shrink-0">{memberCount}명</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : globalSearchTab === 'room' ? (
                      <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">채팅방 검색 결과가 없습니다.</div>
                    ) : null
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'message' || globalSearchTab === 'file') && (() => {
                    const targetResults =
                      globalSearchTab === 'file'
                        ? globalSearchFileResults
                        : globalSearchTab === 'message'
                          ? globalSearchMessageResults
                          : globalSearchResults;
                    if (!globalSearchLoading && targetResults.length === 0) {
                      return (globalSearchTab === 'message' || globalSearchTab === 'file') ? (
                        <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">
                          {globalSearchTab === 'file' ? '파일 검색 결과가 없습니다.' : '메시지 검색 결과가 없습니다.'}
                        </div>
                      ) : null;
                    }
                    return (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">메시지 / 파일</p>}
                        {targetResults.slice(0, globalSearchTab === 'all' ? 6 : targetResults.length).map((msg: ChatMessage) => {
                          type SearchRoom = { name?: string; type?: string; members?: string[] };
                          const msgRoom = (msg.chat_rooms as SearchRoom | null | undefined);
                          let roomName = msgRoom?.name || '채팅방';
                          if (msgRoom?.type === 'direct' && Array.isArray(msgRoom?.members)) {
                            const otherStaff = allKnownStaffs.find((s: StaffMember) => msgRoom.members!.includes(String(s.id)) && String(s.id) !== effectiveChatUserId);
                            if (otherStaff) roomName = otherStaff.name;
                          }
                          const fileUrl = msg.file_url || '';
                          const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(fileUrl);
                          const isFile = !!fileUrl && !isImage;
                          const fileName = fileUrl ? getAttachmentDisplayName(msg.file_name, fileUrl) : '';
                          return (
                            <div
                              data-testid={`chat-global-search-result-${msg.id}`}
                              key={msg.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openRoomFromGlobalSearch(String(msg.room_id))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openRoomFromGlobalSearch(String(msg.room_id));
                                }
                              }}
                              className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all cursor-pointer"
                            >
                              <div className="flex items-center justify-between mb-1.5 gap-3">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="px-1.5 py-0.5 bg-[var(--muted)] dark:bg-zinc-800 text-[var(--toss-gray-4)] rounded text-[10px] font-bold truncate shrink-0 max-w-[110px]">
                                    {roomName}
                                  </span>
                                  <span className="text-[11px] font-bold text-foreground truncate">{(msg.staff as { name?: string } | null | undefined)?.name || '이름 없음'}</span>
                                  {isImage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">이미지</span>}
                                  {isFile && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold shrink-0">파일</span>}
                                </div>
                                <span className="text-[10px] font-medium text-[var(--toss-gray-3)] shrink-0">
                                  {new Date(msg.created_at || 0).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {new Date(msg.created_at || 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {msg.content && (
                                <p className="text-[12px] font-semibold text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] line-clamp-2 leading-relaxed">
                                  {msg.content}
                                </p>
                              )}
                              {fileName && (
                                <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] truncate mt-0.5">첨부 {fileName}</p>
                              )}
                              {fileUrl && (
                                <AttachmentQuickActions
                                  url={fileUrl}
                                  name={fileName}
                                  onPreview={() => openAttachmentPreview(fileUrl, fileName, isImage ? 'image' : 'file')}
                                  variant="subtle"
                                  className="mt-2"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {!globalSearchLoading && globalSearchCounts.all === 0 && (
                    <div className="h-24 flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
                      <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                      <p className="text-xs mt-1 text-[var(--toss-gray-3)]">멤버, 채팅방, 메시지, 파일을 함께 검색했습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {false && showGlobalSearch && (
        <div data-testid="chat-global-search-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-4 animate-in fade-in" onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }}>
          <div className="bg-[var(--card)] dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-[var(--border)] dark:border-zinc-800" onClick={e => e.stopPropagation()}>
            {/* 검색 헤더 */}
            <div className="p-3 border-b border-[var(--border)] dark:border-zinc-800 flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--toss-gray-3)]">
                <circle cx="9" cy="9" r="6"/><line x1="15" y1="15" x2="19" y2="19"/>
              </svg>
              <input
                data-testid="chat-global-search-input"
                autoFocus
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                placeholder="대화내용, 파일명, 사진명 통합 검색..."
                className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-[var(--toss-gray-3)] placeholder:font-normal"
              />
              <button
                data-testid="chat-global-search-submit"
                onClick={() => {
                  void handleGlobalSearch();
                }}
                className="px-3 py-1.5 bg-[var(--accent)] text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {globalSearchLoading ? '검색중…' : '검색'}
              </button>
              <button onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-lg font-bold leading-none px-1">×</button>
            </div>

            {/* 결과 목록 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--tab-bg)] dark:bg-zinc-950 p-3">
              {globalSearchLoading && (
                <div className="h-40 flex items-center justify-center text-sm text-[var(--toss-gray-3)] font-bold">검색 중…</div>
              )}
              {!globalSearchLoading && globalSearchResults.length === 0 && globalSearchQuery.trim() && (
                <div className="h-40 flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                  <p className="text-xs mt-1 text-[var(--toss-gray-3)]">대화내용, 파일명, 사진명으로 검색됩니다.</p>
                </div>
              )}
              {!globalSearchLoading && globalSearchResults.length > 0 && (
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-2 px-1">{globalSearchResults.length}건 검색됨</p>
              )}
              <div className="space-y-2">
                {globalSearchResults.map((msg: ChatMessage) => {
                  type SearchRoom = { name?: string; type?: string; members?: string[] };
                  const msgRoom = (msg.chat_rooms as SearchRoom | null | undefined);
                  let roomName = msgRoom?.name || '채팅방';
                  if (msgRoom?.type === 'direct' && Array.isArray(msgRoom?.members)) {
                    const otherStaff = allKnownStaffs.find(( s: StaffMember) => msgRoom.members!.includes(String(s.id)) && String(s.id) !== effectiveChatUserId);
                    if (otherStaff) roomName = otherStaff.name;
                  }
                  const fileUrl = msg.file_url || '';
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(fileUrl);
                  const isFile = !!fileUrl && !isImage;
                  const fileName = fileUrl ? getAttachmentDisplayName(msg.file_name, fileUrl) : '';
                  return (
                    <div
                      data-testid={`chat-global-search-result-${msg.id}`}
                      key={msg.id}
                      onClick={() => { setRoom(msg.room_id); setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }}
                      className="group p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl cursor-pointer hover:border-[var(--accent)] hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 bg-[var(--muted)] dark:bg-zinc-800 text-[var(--toss-gray-4)] rounded text-[10px] font-bold truncate shrink-0 max-w-[110px]">
                            {roomName}
                          </span>
                          <span className="text-[11px] font-bold text-foreground truncate">{(msg.staff as { name?: string } | null | undefined)?.name || '알 수 없음'}</span>
                          {isImage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">사진</span>}
                          {isFile && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold shrink-0">파일</span>}
                        </div>
                        <span className="text-[10px] font-medium text-[var(--toss-gray-3)] shrink-0">
                          {new Date(msg.created_at || 0).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {new Date(msg.created_at || 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {msg.content && (
                        <p className="text-[12px] font-semibold text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] line-clamp-2 leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                      {fileName && (
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] truncate mt-0.5">
                          📎 {fileName}
                        </p>
                      )}
                      {fileUrl && (
                        <AttachmentQuickActions
                          url={fileUrl}
                          name={fileName}
                          onPreview={() => openAttachmentPreview(fileUrl, fileName, isImage ? 'image' : 'file')}
                          variant="subtle"
                          className="mt-2"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 이미지 전체화면 미리보기 모달 ── */}
      {attachmentPreview && attachmentPreview.kind !== 'image' && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={closeAttachmentPreview}
          onKeyDown={(e) => { if (e.key === 'Escape') closeAttachmentPreview(); }}
          tabIndex={-1}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors z-10"
            onClick={closeAttachmentPreview}
            aria-label="닫기"
          >
            ×
          </button>
          <a
            href={buildDownloadUrl(attachmentPreview.url, attachmentPreview.name ?? '')}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-14 h-9 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 px-3 text-white text-xs font-semibold transition-colors z-10"
            aria-label="다운로드"
            title="다운로드"
          >
            다운로드
          </a>
          <a
            href={attachmentPreview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-14 right-4 h-9 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 px-3 text-white text-xs font-semibold transition-colors z-10"
          >
            새 창 열기
          </a>
          <div
            className="max-w-[92vw] max-h-[88vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {attachmentPreview.kind === 'video' ? (
              <video
                src={attachmentPreview.url}
                controls
                autoPlay
                playsInline
                className="max-w-[92vw] max-h-[88vh] rounded-xl bg-black shadow-2xl"
              />
            ) : /\.pdf(\?|#|$)/i.test(attachmentPreview.url) ? (
              <iframe
                src={attachmentPreview.url}
                title={attachmentPreview.name}
                className="w-[92vw] h-[88vh] rounded-xl bg-white shadow-2xl"
              />
            ) : (
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-left">
                <p className="text-sm font-bold text-[var(--foreground)] break-all">{attachmentPreview.name}</p>
                <p className="mt-2 text-xs text-[var(--toss-gray-4)] break-all">{attachmentPreview.url}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={attachmentPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
                  >
                    새 창 열기
                  </a>
                  <a
                    href={buildDownloadUrl(attachmentPreview.url, attachmentPreview.name ?? '')}
                    className="inline-flex items-center rounded-lg bg-[var(--tab-bg)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                  >
                    다운로드
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {imagePreviewUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setImagePreviewUrl(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setImagePreviewUrl(null); }}
          tabIndex={-1}
        >
          {/* 닫기 */}
          <button
            type="button"
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors z-10"
            onClick={() => setImagePreviewUrl(null)}
            aria-label="닫기"
          >
            ✕
          </button>
          {/* 다운로드 */}
          <a
            href={imagePreviewUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-14 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-base transition-colors z-10"
            aria-label="다운로드"
            title="다운로드"
          >
            ↓
          </a>
          {/* 이미지 */}
          <img
            src={imagePreviewUrl}
            alt="미리보기"
            className="max-w-[92vw] max-h-[88vh] rounded-xl object-contain shadow-2xl select-none"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
