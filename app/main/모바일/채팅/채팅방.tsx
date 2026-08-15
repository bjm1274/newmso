'use client';

/**
 * SChatRoom — 모바일 채팅방.
 * 헤더(뒤로/제목/액션) + 메시지 버블 리스트 + 하단 컴포저.
 *
 * P0: 텍스트 전송 + 읽음 갱신 + 폴링
 * P1: 첨부 업로드(이미지/파일), 이모지 picker, 메시지 반응, 무한 스크롤
 *
 * 메시지 버블 렌더링은 ./메시지버블, 이모지 picker는 ./이모지피커, 반응 picker는 ./반응선택.
 * 데이터는 useChatMessagesForRoom + sendMobileTextMessage + sendMobileFileMessage + toggleMobileReaction.
 *
 * JM(< 500줄), JM2(필요한 effect만), JM3(toast), JM4(any 금지), JM6(button/aria-label).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type ChangeEvent } from 'react';
import type { ChatMessage, ChatRoom, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { pokeChannel, subscribeRealtime, type TableFilter } from '@/lib/realtime-bus';
import { logger } from '@/lib/logger';
import { buildStorageInlineUrl, buildStorageDownloadUrl } from '@/lib/object-storage-url';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import MSheet from '../공통/MSheet';
import {
  getRoomTitle,
  pickAvatarTone,
  sendMobileTextMessage,
  useChatMessagesForRoom,
  useMobileChatReadCounts,
  useChatStaffDirectory,
  type MobileChatRoom,
  type StaffDirectoryEntry } from './data-hooks';
import {
  normalizeMemberIds,
  isGroupChatRoom,
  isSelfChatRoom,
  getGroupChatRoomBadgeText,
  NOTICE_ROOM_ID,
  WARD_QUICK_REPLY_OPTIONS,
  extractWardMessageMeta } from '@/app/main/기능부품/메신저유틸';
import { useRoomNotificationSetting } from '@/app/main/기능부품/메신저구독훅';
import { useChatPresenceMap } from '@/app/main/hooks/useChatPresenceMap';
import { patchChatRoom } from '@/lib/chat-rooms-client';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import EmojiPicker from './이모지피커';
import BubbleList from './버블리스트';
import {
  MOBILE_CHAT_UPLOAD_ACCEPT,
  sendMobileFileMessage,
  validateMobileUploadTarget } from './업로드';
import { toggleMobileReaction } from './반응';
import {
  renameMobileRoom,
  editMobileMessage,
  addMobileRoomMembers,
  removeMobileRoomMember,
  createMobilePoll,
  voteMobilePoll,
  fetchRoomPolls,
  type RoomPollsResult } from './메시지액션';
import { ReactionDetailSheet, ReadStatusSheet } from './상세시트';
import { ThreadSheet } from './스레드시트';
import { AddMemberSheet } from './멤버관리시트';
import { PollComposerSheet, PollCard } from './투표';
import { MessageEditSheet } from './수정시트';
import { triggerChatPush as triggerMobileChatPush } from '@/lib/chat-push-client-trigger';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type SChatRoomProps = {
  user: ErpUser;
  room: ChatRoom;
  /** false면 members 폴백([]) 상태 — 나가기/멤버변경 차단 */
  membersReady?: boolean;
  onBack: () => void;
  /** Quick Switch — 채팅목록에서 패스스루. JM2: 중복 fetch 금지 */
  recentRooms?: MobileChatRoom[];
  onSwitchRoom?: (roomId: string) => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
  searchMessageId?: string | null;
};

const SCROLL_TOP_THRESHOLD_PX = 80;

export default function SChatRoom({ user, room, membersReady = true, onBack, recentRooms, onSwitchRoom, onOpenBoardPost, searchMessageId }: SChatRoomProps) {
  const userId = useResolvedStaffId(user as Record<string, unknown>);
  const userName = typeof user.name === 'string' ? user.name : '';
  const company = typeof user.company === 'string' ? user.company : null;
  const staffs = useChatStaffDirectory(company);
  const presenceMap = useChatPresenceMap(Boolean(userId));
  // 키보드 상승: tokens .m-chat-composer + MobileShell --m-kb-offset
  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    refresh,
    appendOptimistic,
    replaceOptimistic,
    removeOptimistic,
    jumpToMessage,
    searchMessageId: hookSearchMessageId } = useChatMessagesForRoom(String(room.id), userId);

  const activeSearchMessageId = hookSearchMessageId || searchMessageId;

  useEffect(() => {
    if (searchMessageId) {
      const alreadyLoaded = messages.some((m) => String(m.id) === String(searchMessageId));
      if (!alreadyLoaded) {
        void jumpToMessage(searchMessageId);
      }
    }
  }, [searchMessageId, jumpToMessage, messages.length]);

  const title = getRoomTitle(room, staffs, userId);
  const headerTone = pickAvatarTone(String(room.id) + title);
  const memberCount = normalizeMemberIds(room.members).length;

  const memberIds = useMemo(() => normalizeMemberIds(room.members), [room.members]);
  const selfRoom = useMemo(() => isSelfChatRoom(room, userId), [room, userId]);
  const isGroup = useMemo(() => isGroupChatRoom(room), [room]);
  const isNotice = String(room.id) === NOTICE_ROOM_ID;
  const peer = useMemo(() => 
    !isGroup && !isNotice && room.type === 'direct'
      ? selfRoom
        ? staffs.find((s) => String(s.id) === String(userId))
        : memberIds
            .map((memberId) => staffs.find((s) => String(s.id) === String(memberId)))
            .find((staff) => Boolean(staff) && String(staff!.id) !== String(userId)) || null
      : null
  , [isGroup, isNotice, room.type, selfRoom, staffs, userId, memberIds]);

  const peerPhotoUrl = peer ? peer.photo_url || peer.avatar_url : null;
  const peerName = peer ? peer.name : '';
  const isPeerOnline = peer?.id ? Boolean(presenceMap[String(peer.id)]) : false;
  const readCounts = useMobileChatReadCounts(String(room.id), messages, memberIds);

  /**
   * 공유된 사진·파일 목록.
   *
   * 예전에는 `messages.filter(m => m.file_url)` 로 **현재 화면에 로드된 메시지**만
   * 걸렀다. 모바일은 최근 20개(MESSAGES_LIMIT)만 먼저 불러오므로, 사진이 그 안에
   * 없으면 상세 패널의 공유 파일 칸이 **비어 있는 것처럼 보였다.** 파일이 없는 게
   * 아니라 아직 안 불러온 것이었는데, 화면은 "첨부된 항목이 없습니다" 라고 말했다.
   *
   * 이제 방 전체에서 첨부가 있는 메시지만 따로 조회한다. 패널을 열 때만 부르므로
   * 방 진입 비용은 늘지 않는다.
   */
  const ROOM_ATTACHMENTS_LIMIT = 200;
  const [roomAttachments, setRoomAttachments] = useState<ChatMessage[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const loadedAttachments = useMemo(
    () => messages.filter((m) => !!m.file_url).reverse(),
    [messages],
  );
  // 조회 전이거나 실패했을 때는 최소한 로드된 창에서 걸러낸 것이라도 보여준다.
  const attachments = roomAttachments.length > 0 ? roomAttachments : loadedAttachments;

  const memberProfiles = useMemo(() => {
    return memberIds
      .map((id) => staffs.find((s) => String(s.id) === String(id)))
      .filter(Boolean) as StaffDirectoryEntry[];
  }, [memberIds, staffs]);

  const loadRoomAttachments = useCallback(async () => {
    const roomId = String(room.id || '').trim();
    if (!roomId) return;
    setAttachmentsLoading(true);
    try {
      const { data, error } = await db
        .from('messages')
        .select('id, room_id, sender_id, sender_name, content, file_url, file_name, file_kind, created_at')
        .eq('room_id', roomId)
        .not('file_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(ROOM_ATTACHMENTS_LIMIT);
      if (error) throw error;
      setRoomAttachments(Array.isArray(data) ? (data as ChatMessage[]) : []);
    } catch (err) {
      // 실패해도 목록을 비우지 않는다 — 로드된 창 기준 폴백이 남는다.
      logger.warn('[mobile-chat] 공유 파일 조회 실패:', err);
    } finally {
      setAttachmentsLoading(false);
    }
  }, [room.id]);

  const [hasText, setHasText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  // Poll
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);

  // 메시지 수정 시트
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // 반응/읽음 상세 시트
  const [reactionDetailTarget, setReactionDetailTarget] = useState<ChatMessage | null>(null);
  const [readDetailTarget, setReadDetailTarget] = useState<ChatMessage | null>(null);
  // 스레드 시트
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const [threadSending, setThreadSending] = useState(false);
  // 투표
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [pollVoting, setPollVoting] = useState(false);
  const [pollData, setPollData] = useState<RoomPollsResult>({ polls: [], voteCounts: {}, myVotes: {} });
  // 방 이름 수정
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  // 멤버 추가 시트
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberMutating, setMemberMutating] = useState(false);

  // 대화방 알림 수신 토글 — PC 자산 재사용(room_notification_settings 서버 push 기준)
  const { roomNotifyOn, toggleRoomNotify } = useRoomNotificationSetting({
    selectedRoomId: String(room.id),
    effectiveChatUserId: userId,
    userId });

  // 공지/나와의채팅은 나갈 수 없음
  const canLeaveRoom = !isNotice && !selfRoom;
  // 이름 수정·멤버 관리는 그룹 대화방에만 노출(1:1·공지·나와의채팅은 PC와 동일하게 제외)
  const canRenameRoom = isGroup && !isNotice && !selfRoom;
  const canManageMembers = isGroup && !isNotice && !selfRoom;

  const handleLeaveRoom = useCallback(async () => {
    if (leaving) return;
    if (!canLeaveRoom) {
      setLeaveConfirmOpen(false);
      onBack();
      return;
    }
    if (!userId) {
      toast('로그인 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    // members 폴백([]) 상태에서 patch 하면 전 멤버 삭제 위험
    if (!membersReady || memberIds.length === 0) {
      toast('멤버 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'warning');
      return;
    }
    setLeaving(true);
    try {
      const newMembers = memberIds.filter((id) => String(id) !== String(userId));
      // 퇴장 안내는 멤버십 해제 전에 기록(서버 messages insert 멤버 검증 통과 필요)
      try {
        await sendMobileTextMessage({
          roomId: String(room.id),
          senderId: userId,
          content: `[퇴장] ${userName || '알 수 없음'}님이 채팅방을 나갔습니다.` });
      } catch (noticeError) {
        logger.warn('leave room system message error', noticeError);
      }
      const result = await patchChatRoom(String(room.id), { members: newMembers });
      if (!result.ok) {
        toast(result.error || '채팅방 나가기에 실패했습니다.', 'error');
        return;
      }
      setLeaveConfirmOpen(false);
      setInfoOpen(false);
      onBack();
    } finally {
      setLeaving(false);
    }
  }, [canLeaveRoom, leaving, memberIds, membersReady, onBack, room.id, userId, userName]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);

  // 새 메시지 도착 시 하단 스크롤. 단, 무한스크롤로 prepend된 경우는 스크롤 위치 유지.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const next = messages.length;
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = next;

    const alignToBottom = () => {
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    };

    if (prev === 0) {
      // 초기 로드
      alignToBottom();
      const frameId = window.requestAnimationFrame(alignToBottom);
      const nudgeTimers = [
        window.setTimeout(alignToBottom, 80),
        window.setTimeout(alignToBottom, 240)
      ];
      return () => {
        window.cancelAnimationFrame(frameId);
        nudgeTimers.forEach(window.clearTimeout);
      };
    }
    // 무한스크롤로 prepend 됐을 때 — 사용자가 보고 있던 메시지 유지
    if (loadingOlder) return;
    // 메시지 prepend 직후(loadOlder 완료) 스크롤 보정
    if (prevScrollHeightRef.current > 0 && node.scrollHeight !== prevScrollHeightRef.current && node.scrollTop < SCROLL_TOP_THRESHOLD_PX * 2) {
      const diff = node.scrollHeight - prevScrollHeightRef.current;
      node.scrollTop = node.scrollTop + diff;
      prevScrollHeightRef.current = 0;
      return;
    }
    // 그 외엔 하단 스크롤
    const isNearBottom =
      node.scrollHeight - (node.scrollTop + node.clientHeight) < 200;
    if (isNearBottom) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages.length, loadingOlder]);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, []);

  // 무한 스크롤 — 상단 도달 감지
  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (node.scrollTop > SCROLL_TOP_THRESHOLD_PX) return;
    if (loadingOlder || !hasMore) return;
    prevScrollHeightRef.current = node.scrollHeight;
    void loadOlder();
  }, [hasMore, loadOlder, loadingOlder]);

  const handleSendText = useCallback(async () => {
    if (!userId) {
      toast('로그인 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    const text = composerInputRef.current?.value.trim() || '';
    if (!text) return;

    // Optimistic UI: 즉시 임시 메시지 표시 + 입력 초기화
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = {
      id: optimisticId,
      room_id: String(room.id),
      sender_id: userId,
      sender_name: userName,
      content: text,
      created_at: new Date().toISOString(),
      is_deleted: false,
      reply_to_id: replyTo ? String(replyTo.id) : null,
      staff: { name: userName, photo_url: null } } as ChatMessage;
    appendOptimistic(optimisticMsg);
    
    if (composerInputRef.current) {
      composerInputRef.current.value = '';
    }
    setHasText(false);
    const savedReplyTo = replyTo;
    setReplyTo(null);

    // 백그라운드에서 서버 전송
    const result = await sendMobileTextMessage({
      roomId: String(room.id),
      senderId: userId,
      content: text,
      replyToId: savedReplyTo ? String(savedReplyTo.id) : null });
    if (!result.ok) {
      toast(result.error, 'error');
      removeOptimistic(optimisticId);
      // 입력·답장 대상 복구
      if (composerInputRef.current) {
        composerInputRef.current.value = text;
      }
      setHasText(true);
      if (savedReplyTo) setReplyTo(savedReplyTo);
      return;
    }
    // 성공: temp → 실제 메시지로 교체
    replaceOptimistic(optimisticId, result.message);
  }, [room.id, userId, userName, replyTo, appendOptimistic, replaceOptimistic, removeOptimistic]);



  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (!files.length || !userId) return;
      setUploading(true);
      try {
        for (const file of files) {
          const validation = validateMobileUploadTarget(file);
          if (!validation.ok) {
            toast(`${file.name}: ${validation.error}`, 'error');
            continue;
          }
          const result = await sendMobileFileMessage({
            roomId: String(room.id),
            senderId: userId,
            file });
          if (!result.ok) {
            toast(`${file.name}: ${result.error}`, 'error');
          } else if ('queued' in result && result.queued) {
            // 오프라인 큐 적재 — 낙관적 안내 메시지
            toast(`${file.name} — 오프라인 대기 중. 온라인 복귀 시 자동 전송됩니다.`, 'info');
          }
        }
        // 업로드 완료 후 즉시 새 메시지 반영 (큐 상태면 새 메시지 없음)
        void refresh();
      } finally {
        setUploading(false);
      }
    },
    [refresh, room.id, userId],
  );

  const insertEmojiAtCaret = useCallback((emoji: string) => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }

    if (emoji.startsWith('[stat:')) {
      input.value = emoji;
      setHasText(true);
      setTimeout(() => {
        void handleSendText();
      }, 0);
      return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.value = next;
    setHasText(input.value.trim().length > 0);
    // caret 위치 복구
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + emoji.length;
      input.setSelectionRange(caret, caret);
    });
  }, [handleSendText]);

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) {
        toast('로그인 정보를 찾을 수 없습니다.', 'error');
        return;
      }
      const result = await toggleMobileReaction({
        messageId,
        userId,
        emoji,
        roomId: String(room.id) });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      // 즉시 반영 — 폴링 트리거
      void refresh();
    },
    [refresh, room.id, userId],
  );

  const handleSaveEditedMessage = useCallback(
    async (message: ChatMessage, content: string) => {
      setEditSaving(true);
      try {
        const result = await editMobileMessage({
          messageId: String(message.id),
          content,
          roomId: String(room.id) });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        toast('메시지가 수정되었습니다.', 'success');
        setEditingMessage(null);
        void refresh();
      } finally {
        setEditSaving(false);
      }
    },
    [refresh, room.id],
  );

  // ── 투표 데이터 로드 (polls + poll_votes 집계) ──
  // polls는 messages와 별개 테이블이라 메시지 폴링만으로는 타인 생성/투표가 즉시
  // 반영되지 않는다. 진입 시 1회 + 3s 주기 갱신(읽음 커서와 동일 cadence)으로 라이브 유지.
  const refreshPolls = useCallback(async () => {
    const result = await fetchRoomPolls(String(room.id), userId);
    setPollData(result);
  }, [room.id, userId]);

  useEffect(() => {
    void refreshPolls();

    const channelKey = `mobile-chat-polls-${room.id}`;
    const tables: TableFilter[] = [
      { table: 'polls', filter: `room_id=eq.${room.id}` },
      { table: 'poll_votes', filter: `room_id=eq.${room.id}` }
    ];

    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        void refreshPolls();
      },
      { pollIntervalMs: 30000 } // fallback poll interval is 30s
    );

    return unsubscribe;
  }, [room.id, refreshPolls]);

  const handleCreatePoll = useCallback(
    async (input: { question: string; options: string[]; deadlineAt: string }) => {
      if (!userId) {
        toast('로그인 정보를 찾을 수 없습니다.', 'error');
        return;
      }
      setPollSubmitting(true);
      try {
        const result = await createMobilePoll({
          roomId: String(room.id),
          creatorId: userId,
          question: input.question,
          options: input.options,
          deadlineAt: input.deadlineAt });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        toast('투표가 생성되었습니다.', 'success');
        setPollComposerOpen(false);
        await refreshPolls();
      } finally {
        setPollSubmitting(false);
      }
    },
    [room.id, userId, refreshPolls],
  );

  const handleVotePoll = useCallback(
    async (pollId: string, optionIndex: number) => {
      if (!userId) {
        toast('로그인 정보를 찾을 수 없습니다.', 'error');
        return;
      }
      setPollVoting(true);
      try {
        const result = await voteMobilePoll({
          pollId,
          userId,
          optionIndex,
          roomId: String(room.id) });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        await refreshPolls();
      } finally {
        setPollVoting(false);
      }
    },
    [room.id, userId, refreshPolls],
  );



  // ── 스레드 답글 전송 — 기존 sendMobileTextMessage(replyToId) 재사용 ──
  const handleSendThreadReply = useCallback(
    async (rootMessage: ChatMessage, text: string) => {
      if (!userId) {
        toast('로그인 정보를 찾을 수 없습니다.', 'error');
        return;
      }
      setThreadSending(true);
      try {
        const result = await sendMobileTextMessage({
          roomId: String(room.id),
          senderId: userId,
          content: text,
          replyToId: String(rootMessage.id) });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        void refresh();
      } finally {
        setThreadSending(false);
      }
    },
    [room.id, userId, refresh],
  );

  // ── 방 이름 수정 ──
  const handleSaveRename = useCallback(async () => {
    setRenameSaving(true);
    try {
      const result = await renameMobileRoom({ roomId: String(room.id), name: renameDraft });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast('채팅방 이름이 변경되었습니다.', 'success');
      setRenameOpen(false);
      void refresh();
    } finally {
      setRenameSaving(false);
    }
  }, [room.id, renameDraft, refresh]);

  // ── 멤버 추가 ──
  const handleAddMembers = useCallback(
    async (selected: StaffDirectoryEntry[]) => {
      if (selected.length === 0) return;
      setMemberMutating(true);
      try {
        const result = await addMobileRoomMembers({
          roomId: String(room.id),
          currentMembers: memberIds,
          addIds: selected.map((s) => String(s.id)),
          inviterId: userId,
          inviterName: userName,
          addedNames: selected.map((s) => s.name) });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        toast('참여자를 추가했습니다.', 'success');
        setAddMemberOpen(false);
        void refresh();
      } finally {
        setMemberMutating(false);
      }
    },
    [room.id, memberIds, userId, userName, refresh],
  );

  // ── 멤버 제외 ──
  const handleRemoveMember = useCallback(
    async (member: StaffDirectoryEntry) => {
      if (memberMutating) return;
      setMemberMutating(true);
      try {
        const result = await removeMobileRoomMember({
          roomId: String(room.id),
          currentMembers: memberIds,
          removeId: String(member.id),
          removerId: userId,
          removerName: userName,
          removedName: member.name });
        if (!result.ok) {
          toast(result.error, 'error');
          return;
        }
        toast(`${member.name}님을 채팅방에서 제외했습니다.`, 'success');
        void refresh();
      } finally {
        setMemberMutating(false);
      }
    },
    [room.id, memberIds, userId, userName, refresh, memberMutating],
  );

  const handleQuickReply = useCallback(
    async (text: string) => {
      if (!userId) {
        toast('로그인 정보를 찾을 수 없습니다.', 'error');
        return;
      }
      const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimisticMsg = {
        id: optimisticId,
        room_id: String(room.id),
        sender_id: userId,
        sender_name: userName,
        content: text,
        created_at: new Date().toISOString(),
        is_deleted: false,
        reply_to_id: null,
        staff: { name: userName, photo_url: null } } as ChatMessage;
      appendOptimistic(optimisticMsg);
      const result = await sendMobileTextMessage({
        roomId: String(room.id),
        senderId: userId,
        content: text });
      if (!result.ok) {
        toast(result.error, 'error');
        removeOptimistic(optimisticId);
        return;
      }
      replaceOptimistic(optimisticId, result.message);
    },
    [room.id, userId, userName, appendOptimistic, replaceOptimistic, removeOptimistic],
  );

  const handleToggleBookmark = useCallback(async (message: ChatMessage) => {
    if (!userId) return;
    try {
      const { data, error: selectErr } = await db
        .from('message_bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('message_id', message.id);
        
      if (selectErr) throw selectErr;
      
      if (data && data.length > 0) {
        const { error } = await db
          .from('message_bookmarks')
          .delete()
          .eq('user_id', userId)
          .eq('message_id', message.id);
        if (error) throw error;
        toast('북마크가 해제되었습니다.', 'success');
      } else {
        const { error } = await db.from('message_bookmarks').insert([
          {
            user_id: userId,
            message_id: message.id,
            room_id: room.id },
        ]);
        if (error) throw error;
        toast('북마크가 추가되었습니다.', 'success');
      }
    } catch (err) {
      toast('북마크 처리 중 오류가 발생했습니다.', 'error');
    }
  }, [userId, room.id]);

  const handleAddTask = useCallback(async (message: ChatMessage) => {
    if (!userId) return;
    const content = message.content || '첨부 파일 확인';
    try {
      const { error } = await db
        .from('todos')
        .insert([{
          user_id: userId,
          content: `[채팅] ${content}`,
          is_complete: false,
          // todos.task_date 는 KST 날짜키다(PC 는 getKoreanTodayString 사용).
          // 예전에는 toISOString().slice(0,10) 로 UTC 날짜를 넣어, KST 00:00~08:59 에
          // 등록한 할 일이 '어제' 목록으로 들어가 오늘 화면에 보이지 않았다(8차 D10-006).
          task_date: getKoreanTodayString(),
          source_message_id: message.id,
          source_room_id: message.room_id }]);
      if (error) throw error;
      toast('할 일(업무)로 등록되었습니다.', 'success');
    } catch (err) {
      toast('할 일 등록 중 오류가 발생했습니다.', 'error');
    }
  }, [userId]);

  const handleDeleteMessage = useCallback(async (message: ChatMessage) => {
    try {
      const roomId = String(message.room_id || room.id || '');
      const { error } = await db
        .from('messages')
        .update({ is_deleted: true, content: '삭제된 메시지입니다.' })
        .eq('id', message.id);
      if (error) throw error;
      // 목록 미리보기: 최신 non-deleted 로 재계산 (file:// 잔존 버그 수정)
      if (roomId) {
        try {
          const { recomputeChatRoomLastMessageClient } = await import(
            '@/lib/chat-room-last-message'
          );
          await recomputeChatRoomLastMessageClient(roomId);
        } catch (e) {
          console.error('[mobile-chat] recompute preview failed', e);
        }
      }
      toast('메시지가 삭제되었습니다.', 'success');
      void refresh();
      pokeChannel('mobile-chat-rooms-list');
    } catch (err) {
      toast('메시지 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [refresh, room.id]);

  const handleForwardSelectRoom = useCallback(async (targetRoom: MobileChatRoom) => {
    if (!forwardMessage || !userId) return;
    try {
      // 표준 messages 테이블 + 표준 writer 사용(비표준 chat_messages/message_type 제거).
      const { data, error } = await insertChatMessageWithFallback<Pick<ChatMessage, 'id' | 'room_id'>>(db, {
        room_id: String(targetRoom.id),
        sender_id: userId,
        content: `[전달] ${forwardMessage.sender_name || '이름 없음'}: ${forwardMessage.content || '첨부파일'}`,
        file_url: forwardMessage.file_url || null,
        file_name: forwardMessage.file_name || null,
        file_kind: forwardMessage.file_kind || null,
        file_size_bytes: forwardMessage.file_size_bytes || null,
        reply_to_id: null,
        album_id: null,
        album_index: null,
        album_total: null }, 'id, room_id');
      if (error) throw error;
      pokeChannel(`mobile-chat-room-${targetRoom.id}`);
      pokeChannel('mobile-chat-rooms-list');
      if (data?.id && data?.room_id) {
        triggerMobileChatPush(String(data.room_id), String(data.id));
      }
      toast(`"${targetRoom.name || '채팅방'}"으로 메시지를 전달했습니다.`, 'success');
    } catch (err) {
      toast('메시지 전달 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsForwardOpen(false);
      setForwardMessage(null);
    }
  }, [forwardMessage, userId]);

  const placeholder = '메시지를 입력하세요.';
  const composerDisabled = uploading;

  return (
    <div
      className="m-screen"
      style={{
        // 보라→파랑→민트 4색 그라디언트는 말풍선 대비를 매 위치마다 바꿔
        // 같은 회색 글자가 어디서는 읽히고 어디서는 안 읽혔다. 단색 캔버스로.
        background: 'var(--m-bg)',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <div
        style={{
          padding: '10px 12px 10px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--m-border)',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          background: 'var(--m-card)' }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 10,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer' }}
        >
          <MIcon name="chevL" size={22} color="var(--z-700)" />
        </button>
        <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
          <MAvatar tone={headerTone} size="sm">
            {isNotice ? (
              <MIcon name="bell" size={16} color="#fff" />
            ) : peerPhotoUrl ? (
              <img
                src={peerPhotoUrl}
                alt={peerName || title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 'inherit' }}
              />
            ) : isGroup ? (
              <span>{getGroupChatRoomBadgeText(title)}</span>
            ) : (
              <span>{title.charAt(0) || '방'}</span>
            )}
          </MAvatar>
          {peer && !isGroup && !isNotice ? (
            <span
              aria-hidden="true"
              data-testid="mobile-chat-header-presence-dot"
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 9,
                height: 9,
                borderRadius: 999,
                border: '2px solid var(--card, #fff)',
                background: isPeerOnline ? 'var(--m-success, #10B981)' : '#FBBF24',
              }}
            />
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 800,
              color: 'var(--foreground)',
              letterSpacing: '-0.015em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis' }}
          >
            {title}
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1.5 }}
            data-testid="mobile-chat-header-presence"
          >
            {peer && !isGroup && !isNotice ? (
              <>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: isPeerOnline ? 'var(--m-success, #10B981)' : 'var(--z-400, #94A3B8)' }}
                  aria-hidden="true"
                />
                {isPeerOnline ? '온라인' : '자리비움'}
              </>
            ) : (
              <>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--m-success)' }}
                  aria-hidden="true"
                />
                {memberCount > 0 ? `${memberCount}명` : '대화방'}
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            aria-label="상세메뉴"
            onClick={() => {
              setInfoOpen(true);
              // 패널을 열 때 방 전체 첨부를 불러온다 (방 진입 비용은 늘리지 않는다).
              void loadRoomAttachments();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--z-100)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              cursor: 'pointer' }}
          >
            <MIcon name="menu" size={18} color="var(--z-600)" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="m-scroll"
        onScroll={handleScroll}
        data-testid="chat-message-list"
        style={{ background: 'transparent', padding: '12px 12px calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        {hasMore && loadingOlder && (
          <div
            style={{
              padding: '8px 0',
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 11,
              fontWeight: 600 }}
          >
            이전 메시지 불러오는 중…
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div
            style={{
              padding: '8px 0',
              textAlign: 'center',
              color: 'var(--z-400)',
              fontSize: 11,
              fontWeight: 600 }}
          >
            처음으로 돌아왔습니다.
          </div>
        )}
        {loading && messages.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 12,
              fontWeight: 600 }}
          >
            메시지 불러오는 중…
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.6 }}
          >
            대화를 시작해보세요.
          </div>
        )}
        <BubbleList
          messages={messages}
          userId={userId}
          userName={userName}
          staffs={staffs}
          readCounts={readCounts}
          isGroupChat={isGroup}
          searchMessageId={activeSearchMessageId}
          onJumpToMessage={jumpToMessage}
          onToggleReaction={handleToggleReaction}
          onReply={(msg) => {
            setReplyTo(msg);
            setTimeout(() => composerInputRef.current?.focus(), 50);
          }}
          onEdit={setEditingMessage}
          onImageLoad={scrollToBottom}
          onOpenBoardPost={onOpenBoardPost}
          onBookmark={handleToggleBookmark}
          onTask={handleAddTask}
          onDelete={handleDeleteMessage}
          onForward={(msg) => {
            setForwardMessage(msg);
            setIsForwardOpen(true);
          }}
          onReactionDetail={(msg) => setReactionDetailTarget(msg)}
          onReadDetail={(msg) => setReadDetailTarget(msg)}
          onOpenThread={(msg) => setThreadRoot(msg)}
          pollData={pollData}
          pollVoting={pollVoting}
          onVotePoll={handleVotePoll}
        />
      </div>

      {/* 이모지 피커 (컴포저) */}
      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={insertEmojiAtCaret}
        bottomOffset={78}
      />

      <div
        className="m-chat-composer"
        style={{
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)',
          padding: '8px 12px calc(12px + env(safe-area-inset-bottom))' }}
      >
        {(() => {
          const lastMessage = messages[messages.length - 1];
          const wardMeta = lastMessage && lastMessage.is_deleted !== true && lastMessage.sender_id !== userId
            ? extractWardMessageMeta(lastMessage.content)
            : null;
          const showWardQuickReplies = wardMeta?.meta?.type === 'op_ward_request';
          
          if (!showWardQuickReplies) return null;
          return (
            <div
              role="toolbar"
              aria-label="빠른 응답"
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 8,
                overflowX: 'auto',
                paddingBottom: 2 }}
              className="custom-scrollbar"
            >
              {WARD_QUICK_REPLY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-label={`빠른 응답: ${opt.label}`}
                  onClick={() => void handleQuickReply(opt.text)}
                  disabled={composerDisabled}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--z-100)',
                    color: 'var(--z-700)',
                    fontSize: 12,
                    fontWeight: 700,
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    cursor: composerDisabled ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          );
        })()}
        {replyTo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              marginBottom: 8,
              background: 'rgba(0, 0, 0, 0.04)',
              borderRadius: 8,
              borderLeft: '3px solid var(--m-accent)' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-accent)', marginBottom: 2 }}>
                {replyTo.sender_name || staffs.find((s) => String(s.id) === String(replyTo.sender_id))?.name || '알 수 없음'}에게 답장
              </div>
              <div style={{ fontSize: 12, color: 'var(--z-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {typeof replyTo.content === 'string' && replyTo.content ? replyTo.content : (replyTo.file_name ? '첨부파일' : '(내용 없음)')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--z-400)',
                padding: 4,
                cursor: 'pointer' }}
              aria-label="답장 취소"
            >
              <MIcon name="x" size={16} />
            </button>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            // rgba(0,0,0,0.04) 는 다크 모드 카드(#18181B) 위에서 사실상 보이지
            // 않았다 — 입력 줄의 경계가 사라진다. 토큰으로 바꾼다.
            background: 'var(--z-100)',
            border: '1px solid var(--m-border)',
            borderRadius: 22,
            padding: '4px 6px 4px 12px' }}
        >
          <button
            type="button"
            aria-label="추가 기능"
            onClick={() => setActionSheetOpen(true)}
            disabled={composerDisabled}
            style={{
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              color: uploading ? 'var(--m-accent)' : 'var(--z-500)',
              cursor: composerDisabled ? 'not-allowed' : 'pointer' }}
          >
            {uploading ? (
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid var(--m-accent)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite' }}
              />
            ) : (
              <MIcon name="plus" size={20} />
            )}
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ position: 'absolute', left: -9999, top: -9999, width: 1, height: 1 }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={galleryInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileChange}
            style={{ position: 'absolute', left: -9999, top: -9999, width: 1, height: 1 }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={MOBILE_CHAT_UPLOAD_ACCEPT}
            onChange={handleFileChange}
            style={{ position: 'absolute', left: -9999, top: -9999, width: 1, height: 1 }}
            aria-hidden="true"
            tabIndex={-1}
          />

          <label style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: -9999, top: -9999 }}>메시지 입력</span>
            <textarea
              ref={composerInputRef}
              onChange={(e) => {
                const currentText = e.target.value.trim();
                const currentHasText = currentText.length > 0;
                if (currentHasText !== hasText) {
                  setHasText(currentHasText);
                }
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              data-testid="chat-message-input"
              style={{
                flex: 1,
                padding: '4px 4px',
                fontSize: 14,
                fontFamily: 'inherit',
                width: '100%',
                resize: 'none',
                height: 24,
                background: 'transparent',
                // textarea 는 color 를 상속하지 않는다. 지정하지 않으면 다크 모드에서
                // 입력한 글자가 검정으로 찍혀 읽히지 않았다.
                color: 'var(--z-900)',
                border: 'none',
                outline: 'none' }}
              disabled={composerDisabled}
            />
          </label>
          <button
            type="button"
            aria-label="이모지 선택"
            aria-haspopup="dialog"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((v) => !v)}
            disabled={composerDisabled}
            style={{
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              color: emojiOpen ? 'var(--m-accent)' : 'var(--z-500)',
              cursor: composerDisabled ? 'not-allowed' : 'pointer' }}
          >
            <MIcon name="smile" size={20} />
          </button>
          <button
            type="button"
            aria-label="전송"
            data-testid="chat-send-button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void handleSendText()}
            disabled={composerDisabled || !hasText}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: hasText && !composerDisabled
                ? 'var(--m-accent)'
                : 'var(--z-300)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: hasText && !composerDisabled ? 'pointer' : 'not-allowed' }}
          >
            <MIcon name="send" size={16} />
          </button>
        </div>
      </div>

      <MSheet open={actionSheetOpen} onClose={() => setActionSheetOpen(false)} title="추가 기능">
        <div style={{
          padding: '8px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}>
          <button
            type="button"
            onClick={() => {
              setActionSheetOpen(false);
              cameraInputRef.current?.click();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px', borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.02)',
              color: 'var(--z-900)', fontSize: 16, fontWeight: 800,
              textAlign: 'left'
            }}
          >
            <MIcon name="camera" size={24} color="var(--m-accent)" />
            카메라
          </button>
          <button
            type="button"
            onClick={() => {
              setActionSheetOpen(false);
              galleryInputRef.current?.click();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px', borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.02)',
              color: 'var(--z-900)', fontSize: 16, fontWeight: 800,
              textAlign: 'left'
            }}
          >
            <MIcon name="image" size={24} color="var(--m-accent)" />
            갤러리
          </button>
          <button
            type="button"
            onClick={() => {
              setActionSheetOpen(false);
              fileInputRef.current?.click();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px', borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.02)',
              color: 'var(--z-900)', fontSize: 16, fontWeight: 800,
              textAlign: 'left'
            }}
          >
            <MIcon name="paperclip" size={24} color="var(--m-accent)" />
            파일
          </button>
          <button
            type="button"
            onClick={() => {
              setActionSheetOpen(false);
              setPollComposerOpen(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px', borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.02)',
              color: 'var(--z-900)', fontSize: 16, fontWeight: 800,
              textAlign: 'left'
            }}
          >
            <MIcon name="list" size={24} color="var(--m-accent)" />
            새 투표 만들기
          </button>
        </div>
      </MSheet>

      <MSheet open={infoOpen} onClose={() => setInfoOpen(false)} title="대화방 상세 정보">
        <div style={{
          padding: '8px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}>
          {/* Section 1: 대화방 개요 */}
          <div style={{ background: 'var(--z-100)', padding: '14px', borderRadius: 12, border: '1px solid rgba(0, 0, 0, 0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: 'var(--z-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              {canRenameRoom && (
                <button
                  type="button"
                  aria-label="채팅방 이름 수정"
                  onClick={() => {
                    setRenameDraft(typeof room.name === 'string' ? room.name : title);
                    setRenameOpen(true);
                  }}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '5px 10px',
                    borderRadius: 8,
                    background: 'var(--m-accent-soft)',
                    color: 'var(--m-accent)',
                    fontSize: 11,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer' }}
                >
                  <MIcon name="edit" size={13} />
                  이름 수정
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 4, display: 'flex', gap: 8 }}>
              <span>유형: {isGroup ? '그룹 대화방' : '1:1 대화방'}</span>
              <span>·</span>
              <span>참여자: {memberProfiles.length}명</span>
            </div>
          </div>

          {/* Section 2: 알림 설정 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>대화방 알림 수신</div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2 }}>새 메시지 알림을 받습니다.</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={roomNotifyOn}
                onChange={() => { void toggleRoomNotify(); }}
                aria-label="대화방 알림 수신"
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, borderRadius: 24,
                background: roomNotifyOn ? 'var(--m-accent)' : 'rgba(0, 0, 0, 0.15)', transition: '0.2s' }}>
                <span style={{
                  position: 'absolute', left: 4, bottom: 4, width: 16, height: 16,
                  borderRadius: '50%', background: '#fff', transition: '0.2s',
                  transform: roomNotifyOn ? 'translateX(20px)' : 'translateX(0)' }} />
              </span>
            </label>
          </div>

          <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

          {/* Section 3: 상단 공지 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 11 }}>📌</span>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>상단 공지</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--z-100)', borderRadius: 10, fontSize: 12, color: 'var(--z-500)', fontWeight: 600, border: '1px solid rgba(0, 0, 0, 0.02)' }}>
              등록된 대화방 공지가 없습니다.
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

          {/* Section 4: 참여자 목록 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>참여자 ({memberProfiles.length}명)</div>
              {canManageMembers && (
                <button
                  type="button"
                  aria-label="참여자 추가"
                  onClick={() => setAddMemberOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '5px 10px',
                    borderRadius: 8,
                    background: 'var(--m-accent-soft)',
                    color: 'var(--m-accent)',
                    fontSize: 11,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer' }}
                >
                  <MIcon name="plus" size={13} />
                  추가
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto' }} className="custom-scrollbar">
              {memberProfiles.map((member) => {
                const tone = pickAvatarTone(String(member.id) + member.name);
                const isMe = String(member.id) === String(userId);
                const photoUrl = member.photo_url || member.avatar_url;
                return (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MAvatar tone={tone} size="sm">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={member.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                        />
                      ) : (
                        <span>{member.name.charAt(0)}</span>
                      )}
                    </MAvatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>
                        {member.name}
                        {isMe && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--m-accent-soft)', color: 'var(--m-accent)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>나</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2 }}>
                        {member.department || '부서 없음'} · {member.position || '직급 없음'}
                      </div>
                    </div>
                    {canManageMembers && !isMe && (
                      <button
                        type="button"
                        aria-label={`${member.name} 참여자 제외`}
                        onClick={() => { void handleRemoveMember(member); }}
                        disabled={memberMutating}
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 8,
                          background: 'transparent',
                          color: 'var(--m-danger, #ef4444)',
                          border: 'none',
                          cursor: memberMutating ? 'not-allowed' : 'pointer' }}
                      >
                        <MIcon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

          {/* Section 5: 공유된 사진 및 파일 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>공유된 사진 및 파일 ({attachments.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {attachments.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--z-400)', fontWeight: 600 }}>
                  {/* 아직 불러오는 중인데 "없다" 고 단정하지 않는다 — 예전에는 로드된
                      메시지 20개만 보고 없다고 말해서 있는 파일도 없는 것처럼 보였다. */}
                  {attachmentsLoading ? '불러오는 중…' : '첨부된 항목이 없습니다.'}
                </div>
              )}
              {attachments.slice(0, 9).map((att) => (
                <div key={att.id} style={{ aspectRatio: 1, borderRadius: 8, background: 'var(--z-100)', border: '1px solid var(--m-border)', overflow: 'hidden', position: 'relative' }}>
                  {/* file_url 은 공개 R2 도메인이라 401 이 난다 — 인증 프록시 URL 로 변환해서 쓴다. */}
                  {/\.(png|jpg|jpeg|gif|webp|bmp|heic|heif|avif)(\?|$)/i.test(att.file_url!) ? (
                    <img src={buildStorageInlineUrl(att.file_url!, att.file_name || '첨부')} alt="첨부" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => window.open(buildStorageInlineUrl(att.file_url!, att.file_name || '첨부'), '_blank')} />
                  ) : (
                    <div onClick={() => window.open(buildStorageDownloadUrl(att.file_url!, att.file_name || '파일'), '_blank')} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--m-accent)' }}>
                      <MIcon name="file" size={24} />
                      <span style={{ fontSize: 9, marginTop: 4, width: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{att.file_name || '파일'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

          {/* Section 6: 방 나가기 */}
          <button
            type="button"
            onClick={() => {
              if (canLeaveRoom) {
                setLeaveConfirmOpen(true);
              } else {
                onBack();
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 10,
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              textAlign: 'center' }}
          >
            {canLeaveRoom ? '채팅방 나가기' : '목록으로'}
          </button>
        </div>
      </MSheet>

      <MSheet open={leaveConfirmOpen} onClose={() => setLeaveConfirmOpen(false)} title="채팅방 나가기">
        <div style={{
          padding: '8px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}>
          <div style={{ fontSize: 13, color: 'var(--z-600)', fontWeight: 600, lineHeight: 1.6 }}>
            이 채팅방에서 나갑니다.
            <br />
            대화방 목록에서 사라지고 새 메시지 알림도 받지 않습니다.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setLeaveConfirmOpen(false)}
              disabled={leaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                background: 'rgba(0, 0, 0, 0.04)',
                color: 'var(--z-700)',
                fontSize: 13,
                fontWeight: 800,
                border: '1px solid rgba(0, 0, 0, 0.02)',
                cursor: leaving ? 'not-allowed' : 'pointer' }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => { void handleLeaveRoom(); }}
              disabled={leaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #FF3B30, #D00F0F)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: leaving ? 'not-allowed' : 'pointer',
                opacity: leaving ? 0.7 : 1 }}
            >
              {leaving ? '나가는 중…' : '나가기'}
            </button>
          </div>
        </div>
      </MSheet>

      <MSheet
        open={isForwardOpen}
        onClose={() => {
          setIsForwardOpen(false);
          setForwardMessage(null);
        }}
        title="메시지 전달"
      >
        <div style={{
          padding: '8px 20px 24px',
          maxHeight: '60vh',
          overflowY: 'auto',
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}>
          <div style={{ fontSize: 13, color: 'var(--z-600)', fontWeight: 600, marginBottom: 12 }}>
            전달할 채팅방을 선택해 주세요.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentRooms && recentRooms.length > 0 ? (
              recentRooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleForwardSelectRoom(r)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    textAlign: 'left',
                    background: 'var(--m-card)',
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer' }}
                >
                  <span className="truncate" style={{ flex: 1 }}>{r.name || '이름 없는 채팅방'}</span>
                  <MIcon name="chevR" size={18} color="var(--z-400)" />
                </button>
              ))
            ) : (
              <div style={{ fontSize: 12, color: 'var(--z-400)', textAlign: 'center', padding: '16px 0' }}>
                전달 가능한 최근 채팅방이 없습니다.
              </div>
            )}
          </div>
        </div>
      </MSheet>



      {/* 반응 상세 시트 */}
      <ReactionDetailSheet
        message={reactionDetailTarget}
        staffs={staffs}
        onClose={() => setReactionDetailTarget(null)}
      />

      {/* 읽음 확인 상세 시트 */}
      <ReadStatusSheet
        message={readDetailTarget}
        roomId={String(room.id)}
        memberIds={memberIds}
        staffs={staffs}
        onClose={() => setReadDetailTarget(null)}
      />

      {/* 메시지 수정 시트 */}
      <MessageEditSheet
        message={editingMessage}
        saving={editSaving}
        onClose={() => setEditingMessage(null)}
        onSave={(message, content) => { void handleSaveEditedMessage(message, content); }}
      />

      {/* 스레드 시트 */}
      <ThreadSheet
        rootMessage={threadRoot}
        messages={messages}
        staffs={staffs}
        userId={userId}
        sending={threadSending}
        onClose={() => setThreadRoot(null)}
        onSendReply={(rootMessage, text) => { void handleSendThreadReply(rootMessage, text); }}
      />

      {/* 투표 만들기 시트 */}
      <PollComposerSheet
        open={pollComposerOpen}
        submitting={pollSubmitting}
        onClose={() => setPollComposerOpen(false)}
        onSubmit={(input) => { void handleCreatePoll(input); }}
      />

      {/* 참여자 추가 시트 */}
      <AddMemberSheet
        open={addMemberOpen}
        submitting={memberMutating}
        currentMemberIds={memberIds}
        staffs={staffs}
        onClose={() => setAddMemberOpen(false)}
        onSubmit={(selected) => { void handleAddMembers(selected); }}
      />

      {/* 방 이름 수정 시트 */}
      <MSheet open={renameOpen} onClose={() => { if (!renameSaving) setRenameOpen(false); }} title="채팅방 이름 수정">
        <div style={{
          padding: '8px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}>
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="채팅방 이름을 입력해 주세요"
            aria-label="채팅방 이름"
            disabled={renameSaving}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontFamily: 'inherit',
              background: 'var(--z-100)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              borderRadius: 10,
              outline: 'none',
              color: 'var(--z-900)' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              disabled={renameSaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                background: 'rgba(0, 0, 0, 0.04)',
                color: 'var(--z-700)',
                fontSize: 13,
                fontWeight: 800,
                border: '1px solid rgba(0, 0, 0, 0.02)',
                cursor: renameSaving ? 'not-allowed' : 'pointer' }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => { void handleSaveRename(); }}
              disabled={renameSaving || !renameDraft.trim()}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                background: renameDraft.trim()
                  ? 'var(--m-accent)'
                  : 'rgba(0, 0, 0, 0.1)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: renameSaving || !renameDraft.trim() ? 'not-allowed' : 'pointer',
                opacity: renameSaving ? 0.7 : 1 }}
            >
              {renameSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </MSheet>
    </div>
  );
}

