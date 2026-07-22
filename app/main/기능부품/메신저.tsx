'use client';
import { logger } from '@/lib/logger';

import { toast } from '@/lib/toast';
import { toDateKey } from '@/lib/date-utils';
import { useDeferredValue, useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import { db, d1 } from '@/lib/db-client';
import { createOrUpsertChatRoom, patchChatRoom } from '@/lib/chat-rooms-client';
import { triggerChatPush } from '@/lib/chat-push-client-trigger';
import { subscribeRealtime } from '@/lib/realtime-bus';
import {
  isRelationMarkedMissing,
  rememberMissingRelation,
  withMissingColumnsFallback } from '@/lib/db-compat';
import { normalizeRoomReadCursorIds, toUtcSqlTimestamp } from '@/lib/chat-read-cursors';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import { CHAT_ACTIVE_ROOM_KEY, CHAT_FOCUS_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import { getMessageDisplayText } from './메신저첨부';
import { useChatAttachmentPreview } from './메신저첨부미리보기훅';
import { MessengerComposer, type MessengerComposerHandle } from './메신저컴포저';
import { selectChatMessagesWithFallback } from './메신저데이터유틸';
import { useChatMessageActions } from './메신저액션훅';
import { useChatGlobalSearch } from './메신저검색훅';
import { renderMessageContent } from './메신저메시지렌더';
import { useChatMessageWorkflow } from './메신저메시지액션워크플로훅';
import { useChatRoomManagement } from './메신저방관리훅';
import { useChatRoomDataSync } from './메신저방데이터훅';
import { useChatSidebarState } from './메신저사이드바훅';
import { fetchAllChatRooms, readCachedChatRooms, writeCachedChatRooms } from './chatQueryService';
import { useChatMessageSending } from './메신저전송훅';
import { useScheduledNoticeDispatcher } from './메신저예약공지훅';
import { useChatRoomPreferences } from './메신저방환경설정훅';
import { useChatRealtimeSubscriptions } from './메신저구독훅';
import { useChatTypingD1 } from './useChatTypingD1';
import { useChatWorkflowDrafts } from './메신저입력워크플로훅';
import {
  useChatGroupedStaffs,
  useChatMediaPreviewState,
  useChatMentionCandidates,
  useChatSelectedPeerState,
  useChatSelectedRoomLabel,
  useChatTimelineItems,
  useChatTypingNoticeText,
  resolveThreadRootMessage as resolveThreadRootMessageFromList,
  useThreadOverviews,
  useThreadMessages,
  useThreadSummaries,
  type MediaFilter } from './메신저파생훅';
import { ChatRealtimeState, useRealtimeConnectionMeta, useRoomNotificationSetting } from './메신저구독훅';
import { useChatRoomNavigation } from './메신저방전환훅';
import { useChatMessageEditing, useChatMobileBackLayer, useReadStatusModal } from './메신저상태훅';
import { useChatUploads } from './메신저업로드훅';
import { MessengerSidebar, type MessengerMentionInboxItem, type MessengerThreadInboxItem } from './메신저사이드바';
import {
  buildRetryQueueMessage,
  getDueChatRetryQueueEntries,
  readChatRetryQueue } from './메신저재시도큐';
import { MessengerTimeline, type MessengerTimelineItem } from './메신저타임라인';
import { getPresenceMeta, type PresenceMeta, type AttendanceSnapshot } from './메신저섹션/presenceMeta';
import { ChatRoomHeader } from './메신저섹션/ChatRoomHeader';
import { RetryQueueBanner } from './메신저섹션/RetryQueueBanner';
import { TypingNotice } from './메신저섹션/TypingNotice';
import {
  CAN_WRITE_NOTICE_POSITIONS,
  NOTICE_ROOM_ID,
  NOTICE_ROOM_NAME,
  SELF_ROOM_NAME,
  WARD_QUICK_REPLY_OPTIONS,
  compareStaffMembers,
  extractWardMessageMeta,
  getConversationRoomIdsByRoomId,
  getDirectRoomMembersKey,
  getLatestReadCursor,
  getPinnedRoomOrderStorageKey,
  getRoomDisplayName,
  getRoomPrefsStorageKey,
  haveSameMembers,
  isActiveChatMember,
  isActiveNoticeMember,
  isMessageReadByCursor,
  isMobileChatViewport,
  isRecentPresenceTimestamp,
  isSelfChatRoom,
  isUuidLike,
  normalizeRoomNotificationKeyword,
  normalizeRoomNotificationMode,
  normalizeMemberIds,
  readStoredBookmarks,
  readStoredThreadPreferences,
  readStoredStringArray,
  sortChatRoomsWithNoticeFirst,
  toChatDate,
  writeStoredThreadPreferences,
  writeStoredBookmarks,
  writeStoredPinnedIds,
  type ThreadPreference,
  type MessageRetryPayload,
  type RoomPreference } from './메신저유틸';
import type { StaffMember, ChatRoom, ChatMessage } from '@/types';

const MessengerOverlayLoading = () => (
  <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center pointer-events-none">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
  </div>
);

const MessengerDrawer = dynamic(
  () => import('./메신저드로어').then((m) => m.MessengerDrawer),
  { ssr: false, loading: MessengerOverlayLoading });
const MediaArchivePanel = dynamic(
  () => import('./메신저미디어아카이브').then((m) => m.MediaArchivePanel),
  { ssr: false, loading: MessengerOverlayLoading });
const GlobalSearchModal = dynamic(
  () => import('./메신저전역검색').then((m) => m.GlobalSearchModal),
  { ssr: false, loading: MessengerOverlayLoading });
const GroupChatModal = dynamic(
  () => import('./메신저그룹생성모달').then((m) => m.GroupChatModal),
  { ssr: false, loading: MessengerOverlayLoading });
const AddMemberModal = dynamic(
  () => import('./메신저멤버관리모달').then((m) => m.AddMemberModal),
  { ssr: false, loading: MessengerOverlayLoading });
const ForwardMessageModal = dynamic(
  () => import('./메신저멤버관리모달').then((m) => m.ForwardMessageModal),
  { ssr: false, loading: MessengerOverlayLoading });
const MessageEditModal = dynamic(
  () => import('./메신저수정모달').then((m) => m.MessageEditModal),
  { ssr: false, loading: MessengerOverlayLoading });
const MessageEditHistoryModal = dynamic(
  () => import('./메신저수정모달').then((m) => m.MessageEditHistoryModal),
  { ssr: false, loading: MessengerOverlayLoading });
const ThreadPanel = dynamic(
  () => import('./메신저스레드패널').then((m) => m.ThreadPanel),
  { ssr: false, loading: MessengerOverlayLoading });
const PollComposerModal = dynamic(
  () => import('./메신저투표모달').then((m) => m.PollComposerModal),
  { ssr: false, loading: MessengerOverlayLoading });
const SlashCommandModal = dynamic(
  () => import('./메신저투표모달').then((m) => m.SlashCommandModal),
  { ssr: false, loading: MessengerOverlayLoading });
const ReadStatusModal = dynamic(
  () => import('./메신저읽음모달').then((m) => m.ReadStatusModal),
  { ssr: false, loading: MessengerOverlayLoading });
const MessengerOperationsCenter = dynamic(
  () => import('./메신저운영센터'),
  { ssr: false, loading: MessengerOverlayLoading });
const ReactionDetailModal = dynamic(
  () => import('./메신저액션').then((m) => m.ReactionDetailModal),
  { ssr: false, loading: MessengerOverlayLoading });
const DateJumpModal = dynamic(
  () => import('./메신저섹션/DateJumpModal').then((m) => m.DateJumpModal),
  { ssr: false, loading: MessengerOverlayLoading });
const StaffDetailModal = dynamic(
  () => import('./메신저섹션/StaffDetailModal').then((m) => m.StaffDetailModal),
  { ssr: false, loading: MessengerOverlayLoading });
const ChatAttachmentPreviewModal = dynamic(
  () => import('./메신저첨부미리보기').then((m) => m.ChatAttachmentPreviewModal),
  { ssr: false, loading: MessengerOverlayLoading });

type ReactionUsersByMessage = Record<string, Record<string, StaffMember[]>>;

type PresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  retryPayload?: MessageRetryPayload;
  error?: string | null;
};

function formatChatLocalDateKey(value?: string | null) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatViewProps {
  user: StaffMember | null;
  onRefresh?: () => void;
  staffs?: StaffMember[];
  chatListResetToken?: number;
  initialOpenChatRoomId?: string | null;
  initialOpenChatRequestToken?: number;
  initialOpenMessageId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
  onOpenBoardPost?: (boardType: string, postId: string) => void;
  shareTarget?: { id: string; fileCount: number; text: string | null; url: string | null; title: string | null } | null;
  onConsumeShareTarget?: () => void;
}
export default function ChatView({
  user,
  onRefresh,
  staffs = [],
  chatListResetToken,
  initialOpenChatRoomId,
  initialOpenChatRequestToken,
  initialOpenMessageId,
  onConsumeOpenChatRoomId,
  onOpenBoardPost,
  shareTarget,
  onConsumeShareTarget }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const pendingScrollMsgIdRef = useRef<string | null>(null);
  const lastScrolledMsgIdRef = useRef<string | null>(null);
  const directMessageLoadTargetRef = useRef<string | null>(null);
  const pendingThreadRootIdRef = useRef<string | null>(null);
  const pendingBottomAlignRoomIdRef = useRef<string | null>(null);
  const readyBottomAlignRoomIdRef = useRef<string | null>(null);
  // useLayoutEffect가 스크롤을 처리했을 때 useEffect의 중복 스크롤을 방지하는 플래그
  const layoutScrollHandledRef = useRef(false);
  const fetchDataRequestSeqRef = useRef(0);
  const selfChatCreationInFlightRef = useRef(false);
  const [omniSearch, setOmniSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const deferredOmniSearch = useDeferredValue(omniSearch);
  const deferredChatSearch = useDeferredValue(chatSearch);
  // inputMsg state는 컴포저 내부로 이동. 부모는 inputMsgRef로 동기 읽기,
  // setInputMsg(이전 dispatch 시그니처 그대로)로 imperative 쓰기만 한다.
  // 3,448줄짜리 부모 함수가 매 키 입력마다 재실행되던 입력 지연 주범 제거.
  const [activeActionMsg, setActiveActionMsg] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [wardQuickReplySendingMessageId, setWardQuickReplySendingMessageId] = useState<string | null>(null);
  const [deliveryStates, setDeliveryStates] = useState<Record<string, DeliveryState>>({});
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [timelineEnsureMessageId, setTimelineEnsureMessageId] = useState<string | null>(null);
  const [dateJumpPickerOpen, setDateJumpPickerOpen] = useState(false);
  const [dateJumpValue, setDateJumpValue] = useState('');
  const [dateJumpError, setDateJumpError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const lastReadAtRef = useRef<string | null>(null);
  const isFocusedRef = useRef(true);

  const [viewMode, setViewMode] = useState<'chat' | 'org'>('chat');
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedStaffForModal, setSelectedStaffForModal] = useState<StaffMember | null>(null);
  const [selectedStaffPresence, setSelectedStaffPresence] = useState<PresenceMeta | null>(null);
  const [isLoadingPresence, setIsLoadingPresence] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [timelineRoomId, setTimelineRoomId] = useState<string | null>(null);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [roomReadCursorMap, setRoomReadCursorMap] = useState<Record<string, string>>({});
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tabbar = document.querySelector('.mobile-bottom-tabbar') || document.querySelector('.m-bottom-tab');
    const shell = document.querySelector('.main-content-mobile-shell');

    if (selectedRoomId) {
      if (tabbar instanceof HTMLElement) {
        tabbar.style.setProperty('display', 'none', 'important');
      }
      shell?.classList.remove('pb-[88px]');
      shell?.classList.add('pb-0');
    } else {
      if (tabbar instanceof HTMLElement) {
        tabbar.style.removeProperty('display');
      }
      shell?.classList.remove('pb-0');
      shell?.classList.add('pb-[88px]');
    }

    return () => {
      if (tabbar instanceof HTMLElement) {
        tabbar.style.removeProperty('display');
      }
      shell?.classList.remove('pb-0');
      shell?.classList.add('pb-[88px]');
    };
  }, [selectedRoomId]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [noticeReminderBusy, setNoticeReminderBusy] = useState(false);
  const [mentionInboxItems, setMentionInboxItems] = useState<MessengerMentionInboxItem[]>([]);
  const [threadInboxItems, setThreadInboxItems] = useState<MessengerThreadInboxItem[]>([]);

  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [roomPrefs, setRoomPrefs] = useState<Record<string, RoomPreference>>({});
  const [threadPrefs, setThreadPrefs] = useState<Record<string, ThreadPreference>>({});
  const [pinnedRoomOrder, setPinnedRoomOrder] = useState<string[]>([]);
  const [showHiddenRooms, setShowHiddenRooms] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const chatRoomsRef = useRef<ChatRoom[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const deliveryStatesRef = useRef<Record<string, DeliveryState>>({});
  const presenceChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  // typingChannelRef, typingPeersTimeoutRef, lastTypingEmitAtRef 제거됨.
  // D1 polling 기반 typing은 useChatTypingD1(useChatRealtimeBridge 내부)이 전담.
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const incomingRealtimeMessageIdsRef = useRef<Map<string, number>>(new Map());
  const isNearBottomRef = useRef(true);
  const lastTimelineTailRef = useRef('');
  const lastHandledChatListResetTokenRef = useRef(0);
  const selectedRoomIdRef = useRef<string | null>(null);
  const mobileChatHistoryEntryActiveRef = useRef(false);
  const suppressNextMobileChatPopstateRef = useRef(false);
  const setRoomRef = useRef<(roomId: string | null) => void>(() => {});
  const closeMobileChatBackLayerRef = useRef<() => boolean>(() => false);
  const closeEditingMessageRef = useRef<() => void>(() => {});
  const closeEditHistoryRef = useRef<() => void>(() => {});
  const markConversationNotificationsAsReadRef = useRef<(roomIds: string[], readAt: string) => Promise<unknown>>(async () => undefined);
  const broadcastChatSyncRef = useRef<(action: string, roomId?: string | null) => void>(() => {});
  const initialRoomRestoreSyncedRef = useRef(false);
  const fetchDataRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(null);
  const globalRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBottomAlignReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineMediaLoadFrameRef = useRef<number | null>(null);
  const pendingBottomAlignHoldUntilRef = useRef(0);
  const suppressBottomAlignmentUntilRef = useRef(0);
  /** 방별 입력 draft 저장소 */
  const draftMapRef = useRef<Map<string, string>>(new Map());
  /** setRoom 바깥에서도 최신 입력값을 읽기 위한 ref */
  const inputMsgRef = useRef('');
  /** 컴포저에 imperative하게 value를 push하기 위한 핸들 ref */
  const composerControlRef = useRef<MessengerComposerHandle | null>(null);
  /**
   * 기존 useState setInputMsg를 대체. 시그니처는 Dispatch<SetStateAction<string>>
   * 그대로 유지해 호출부(전송훅 clear, 업로드훅 share-target, 방전환훅 draft 복원,
   * 멘션 선택)는 변경 없이 동작. 부모 리렌더를 트리거하지 않음.
   */
  const setInputMsg = useCallback<Dispatch<SetStateAction<string>>>((valueOrUpdater) => {
    const next =
      typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (prev: string) => string)(inputMsgRef.current)
        : valueOrUpdater;
    inputMsgRef.current = next;
    composerControlRef.current?.setValue(next);
  }, []);

  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);

  const pushMobileChatHistoryEntry = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileChatViewport()) return;
    if (!selectedRoomIdRef.current) return;
    if (mobileChatHistoryEntryActiveRef.current) return;
    try {
      window.history.pushState({
        ...(window.history.state ?? {}),
        __erpMobileChatRoomOpen: true,
        __erpMobileChatRoomToken: Date.now() }, '');
      mobileChatHistoryEntryActiveRef.current = true;
    } catch {
    }
  }, []);

  const [reactionDetailTarget, setReactionDetailTarget] = useState<{ message: ChatMessage; emoji: string } | null>(null);
  const [globalRealtimeState, setGlobalRealtimeState] = useState<ChatRealtimeState>('connecting');
  const [roomRealtimeState, setRoomRealtimeState] = useState<ChatRealtimeState>('idle');
  const [globalRealtimeRetryToken, setGlobalRealtimeRetryToken] = useState(0);
  const [roomRealtimeRetryToken, setRoomRealtimeRetryToken] = useState(0);
  const [chatDirectoryStaffs, setChatDirectoryStaffs] = useState<StaffMember[]>([]);
  const [persistedPinnedMessages, setPersistedPinnedMessages] = useState<ChatMessage[]>([]);

  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true || user?.role === 'admin';
  const canWriteNotice = isMso || Boolean(user?.position && CAN_WRITE_NOTICE_POSITIONS.includes(user.position));
  const canManageNoticeOps =
    canWriteNotice ||
    user?.role === 'manager' ||
    permissions['board_공지사항_write'] === true;
  const allKnownStaffs = useMemo(() => {
    const merged = new Map<string, StaffMember>();
    [...chatDirectoryStaffs, ...(Array.isArray(staffs) ? staffs : [])].forEach(( staff: StaffMember) => {
      if (!staff?.id) return;
      const staffId = String(staff.id);
      const previous = merged.get(staffId);
      const normalized = normalizeProfileUser({ ...(previous ?? {}), ...staff }) as Partial<StaffMember> | null;
      merged.set(staffId, {
        ...staff,
        ...(normalized ?? {}),
        id: staffId,
        name: String(normalized?.name ?? staff.name ?? ''),
        company: String(normalized?.company ?? staff.company ?? ''),
        photo_url: normalized?.photo_url ?? staff.photo_url ?? null });
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
    (staffId: string | null | undefined, fallbackName?: string | null): StaffMember | null => {
      const knownStaff = findKnownStaffById(staffId);
      if (knownStaff) {
        return {
          ...knownStaff,
          photo_url: getProfilePhotoUrl(knownStaff) };
      }
      if (String(staffId) === String(user?.id) && user?.name) {
        return {
          id: String(user.id),
          name: String(user.name),
          company: user.company || '',
          department: user.department || '',
          position: user.position || '',
          photo_url: getProfilePhotoUrl(user) };
      }
      const safeName = String(fallbackName || '').trim();
      if (!safeName) return null;
      return {
        id: String(staffId || ''),
        name: safeName,
        company: '',
        department: '',
        position: '',
        photo_url: null };
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
          photo_url: null };
      }
      return {
        id: memberId,
        name: '이름 없음',
        company: '',
        department: '',
        position: '',
        photo_url: null };
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
        const { data, error } = await withMissingColumnsFallback<StaffMember[]>(
          (omittedColumns) => {
            const selectColumns = [
              'id',
              'name',
              'company',
              'department',
              'position',
              'status',
              ...(omittedColumns.has('presence_status') ? [] : ['presence_status']),
              ...(omittedColumns.has('last_seen_at') ? [] : ['last_seen_at']),
              ...(omittedColumns.has('permissions') ? [] : ['permissions']),
            ];
            return db
              .from('staff_members')
              .select(selectColumns.join(', ')) as PromiseLike<{
                data: StaffMember[] | null;
                error: unknown;
              }>;
          },
          ['presence_status', 'last_seen_at', 'permissions'],
          { cacheKey: 'chat:staff-directory' },
        );
        if (error) throw error;
        if (active) {
          setChatDirectoryStaffs(Array.isArray(data) ? data.map(( staff: StaffMember) => normalizeProfileUser(staff)) : []);
        }
      } catch (error) {
        logger.error('채팅 직원 디렉터리 로드 실패:', error);
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
  const retryQueueActorId = effectiveChatUserId || user?.id || null;
  const {
    roomNotifyOn,
    toggleRoomNotify } = useRoomNotificationSetting({
    selectedRoomId,
    effectiveChatUserId,
    userId: user?.id });
  const getEffectiveRoomMemberIds = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return [];
    if (String(room.id) === NOTICE_ROOM_ID) return noticeRoomMemberIds;

    const seenIds = new Set<string>();
    const memberIds: string[] = [];
    normalizeMemberIds(room.members).forEach((memberId: string) => {
      if (!memberId || seenIds.has(memberId)) return;
      seenIds.add(memberId);

      if (memberId === effectiveChatUserId) {
        memberIds.push(memberId);
        return;
      }

      const knownStaff = allKnownStaffMap.get(memberId);
      // staff_members 조회 결과가 없어도 유지하고, 비활성 사용자만 공지방 멤버에서 제외한다.
      if (!knownStaff || isActiveChatMember(knownStaff)) {
        memberIds.push(memberId);
      }
    });
    return memberIds;
  }, [allKnownStaffMap, effectiveChatUserId, noticeRoomMemberIds]);

  const isRoomAccessibleToCurrentUser = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return false;
    if (String(room.id) === NOTICE_ROOM_ID) return true;
    const me = String(effectiveChatUserId || '').trim();
    if (!me) return true;
    if (isSelfChatRoom(room, me) || room.name === SELF_ROOM_NAME) return true;
    const memberIds = getEffectiveRoomMemberIds(room);
    if (memberIds.length === 0) return true;
    return memberIds.some((memberId) => String(memberId) === me);
  }, [effectiveChatUserId, getEffectiveRoomMemberIds]);

  const selectedRoom = useMemo(() => {
    const room = chatRooms.find((candidate: ChatRoom) => String(candidate.id) === String(selectedRoomId || '')) || null;
    if (!room) return null;
    return room;
  }, [chatRooms, selectedRoomId]);

  const {
    unreadModalMsg,
    unreadUsers,
    readUsers,
    unreadLoading,
    closeReadStatusModal,
    loadReadStatusForMessage } = useReadStatusModal({
    selectedRoom,
    allKnownStaffs,
    roomReadCursorMap,
    getEffectiveRoomMemberIds });
  const handleRoomChangeCleanup = useCallback((mode: 'full' | 'room-switch' = 'full') => {
    if (mode === 'full') {
      setMessages([]);
      setTimelineRoomId(null);
      setReadCounts({});
      setRoomReadCursorMap({});
      setReactions({});
      setReactionUsersByMessage({});
      setPolls([]);
      setPollVotes({});
      setPinnedIds([]);
      setPersistedPinnedMessages([]);
      setBookmarkedIds(new Set());
    }
    setActiveActionMsg(null);
    setTimelineEnsureMessageId(null);
    setThreadRoot(null);
    closeEditingMessageRef.current();
    closeEditHistoryRef.current();
    setReplyTo(null);
    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    setTypingUsers({});
    closeReadStatusModal();
    setReactionDetailTarget(null);
    setDeliveryStates((prev) => {
      const next: Record<string, DeliveryState> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value.status !== 'sent') next[key] = value;
      }
      return next;
    });
  }, [closeReadStatusModal]);
  const clearPendingBottomAlignReleaseTimer = useCallback(() => {
    if (!pendingBottomAlignReleaseTimerRef.current) return;
    clearTimeout(pendingBottomAlignReleaseTimerRef.current);
    pendingBottomAlignReleaseTimerRef.current = null;
  }, []);
  const clearPendingMessageScrollTimer = useCallback(() => {
    if (!pendingMessageScrollTimerRef.current) return;
    clearTimeout(pendingMessageScrollTimerRef.current);
    pendingMessageScrollTimerRef.current = null;
  }, []);
  const schedulePendingBottomAlignRelease = useCallback((roomId: string | null) => {
    clearPendingBottomAlignReleaseTimer();

    const normalizedRoomId = String(roomId || '').trim();
    if (!normalizedRoomId) {
      pendingBottomAlignHoldUntilRef.current = 0;
      return;
    }

    const remainingMs = pendingBottomAlignHoldUntilRef.current - Date.now();
    if (remainingMs <= 0) {
      if (String(pendingBottomAlignRoomIdRef.current || '') === normalizedRoomId) {
        pendingBottomAlignRoomIdRef.current = null;
      }
      return;
    }

    pendingBottomAlignReleaseTimerRef.current = setTimeout(() => {
      pendingBottomAlignReleaseTimerRef.current = null;
      if (String(pendingBottomAlignRoomIdRef.current || '') === normalizedRoomId) {
        pendingBottomAlignRoomIdRef.current = null;
      }
    }, remainingMs);
  }, [clearPendingBottomAlignReleaseTimer]);
  const requestBottomAlignmentHold = useCallback((roomId: string | null, holdMs = 900) => {
    const normalizedRoomId = String(roomId || '').trim();
    const previousRoomId = String(pendingBottomAlignRoomIdRef.current || '').trim();
    pendingBottomAlignRoomIdRef.current = normalizedRoomId || null;

    if (!normalizedRoomId) {
      pendingBottomAlignHoldUntilRef.current = 0;
      clearPendingBottomAlignReleaseTimer();
      return;
    }

    const nextHoldUntil = Date.now() + Math.max(holdMs, 0);
    pendingBottomAlignHoldUntilRef.current =
      previousRoomId === normalizedRoomId
        ? Math.max(pendingBottomAlignHoldUntilRef.current, nextHoldUntil)
        : nextHoldUntil;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    schedulePendingBottomAlignRelease(normalizedRoomId);
  }, [clearPendingBottomAlignReleaseTimer, schedulePendingBottomAlignRelease]);
  const scrollToMessage = useCallback((messageId: string, remainingAttempts = 30) => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) return;

    suppressBottomAlignmentUntilRef.current = Date.now() + 2200;
    pendingBottomAlignRoomIdRef.current = null;
    pendingBottomAlignHoldUntilRef.current = 0;
    clearPendingBottomAlignReleaseTimer();
    isNearBottomRef.current = false;
    // 타임라인 윈도우 밖이면 DOM에 없어 scrollIntoView 불가 → 렌더 윈도우 확장 요청
    setTimelineEnsureMessageId(normalizedMessageId);

    const el = msgRefs.current[normalizedMessageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origClass = el.className;
      el.classList.add('bg-[var(--toss-blue-light)]', 'rounded-xl', 'transition-colors', 'duration-500');
      setTimeout(() => {
        el.className = origClass;
      }, 2000);
      lastScrolledMsgIdRef.current = normalizedMessageId;
      pendingScrollMsgIdRef.current = null;
    } else if (remainingAttempts > 0) {
      setTimeout(() => {
        scrollToMessage(normalizedMessageId, remainingAttempts - 1);
      }, 100);
    } else {
      pendingScrollMsgIdRef.current = null;
    }
  }, [clearPendingBottomAlignReleaseTimer]);
  const persistRoomReadCursors = useCallback(async (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ): Promise<boolean> => {
    // 읽음 커서 쓰기는 서버 라우트에 위임한다. 브라우저는 D1 binding에 직접 접근할 수
    // 없어 upsertRoomReadCursors를 클라이언트에서 호출하면 항상 실패했고, 이 때문에
    // 읽음 커서가 영구 저장되지 않아 안 읽음 배지가 사라졌다 재출현했다.
    const normalizedRoomIds = normalizeRoomReadCursorIds(roomIds);
    if (!effectiveChatUserId || normalizedRoomIds.length === 0) return false;
    try {
      const res = await fetch('/api/chat/read-cursors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomIds: normalizedRoomIds, readAt: readAt ?? undefined }),
        credentials: 'same-origin' });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      return Boolean(res.ok && json?.ok);
    } catch {
      return false;
    }
  }, [effectiveChatUserId]);
  const {
    setRoom,
    scrollToBottom,
    handleRoomListClick,
    updateScrollPositionState } = useChatRoomNavigation({
    selectedRoomId,
    selectedRoomIdRef,
    chatRoomsRef,
    inputMsgRef,
    draftMapRef,
    requestBottomAlignmentHold,
    pendingBottomAlignRoomIdRef,
    isNearBottomRef,
    lastTimelineTailRef,
    messageListRef,
    scrollRef,
    effectiveChatUserId,
    setSelectedRoomId,
    setInputMsg,
    setLoadingRoomId,
    setShowScrollToLatest,
    setRoomUnreadCounts,
    loadingRoomId,
    persistRoomReadCursors,
    markConversationNotificationsAsRead: (roomIds, readAt) =>
      markConversationNotificationsAsReadRef.current(roomIds, readAt),
    broadcastChatSync: (action, roomId) =>
      broadcastChatSyncRef.current(action, roomId),
    onRoomChangeCleanup: handleRoomChangeCleanup });
  setRoomRef.current = setRoom;

  const tryScrollToLoadedMessage = useCallback((roomId: string, messageId?: string | null) => {
    const normalizedRoomId = String(roomId || '').trim();
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedRoomId || !normalizedMessageId) return false;
    if (String(selectedRoomIdRef.current || '') !== normalizedRoomId) return false;
    if (!messages.some((message) => String(message.id) === normalizedMessageId)) return false;

    clearPendingMessageScrollTimer();
    pendingMessageScrollTimerRef.current = setTimeout(() => {
      pendingMessageScrollTimerRef.current = null;
      scrollToMessage(normalizedMessageId);
    }, 120);
    return true;
  }, [clearPendingMessageScrollTimer, messages, scrollToMessage]);

  const openRoomAtMessage = useCallback((roomId: string, messageId?: string | null) => {
    const normalizedRoomId = String(roomId || '').trim();
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedRoomId) return;
    if (normalizedMessageId) {
      pendingScrollMsgIdRef.current = normalizedMessageId;
    }
    if (tryScrollToLoadedMessage(normalizedRoomId, normalizedMessageId)) {
      return;
    }
    setRoom(normalizedRoomId);
  }, [setRoom, tryScrollToLoadedMessage]);

  const repairDirectRooms = useCallback(async (rooms: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : [];
    const orphanRooms = sourceRooms.filter(( room: ChatRoom) =>
      room?.type === 'direct' && normalizeMemberIds(room.members).length === 0
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

      const { data: roomMessages, error } = await db
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

        const { error: updateError } = await db
          .from('chat_rooms')
          .update({ members: inferredMembers })
          .eq('id', roomId);
        if (updateError) throw updateError;

        const roomIndex = repairedRooms.findIndex((candidate: ChatRoom) => String(candidate?.id) === roomId);
        if (roomIndex >= 0) {
          repairedRooms[roomIndex] = {
            ...repairedRooms[roomIndex],
            members: inferredMembers };
        }
      }

      return repairedRooms;
    } catch (error) {
      logger.error('repairDirectRooms failed', error);
      return sourceRooms;
    }
  }, []);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileChatViewport()) return;

    if (selectedRoomId) {
      pushMobileChatHistoryEntry();
      return;
    }

    if (!mobileChatHistoryEntryActiveRef.current) return;

    suppressNextMobileChatPopstateRef.current = true;
    mobileChatHistoryEntryActiveRef.current = false;
    try {
      window.history.back();
    } catch {
      suppressNextMobileChatPopstateRef.current = false;
    }
  }, [pushMobileChatHistoryEntry, selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (suppressNextMobileChatPopstateRef.current) {
        suppressNextMobileChatPopstateRef.current = false;
        return;
      }
      if (!isMobileChatViewport()) {
        mobileChatHistoryEntryActiveRef.current = false;
        return;
      }
      if (!selectedRoomIdRef.current) {
        mobileChatHistoryEntryActiveRef.current = false;
        return;
      }

      mobileChatHistoryEntryActiveRef.current = false;

      if (closeMobileChatBackLayerRef.current()) {
        window.requestAnimationFrame(() => {
          if (selectedRoomIdRef.current) {
            pushMobileChatHistoryEntry();
          }
        });
        return;
      }

      setRoomRef.current(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pushMobileChatHistoryEntry]);

  const roomPrefsUserId = effectiveChatUserId || user?.id || null;
  const {
    updateRoomPreference,
    persistPinnedRoomOrder,
    toggleRoomPinned,
    movePinnedRoom,
    toggleRoomHidden } = useChatRoomPreferences({
    roomPrefsUserId,
    pinnedRoomOrder,
    setRoomPrefs,
    setPinnedRoomOrder });

  const markConversationNotificationsAsRead = useCallback(async (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null
  ) => {
    if (!effectiveChatUserId) return;

    const targetRoomIds = new Set(
      roomIds.map((roomId) => String(roomId || '').trim()).filter(Boolean)
    );
    if (targetRoomIds.size === 0) return;

    // D1 은 PostgREST JSONPath(metadata->>room_id) 필터를 지원하지 않음.
    // 미읽음 message/mention 을 가져와 room_id 를 JS 로 매칭 후 id 단위 갱신.
    const resolvedReadAt = toUtcSqlTimestamp(readAt);
    try {
      const { data, error } = await d1
        .from('notifications')
        .select('id, metadata')
        .eq('user_id', effectiveChatUserId)
        .in('type', ['message', 'mention'])
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const idsToMark: string[] = [];
      for (const row of data || []) {
        const meta =
          row?.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : typeof row?.metadata === 'string'
              ? (() => {
                  try {
                    return JSON.parse(row.metadata) as Record<string, unknown>;
                  } catch {
                    return {};
                  }
                })()
              : {};
        const roomId = String(meta.room_id || meta.roomId || '').trim();
        if (roomId && targetRoomIds.has(roomId)) {
          const id = String(row.id || '').trim();
          if (id) idsToMark.push(id);
        }
      }

      if (idsToMark.length > 0) {
        // D1 IN 파라미터 한도 여유 — 청크 갱신
        for (let i = 0; i < idsToMark.length; i += 50) {
          const chunk = idsToMark.slice(i, i + 50);
          await d1
            .from('notifications')
            .update({ read_at: resolvedReadAt })
            .in('id', chunk);
        }
      }
    } catch (err) {
      logger.warn('대화방 알림 읽음 처리 실패:', err);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
  }, [effectiveChatUserId]);
  markConversationNotificationsAsReadRef.current = markConversationNotificationsAsRead;

  // 전체 unread가 0이 되면, 0으로 확인된 방들의 알림만 읽음 처리 (전역 일괄 wipe 금지).
  const prevTotalUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (!effectiveChatUserId) return;
    if (chatRooms.length === 0) return;
    const total = Object.values(roomUnreadCounts).reduce((sum, n) => sum + (n || 0), 0);
    const roomCount = Object.keys(roomUnreadCounts).length;
    if (roomCount === 0) return;
    if (roomCount < Math.min(3, chatRooms.length) && total === 0) return;
    if (total === 0 && prevTotalUnreadRef.current !== 0 && prevTotalUnreadRef.current !== null) {
      prevTotalUnreadRef.current = 0;
      const zeroRooms = Object.entries(roomUnreadCounts)
        .filter(([, count]) => (count || 0) === 0)
        .map(([roomId]) => roomId);
      if (zeroRooms.length > 0) {
        void markConversationNotificationsAsRead(zeroRooms);
      }
    } else {
      prevTotalUnreadRef.current = total;
    }
  }, [roomUnreadCounts, effectiveChatUserId, chatRooms.length, markConversationNotificationsAsRead]);

  const loadMentionInbox = useCallback(async () => {
    if (!effectiveChatUserId) {
      setMentionInboxItems([]);
      return;
    }

    try {
      const { data, error } = await d1.from('notifications')
        .select('id, title, body, created_at, read_at, metadata')
        .eq('user_id', effectiveChatUserId)
        .eq('type', 'mention')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      const nextItems = (data || []).map((row: Record<string, unknown>) => {
        const metadata =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata as Record<string, unknown>
            : {};
        return {
          id: String(row.id || ''),
          roomId: String(metadata.room_id || '').trim(),
          messageId: String(metadata.message_id || metadata.id || '').trim(),
          roomName: String(metadata.room_name || '채팅방').trim() || '채팅방',
          senderName: String(metadata.sender_name || row.title || '알 수 없음').replace(/^📣\s*/, '').trim() || '알 수 없음',
          body: String(row.body || '').trim() || '멘션 메시지',
          createdAt: String(row.created_at || '').trim(),
          unread: !row.read_at } satisfies MessengerMentionInboxItem;
      }).filter((item: MessengerMentionInboxItem) => item.id && item.roomId && item.messageId);

      setMentionInboxItems(nextItems);
    } catch {
      setMentionInboxItems([]);
    }
  }, [effectiveChatUserId]);

  const persistThreadPreferences = useCallback((nextPreferences: Record<string, ThreadPreference>) => {
    setThreadPrefs(nextPreferences);
    writeStoredThreadPreferences(roomPrefsUserId, nextPreferences);
  }, [roomPrefsUserId]);

  const followedThreadIds = useMemo(
    () =>
      new Set(
        Object.entries(threadPrefs)
          .filter(([, preference]) => preference?.followed)
          .map(([threadId]) => threadId),
      ),
    [threadPrefs],
  );

  const loadThreadInbox = useCallback(async () => {
    if (!effectiveChatUserId) {
      setThreadInboxItems([]);
      return;
    }

    try {
      const { data, error } = await d1.from('notifications')
        .select('id, title, body, created_at, read_at, metadata')
        .eq('user_id', effectiveChatUserId)
        .in('type', ['message', 'mention'])
        .order('created_at', { ascending: false })
        .limit(24);

      if (error) throw error;

      const nextItems = (data || [])
        .map((row: Record<string, unknown>) => {
          const metadata =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? row.metadata as Record<string, unknown>
              : {};
          const threadRootId = String(metadata.thread_root_id || metadata.reply_to_id || metadata.message_id || metadata.id || '').trim();
          if (!threadRootId) return null;
          const followed = followedThreadIds.has(threadRootId) || followedThreadIds.has(String(metadata.reply_to_id || '').trim());
          const isThreadReply =
            metadata.is_thread_reply === true ||
            String(metadata.is_thread_reply || '').toLowerCase() === 'true';
          if (!isThreadReply && !followed) return null;

          return {
            id: String(row.id || '').trim(),
            roomId: String(metadata.room_id || '').trim(),
            messageId: String(metadata.message_id || metadata.id || '').trim(),
            threadRootId,
            roomName: String(metadata.room_name || '채팅방').trim() || '채팅방',
            senderName: String(metadata.sender_name || row.title || '알 수 없음').replace(/^📣\s*/, '').trim() || '알 수 없음',
            body: String(row.body || '').trim() || '스레드 답글',
            createdAt: String(row.created_at || '').trim(),
            unread: !row.read_at,
            followed } satisfies MessengerThreadInboxItem;
        })
        .filter((item: MessengerThreadInboxItem | null): item is MessengerThreadInboxItem => Boolean(item?.id && item.roomId && item.messageId))
        .reduce((acc: MessengerThreadInboxItem[], item: MessengerThreadInboxItem) => {
          if (acc.some((entry) => entry.threadRootId === item.threadRootId && entry.roomId === item.roomId)) {
            return acc;
          }
          acc.push(item);
          return acc;
        }, [] as MessengerThreadInboxItem[])
        .slice(0, 8);

      setThreadInboxItems(nextItems);
    } catch {
      setThreadInboxItems([]);
    }
  }, [effectiveChatUserId, followedThreadIds]);

  useEffect(() => {
    void loadMentionInbox();
    void loadThreadInbox();
    if (typeof window === 'undefined') return;

    const reloadMentionInbox = () => {
      void loadMentionInbox();
      void loadThreadInbox();
    };

    window.addEventListener('erp-notification-read', reloadMentionInbox);
    let unbindMockNotificationInsert: (() => void) | undefined;
    // 테스트/모의 알림 바인딩은 비프로덕션 전용 — 첫 엔트리 정적 번들에서 제외
    if (process.env.NODE_ENV !== 'production') {
      void import('./메신저테스트이벤트').then(({ bindMockNotificationInsert }) => {
        unbindMockNotificationInsert = bindMockNotificationInsert(reloadMentionInbox);
      });
    }
    return () => {
      window.removeEventListener('erp-notification-read', reloadMentionInbox);
      unbindMockNotificationInsert?.();
    };
  }, [loadMentionInbox, loadThreadInbox]);

  const broadcastChatSync = useCallback((action: string, roomId?: string | null) => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-chat-sync', {
          detail: {
            action,
            roomId: roomId || selectedRoomId || null,
            at: Date.now() } }));
      }
      if (!syncChannelRef.current) return;
      syncChannelRef.current.postMessage({
        action,
        roomId: roomId || selectedRoomId || null,
        at: Date.now() });
    } catch {
      // ignore
    }
  }, [selectedRoomId]);
  broadcastChatSyncRef.current = broadcastChatSync;

  // 즉시 푸시 트리거: lib/chat-push-client-trigger (모바일과 동일).
  // enqueue 는 서버 d1/mutate → chat-push-enqueue 단일 경로.

  // D1 polling 기반 typing — emit과 수신 폴링 모두 useChatTypingD1이 담당.
  const { emitTyping: emitTypingState, handleTypingInput } = useChatTypingD1({
    selectedRoomId,
    effectiveChatUserId,
    userName: user?.name,
    setTypingUsers,
    typingClearRef });

  const handleComposerChange = useCallback((value: string, caret: number) => {
    // value/inputMsgRef는 컴포저 내부에서 이미 갱신. 부모는 멘션 인식과
    // typing emit만 처리해 부모 트리 리렌더(키 입력당 setInputMsg)를 회피.
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/@([^\s@]{0,20})$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
      setMentionQuery('');
    }
    // D1 기반 typing emit — 입력 값으로 throttle/debounce 처리
    handleTypingInput(value);
  }, [handleTypingInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1) localStorage에서 즉시 로드 (빠른 초기화)
    try {
      const raw = window.localStorage.getItem(getRoomPrefsStorageKey(roomPrefsUserId));
      setRoomPrefs(raw ? JSON.parse(raw) : {});
    } catch {
      setRoomPrefs({});
    }
    setThreadPrefs(readStoredThreadPreferences(roomPrefsUserId));
    try {
      const rawPinnedOrder = window.localStorage.getItem(getPinnedRoomOrderStorageKey(roomPrefsUserId));
      const parsedPinnedOrder = rawPinnedOrder ? JSON.parse(rawPinnedOrder) : [];
      setPinnedRoomOrder(Array.isArray(parsedPinnedOrder) ? parsedPinnedOrder.map((value) => String(value)) : []);
    } catch {
      setPinnedRoomOrder([]);
    }
    // 2) DB에서 최신 설정 로드 (chat_room_prefs 테이블이 없으면 graceful skip)
    if (roomPrefsUserId && !isRelationMarkedMissing('chat_room_prefs')) {
      void db
        .from('chat_room_prefs')
        .select('room_id, pinned, hidden')
        .eq('user_id', roomPrefsUserId)
        .then(({ data, error }) => {
          if (rememberMissingRelation(error, 'chat_room_prefs')) return;
          if (error || !Array.isArray(data) || data.length === 0) return;
          const dbPrefs: Record<string, RoomPreference> = {};
          data.forEach((row: Record<string, unknown>) => {
            const rid = String(row.room_id || '');
            if (rid) dbPrefs[rid] = { pinned: Boolean(row.pinned), hidden: Boolean(row.hidden) };
          });
          if (Object.keys(dbPrefs).length > 0) {
            setRoomPrefs(dbPrefs);
            try {
              window.localStorage.setItem(getRoomPrefsStorageKey(roomPrefsUserId), JSON.stringify(dbPrefs));
            } catch { /* ignore */ }
          }
        });
    }
  }, [roomPrefsUserId]);

  useEffect(() => {
    deliveryStatesRef.current = deliveryStates;
  }, [deliveryStates]);

  useEffect(() => {
    if (!retryQueueActorId) return;
    const queuedEntries = readChatRetryQueue(retryQueueActorId);
    if (!queuedEntries.length) return;
    setDeliveryStates((prev) => {
      const next = { ...prev };
      queuedEntries.forEach((entry) => {
        if (next[entry.id]?.status === 'sent') return;
        next[entry.id] = {
          status: next[entry.id]?.status === 'sending' ? 'sending' : 'failed',
          retryPayload: entry.payload,
          error: entry.error };
      });
      return next;
    });
  }, [retryQueueActorId]);

  useEffect(() => {
    if (!retryQueueActorId || !selectedRoomId) return;
    const queuedMessages = readChatRetryQueue(retryQueueActorId)
      .filter((entry) => String(entry.payload.roomId) === String(selectedRoomId))
      .map((entry) => buildRetryQueueMessage(entry, user));
    if (!queuedMessages.length) return;
    setMessages((prev) => {
      const merged = new Map<string, ChatMessage>();
      [...prev, ...queuedMessages].forEach((message) => {
        merged.set(String(message.id), message);
      });
      return Array.from(merged.values()).sort(
        (left, right) =>
          toChatDate(left.created_at || 0).getTime() - toChatDate(right.created_at || 0).getTime(),
      );
    });
  }, [retryQueueActorId, selectedRoomId, user]);

  // textarea 자동 높이 조절 effect는 inputMsg가 부모 state였을 때 여기 있었음.
  // value owner를 컴포저로 옮긴 뒤 컴포저 내부 useEffect로 이전.

  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [reactionUsersByMessage, setReactionUsersByMessage] = useState<ReactionUsersByMessage>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSourceMsg, setForwardSourceMsg] = useState<ChatMessage | null>(null);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const attachmentPreviewController = useChatAttachmentPreview();
  const {
    preview: attachmentPreview,
    buildPreviewItem: buildAttachmentPreviewItem,
    openPreviewGallery: openAttachmentPreviewGallery,
    openPreview: openAttachmentPreview,
    closePreview: closeAttachmentPreview } = attachmentPreviewController;
  const deferredAddMemberSearch = useDeferredValue(addMemberSearch);
  const [addMemberSelectingIds, setAddMemberSelectingIds] = useState<string[]>([]);
  // 조직도 기반 초대 모달의 부서 펼침 상태
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const toggleDept = (key: string) =>
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const closeGroupModal = useCallback(() => {
    setShowGroupModal(false);
  }, []);

  const closeForwardModal = useCallback(() => {
    setShowForwardModal(false);
    setForwardSourceMsg(null);
  }, []);

  const closeAddMemberModal = useCallback(() => {
    setShowAddMemberModal(false);
    setAddMemberSelectingIds([]);
  }, []);

  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const {
    polls,
    setPolls,
    pollVotes,
    setPollVotes,
    showPollModal,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    pollDeadlineAt,
    setPollDeadlineAt,
    openPollModal,
    closePollModal,
    handleCreatePoll,
    handlePollOptionChange,
    handleRemovePollOption,
    handleAddPollOption,
    handleVote,
    handleDrawPollPrize,
    prizeEnabled,
    prizeWinnerCount,
    prizeName,
    setPrizeEnabled,
    setPrizeWinnerCount,
    setPrizeName,
    isKickPoll,
    setIsKickPoll,
    kickTargetId,
    setKickTargetId,
    slashCommand,
    showSlashModal,
    slashForm,
    closeSlashModal,
    handleSlashFormFieldChange,
    openSlashDraftFromText,
    handleSubmitAnnualLeaveDraft,
    handleSubmitPurchaseDraft } = useChatWorkflowDrafts({
    selectedRoomId,
    effectiveChatUserId,
    user,
    fetchData: () => fetchDataRef.current?.() });
  const {
    updateUnreadForRooms,
    syncChatRoomsState,
    syncRoomSummaryFromMessages,
    fetchData,
    applyReadCursorFromRealtime,
    refreshReadCursorsForRoom,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshRoomPolls,
    loadMessagesAroundMessage,
    hasOlderMessages,
    loadingOlderMessages,
    loadOlderMessages } = useChatRoomDataSync({
    selectedRoomId,
    selectedRoomIdRef,
    chatRoomsRef,
    messagesRef,
    pendingBottomAlignRoomIdRef,
    fetchDataRequestSeqRef,
    deliveryStatesRef,
    effectiveChatUserId,
    effectiveTodoUserId,
    userId: user?.id,
    requestBottomAlignmentHold,
    setRoom,
    resolveStaffProfile,
    getEffectiveRoomMemberIds,
    isRoomAccessibleToCurrentUser,
    repairDirectRooms,
    setChatRooms,
    setRoomUnreadCounts,
    setMessages,
    setLoadingRoomId,
    setTimelineRoomId,
    setRoomReadCursorMap,
    setReadCounts,
    setBookmarkedIds,
    setPinnedIds,
    setPersistedPinnedMessages,
    setReactions,
    setReactionUsersByMessage,
    setPolls,
    setPollVotes });

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
    const alreadyHandledRecently = !claimIncomingRealtimeMessage(row.id);

    const roomId = String(row.room_id);
    const currentRooms = chatRoomsRef.current;
    const currentRoom = currentRooms.find((room: ChatRoom) => String(room.id) === roomId) || null;
    const conversationRoomIds = getConversationRoomIdsByRoomId(roomId, currentRooms as ChatRoom[]);
    if (currentRoom && !isRoomAccessibleToCurrentUser(currentRoom)) return;

    const currentConversationRoomId = String(selectedRoomIdRef.current || roomId);
    const isCurrentRoom = isRoomInSelectedConversation(roomId, currentRooms);
    const isOwnMessage = String(row.sender_id || '') === String(effectiveChatUserId || '');
    if (alreadyHandledRecently && !isCurrentRoom) return;
    const previewText = getMessageDisplayText(
      row.content,
      row.file_name,
      row.file_url,
      currentRoom?.last_message_preview || currentRoom?.last_message || ''
    );

    // conversation 그룹에 속한 모든 방 ID를 업데이트하여 사이드바 대표 방의
    // preview도 반영되도록 한다 (erp-chat-notification 핸들러와 동일 패턴).
    const targetRoomIdsForPreview = Array.from(
      new Set([...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]), roomId].filter(Boolean)),
    );
    setChatRooms((prev) => {
      if (!prev.some((room: ChatRoom) => targetRoomIdsForPreview.includes(String(room.id)))) return prev;
      return sortChatRoomsWithNoticeFirst(
        prev.map((room: ChatRoom) =>
          targetRoomIdsForPreview.includes(String(room.id))
            ? {
                ...room,
                last_message: previewText || room.last_message,
                last_message_preview: previewText || room.last_message_preview,
                last_message_at: row.created_at || new Date().toISOString() }
            : room
        )
      );
    });

    if (isCurrentRoom) {
      if (isNearBottomRef.current || isOwnMessage) {
        requestBottomAlignmentHold(currentConversationRoomId, isOwnMessage ? 1200 : 900);
      }
      setMessages((prev) => {
        if (prev.some((message: ChatMessage) => String(message.id) === String(row.id))) return prev;
        const newMsg = {
          ...row,
          staff: resolveStaffProfile(row.sender_id, row.sender_name) || { name: '이름 없음', photo_url: null } };
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
        const readAt = toUtcSqlTimestamp();
        const targetRoomIds = conversationRoomIds.length > 0 ? conversationRoomIds : [roomId];
        void persistRoomReadCursors(targetRoomIds, readAt)
          .then(async (cursorWriteOk) => {
            await markConversationNotificationsAsRead(
              [...targetRoomIds, currentConversationRoomId],
              readAt
            );
            if (cursorWriteOk) {
              broadcastChatSync('message-read', roomId);
            }
          })
          .catch(() => {});
        setRoomUnreadCounts((prev) => {
          let changed = false;
          const next = { ...prev };
          const targetRoomIds = Array.from(
            new Set(
              [
                ...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]),
                currentConversationRoomId,
              ].filter(Boolean)
            )
          );
          targetRoomIds.forEach((targetRoomId) => {
            if (!next[targetRoomId]) return;
            next[targetRoomId] = 0;
            changed = true;
          });
          return changed ? next : prev;
          });
      }
      return;
    }

    // 내 메시지가 아니면 unread 카운트를 증가시킨다.
    if (!isOwnMessage) {
      setRoomUnreadCounts((prev) => ({
        ...prev,
        [roomId]: Math.max(1, (prev[roomId] || 0) + 1) }));
    }
  }, [
    broadcastChatSync,
    claimIncomingRealtimeMessage,
    effectiveChatUserId,
    isRoomAccessibleToCurrentUser,
    markConversationNotificationsAsRead,
    persistRoomReadCursors,
    requestBottomAlignmentHold,
    updateUnreadForRooms,
    user?.id,
    isRoomInSelectedConversation,
  ]);

  const fetchMessageByIdWithRetry = useCallback(async (messageId: string, attempts = 3) => {
    const targetMessageId = String(messageId || '').trim();
    if (!targetMessageId || !UUID_ID_PATTERN.test(targetMessageId)) return null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const { data } = await selectChatMessagesWithFallback<ChatMessage>(({ selectClause }) =>
          db
            .from('messages')
            .select(selectClause)
            .eq('id', targetMessageId)
            .maybeSingle() as PromiseLike<{ data: ChatMessage | null; error: unknown }>
        );
        if (data) return data;
      } catch {
        // ignore and retry below
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }

    return null;
  }, []);

  const syncNoticeRoomMembers = useCallback(async (rooms?: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const noticeRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID);
    if (!noticeRoom) return;

    const currentMemberIds = normalizeMemberIds(noticeRoom.members);
    if (haveSameMembers(currentMemberIds, noticeRoomMemberIds)) return;

    try {
      const { error } = await db
        .from('chat_rooms')
        .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
        .eq('id', NOTICE_ROOM_ID);
      if (error) throw error;
    } catch (error) {
      logger.error('공지방 멤버 동기화 실패:', error);
    }
  }, [noticeRoomMemberIds]);

  const ensureSelfChatRoom = useCallback(
    async (rooms: ChatRoom[]) => {
      const currentUserId = String(effectiveChatUserId || '').trim();
      const sourceRooms = Array.isArray(rooms) ? rooms : [];
      if (!currentUserId) return sourceRooms;

      const existingSelfRooms = sourceRooms
        .filter((room: ChatRoom) => isSelfChatRoom(room, currentUserId))
        .sort(
          (a: ChatRoom, b: ChatRoom) =>
            toChatDate(b.last_message_at || b.created_at || 0).getTime() -
            toChatDate(a.last_message_at || a.created_at || 0).getTime()
        );
      const existingSelfRoom = existingSelfRooms[0];

      if (existingSelfRoom) {
        const nextMembers = [currentUserId];
        const currentMembers = normalizeMemberIds(existingSelfRoom.members);
        const needsUpdate =
          existingSelfRoom.name !== SELF_ROOM_NAME ||
          existingSelfRoom.type !== 'direct' ||
          currentMembers.length !== 1 ||
          currentMembers[0] !== currentUserId;

        if (!needsUpdate) return sourceRooms;

        try {
          const result = await patchChatRoom(String(existingSelfRoom.id), {
            name: SELF_ROOM_NAME,
            type: 'direct',
            members: nextMembers });
          if (!result.ok) throw new Error(result.error);
        } catch (error) {
          logger.error('나와의 채팅방 업데이트 실패:', error);
        }

        return sourceRooms
          .filter(
            (room: ChatRoom) =>
              !isSelfChatRoom(room, currentUserId) || String(room.id) === String(existingSelfRoom.id)
          )
          .map((room: ChatRoom) =>
            String(room.id) === String(existingSelfRoom.id)
              ? { ...room, name: SELF_ROOM_NAME, type: 'direct' as const, members: nextMembers }
              : room
          );
      }

      if (selfChatCreationInFlightRef.current) {
        return sourceRooms;
      }

      selfChatCreationInFlightRef.current = true;
      try {
        const result = await createOrUpsertChatRoom({
          name: SELF_ROOM_NAME,
          type: 'direct',
          members: [currentUserId] });
        if (!result.ok || !result.room) throw new Error(result.error || 'Self chat create failed');
        return [...sourceRooms, result.room as unknown as ChatRoom];
      } catch (error) {
        logger.error('나와의 채팅방 생성 실패:', error);
        return sourceRooms;
      } finally {
        selfChatCreationInFlightRef.current = false;
      }
    },
    [effectiveChatUserId]
  );

  useEffect(() => {
    chatRoomsRef.current = chatRooms;
  }, [chatRooms]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestoreSavedRoomOnMount = !isMobileChatViewport();
    if ((chatListResetToken ?? 0) > 0 || initialOpenChatRoomId) {
      pendingBottomAlignRoomIdRef.current = null;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      setLoadingRoomId(null);
      setTimelineRoomId(null);
      setSelectedRoomId(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem(CHAT_ROOM_KEY);
      if (shouldRestoreSavedRoomOnMount && saved && saved !== 'null' && saved !== 'undefined') {
        pendingBottomAlignRoomIdRef.current = saved;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setLoadingRoomId(saved);
        setSelectedRoomId(saved);
      } else {
        // 첫 진입 + 저장된 방 없음 → 공지방을 기본으로 (PC만, 모바일은 방 목록 노출 유지)
        pendingBottomAlignRoomIdRef.current = null;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        const initialRoomId = shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null;
        setLoadingRoomId(initialRoomId);
        setSelectedRoomId(initialRoomId);
      }
    } catch {
      pendingBottomAlignRoomIdRef.current = null;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      const fallbackRoomId = shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null;
      setLoadingRoomId(fallbackRoomId);
      setSelectedRoomId(fallbackRoomId);
    }
  }, []);

  const handleSelectMention = useCallback((name: string) => {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;

    const value = inputMsgRef.current;
    const replaced = value.match(/@([^\s@]{0,20})$/)
      ? value.replace(/@([^\s@]{0,20})$/, `@${trimmedName} `)
      : `${value}@${trimmedName} `;

    inputMsgRef.current = replaced;
    setInputMsg(replaced);
    setShowMentionList(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (initialRoomRestoreSyncedRef.current) return;
    if (selectedRoomId === null) {
      initialRoomRestoreSyncedRef.current = true;
      return;
    }
    if (chatRooms.length === 0) return;

    initialRoomRestoreSyncedRef.current = true;
    setRoom(String(selectedRoomId));
  }, [chatRooms.length, selectedRoomId]);

  useEffect(() => {
    if (initialOpenChatRoomId) {
      openRoomAtMessage(initialOpenChatRoomId, initialOpenMessageId);
      onConsumeOpenChatRoomId?.();
    }
  }, [initialOpenChatRequestToken, initialOpenChatRoomId, initialOpenMessageId, onConsumeOpenChatRoomId, openRoomAtMessage]);

  useEffect(() => {
    if (!selectedRoomId) {
      suppressBottomAlignmentUntilRef.current = 0;
      return;
    }

    const pendingTargetMessageId = String(pendingScrollMsgIdRef.current || '').trim();
    if (!pendingTargetMessageId) {
      suppressBottomAlignmentUntilRef.current = 0;
    }
  }, [selectedRoomId]);

  useEffect(() => {
    if (!chatListResetToken) return;
    if (chatListResetToken === lastHandledChatListResetTokenRef.current) return;

    // 딥링크(initialOpenChatRoomId)가 살아 있으면 그쪽 effect가 방을 결정한다.
    // 마이페이지 → 할일 "↗ 채팅" 같은 진입 경로에서 ChatView가 새로 마운트될 때,
    // 부모 state에 누적된 chatListResetToken(>0) 때문에 이 reset effect가 같은
    // commit에 발화해 setRoom(NOTICE_ROOM_ID)로 덮어쓰던 회귀 방지.
    if (initialOpenChatRoomId) {
      lastHandledChatListResetTokenRef.current = chatListResetToken;
      return;
    }

    lastHandledChatListResetTokenRef.current = chatListResetToken;
    pendingScrollMsgIdRef.current = null;
    pendingThreadRootIdRef.current = null;
    pendingBottomAlignRoomIdRef.current = null;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    setLoadingRoomId(null);
    setTimelineRoomId(null);
    setViewMode('chat');
    setShowDrawer(false);
    // 사이드바 채팅 메뉴 재클릭(=재진입) → 공지방을 기본으로 (PC만)
    setRoom(isMobileChatViewport() ? null : NOTICE_ROOM_ID);
    onConsumeOpenChatRoomId?.();
  }, [chatListResetToken, initialOpenChatRoomId, onConsumeOpenChatRoomId]);

  useEffect(() => {
    const targetMsgId = pendingScrollMsgIdRef.current;
    if (targetMsgId && messages.length > 0) {
      if (messages.some((message) => String(message.id) === String(targetMsgId))) {
        clearPendingMessageScrollTimer();
        pendingMessageScrollTimerRef.current = setTimeout(() => {
          pendingMessageScrollTimerRef.current = null;
          scrollToMessage(targetMsgId);
        }, 500);
      }
    }
  }, [clearPendingMessageScrollTimer, messages, scrollToMessage]);

  // 과거 메시지 바로가기 시 해당 메시지 중심의 히스토리를 불러오는 로직 이식
  useEffect(() => {
    const targetMsgId = String(pendingScrollMsgIdRef.current || '').trim();
    if (!targetMsgId) {
      directMessageLoadTargetRef.current = null;
      return;
    }
    if (!selectedRoomId || !loadMessagesAroundMessage) return;
    if (String(timelineRoomId || '') !== String(selectedRoomId)) return;
    if (messages.some((message) => String(message.id) === targetMsgId)) {
      directMessageLoadTargetRef.current = null;
      return;
    }

    const loadKey = `${selectedRoomId}:${targetMsgId}`;
    if (directMessageLoadTargetRef.current === loadKey) return;

    directMessageLoadTargetRef.current = loadKey;
    pendingBottomAlignRoomIdRef.current = null;
    isNearBottomRef.current = false;
    setShowScrollToLatest(false);

    void loadMessagesAroundMessage(targetMsgId)
      .then((result) => {
        if (directMessageLoadTargetRef.current !== loadKey) return;
        if (result.ok) {
          pendingScrollMsgIdRef.current = result.messageId || targetMsgId;
          return;
        }
        if (result.reason === 'room-changed') {
          directMessageLoadTargetRef.current = null;
          return;
        }
        pendingScrollMsgIdRef.current = null;
        directMessageLoadTargetRef.current = null;
      })
      .catch(() => {
        if (directMessageLoadTargetRef.current === loadKey) {
          pendingScrollMsgIdRef.current = null;
          directMessageLoadTargetRef.current = null;
        }
      });
  }, [
    selectedRoomId,
    timelineRoomId,
    loadMessagesAroundMessage,
    messages,
    pendingBottomAlignRoomIdRef,
    pendingScrollMsgIdRef,
    isNearBottomRef,
    setShowScrollToLatest,
  ]);

  // fetchDataRef가 항상 최신 fetchData를 가리키게 유지
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    return () => {
      clearPendingMessageScrollTimer();
      clearPendingBottomAlignReleaseTimer();
      if (globalRealtimeRetryTimerRef.current) {
        clearTimeout(globalRealtimeRetryTimerRef.current);
        globalRealtimeRetryTimerRef.current = null;
      }
      if (roomRealtimeRetryTimerRef.current) {
        clearTimeout(roomRealtimeRetryTimerRef.current);
        roomRealtimeRetryTimerRef.current = null;
      }
    };
  }, [clearPendingBottomAlignReleaseTimer, clearPendingMessageScrollTimer]);

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        // 로컬 캐시가 있으면 먼저 그려 빈 목록 체감을 줄인다.
        if (active && chatRoomsRef.current.length === 0) {
          const cached = readCachedChatRooms();
          if (cached.length > 0) {
            await syncChatRoomsState(cached);
          }
        }

        // 공지방 보장 백그라운드 비동기 실행 (채팅방 목록 로딩 지연 방지)
        void (async () => {
          try {
            const { data: noticeRoom } = await db
              .from('chat_rooms')
              .select('id')
              .eq('id', NOTICE_ROOM_ID)
              .maybeSingle();

            const canSyncNoticeMembers = noticeRoomMemberIds.length > 0;
            if (!noticeRoom) {
              await createOrUpsertChatRoom({
                id: NOTICE_ROOM_ID,
                name: NOTICE_ROOM_NAME,
                type: 'notice',
                ...(canSyncNoticeMembers ? { members: noticeRoomMemberIds } : {}) });
            } else if (canSyncNoticeMembers) {
              await patchChatRoom(NOTICE_ROOM_ID, {
                name: NOTICE_ROOM_NAME,
                type: 'notice',
                members: noticeRoomMemberIds });
            } else {
              await patchChatRoom(NOTICE_ROOM_ID, {
                name: NOTICE_ROOM_NAME,
                type: 'notice' });
            }
          } catch (noticeErr) {
            logger.warn('공지방 백그라운드 갱신 무시:', noticeErr);
          }
        })();

        const roomResult = await fetchAllChatRooms({ force: true });
        if (roomResult.error) throw roomResult.error;
        const roomsWithSelf = await ensureSelfChatRoom(roomResult.data);
        if (!active) return;
        const syncedRooms = await syncChatRoomsState(roomsWithSelf);
        writeCachedChatRooms(syncedRooms);
      } catch (error) {
        logger.error('채팅방 목록 로드 실패:', error);
        if (!active) return;
        if (chatRoomsRef.current.length > 0) {
          await syncChatRoomsState(chatRoomsRef.current);
          return;
        }
        const cached = readCachedChatRooms();
        if (cached.length > 0) {
          await syncChatRoomsState(cached);
        }
      }
    };
    void loadRooms();
    return () => {
      active = false;
    };
  }, [ensureSelfChatRoom, noticeRoomMemberIds, syncChatRoomsState]);

  useEffect(() => {
    if (!chatRooms.some((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)) return;
    void syncNoticeRoomMembers(chatRooms);
  }, [chatRooms, syncNoticeRoomMembers]);

  // Phase 5-C — Supabase Realtime channel → polling으로 전환.
  // chat_rooms 테이블 변경(생성/이름변경/멤버변경/삭제) 감지 시 전체 리스트 refetch.
  useEffect(() => {
    return subscribeRealtime(
      'chat-rooms-list',
      [{ table: 'chat_rooms' }],
      () => {
        void fetchAllChatRooms({ force: true }).then((result) => {
          if (result.error || !result.data) return;
          let accessible = result.data.filter((room) => isRoomAccessibleToCurrentUser(room));
          // identity/멤버 필드 일시 불일치로 accessible 이 비면 기존 목록을 지우지 않는다.
          // (사이드바 뱃지는 뜨는데 목록만 비는 회귀 방지)
          if (accessible.length === 0) {
            if (chatRoomsRef.current.length > 0) return;
            // 공지방만이라도 유지
            accessible = result.data.filter((room) => String(room.id) === NOTICE_ROOM_ID);
            if (accessible.length === 0) return;
          }
          // 폴링이 방 목록을 덮을 때: 현재 메모리 상의 더 최신 last_message_at 은 유지
          setChatRooms((prev) => {
            const prevById = new Map(prev.map((r) => [String(r.id), r]));
            const merged = accessible.map((room) => {
              const old = prevById.get(String(room.id));
              if (!old) return room;
              const oldAt = new Date(String(old.last_message_at || 0).replace(' ', 'T')).getTime();
              const newAt = new Date(String(room.last_message_at || 0).replace(' ', 'T')).getTime();
              const oldPreview = String(old.last_message_preview || old.last_message || '');
              const newPreview = String(room.last_message_preview || room.last_message || '');
              const newIsDirty =
                /^file:\/\//i.test(newPreview) ||
                /^blob:/i.test(newPreview) ||
                /^[A-Za-z]:[\\/]/.test(newPreview);
              const oldIsDeleted =
                oldPreview === '삭제된 메시지입니다.' || oldPreview.startsWith('삭제된 메시지');
              if (newIsDirty && oldPreview && (!/^file:\/\//i.test(oldPreview) || oldIsDeleted)) {
                return {
                  ...room,
                  last_message: oldIsDeleted ? '삭제된 메시지입니다.' : old.last_message,
                  last_message_preview: oldIsDeleted
                    ? '삭제된 메시지입니다.'
                    : old.last_message_preview,
                  last_message_at: old.last_message_at || room.last_message_at,
                };
              }
              if (Number.isFinite(oldAt) && Number.isFinite(newAt) && oldAt > newAt) {
                return {
                  ...room,
                  last_message: old.last_message,
                  last_message_preview: old.last_message_preview,
                  last_message_at: old.last_message_at,
                };
              }
              return room;
            });
            return sortChatRoomsWithNoticeFirst(merged);
          });
        });
      },
      { pollIntervalMs: 15000 },
    );
  }, [isRoomAccessibleToCurrentUser, sortChatRoomsWithNoticeFirst]);
  useChatRealtimeSubscriptions({
    userId: user?.id,
    userName: user?.name,
    effectiveChatUserId,
    effectiveTodoUserId,
    selectedRoomId,
    globalRealtimeRetryToken,
    roomRealtimeRetryToken,
    presenceChannelRef,
    syncChannelRef,
    chatRoomsRef,
    selectedRoomIdRef,
    fetchDataRef,
    globalRealtimeRetryTimerRef,
    roomRealtimeRetryTimerRef,
    setPresenceMap,
    setGlobalRealtimeState,
    setRoomRealtimeState,
    setChatRooms,
    fetchData,
    updateUnreadForRooms,
    applyReadCursorFromRealtime,
    refreshReadCursorsForRoom,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshRoomPolls,
    handleIncomingRealtimeMessage,
    scheduleRealtimeReconnect,
    isRoomInSelectedConversation,
    fetchMessageByIdWithRetry,
    sortChatRoomsWithNoticeFirst });

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
    const onFocus = () => { isFocusedRef.current = true; };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);

  const isSelectedRoomTimelineReady = useMemo(() => {
    if (!selectedRoomId) return false;
    if (String(loadingRoomId || '') === String(selectedRoomId)) return false;
    return String(timelineRoomId || '') === String(selectedRoomId);
  }, [loadingRoomId, selectedRoomId, timelineRoomId]);

  useEffect(() => {
    if (selectedRoomId && isSelectedRoomTimelineReady) return;
    readyBottomAlignRoomIdRef.current = null;
  }, [isSelectedRoomTimelineReady, selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId || messages.length === 0 || !isSelectedRoomTimelineReady) return;
    const normalizedSelectedRoomId = String(selectedRoomId);
    const pendingTargetMessageId = String(pendingScrollMsgIdRef.current || '').trim();
    if (
      pendingTargetMessageId &&
      messages.some((message) => String(message.id) === pendingTargetMessageId)
    ) {
      readyBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
      pendingBottomAlignRoomIdRef.current = null;
      pendingBottomAlignHoldUntilRef.current = 0;
      clearPendingBottomAlignReleaseTimer();
      isNearBottomRef.current = false;
      layoutScrollHandledRef.current = true;
      return;
    }
    const isPendingBottomAlignActive =
      String(pendingBottomAlignRoomIdRef.current || '') === normalizedSelectedRoomId;
    const justBecameReady = readyBottomAlignRoomIdRef.current !== normalizedSelectedRoomId;
    const shouldAlignAfterReady = justBecameReady && isNearBottomRef.current;
    if (!isPendingBottomAlignActive && !shouldAlignAfterReady) return;

    const listEl = messageListRef.current;
    if (!listEl) return;

    readyBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
    listEl.scrollTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    pendingBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
    pendingBottomAlignHoldUntilRef.current = Date.now() + 2200;
    schedulePendingBottomAlignRelease(normalizedSelectedRoomId);
    // useEffect의 중복 스크롤 애니메이션을 막기 위해 처리 완료 표시
    layoutScrollHandledRef.current = true;
  }, [isNearBottomRef, isSelectedRoomTimelineReady, messageListRef, messages, pendingBottomAlignRoomIdRef, schedulePendingBottomAlignRelease, selectedRoomId, setShowScrollToLatest]);

  useEffect(() => {
    if (!selectedRoomId || messages.length === 0 || !isSelectedRoomTimelineReady) return;
    const lastMessage = messages[messages.length - 1];
    const lastMessageRoomId = String(lastMessage?.room_id || '');
    const isLastMessageInSelectedRoom = isRoomInSelectedConversation(lastMessageRoomId);
    if (!isLastMessageInSelectedRoom && !String(lastMessage?.id || '').startsWith('temp-')) return;

    const tailSignature = `${messages.length}:${String(lastMessage?.id || '')}:${String(lastMessage?.created_at || '')}`;
    const tailChanged = lastTimelineTailRef.current !== tailSignature;
    lastTimelineTailRef.current = tailSignature;

    // 메시지 목록 끝이 바뀌지 않은 리렌더(예: setShowScrollToLatest 등 다른 상태 변화로 인한
    // 재렌더)에서는 스크롤을 건드리지 않는다. 콘텐츠 높이 변화(이미지 로딩 등)는
    // ResizeObserver가 별도로 처리한다.
    if (!tailChanged) {
      layoutScrollHandledRef.current = false;
      return;
    }

    // useLayoutEffect가 이미 방 전환 스크롤을 처리했으면 중복 스크롤 생략
    if (layoutScrollHandledRef.current) {
      layoutScrollHandledRef.current = false;
      return;
    }

    const isPending = String(pendingBottomAlignRoomIdRef.current || '') === String(selectedRoomId);
    if (isPending) {
      return;
    }

    const isOwnNewestMessage = String(lastMessage?.sender_id) === String(effectiveChatUserId || user?.id || '');
    const shouldStick =
      isNearBottomRef.current ||
      String(lastMessage?.id || '').startsWith('temp-') ||
      (tailChanged && isOwnNewestMessage);
    if (shouldStick) {
      const behavior = isOwnNewestMessage ? 'smooth' as const : 'auto' as const;
      const capturedRoomId = selectedRoomId;
      requestAnimationFrame(() => {
        if (String(selectedRoomIdRef.current || '') !== String(capturedRoomId)) return;
        scrollToBottom(behavior);
      });
    } else {
      if (String(pendingBottomAlignRoomIdRef.current || '') === String(selectedRoomId)) {
        pendingBottomAlignRoomIdRef.current = null;
      }
      setShowScrollToLatest(true);
    }
  }, [effectiveChatUserId, isRoomInSelectedConversation, isSelectedRoomTimelineReady, messages, scrollToBottom, selectedRoomId, user?.id]);

  const shouldKeepBottomAligned = useCallback(() => {
    const activeRoomId = String(selectedRoomIdRef.current || selectedRoomId || '');
    if (!activeRoomId || !isSelectedRoomTimelineReady) return false;
    if (suppressBottomAlignmentUntilRef.current > Date.now()) return false;
    const pendingBottomAlignRoomId = String(pendingBottomAlignRoomIdRef.current || '');
    const isBottomAlignHoldActive =
      pendingBottomAlignHoldUntilRef.current > Date.now() &&
      pendingBottomAlignRoomId === activeRoomId;
    return (
      isNearBottomRef.current ||
      pendingBottomAlignRoomId === activeRoomId ||
      isBottomAlignHoldActive
    );
  }, [isSelectedRoomTimelineReady, selectedRoomId]);

  const handleTimelineMediaLoad = useCallback(() => {
    const activeRoomId = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!activeRoomId) return;

    if (suppressBottomAlignmentUntilRef.current > Date.now()) {
      const lastScrolledMsgId = lastScrolledMsgIdRef.current;
      if (lastScrolledMsgId && msgRefs.current[lastScrolledMsgId]) {
        msgRefs.current[lastScrolledMsgId]?.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
      }
    }

    if (!shouldKeepBottomAligned()) return;
    if (timelineMediaLoadFrameRef.current !== null) return;

    timelineMediaLoadFrameRef.current = window.requestAnimationFrame(() => {
      timelineMediaLoadFrameRef.current = null;
      if (String(selectedRoomIdRef.current || '') !== activeRoomId) return;
      if (!shouldKeepBottomAligned()) return;
      scrollToBottom('auto');
    });
  }, [scrollToBottom, selectedRoomId, shouldKeepBottomAligned, lastScrolledMsgIdRef, msgRefs]);

  useEffect(() => {
    return () => {
      if (timelineMediaLoadFrameRef.current === null) return;
      window.cancelAnimationFrame(timelineMediaLoadFrameRef.current);
      timelineMediaLoadFrameRef.current = null;
    };
  }, []);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(String(m.id))),
    [messages, pinnedIds]
  );

  const noticeMessages = useMemo(
    () => (persistedPinnedMessages.length > 0 ? persistedPinnedMessages : pinnedMessages),
    [persistedPinnedMessages, pinnedMessages]
  );

  const bookmarkedMessages = useMemo(
    () =>
      [...messages]
        .filter((message) => !message.is_deleted && bookmarkedIds.has(String(message.id)))
        .sort(
          (left, right) =>
            toChatDate(right.created_at || 0).getTime() - toChatDate(left.created_at || 0).getTime(),
        ),
    [bookmarkedIds, messages],
  );

  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    if (selectedRoomId === NOTICE_ROOM_ID) return noticeRoomMembers;
    const room = chatRooms.find(( r: ChatRoom) => r.id === selectedRoomId);
    const memberIds = getEffectiveRoomMemberIds(room || null);
    if (!room || memberIds.length === 0) return [];
    return memberIds.map((id: string) => resolveRoomMemberProfile(room, id));
  }, [chatRooms, getEffectiveRoomMemberIds, noticeRoomMembers, resolveRoomMemberProfile, selectedRoomId]);

  const selectedRoomLabel = useChatSelectedRoomLabel({
    selectedRoom,
    allKnownStaffs,
    effectiveChatUserId,
    getRoomDisplayName });
  const selectedRoomPreference = selectedRoomId ? (roomPrefs[selectedRoomId] || {}) : {};
  const selectedRoomNotificationMode = useMemo(
    () => normalizeRoomNotificationMode(selectedRoomPreference.notifyMode),
    [selectedRoomPreference.notifyMode],
  );
  const selectedRoomNotificationKeyword = useMemo(
    () => normalizeRoomNotificationKeyword(selectedRoomPreference.notifyKeyword),
    [selectedRoomPreference.notifyKeyword],
  );

  const addableMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const currentMemberIds = new Set(normalizeMemberIds(selectedRoom.members));
    return allKnownStaffs
      .filter((staff: StaffMember) => isActiveChatMember(staff))
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

  const groupSelectableStaffs = useMemo(
    () =>
      allKnownStaffs.filter(
        (staff: StaffMember) =>
          String(staff.id) !== String(effectiveChatUserId || user?.id || '') &&
          isActiveChatMember(staff)
      ),
    [allKnownStaffs, effectiveChatUserId, user?.id]
  );

  const handleGroupNameChange = useCallback((value: string) => {
    setGroupName(value);
  }, []);

  const handleToggleGroupMember = useCallback((memberId: string, checked: boolean) => {
    setSelectedMembers((prev) => {
      if (checked) {
        return prev.includes(memberId) ? prev : [...prev, memberId];
      }
      return prev.filter((id) => id !== memberId);
    });
  }, []);

  const handleAddMemberSearchChange = useCallback((value: string) => {
    setAddMemberSearch(value);
  }, []);

  const handleToggleAddMemberSelection = useCallback((memberId: string, checked: boolean) => {
    setAddMemberSelectingIds((prev) => {
      if (checked) {
        return prev.includes(memberId) ? prev : [...prev, memberId];
      }
      return prev.filter((id) => id !== memberId);
    });
  }, []);

  const {
    visibleRooms,
    roomLabelMap,
    sidebarRoomItems,
    visibleRoomIds,
    forwardTargetRoomItems } = useChatSidebarState({
    chatRooms,
    selectedRoomId,
    selectedRoom,
    setRoom,
    isRoomAccessibleToCurrentUser,
    allKnownStaffs,
    allKnownStaffMap,
    effectiveChatUserId,
    resolveStaffProfile,
    isStaffCurrentlyOnline,
    deferredOmniSearch,
    showHiddenRooms,
    roomPrefs,
    pinnedRoomOrder,
    setPinnedRoomOrder,
    roomPrefsUserId,
    roomUnreadCounts });
  const {
    dialog: roomActionDialog,
    handleLeaveRoom,
    removeRoomMember,
    handleLeaveRoomFromDrawer,
    handleSaveRoomName,
    handleStartEditingRoomName,
    handleCancelEditingRoomName,
    createGroupChat,
    openDirectChat,
    handleSubmitAddMembers } = useChatRoomManagement({
    addMemberSelectingIds,
    closeAddMemberModal,
    closeGroupModal,
    effectiveChatUserId,
    fetchData,
    groupName,
    repairDirectRooms,
    resolveRoomMemberProfile,
    resolveStaffProfile,
    roomNameDraft,
    selectedMembers,
    selectedRoom,
    setAddMemberSelectingIds,
    setChatRooms,
    setEditingRoomName,
    setGroupName,
    setRoom,
    setRoomNameDraft,
    setRoomUnreadCounts,
    setSelectedMembers,
    setShowDrawer,
    setViewMode,
    triggerChatPush,
    user });
  const {
    showGlobalSearch,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchTab,
    setGlobalSearchTab,
    globalSearchResults,
    globalSearchLoading,
    globalSearchMemberResults,
    globalSearchRoomResults,
    globalSearchMessageResults,
    globalSearchFileResults,
    globalSearchCounts,
    savedSearches,
    closeGlobalSearch,
    openGlobalSearch,
    transientHighlightQuery,
    openGroupFromGlobalSearch,
    openRoomFromGlobalSearch,
    openMemberFromGlobalSearch,
    handleGlobalSearch,
    saveCurrentSearch,
    removeSavedSearch,
    applySavedSearch } = useChatGlobalSearch({
    allKnownStaffs,
    effectiveChatUserId,
    resolveStaffProfile,
    setShowGroupModal,
    selectedRoomIdRef,
    pendingScrollMsgIdRef,
    messages,
    scrollToMessage,
    setRoom,
    openDirectChat,
    visibleRooms,
    visibleRoomIds,
    roomLabelMap,
    roomPrefs,
    roomPrefsUserId });
  const {
    editingMessage,
    editingMessageDraft,
    editHistoryTarget,
    editHistoryEntries,
    editHistoryLoading,
    setEditingMessageDraft,
    startEditMessage,
    closeEditingMessage,
    openEditHistory,
    closeEditHistory,
    saveEditedMessage } = useChatMessageEditing({
    currentUserId: effectiveChatUserId,
    fallbackUserId: user?.id,
    auditUserId: user?.id,
    auditUserName: user?.name,
    isMso,
    selectedRoomId,
    fetchData,
    syncRoomSummaryFromMessages,
    setMessages,
    setPersistedPinnedMessages });
  closeEditingMessageRef.current = closeEditingMessage;
  closeEditHistoryRef.current = closeEditHistory;
  const closeMobileChatBackLayer = useChatMobileBackLayer({
    attachmentPreviewOpen: Boolean(attachmentPreview),
    closeAttachmentPreview,
    activeActionMsg,
    setActiveActionMsg,
    threadRoot,
    setThreadRoot,
    editHistoryTarget,
    closeEditHistory,
    reactionDetailTarget,
    setReactionDetailTarget,
    unreadModalMsg,
    closeReadStatusModal,
    showForwardModal,
    forwardSourceMsg,
    closeForwardModal,
    showAddMemberModal,
    closeAddMemberModal,
    showMediaPanel,
    setShowMediaPanel,
    showPollModal,
    closePollModal,
    showDrawer,
    setShowDrawer,
    showGlobalSearch,
    closeGlobalSearch,
    showGroupModal,
    closeGroupModal });
  closeMobileChatBackLayerRef.current = closeMobileChatBackLayer;
  const typingNoticeText = useChatTypingNoticeText(typingUsers);
  const openDateJumpPicker = useCallback((dateKey?: string) => {
    const normalizedDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))
      ? String(dateKey)
      : formatChatLocalDateKey(new Date().toISOString());
    setDateJumpValue(normalizedDateKey);
    setDateJumpError('');
    setDateJumpPickerOpen(true);
  }, []);

  const closeDateJumpPicker = useCallback(() => {
    setDateJumpPickerOpen(false);
    setDateJumpError('');
  }, []);

  const handleDateJumpSubmit = useCallback((dateKey: string) => {
    const normalizedDateKey = String(dateKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) {
      setDateJumpError('이동할 날짜를 선택해주세요.');
      return;
    }

    const targetMessage = [...messages]
      .filter((message) => {
        if (!isRoomInSelectedConversation(message.room_id)) return false;
        return formatChatLocalDateKey(message.created_at) === normalizedDateKey;
      })
      .sort(
        (left, right) =>
          toChatDate(left.created_at || 0).getTime() - toChatDate(right.created_at || 0).getTime(),
      )[0];

    if (!targetMessage?.id) {
      setDateJumpError('해당 날짜의 메시지가 없습니다.');
      return;
    }

    closeDateJumpPicker();
    scrollToMessage(String(targetMessage.id));
  }, [closeDateJumpPicker, isRoomInSelectedConversation, messages, scrollToMessage]);

  const { selectedPeer, selectedPeerPhotoUrl, selectedPeerIsOnline } = useChatSelectedPeerState({
    selectedRoom,
    roomMembers,
    effectiveChatUserId,
    resolveStaffProfile,
    isStaffCurrentlyOnline });
  const realtimeConnectionMeta = useRealtimeConnectionMeta(
    selectedRoomId,
    globalRealtimeState,
    roomRealtimeState,
  );

  const resolveThreadRootForMessage = useCallback(
    (message: ChatMessage) => resolveThreadRootMessageFromList(message, messages) || message,
    [messages],
  );
  const threadSummaries = useThreadSummaries(messages, effectiveChatUserId);
  const threadOverviews = useThreadOverviews(messages, effectiveChatUserId);
  const attentionThreadItems = useMemo(
    () =>
      threadOverviews
        .filter((thread) => thread.needsAttention)
        .slice(0, 6)
        .map((thread) => {
          const latestMessage = thread.latestMessage;
          const latestSender =
            resolveStaffProfile(latestMessage.sender_id, latestMessage.sender_name) ||
            (latestMessage.staff as StaffMember | undefined) ||
            null;
          return {
            id: `attention-${thread.rootId}`,
            roomId: String(latestMessage.room_id || selectedRoomId || ''),
            messageId: String(latestMessage.id || thread.rootId),
            threadRootId: thread.rootId,
            roomName: selectedRoomLabel || '채팅방',
            senderName: String(latestSender?.name || '알 수 없음').trim() || '알 수 없음',
            body:
              getMessageDisplayText(
                latestMessage.content,
                latestMessage.file_name,
                latestMessage.file_url,
                '스레드 답글',
              ).replace(/\s+/g, ' ').trim() || '스레드 답글',
            createdAt: String(latestMessage.created_at || thread.rootMessage.created_at || ''),
            unread: true,
            followed: followedThreadIds.has(thread.rootId) } satisfies MessengerThreadInboxItem;
        }),
    [followedThreadIds, resolveStaffProfile, selectedRoomId, selectedRoomLabel, threadOverviews],
  );
  const threadMessages = useThreadMessages(threadRoot, messages);
  const openThreadShortcutItem = useCallback(
    (item: Pick<MessengerThreadInboxItem, 'roomId' | 'messageId' | 'threadRootId'>) => {
      pendingThreadRootIdRef.current = item.threadRootId;
      openRoomAtMessage(item.roomId, item.messageId);
    },
    [openRoomAtMessage],
  );
  const handleOpenMentionInboxItem = useCallback((item: MessengerMentionInboxItem) => {
    openRoomAtMessage(item.roomId, item.messageId);

    if (!effectiveChatUserId || !item.unread) return;

    const readAt = new Date().toISOString();
    setMentionInboxItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? { ...entry, unread: false }
          : entry,
      ),
    );

    void d1.from('notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('user_id', effectiveChatUserId)
      .is('read_at', null)
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notification-read'));
        }
      });
  }, [effectiveChatUserId, openRoomAtMessage]);
  const handleOpenThreadInboxItem = useCallback((item: MessengerThreadInboxItem) => {
    openThreadShortcutItem(item);

    if (!effectiveChatUserId || !item.unread) return;

    const readAt = new Date().toISOString();
    setThreadInboxItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? { ...entry, unread: false }
          : entry,
      ),
    );

    void d1.from('notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('user_id', effectiveChatUserId)
      .is('read_at', null)
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notification-read'));
        }
      });
  }, [effectiveChatUserId, openThreadShortcutItem]);
  const handleOpenAttentionThreadItem = useCallback((item: MessengerThreadInboxItem) => {
    openThreadShortcutItem(item);
  }, [openThreadShortcutItem]);

  const openReactionDetail = useCallback((message: ChatMessage, emoji: string) => {
    setReactionDetailTarget({ message, emoji });
  }, []);

  const handleOpenPollModalFromDrawer = useCallback(() => {
    openPollModal();
    setShowDrawer(false);
  }, [openPollModal]);
  const handleOpenPollModalFromHeader = useCallback(() => {
    openPollModal();
  }, [openPollModal]);
  const handleOpenApprovalDraftFromHeader = useCallback(() => {
    openSlashDraftFromText('/연차');
  }, [openSlashDraftFromText]);
  const handleToggleRoomNotifyFromDrawer = useCallback(async () => {
    if (!selectedRoomId) return;
    const willEnable = !roomNotifyOn;
    await toggleRoomNotify();
    updateRoomPreference(selectedRoomId, {
      notifyMode: willEnable
        ? (selectedRoomNotificationMode === 'mute' ? 'all' : selectedRoomNotificationMode)
        : 'mute' });
  }, [
    roomNotifyOn,
    selectedRoomId,
    selectedRoomNotificationMode,
    toggleRoomNotify,
    updateRoomPreference,
  ]);
  const handleSelectRoomNotificationMode = useCallback((mode: 'all' | 'mention_only' | 'keyword' | 'mute') => {
    if (!selectedRoomId) return;
    updateRoomPreference(selectedRoomId, {
      notifyMode: mode,
      notifyKeyword:
        mode === 'keyword'
          ? normalizeRoomNotificationKeyword(selectedRoomNotificationKeyword)
          : selectedRoomNotificationKeyword });
  }, [selectedRoomId, selectedRoomNotificationKeyword, updateRoomPreference]);
  const handleRoomNotificationKeywordChange = useCallback((value: string) => {
    if (!selectedRoomId) return;
    updateRoomPreference(selectedRoomId, {
      notifyMode: 'keyword',
      notifyKeyword: normalizeRoomNotificationKeyword(value) });
  }, [selectedRoomId, updateRoomPreference]);
  const { handleSendMessage, sendWardQuickReply, retryFailedMessage, retryAllFailedMessages } = useChatMessageSending({
    selectedRoomId,
    selectedRoom,
    visibleRoomIds,
    effectiveChatUserId,
    user,
    replyTo,
    canWriteNotice,
    selectedRoomIdRef,
    inputMsgRef,
    draftMapRef,
    deliveryStatesRef,
    typingClearRef,
    wardQuickReplySendingMessageId,
    setRoom,
    setInputMsg,
    setReplyTo,
    setMessages,
    setDeliveryStates,
    setChatRooms,
    setWardQuickReplySendingMessageId,
    scrollToBottom,
    broadcastChatSync,
    emitTypingState,
    triggerChatPush,
    openSlashDraftFromText });
  useEffect(() => {
    if (!retryQueueActorId || !selectedRoomId || typeof window === 'undefined') return;

    const flushDueRetryQueue = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const dueEntries = getDueChatRetryQueueEntries(retryQueueActorId, [selectedRoomId])
        .filter((entry) => deliveryStatesRef.current[entry.id]?.status === 'failed');
      if (!dueEntries.length) return;
      void retryAllFailedMessages(dueEntries.map((entry) => entry.id));
    };

    flushDueRetryQueue();
    const intervalId = window.setInterval(flushDueRetryQueue, 5000);
    window.addEventListener('online', flushDueRetryQueue);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', flushDueRetryQueue);
    };
  }, [retryAllFailedMessages, retryQueueActorId, selectedRoomId]);
  const {
    pendingAlbumFiles,
    albumPreviewUrls,
    pendingAttachmentFiles,
    failedAttachmentRetryEntries,
    fileUploading,
    confirmPendingAttachmentUpload,
    cancelPendingAttachmentUpload,
    removePendingAttachmentFile,
    handleAlbumFileSelect,
    removeAlbumFile,
    cancelAlbumUpload,
    sendAlbum,
    handleComposerPaste,
    queueDroppedFiles,
    handleAttachmentSelect,
    retryFailedAttachmentUpload,
    retryAllFailedAttachmentUploads,
    dismissFailedAttachmentUpload,
    clearAllFailedAttachmentUploads } = useChatUploads({
    selectedRoomId,
    actorId: roomPrefsUserId,
    replyToId: replyTo?.id ? String(replyTo.id) : null,
    shareTarget,
    onConsumeShareTarget,
    inputMsgRef,
    setInputMsg,
    handleSendMessage,
    scrollToBottom });

  useEffect(() => {
    if (!selectedRoomId) return;
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        return;
      }
      handleComposerPaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [selectedRoomId, handleComposerPaste]);

  const groupedStaffs = useChatGroupedStaffs(allKnownStaffs);
  const {
    mediaMessages,
    filteredMediaMessages,
    currentNoticeMessage,
    sharedMediaPreviewMessages,
    sharedFilePreviewMessages,
    sharedLinkPreviewMessages,
    openMediaArchive,
    openAttachmentPreviewForMessage } = useChatMediaPreviewState({
    messages,
    noticeMessages,
    mediaFilter,
    setMediaFilter,
    setShowDrawer,
    setShowMediaPanel,
    buildAttachmentPreviewItem,
    openAttachmentPreviewGallery,
    openAttachmentPreview });
  const noticeReadStats = useMemo(() => {
    const audienceMembers = roomMembers.filter(
      (member): member is StaffMember =>
        Boolean(member?.id) && String(member.id) !== String(currentNoticeMessage?.sender_id || ''),
    );

    if (!currentNoticeMessage?.id || !currentNoticeMessage.created_at) {
      return {
        readCount: 0,
        unreadCount: 0,
        recipientCount: audienceMembers.length,
        unreadMembers: [] as StaffMember[] };
    }

    const unreadMembers = audienceMembers.filter(
      (member) => !isMessageReadByCursor(currentNoticeMessage.created_at, roomReadCursorMap[String(member.id)]),
    );

    return {
      readCount: Math.max(0, audienceMembers.length - unreadMembers.length),
      unreadCount: unreadMembers.length,
      recipientCount: audienceMembers.length,
      unreadMembers };
  }, [currentNoticeMessage, roomMembers, roomReadCursorMap]);
  const openCurrentNoticeReadStatus = useCallback(() => {
    if (!currentNoticeMessage) return;
    void loadReadStatusForMessage(currentNoticeMessage);
  }, [currentNoticeMessage, loadReadStatusForMessage]);
  const handleJumpToNoticeMessage = useCallback(() => {
    if (!currentNoticeMessage?.id) return;
    setShowDrawer(false);
    scrollToMessage(String(currentNoticeMessage.id));
  }, [currentNoticeMessage, scrollToMessage]);
  const handleSendNoticeReminder = useCallback(async () => {
    if (!selectedRoom?.id || !currentNoticeMessage?.id) return;
    if (noticeReadStats.unreadMembers.length === 0) {
      toast('이미 전원이 상단 공지를 확인했습니다.', 'warning');
      return;
    }

    const previewText = getMessageDisplayText(
      currentNoticeMessage.content,
      currentNoticeMessage.file_name,
      currentNoticeMessage.file_url,
      '상단 공지',
    ).replace(/\s+/g, ' ').trim();

    setNoticeReminderBusy(true);
    try {
      const payload = noticeReadStats.unreadMembers.map((member) => ({
        user_id: member.id,
        type: 'message',
        title: `${selectedRoomLabel || '채팅방'} 공지 리마인드`,
        body: previewText
          ? `${previewText.slice(0, 80)}${previewText.length > 80 ? '...' : ''}`
          : '상단 공지를 확인해 주세요.',
        read_at: null,
        metadata: buildChatNotificationMetadata({
          roomId: String(selectedRoom.id),
          messageId: String(currentNoticeMessage.id),
          notificationType: 'message',
          extra: {
            reminder_kind: 'pinned_notice',
            room_name: selectedRoomLabel || null } }) }));

      const { error } = await d1.from('notifications').insert(payload);
      if (error) throw error;
      toast(`${noticeReadStats.unreadMembers.length}명에게 공지 리마인드를 보냈습니다.`, 'success');
    } catch (error) {
      logger.error('send notice reminder failed', error);
      toast('공지 리마인드 발송에 실패했습니다.', 'error');
    } finally {
      setNoticeReminderBusy(false);
    }
  }, [currentNoticeMessage, noticeReadStats.unreadMembers, selectedRoom, selectedRoomLabel]);

  useScheduledNoticeDispatcher({
    allKnownStaffs,
    canManageNoticeOps,
    currentUserId: user?.id,
    fetchDataRef,
    fetchMessageByIdWithRetry,
    roomPrefsUserId,
    triggerChatPush });

  const mentionCandidates = useChatMentionCandidates({
    showMentionList,
    mentionQuery,
    roomMembers,
    staffs });

  const {
    dialog: messageActionDialog,
    toggleReaction,
    togglePin,
    toggleBookmark,
    markMessageRead,
    deleteMessage } = useChatMessageActions({
    currentUserId: effectiveChatUserId,
    fallbackUserId: user?.id,
    effectiveTodoUserId,
    selectedRoomId,
    selectedRoom,
    isMso,
    pinnedIds,
    bookmarkedIds,
    chatRoomsRef,
    setPinnedIds,
    setBookmarkedIds,
    setMessages,
    setPersistedPinnedMessages,
    fetchData,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshReadCursorsForRoom,
    syncRoomSummaryFromMessages,
    persistRoomReadCursors,
    broadcastChatSync,
    auditUserId: user?.id,
    auditUserName: user?.name });

  // 타임라인/컴포저 props 안정화 콜백 (입력 시 매 키마다 발생하는
  // 부모 re-render 영향으로 memo()가 무효화되는 것을 막기 위함)
  const closeMessageActions = useCallback(() => {
    setActiveActionMsg(null);
  }, []);
  const handleTimelineToggleReaction = useCallback(
    (message: ChatMessage, emoji: string) => {
      void toggleReaction(String(message.id), emoji);
    },
    [toggleReaction],
  );
  const handleTimelineTogglePin = useCallback(
    (message: ChatMessage) => {
      void togglePin(String(message.id));
    },
    [togglePin],
  );
  const handleTimelineToggleBookmark = useCallback(
    (message: ChatMessage) => {
      void toggleBookmark(String(message.id));
    },
    [toggleBookmark],
  );
  const handleCloseReply = useCallback(() => {
    setReplyTo(null);
  }, []);
  const handleScrollToLatest = useCallback(() => {
    scrollToBottom('smooth');
  }, [scrollToBottom]);
  const selectedRoomIdForRetry = selectedRoomId;
  const handleRetryAllFailedAttachmentsForRoom = useCallback(
    () => retryAllFailedAttachmentUploads(selectedRoomIdForRetry),
    [retryAllFailedAttachmentUploads, selectedRoomIdForRetry],
  );

  const {
    activeMessageHighlightQuery,
    combinedTimeline } = useChatTimelineItems({
    messages,
    polls,
    selectedRoomId,
    deferredChatSearch,
    transientHighlightQuery,
    effectiveChatUserId });
  const failedMessageIdsInSelectedRoom = useMemo(
    () =>
      messages
        .filter((message) =>
          selectedRoomId &&
          String(message.room_id || '') === String(selectedRoomId) &&
          deliveryStates[String(message.id)]?.status === 'failed',
        )
        .map((message) => String(message.id)),
    [deliveryStates, messages, selectedRoomId],
  );

  const {
    openMessageActions,
    addTaskFromMessage,
    startReplyToMessage,
    startForwardMessage,
    handleForwardToRoom,
    openReadStatusPanel,
    openThreadPanel,
    deleteMessageFromActions } = useChatMessageWorkflow({
    activeActionMsg,
    effectiveTodoUserId,
    effectiveChatUserId,
    fallbackUserId: user?.id,
    forwardSourceMsg,
    composerRef,
    onRefresh,
    closeForwardModal,
    setActiveActionMsg,
      setReplyTo,
      setForwardSourceMsg,
      setShowForwardModal,
      setThreadRoot,
      resolveThreadRootMessage: resolveThreadRootForMessage,
      markMessageRead,
      loadReadStatusForMessage,
    deleteMessage,
    triggerChatPush });
  const openTrackedThreadPanel = useCallback((message: ChatMessage) => {
    const resolvedRoot = resolveThreadRootForMessage(message);
    const rootId = String(resolvedRoot.id || message.id || '').trim();
    if (rootId) {
      persistThreadPreferences({
        ...threadPrefs,
        [rootId]: {
          ...(threadPrefs[rootId] || {}),
          lastOpenedAt: new Date().toISOString() } });
    }
    openThreadPanel(message);
  }, [openThreadPanel, persistThreadPreferences, resolveThreadRootForMessage, threadPrefs]);

  const toggleThreadFollow = useCallback((message: ChatMessage) => {
    const resolvedRoot = resolveThreadRootForMessage(message);
    const rootId = String(resolvedRoot.id || message.id || '').trim();
    if (!rootId) return;

    const currentPreference = threadPrefs[rootId] || {};
    const nextFollowed = currentPreference.followed !== true;
    const nextPreferences = {
      ...threadPrefs,
      [rootId]: {
        ...currentPreference,
        followed: nextFollowed,
        lastOpenedAt: new Date().toISOString() } };
    persistThreadPreferences(nextPreferences);
    toast(nextFollowed ? '이 스레드 알림을 켰습니다.' : '이 스레드 알림을 껐습니다.', 'success');
  }, [persistThreadPreferences, resolveThreadRootForMessage, threadPrefs]);
  useEffect(() => {
    const targetThreadRootId = pendingThreadRootIdRef.current;
    if (!targetThreadRootId || messages.length === 0) return;

    const targetMessage =
      messages.find((message) => String(message.id) === targetThreadRootId) ||
      messages.find((message) => String(message.id) === String(pendingScrollMsgIdRef.current || '').trim());
    if (!targetMessage) return;

    pendingThreadRootIdRef.current = null;
    setTimeout(() => {
      openTrackedThreadPanel(targetMessage);
    }, 150);
  }, [messages, openTrackedThreadPanel]);
  const handleOpenThreadFromDrawer = useCallback((message: ChatMessage) => {
    setShowDrawer(false);
    openTrackedThreadPanel(message);
  }, [openTrackedThreadPanel]);
  const handleCopyMessageLink = useCallback(async (message: ChatMessage) => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams({
      open_menu: '채팅',
      open_chat_room: String(message.room_id || ''),
      open_msg: String(message.id || '') });
    const baseUrl = `${window.location.origin}/main?${params.toString()}`;

    try {
      await navigator.clipboard.writeText(baseUrl);
      toast('메시지 링크를 복사했습니다.');
      setActiveActionMsg(null);
    } catch {
      toast('메시지 링크 복사에 실패했습니다.', 'error');
    }
  }, []);
  const handleOpenStaffProfile = useCallback(async (staff: StaffMember) => {
    setSelectedStaffForModal(staff);
    setSelectedStaffPresence(null);
    setIsLoadingPresence(true);
    try {
      const todayKey = toDateKey(new Date());
      const [attRes, legacyAttRes] = await Promise.allSettled([
        db
          .from('attendance')
          .select('staff_id, date, check_in, check_out, status')
          .eq('date', todayKey)
          .eq('staff_id', staff.id)
          .maybeSingle(),
        db
          .from('attendances')
          .select('staff_id, work_date, check_in_time, check_out_time, status')
          .eq('work_date', todayKey)
          .eq('staff_id', staff.id)
          .maybeSingle(),
      ]);

      let snapshot: AttendanceSnapshot | null = null;
      if (attRes.status === 'fulfilled' && attRes.value.data) {
        snapshot = attRes.value.data as AttendanceSnapshot;
      }
      if (legacyAttRes.status === 'fulfilled' && legacyAttRes.value.data) {
        const row = legacyAttRes.value.data as AttendanceSnapshot;
        snapshot = {
          ...snapshot,
          ...row,
          staff_id: String(row.staff_id),
          date: snapshot?.date ?? row.work_date ?? todayKey };
      }

      setSelectedStaffPresence(getPresenceMeta(snapshot));
    } catch (e) {
      logger.warn('Failed to load attendance for staff profile:', e);
      setSelectedStaffPresence(getPresenceMeta(null));
    } finally {
      setIsLoadingPresence(false);
    }
  }, []);
  const handleManualRoomListClick = useCallback((roomId: string) => {
    clearPendingMessageScrollTimer();
    pendingScrollMsgIdRef.current = null;
    pendingThreadRootIdRef.current = null;
    suppressBottomAlignmentUntilRef.current = 0;
    handleRoomListClick(roomId);
  }, [clearPendingMessageScrollTimer, handleRoomListClick]);

  return (
    <div data-testid="chat-view" className="flex flex-1 min-h-0 overflow-hidden relative font-sans bg-[var(--background)] md:h-[100dvh] md:max-h-[100dvh] md:bg-[var(--card)]">
        {roomActionDialog}
        {messageActionDialog}
        <MessengerSidebar
          selectedRoomId={selectedRoomId}
          viewMode={viewMode}
          showHiddenRooms={showHiddenRooms}
          sidebarRoomItems={sidebarRoomItems}
          attentionThreadItems={attentionThreadItems}
          mentionInboxItems={mentionInboxItems}
          threadInboxItems={threadInboxItems}
          groupedStaffs={groupedStaffs}
          expandedDepts={expandedDepts}
          onViewModeChange={setViewMode}
          onOpenGlobalSearch={openGlobalSearch}
          onToggleHiddenRooms={() => setShowHiddenRooms((prev) => !prev)}
          onRoomClick={handleManualRoomListClick}
          onOpenAttentionThreadItem={handleOpenAttentionThreadItem}
          onOpenMentionItem={handleOpenMentionInboxItem}
          onOpenThreadItem={handleOpenThreadInboxItem}
          onToggleRoomPinned={toggleRoomPinned}
          onMovePinnedRoom={movePinnedRoom}
          onToggleRoomHidden={toggleRoomHidden}
          onToggleDept={toggleDept}
          onOpenDirectChat={openDirectChat}
          onOpenGroupModal={user?.permissions?.chat_방생성 !== false ? () => setShowGroupModal(true) : undefined}
        />

      <main className={`${!selectedRoomId ? 'hidden md:flex' : 'flex'} flex-1 min-h-0 flex-col overflow-hidden bg-[var(--muted)] relative`}>
        {selectedRoomId && selectedRoom && (
          <ChatRoomHeader
            selectedRoom={selectedRoom}
            selectedPeer={selectedPeer}
            selectedRoomLabel={selectedRoomLabel}
            selectedPeerPhotoUrl={selectedPeerPhotoUrl}
            selectedPeerIsOnline={selectedPeerIsOnline}
            roomMembers={roomMembers}
            realtimeConnectionMeta={realtimeConnectionMeta}
            onBack={() => setRoom(null)}
            onOpenStaffProfile={handleOpenStaffProfile}
            onOpenPollModal={handleOpenPollModalFromHeader}
            onOpenApprovalDraft={handleOpenApprovalDraftFromHeader}
            onOpenMediaArchive={openMediaArchive}
            onOpenDrawer={() => setShowDrawer(true)}
          />
        )}

        <MessengerTimeline
          selectedRoomId={selectedRoomId}
          isLoadingMessages={Boolean(selectedRoomId && loadingRoomId === selectedRoomId)}
          messages={messages}
          combinedTimeline={combinedTimeline as MessengerTimelineItem[]}
          showScrollToLatest={showScrollToLatest}
            pollVotes={pollVotes}
            reactions={reactions}
            readCounts={readCounts}
            deliveryStates={deliveryStates}
            threadSummaries={threadSummaries}
            activeActionMessageId={activeActionMsg ? String(activeActionMsg.id) : null}
            pinnedIds={pinnedIds}
            bookmarkedIds={bookmarkedIds}
            roomMembers={roomMembers}
            effectiveChatUserId={effectiveChatUserId}
            activeMessageHighlightQuery={activeMessageHighlightQuery}
            wardQuickReplySendingMessageId={wardQuickReplySendingMessageId}
          messageRefs={msgRefs}
          messageListRef={messageListRef}
          scrollRef={scrollRef}
          resolveStaffProfile={resolveStaffProfile}
          onOpenStaffProfile={handleOpenStaffProfile}
          onScrollToMessage={scrollToMessage}
          onMessageListScroll={updateScrollPositionState}
            onVote={handleVote}
            onDrawPrize={handleDrawPollPrize}
            onOpenAttachmentPreviewForMessage={openAttachmentPreviewForMessage}
            onStartReplyToMessage={startReplyToMessage}
            onOpenThread={openTrackedThreadPanel}
            onOpenBoardPost={onOpenBoardPost}
            onOpenMessageActions={openMessageActions}
            onCloseMessageActions={closeMessageActions}
            onToggleReaction={handleTimelineToggleReaction}
            onAddTask={addTaskFromMessage}
            onTogglePin={handleTimelineTogglePin}
            onToggleBookmark={handleTimelineToggleBookmark}
            onForwardMessage={startForwardMessage}
            onDeleteMessage={deleteMessageFromActions}
            onStartEdit={startEditMessage}
            onOpenEditHistory={openEditHistory}
            onCopyMessageLink={handleCopyMessageLink}
            onOpenReadStatusPanel={openReadStatusPanel}
            onOpenThreadPanel={openTrackedThreadPanel}
            onMarkMessageRead={markMessageRead}
            renderMessageContent={renderMessageContent}
            onOpenAttachmentPreview={openAttachmentPreview}
            onOpenReactionDetail={openReactionDetail}
          onLoadReadStatus={loadReadStatusForMessage}
          onSendWardQuickReply={sendWardQuickReply}
          onRetryFailedMessage={retryFailedMessage}
          onScrollToBottom={scrollToBottom}
          shouldKeepBottomAligned={shouldKeepBottomAligned}
          onMediaLoad={handleTimelineMediaLoad}
          onOpenDateJump={openDateJumpPicker}
          ensureVisibleMessageId={timelineEnsureMessageId}
          hasOlderMessages={hasOlderMessages}
          loadingOlderMessages={loadingOlderMessages}
          onLoadOlderMessages={() => { void loadOlderMessages(); }}
        />

        <TypingNotice text={typingNoticeText} />

        {selectedRoomId && selectedRoom ? (
          <>
            <RetryQueueBanner
              failedCount={failedMessageIdsInSelectedRoom.length}
              onRetryAll={() => { void retryAllFailedMessages(failedMessageIdsInSelectedRoom); }}
            />
            <MessengerComposer
              ref={composerControlRef}
              replyTo={replyTo}
              canAttachFile={user?.permissions?.chat_파일첨부 !== false}
              pendingAlbumFiles={pendingAlbumFiles}
              albumPreviewUrls={albumPreviewUrls}
              pendingAttachmentFiles={pendingAttachmentFiles}
              failedAttachmentRetryEntries={failedAttachmentRetryEntries.filter((entry) => String(entry.roomId) === String(selectedRoomId))}
              fileUploading={fileUploading}
              selectedRoomId={selectedRoomId}
              canWriteNotice={canWriteNotice}
              composerRef={composerRef}
              inputMsgRef={inputMsgRef}
              showScrollToLatest={showScrollToLatest}
              showMentionList={showMentionList}
              mentionCandidates={mentionCandidates}
              onCloseReply={handleCloseReply}
              onCancelAlbumUpload={cancelAlbumUpload}
              onRemoveAlbumFile={removeAlbumFile}
              onSendAlbum={sendAlbum}
              onCancelPendingAttachmentUpload={cancelPendingAttachmentUpload}
              onRemovePendingAttachmentFile={removePendingAttachmentFile}
              onConfirmPendingAttachmentUpload={confirmPendingAttachmentUpload}
              onRetryFailedAttachmentUpload={retryFailedAttachmentUpload}
              onRetryAllFailedAttachmentUploads={handleRetryAllFailedAttachmentsForRoom}
              onDismissFailedAttachmentUpload={dismissFailedAttachmentUpload}
              onClearAllFailedAttachmentUploads={clearAllFailedAttachmentUploads}
              onAttachmentSelect={handleAttachmentSelect}
              onAlbumFileSelect={handleAlbumFileSelect}
              onQueueDroppedFiles={queueDroppedFiles}
              onComposerChange={handleComposerChange}
              onComposerPaste={handleComposerPaste}
              onSendMessage={handleSendMessage}
              onScrollToLatest={handleScrollToLatest}
              onSelectMention={handleSelectMention}
              onOpenPollModal={handleOpenPollModalFromHeader}
              selectedRoomName={selectedRoomLabel || undefined}
            />
          </>
        ) : null}

        {showDrawer ? (
          <MessengerDrawer
            isOpen={showDrawer}
            roomNotifyOn={roomNotifyOn}
            currentNoticeMessage={currentNoticeMessage}
            noticeReadCount={noticeReadStats.readCount}
            noticeUnreadCount={noticeReadStats.unreadCount}
            noticeRecipientCount={noticeReadStats.recipientCount}
            noticeReminderBusy={noticeReminderBusy}
            threadOverviews={threadOverviews}
            followedThreadIds={followedThreadIds}
            roomNotificationMode={roomNotifyOn ? selectedRoomNotificationMode : 'mute'}
            roomNotificationKeyword={selectedRoomNotificationKeyword}
            sharedMediaPreviewMessages={sharedMediaPreviewMessages}
            sharedFilePreviewMessages={sharedFilePreviewMessages}
            sharedLinkPreviewMessages={sharedLinkPreviewMessages}
            bookmarkedMessages={bookmarkedMessages}
            roomMembers={roomMembers}
            selectedRoom={selectedRoom}
            currentUserId={effectiveChatUserId || user?.id}
            editingRoomName={editingRoomName}
            roomNameDraft={roomNameDraft}
            resolveRoomMemberProfile={resolveRoomMemberProfile}
            onOpenStaffProfile={handleOpenStaffProfile}
            onClose={() => setShowDrawer(false)}
            onToggleRoomNotify={handleToggleRoomNotifyFromDrawer}
            onSelectRoomNotificationMode={handleSelectRoomNotificationMode}
            onRoomNotificationKeywordChange={handleRoomNotificationKeywordChange}
            onOpenPollModal={handleOpenPollModalFromDrawer}
            onOpenOpsCenter={canManageNoticeOps ? () => {
              setShowDrawer(false);
              setShowSettings(true);
            } : null}
            onOpenMediaArchive={openMediaArchive}
            onPreviewMessage={openAttachmentPreviewForMessage}
            onReplyMessage={startReplyToMessage}
            onOpenThread={handleOpenThreadFromDrawer}
            onToggleThreadFollow={toggleThreadFollow}
            onScrollToMessage={scrollToMessage}
            onJumpToNoticeMessage={handleJumpToNoticeMessage}
            onOpenNoticeReadStatus={openCurrentNoticeReadStatus}
            onSendNoticeReminder={handleSendNoticeReminder}
            onOpenAddMemberModal={() => setShowAddMemberModal(true)}
            onRemoveRoomMember={removeRoomMember}
            onRoomNameDraftChange={setRoomNameDraft}
            onSaveRoomName={handleSaveRoomName}
            onCancelEditingRoomName={handleCancelEditingRoomName}
            onStartEditingRoomName={handleStartEditingRoomName}
            onLeaveRoom={handleLeaveRoomFromDrawer}
          />
        ) : null}

        {editingMessage ? (
          <MessageEditModal
            open
            draft={editingMessageDraft}
            onDraftChange={setEditingMessageDraft}
            onClose={closeEditingMessage}
            onSave={saveEditedMessage}
          />
        ) : null}

        {editHistoryTarget ? (
          <MessageEditHistoryModal
            open
            message={editHistoryTarget}
            loading={editHistoryLoading}
            entries={editHistoryEntries}
            onClose={closeEditHistory}
          />
        ) : null}

        {showGroupModal ? (
          <GroupChatModal
            open={showGroupModal}
            groupName={groupName}
            selectedMembers={selectedMembers}
            selectableStaffs={groupSelectableStaffs}
            onGroupNameChange={handleGroupNameChange}
            onToggleMember={handleToggleGroupMember}
            onClose={closeGroupModal}
            onCreate={createGroupChat}
          />
        ) : null}
      </main>

      {showPollModal ? (
        <PollComposerModal
          open={showPollModal}
          roomMembers={roomMembers}
          question={pollQuestion}
          options={pollOptions}
          deadlineAt={pollDeadlineAt}
          prizeEnabled={prizeEnabled}
          prizeWinnerCount={prizeWinnerCount}
          prizeName={prizeName}
          isKickPoll={isKickPoll}
          kickTargetId={kickTargetId}
          onQuestionChange={setPollQuestion}
          onDeadlineAtChange={setPollDeadlineAt}
          onOptionChange={handlePollOptionChange}
          onRemoveOption={handleRemovePollOption}
          onAddOption={handleAddPollOption}
          onPrizeEnabledChange={setPrizeEnabled}
          onPrizeWinnerCountChange={setPrizeWinnerCount}
          onPrizeNameChange={setPrizeName}
          onIsKickPollChange={setIsKickPoll}
          onKickTargetIdChange={setKickTargetId}
          onClose={closePollModal}
          onSubmit={handleCreatePoll}
        />
      ) : null}

      {showSlashModal ? (
        <SlashCommandModal
          open={showSlashModal}
          command={slashCommand}
          form={slashForm}
          onFieldChange={handleSlashFormFieldChange}
          onClose={closeSlashModal}
          onSubmitAnnualLeave={handleSubmitAnnualLeaveDraft}
          onSubmitPurchase={handleSubmitPurchaseDraft}
        />
      ) : null}

      {threadRoot ? (
        <ThreadPanel
          rootMessage={threadRoot}
          messages={threadMessages}
          resolveStaffProfile={resolveStaffProfile}
          isFollowingThread={Boolean(followedThreadIds.has(String(threadRoot.id || '')))}
          onClose={() => setThreadRoot(null)}
          onToggleFollowThread={toggleThreadFollow}
          onPreviewAttachment={openAttachmentPreviewForMessage}
          onReplyMessage={startReplyToMessage}
        />
      ) : null}

      {unreadModalMsg ? (
        <ReadStatusModal
          message={unreadModalMsg}
          loading={unreadLoading}
          unreadUsers={unreadUsers}
          readUsers={readUsers}
          onClose={closeReadStatusModal}
        />
      ) : null}

      {reactionDetailTarget ? (
        <ReactionDetailModal
          target={reactionDetailTarget}
          users={
            reactionUsersByMessage[String(reactionDetailTarget.message.id)]?.[reactionDetailTarget.emoji] || []
          }
          onClose={() => setReactionDetailTarget(null)}
        />
      ) : null}

      {showForwardModal && forwardSourceMsg ? (
        <ForwardMessageModal
          open
          targetRooms={forwardTargetRoomItems}
          onClose={closeForwardModal}
          onForward={handleForwardToRoom}
        />
      ) : null}

      {showAddMemberModal ? (
        <AddMemberModal
          open={showAddMemberModal}
          selectedRoom={selectedRoom}
          search={addMemberSearch}
          addableMembers={addableMembers}
          selectingIds={addMemberSelectingIds}
          onSearchChange={handleAddMemberSearchChange}
          onToggleMember={handleToggleAddMemberSelection}
          onClose={closeAddMemberModal}
          onSubmit={handleSubmitAddMembers}
        />
      ) : null}

      {showMediaPanel ? (
        <MediaArchivePanel
          open={showMediaPanel}
          mediaFilter={mediaFilter}
          filteredMediaMessages={filteredMediaMessages}
          onClose={() => setShowMediaPanel(false)}
          onFilterChange={setMediaFilter}
          onPreviewMessage={openAttachmentPreviewForMessage}
          onReplyMessage={startReplyToMessage}
        />
      ) : null}

      {showSettings ? (
        <MessengerOperationsCenter
          user={user}
          staffs={allKnownStaffs}
          selectedRoomId={selectedRoomId}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {showGlobalSearch ? (
        <GlobalSearchModal
          open={showGlobalSearch}
          query={globalSearchQuery}
          activeTab={globalSearchTab}
          loading={globalSearchLoading}
          counts={globalSearchCounts}
          memberResults={globalSearchMemberResults}
          roomResults={globalSearchRoomResults}
          messageResults={globalSearchMessageResults}
          fileResults={globalSearchFileResults}
          allResults={globalSearchResults}
          allKnownStaffs={allKnownStaffs}
          effectiveChatUserId={effectiveChatUserId}
          savedSearches={savedSearches}
          onClose={closeGlobalSearch}
          onQueryChange={setGlobalSearchQuery}
          onTabChange={setGlobalSearchTab}
          onSearchSubmit={(query) => handleGlobalSearch(query)}
          onSaveCurrentSearch={saveCurrentSearch}
          onApplySavedSearch={applySavedSearch}
          onRemoveSavedSearch={removeSavedSearch}
          onOpenGroup={openGroupFromGlobalSearch}
          onOpenMember={openMemberFromGlobalSearch}
          onOpenRoom={openRoomFromGlobalSearch}
          onPreviewAttachment={openAttachmentPreview}
        />
      ) : null}

      {dateJumpPickerOpen ? (
        <DateJumpModal
          open={dateJumpPickerOpen}
          value={dateJumpValue}
          error={dateJumpError}
          onValueChange={(value) => {
            setDateJumpValue(value);
            setDateJumpError('');
          }}
          onClose={closeDateJumpPicker}
          onSubmit={handleDateJumpSubmit}
        />
      ) : null}

      {attachmentPreview ? (
        <ChatAttachmentPreviewModal controller={attachmentPreviewController} />
      ) : null}

      {selectedStaffForModal ? (
        <StaffDetailModal
          staff={selectedStaffForModal}
          presence={selectedStaffPresence}
          isLoadingPresence={isLoadingPresence}
          onClose={() => setSelectedStaffForModal(null)}
          viewer={user}
        />
      ) : null}
    </div>
  );
}
