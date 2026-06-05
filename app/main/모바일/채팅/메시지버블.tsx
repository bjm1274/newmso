'use client';

/**
 * 모바일 채팅 메시지 버블.
 * - 텍스트 / 이미지 / 일반 파일 첨부 렌더
 * - 반응 chip (m-screens-1.jsx 디자인 그대로)
 * - "+ 반응" 버튼 + ReactionMenu(자식 컴포넌트가 제어)
 *
 * 제약: JM(< 500줄, 단일 책임), JM4(any 금지), JM6(button + aria-label).
 */

import { useMemo } from 'react';
import type { ChatMessage } from '@/types';
import { renderMessageContent } from '@/app/main/기능부품/메신저메시지렌더';
import MAvatar from '../공통/MAvatar';
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
  onToggleReaction: (messageId: string, emoji: string) => void;
  onImageLoad?: () => void;
};

const IMAGE_KINDS = new Set(['image']);

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
  onToggleReaction,
  onImageLoad,
}: MessageBubbleProps) {
  const ts = formatBubbleTimestamp(message.created_at);
  const senderName =
    message.sender_name ||
    staffs.find((s) => String(s.id) === String(message.sender_id || ''))?.name ||
    (mine ? fallbackMyName : '알 수 없음');
  const tone = pickAvatarTone(String(message.sender_id || senderName));
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

  return (
    <div
      data-testid={`chat-message-row-${message.id}`}
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 8,
        justifyContent: mine ? 'flex-end' : 'flex-start',
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
  );
}


