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
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { ChatRoom, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  getRoomTitle,
  pickAvatarTone,
  sendMobileTextMessage,
  useChatMessagesForRoom,
  useChatStaffDirectory,
} from './data-hooks';
import { normalizeMemberIds } from '@/app/main/기능부품/메신저유틸';
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
};

const SCROLL_TOP_THRESHOLD_PX = 80;

export default function SChatRoom({ user, room, onBack }: SChatRoomProps) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const userName = typeof user.name === 'string' ? user.name : '';
  const staffs = useChatStaffDirectory();
  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    refresh,
  } = useChatMessagesForRoom(String(room.id), userId);

  const title = getRoomTitle(room, staffs, userId);
  const headerTone = pickAvatarTone(String(room.id) + title);
  const memberCount = normalizeMemberIds(room.members).length;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);

  // 새 메시지 도착 시 하단 스크롤. 단, 무한스크롤로 prepend된 경우는 스크롤 위치 유지.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const next = messages.length;
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = next;

    if (prev === 0) {
      // 초기 로드
      node.scrollTop = node.scrollHeight;
      return;
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
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const result = await sendMobileTextMessage({
        roomId: String(room.id),
        senderId: userId,
        content: text,
      });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      setDraft('');
    } finally {
      setSending(false);
    }
  }, [draft, room.id, sending, userId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendText();
    }
  };

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
          }
        }
        // 업로드 완료 후 즉시 새 메시지 반영
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
      setDraft((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + emoji + input.value.slice(end);
    setDraft(next);
    // caret 위치 복구
    requestAnimationFrame(() => {
      const node = composerInputRef.current;
      if (!node) return;
      node.focus();
      const caret = start + emoji.length;
      node.setSelectionRange(caret, caret);
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

  const placeholder = `#${title}에 메시지 보내기`;
  const composerDisabled = sending || uploading;

  return (
    <div className="m-screen">
      <div className="m-header" style={{ paddingBottom: 10 }}>
        <button type="button" className="back" onClick={onBack} aria-label="뒤로">
          <MIcon name="chevL" size={22} />
        </button>
        <MAvatar tone={headerTone} size="sm">
          {title.charAt(0) || '방'}
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
          </div>
        </div>
        <div className="actions">
          <button type="button" aria-label="채팅 검색" disabled>
            <MIcon name="search" size={20} />
          </button>
          <button type="button" aria-label="더보기" disabled>
            <MIcon name="moreV" size={20} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="m-scroll"
        onScroll={handleScroll}
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
          onToggleReaction={handleToggleReaction}
        />
      </div>

      {/* 이모지 피커 (컴포저) */}
      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={insertEmojiAtCaret}
      />

      {/* 컴포저 */}
      <div
        style={{
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)',
          padding: '8px 12px 12px',
        }}
      >
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
            <input
              ref={composerInputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label={placeholder}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: 14,
                fontFamily: 'inherit',
                width: '100%',
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
            onClick={() => void handleSendText()}
            disabled={composerDisabled || !draft.trim()}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background:
                composerDisabled || !draft.trim() ? 'var(--z-300)' : 'var(--m-accent)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <MIcon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

