'use client';

/**
 * 모바일 채팅 메시지 버블.
 * - 텍스트 / 이미지 / 일반 파일 첨부 렌더
 * - 반응 chip (m-screens-1.jsx 디자인 그대로)
 * - 스와이프 제스처: 좌/우 밀면 이모지 리액션 바 + 답장/복사 액션 노출
 *
 * 제약: JM(< 500줄, 단일 책임), JM4(any 금지), JM6(button + aria-label).
 */

import { useMemo, useRef, useState, useCallback } from 'react';
import type { ChatMessage } from '@/types';
import { renderMessageContent } from '@/app/main/기능부품/메신저메시지렌더';
import MIcon from '../공통/MIcon';
import {
  formatBubbleTimestamp,
  pickAvatarTone,
  type StaffDirectoryEntry,
} from './data-hooks';

export type MessageBubbleProps = {
  message: ChatMessage;
  mine: boolean;
  myUserId: string | null;
  staffs: StaffDirectoryEntry[];
  fallbackMyName: string;
  readCount?: number;
  isGroupChat?: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply?: (message: ChatMessage) => void;
  onImageLoad?: () => void;
};

const IMAGE_KINDS = new Set(['image']);
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const SWIPE_THRESHOLD = 40;
const SWIPE_MAX = 140;

function isImage(message: ChatMessage): boolean {
  if (typeof message.file_kind === 'string' && IMAGE_KINDS.has(message.file_kind)) {
    return true;
  }
  const url = String(message.file_url || '');
  return /\.(png|jpg|jpeg|gif|webp|bmp|heic|heif|avif)(\?|$)/i.test(url);
}

function formatBytes(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value <= 0) return '';
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export default function MessageBubble({
  message,
  mine,
  myUserId,
  staffs,
  fallbackMyName,
  readCount = 0,
  isGroupChat = false,
  onToggleReaction,
  onReply,
  onImageLoad,
}: MessageBubbleProps) {
  const displayedReadCount = (mine || isGroupChat) ? readCount : 0;

  const ts = formatBubbleTimestamp(message.created_at);
  const senderName =
    message.sender_name ||
    staffs.find((s) => String(s.id) === String(message.sender_id || ''))?.name ||
    (mine ? fallbackMyName : '알 수 없음');
  const text =
    typeof message.content === 'string' && message.content ? message.content : '';

  const hasFile = Boolean(message.file_url);
  const imageMode = hasFile && isImage(message);
  const fileName =
    (typeof message.file_name === 'string' && message.file_name) || '첨부파일';
  const fileSize = formatBytes(
    typeof message.file_size_bytes === 'number' ? message.file_size_bytes : null,
  );

  const reactionEntries = useMemo(() => {
    const r = message.reactions;
    if (!r || typeof r !== 'object') return [];
    return Object.entries(r)
      .map(([emoji, users]) => ({
        emoji,
        users: Array.isArray(users) ? users.map(String) : [],
      }))
      .filter((entry) => entry.users.length > 0);
  }, [message.reactions]);

  const isEmoticonOrSticker = useMemo(() => {
    if (hasFile) return false;
    const trimmed = text.trim();
    return /^\[emo:[a-z0-9-]+\]$/.test(trimmed) || /^\[stat:[a-z0-9-]+\]$/.test(trimmed);
  }, [text, hasFile]);

  /* ─── 스와이프 제스처 ─────────────────────────────────── */
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [actionRevealed, setActionRevealed] = useState(false);
  const touchRef = useRef({ startX: 0, startY: 0, moved: false, locked: false });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, moved: false, locked: false };
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    const touch = e.touches[0];
    const ref = touchRef.current;
    const dx = touch.clientX - ref.startX;
    const dy = touch.clientY - ref.startY;

    // 수직 스크롤 우선 — 세로 이동이 더 크면 스와이프 취소
    if (!ref.locked && !ref.moved) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        setSwiping(false);
        setSwipeX(0);
        return;
      }
      if (Math.abs(dx) > 8) {
        ref.locked = true;
        ref.moved = true;
      }
    }

    if (!ref.locked) return;

    // 내 메시지: 왼쪽(음수)만, 상대 메시지: 오른쪽(양수)만
    let clamped: number;
    if (mine) {
      clamped = Math.max(-SWIPE_MAX, Math.min(0, dx));
    } else {
      clamped = Math.max(0, Math.min(SWIPE_MAX, dx));
    }
    setSwipeX(clamped);
  }, [swiping, mine]);

  const handleTouchEnd = useCallback(() => {
    setSwiping(false);
    if (Math.abs(swipeX) >= SWIPE_THRESHOLD) {
      setActionRevealed(true);
      setSwipeX(mine ? -SWIPE_MAX : SWIPE_MAX);
    } else {
      setSwipeX(0);
      setActionRevealed(false);
    }
  }, [swipeX, mine]);

  const closeActions = useCallback(() => {
    setSwipeX(0);
    setActionRevealed(false);
  }, []);

  const handleQuickReaction = useCallback((emoji: string) => {
    onToggleReaction(String(message.id), emoji);
    closeActions();
  }, [message.id, onToggleReaction, closeActions]);

  const handleReply = useCallback(() => {
    if (onReply) onReply(message);
    closeActions();
  }, [message, onReply, closeActions]);

  const handleCopy = useCallback(() => {
    if (text) {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
    closeActions();
  }, [text, closeActions]);

  const isRevealed = actionRevealed && Math.abs(swipeX) >= SWIPE_THRESHOLD;

  return (
    <div
      data-testid={`chat-message-row-${message.id}`}
      style={{
        marginBottom: 8,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* ── 스와이프 뒤에 나타나는 액션 영역 ─────────── */}
      {isRevealed && (
        <>
          {/* 배경 오버레이 — 다른 곳 탭하면 닫힘 */}
          <div
            onClick={closeActions}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              ...(mine ? { right: 0 } : { left: 0 }),
              width: SWIPE_MAX,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: mine ? 'flex-end' : 'flex-start',
              padding: '4px 6px',
              gap: 5,
              zIndex: 10,
            }}
          >
            {/* 빠른 이모지 행 */}
            <div style={{
              display: 'flex',
              gap: 1,
              background: 'var(--m-card)',
              border: '1px solid var(--m-border)',
              borderRadius: 20,
              padding: '3px 4px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            }}>
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`반응 ${emoji}`}
                  onClick={() => handleQuickReaction(emoji)}
                  style={{
                    width: 28,
                    height: 28,
                    fontSize: 15,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* 액션 버튼 행 */}
            <div style={{
              display: 'flex',
              gap: 4,
            }}>
              <button
                type="button"
                aria-label="답장"
                onClick={handleReply}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 14,
                  border: '1px solid var(--m-border)',
                  background: 'var(--m-card)',
                  color: 'var(--z-700)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                <MIcon name="reply" size={12} />
                답장
              </button>
              {text && (
                <button
                  type="button"
                  aria-label="복사"
                  onClick={handleCopy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 14,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-card)',
                    color: 'var(--z-700)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  <MIcon name="copy" size={12} />
                  복사
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: mine ? 'flex-end' : 'flex-start',
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          zIndex: isRevealed ? 11 : 1,
          touchAction: 'pan-y',
        }}
      >
        {!mine && (
          <div style={{ width: 4, flexShrink: 0 }} />
        )}
        <div
          style={{
            maxWidth: '72%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {!mine && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--z-600)',
                marginBottom: 3,
                padding: '0 4px',
              }}
            >
              {senderName}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              position: 'relative',
            }}
          >
            {mine && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                {displayedReadCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--m-green)',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                    }}
                  >
                    {displayedReadCount}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--z-400)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ts}
                </span>
              </div>
            )}


            <div
              data-testid={`chat-message-${message.id}`}
              style={{
                padding: (imageMode || isEmoticonOrSticker) ? 0 : '10px 14px',
                borderRadius: 16,
                background: (imageMode || isEmoticonOrSticker)
                  ? 'transparent'
                  : mine
                    ? 'var(--m-accent)'
                    : 'var(--m-card)',
                color: mine && !(imageMode || isEmoticonOrSticker) ? '#fff' : 'var(--z-900)',
                border: mine || imageMode || isEmoticonOrSticker ? 0 : '1px solid var(--m-border)',
                borderBottomRightRadius: mine ? 4 : 16,
                borderBottomLeftRadius: mine ? 16 : 4,
                fontSize: 14,
                lineHeight: 1.5,
                fontWeight: 500,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                overflow: 'hidden',
              }}
            >
              {imageMode && message.file_url ? (
                <a
                  href={String(message.file_url)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`첨부 이미지 ${fileName}`}
                  style={{ display: 'block' }}
                >
                  <img
                    src={String(message.file_url)}
                    alt={fileName}
                    onLoad={onImageLoad}
                    style={{
                      display: 'block',
                      maxWidth: 220,
                      maxHeight: 260,
                      borderRadius: 12,
                      objectFit: 'cover',
                    }}
                    loading="lazy"
                  />
                </a>
              ) : hasFile ? (
                <a
                  href={String(message.file_url)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`파일 다운로드 ${fileName}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: mine ? '#fff' : 'var(--z-900)',
                    textDecoration: 'none',
                  }}
                >
                  <MIcon name="paperclip" size={18} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {fileName}
                    </span>
                    {fileSize && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: 0.75,
                        }}
                      >
                        {fileSize}
                      </span>
                    )}
                  </span>
                  <MIcon name="chevR" size={18} />
                </a>
              ) : (
                text ? renderMessageContent(text, mine) : <span style={{ opacity: 0.7 }}>(빈 메시지)</span>
              )}
            </div>


            {!mine && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                {displayedReadCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--m-green)',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                    }}
                  >
                    {displayedReadCount}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--z-400)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ts}
                </span>
              </div>
            )}
          </div>

          {reactionEntries.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginTop: 4,
                flexWrap: 'wrap',
                justifyContent: mine ? 'flex-end' : 'flex-start',
              }}
            >
              {reactionEntries.map((entry) => {
                const mineReaction = myUserId
                  ? entry.users.includes(String(myUserId))
                  : false;
                return (
                  <button
                    key={entry.emoji}
                    type="button"
                    aria-label={`${entry.emoji} ${entry.users.length}명 — ${mineReaction ? '취소' : '추가'}`}
                    onClick={() => onToggleReaction(String(message.id), entry.emoji)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'var(--accent-tint)',
                      color: 'var(--m-accent)',
                      fontSize: 11,
                      fontWeight: 700,
                      border: mineReaction ? '1px solid var(--m-accent)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {entry.emoji} {entry.users.length}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
