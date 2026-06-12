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
  type ChangeEvent,
} from 'react';
import type { ChatMessage, ChatRoom, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
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
  type StaffDirectoryEntry,
} from './data-hooks';
import {
  normalizeMemberIds,
  isGroupChatRoom,
  isSelfChatRoom,
  getGroupChatRoomBadgeText,
  NOTICE_ROOM_ID,
} from '@/app/main/기능부품/메신저유틸';
import { useRoomNotificationSetting } from '@/app/main/기능부품/메신저구독훅';
import { patchChatRoom } from '@/lib/chat-rooms-client';
import EmojiPicker from './이모지피커';
import BubbleList from './버블리스트';
import {
  MOBILE_CHAT_UPLOAD_ACCEPT,
  sendMobileFileMessage,
  validateMobileUploadTarget,
} from './업로드';
import { toggleMobileReaction } from './반응';

export type SChatRoomProps = {
  user: ErpUser;
  room: ChatRoom;
  onBack: () => void;
  /** Quick Switch — 채팅목록에서 패스스루. JM2: 중복 fetch 금지 */
  recentRooms?: MobileChatRoom[];
  onSwitchRoom?: (roomId: string) => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
};

const SCROLL_TOP_THRESHOLD_PX = 80;

export default function SChatRoom({ user, room, onBack, recentRooms, onSwitchRoom, onOpenBoardPost }: SChatRoomProps) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const userName = typeof user.name === 'string' ? user.name : '';
  const company = typeof user.company === 'string' ? user.company : null;
  const staffs = useChatStaffDirectory(company);
  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    refresh,
    appendOptimistic,
    replaceOptimistic,
  } = useChatMessagesForRoom(String(room.id), userId);

  const title = getRoomTitle(room, staffs, userId);
  const headerTone = pickAvatarTone(String(room.id) + title);
  const memberCount = normalizeMemberIds(room.members).length;

  const memberIds = useMemo(() => (Array.isArray(room.members) ? room.members.map((id) => String(id)) : []), [room.members]);
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
  const readCounts = useMobileChatReadCounts(String(room.id), messages, memberIds);

  const attachments = useMemo(() => {
    return messages.filter(m => !!m.file_url).reverse();
  }, [messages]);

  const memberProfiles = useMemo(() => {
    return memberIds
      .map((id) => staffs.find((s) => String(s.id) === String(id)))
      .filter(Boolean) as StaffDirectoryEntry[];
  }, [memberIds, staffs]);

  const [hasText, setHasText] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 대화방 알림 수신 토글 — PC 자산 재사용(room_notification_settings 서버 push 기준)
  const { roomNotifyOn, toggleRoomNotify } = useRoomNotificationSetting({
    selectedRoomId: String(room.id),
    effectiveChatUserId: userId,
    userId,
  });

  // 공지/나와의채팅은 나갈 수 없음
  const canLeaveRoom = !isNotice && !selfRoom;

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
    setLeaving(true);
    try {
      const newMembers = memberIds.filter((id) => String(id) !== String(userId));
      const result = await patchChatRoom(String(room.id), { members: newMembers });
      if (!result.ok) {
        toast(result.error || '채팅방 나가기에 실패했습니다.', 'error');
        return;
      }
      // PC handleLeaveRoom과 동일하게 '퇴장' 안내 메시지를 남김(실패해도 나가기는 진행)
      try {
        await sendMobileTextMessage({
          roomId: String(room.id),
          senderId: userId,
          content: `[퇴장] ${userName || '알 수 없음'}님이 채팅방을 나갔습니다.`,
        });
      } catch (noticeError) {
        console.error('leave room system message error', noticeError);
      }
      setLeaveConfirmOpen(false);
      setInfoOpen(false);
      onBack();
    } finally {
      setLeaving(false);
    }
  }, [canLeaveRoom, leaving, memberIds, onBack, room.id, userId, userName]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
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
      staff: { name: userName, photo_url: null },
    } as ChatMessage;
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
      replyToId: savedReplyTo ? String(savedReplyTo.id) : null,
    });
    if (!result.ok) {
      toast(result.error, 'error');
      // 실패 시 임시 메시지는 다음 refresh에서 제거됨
      return;
    }
    // 성공: temp → 실제 메시지로 교체
    replaceOptimistic(optimisticId, result.message);
  }, [room.id, userId, userName, replyTo, appendOptimistic, replaceOptimistic]);



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
            file,
          });
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
  }, []);

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
        roomId: String(room.id),
      });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      // 즉시 반영 — 폴링 트리거
      void refresh();
    },
    [refresh, room.id, userId],
  );

  const placeholder = '메시지를 입력하세요.';
  const composerDisabled = uploading;

  return (
    <div className="m-screen">
      <div className="m-header" style={{ paddingBottom: 10 }}>
        <button type="button" className="back" onClick={onBack} aria-label="뒤로">
          <MIcon name="chevL" size={22} />
        </button>
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
                borderRadius: 'inherit',
              }}
            />
          ) : isGroup ? (
            <span>{getGroupChatRoomBadgeText(title)}</span>
          ) : (
            <span>{title.charAt(0) || '방'}</span>
          )}
        </MAvatar>
        <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
          <div
            className="title"
            style={{
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--m-success)',
              }}
              aria-hidden="true"
            />
            {memberCount > 0 ? `${memberCount}명` : '대화방'}
            <span style={{ color: 'var(--z-400)' }}>·</span>
            실시간 연결됨
          </div>
        </div>
        <div className="actions">
          <button type="button" aria-label="상세메뉴" onClick={() => setInfoOpen(true)}>
            <MIcon name="menu" size={20} />
          </button>
        </div>
      </div>


      <div
        ref={scrollRef}
        className="m-scroll"
        onScroll={handleScroll}
        data-testid="chat-message-list"
        style={{ background: 'var(--m-bg)', padding: '12px 12px 6px' }}
      >
        {hasMore && loadingOlder && (
          <div
            style={{
              padding: '8px 0',
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 11,
              fontWeight: 600,
            }}
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
              fontWeight: 600,
            }}
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
              fontWeight: 600,
            }}
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
              lineHeight: 1.6,
            }}
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
          onToggleReaction={handleToggleReaction}

          onReply={(msg) => {
            setReplyTo(msg);
            setTimeout(() => composerInputRef.current?.focus(), 50);
          }}
          onImageLoad={scrollToBottom}
          onOpenBoardPost={onOpenBoardPost}
        />
      </div>

      {/* 이모지 피커 (컴포저) */}
      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={insertEmojiAtCaret}
      />

      <div
        style={{
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)',
          padding: '8px 12px 12px',
        }}
      >
        {replyTo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              marginBottom: 8,
              background: 'var(--m-bg)',
              borderRadius: 8,
              borderLeft: '3px solid var(--m-accent)',
            }}
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
                cursor: 'pointer',
              }}
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
            background: 'var(--m-bg)',
            borderRadius: 22,
            padding: '4px 6px 4px 12px',
          }}
        >
          <button
            type="button"
            aria-label="첨부 추가"
            onClick={() => fileInputRef.current?.click()}
            disabled={composerDisabled}
            style={{
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              color: uploading ? 'var(--m-accent)' : 'var(--z-500)',
              cursor: composerDisabled ? 'not-allowed' : 'pointer',
            }}
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
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            ) : (
              <MIcon name="plus" size={20} />
            )}
          </button>
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
                border: 'none',
                outline: 'none',
              }}
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
              cursor: composerDisabled ? 'not-allowed' : 'pointer',
            }}
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
              background: hasText && !composerDisabled ? 'var(--m-accent)' : 'var(--z-300)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name="send" size={16} />
          </button>
        </div>
      </div>

      <MSheet open={infoOpen} onClose={() => setInfoOpen(false)} title="대화방 상세 정보">
        <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: 대화방 개요 */}
          <div style={{ background: 'var(--m-bg)', padding: '14px', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-900)' }}>{title}</div>
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
                background: roomNotifyOn ? 'var(--m-accent)' : 'var(--z-300)', transition: '0.2s',
              }}>
                <span style={{
                  position: 'absolute', left: 4, bottom: 4, width: 16, height: 16,
                  borderRadius: '50%', background: '#fff', transition: '0.2s',
                  transform: roomNotifyOn ? 'translateX(20px)' : 'translateX(0)',
                }} />
              </span>
            </label>
          </div>

          <div style={{ height: 1, background: 'var(--m-border)' }} />

          {/* Section 3: 상단 공지 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 11 }}>📌</span>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>상단 공지</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--m-bg)', borderRadius: 10, fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>
              등록된 대화방 공지가 없습니다.
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--m-border)' }} />

          {/* Section 4: 참여자 목록 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>참여자 ({memberProfiles.length}명)</div>
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
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--m-border)' }} />

          {/* Section 5: 공유된 사진 및 파일 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>공유된 사진 및 파일 ({attachments.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {attachments.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--z-400)', fontWeight: 600 }}>첨부된 항목이 없습니다.</div>
              )}
              {attachments.slice(0, 9).map((att) => (
                <div key={att.id} style={{ aspectRatio: 1, borderRadius: 8, background: 'var(--m-bg)', overflow: 'hidden', position: 'relative' }}>
                  {/\.(png|jpg|jpeg|gif|webp|bmp|heic|heif|avif)(\?|$)/i.test(att.file_url!) ? (
                    <img src={att.file_url!} alt="첨부" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => window.open(att.file_url!, '_blank')} />
                  ) : (
                    <div onClick={() => window.open(att.file_url!, '_blank')} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--m-accent)' }}>
                      <MIcon name="file" size={24} />
                      <span style={{ fontSize: 9, marginTop: 4, width: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{att.file_name || '파일'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--m-border)' }} />

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
              textAlign: 'center',
            }}
          >
            {canLeaveRoom ? '채팅방 나가기' : '목록으로'}
          </button>
        </div>
      </MSheet>

      <MSheet open={leaveConfirmOpen} onClose={() => setLeaveConfirmOpen(false)} title="채팅방 나가기">
        <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                background: 'var(--m-bg)',
                color: 'var(--z-700)',
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: leaving ? 'not-allowed' : 'pointer',
              }}
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
                background: 'var(--m-danger, #ef4444)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: leaving ? 'not-allowed' : 'pointer',
                opacity: leaving ? 0.7 : 1,
              }}
            >
              {leaving ? '나가는 중…' : '나가기'}
            </button>
          </div>
        </div>
      </MSheet>
    </div>
  );
}

