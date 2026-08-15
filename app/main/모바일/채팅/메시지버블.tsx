'use client';

/**
 * 모바일 채팅 메시지 버블.
 * - 텍스트 / 이미지 / 일반 파일 첨부 렌더
 * - 반응 chip (m-screens-1.jsx 디자인 그대로)
 * - 스와이프 제스처: 좌/우 밀면 이모지 리액션 바 + 답장/복사 액션 노출
 *
 * 제약: JM(< 500줄, 단일 책임), JM4(any 금지), JM6(button + aria-label).
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { ChatMessage } from '@/types';
import { renderMessageContent } from '@/app/main/기능부품/메신저메시지렌더';
import { buildStorageInlineUrl, buildStorageDownloadUrl } from '@/lib/object-storage-url';
import MIcon from '../공통/MIcon';
import {
  formatBubbleTimestamp,
  pickAvatarTone,
  type StaffDirectoryEntry } from './data-hooks';
import { toast } from '@/lib/toast';
import MessageActionsHost from '../../기능부품/메신저액션서브/MessageActionsHost';

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
  onEdit?: (message: ChatMessage) => void;
  onImageLoad?: () => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
  replyTarget?: ChatMessage;
  onBookmark: (message: ChatMessage) => void;
  onTask: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  /** 이모지별 반응자 상세 */
  onReactionDetail?: (message: ChatMessage) => void;
  /** 읽음 상세(누가 읽었나) */
  onReadDetail?: (message: ChatMessage) => void;
  /** 스레드(답글 모음) 열기 */
  onOpenThread?: (message: ChatMessage) => void;
  /** 이 메시지에 달린 답글 수(스레드) */
  threadReplyCount?: number;
  /** 검색을 통해 이동한 메시지인지 여부 (강조 및 스크롤용) */
  searchMessageId?: string | null;
  onJumpToMessage?: (messageId: string) => void;
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
  onEdit,
  onImageLoad,
  onOpenBoardPost,
  replyTarget,
  onBookmark,
  onTask,
  onDelete,
  onForward,
  onReactionDetail,
  onReadDetail,
  onOpenThread,
  threadReplyCount = 0,
  searchMessageId,
  onJumpToMessage }: MessageBubbleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (searchMessageId && String(message.id) === String(searchMessageId)) {
      setHighlighted(true);
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      setTimeout(() => {
        setHighlighted(false);
      }, 3000);
    }
  }, [searchMessageId, message.id]);

  const displayedReadCount = readCount;

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
        users: Array.isArray(users) ? users.map(String) : [] }))
      .filter((entry) => entry.users.length > 0);
  }, [message.reactions]);

  const isEmoticonOrSticker = useMemo(() => {
    if (hasFile) return false;
    const trimmed = text.trim();
    return /^\[emo:[a-z0-9-]+\]$/.test(trimmed) || /^\[stat:[a-z0-9-]+\]$/.test(trimmed);
  }, [text, hasFile]);

  const isSystemMessage = useMemo(() => {
    const trimmed = text.trim();
    return /^\[(초대|내보내기|퇴장|전달)\]/.test(trimmed);
  }, [text]);

  const wasEdited = Boolean(message.edited_at);
  const isPending = Boolean(message.status === 'sending' || message.is_pending || message.sending || message.is_sending);
  const hasThreadReplies = Boolean(threadReplyCount && threadReplyCount > 0);

  /**
   * 말풍선 옆 메타 스택 (전송중·수정됨·읽음·시각).
   *
   * mine / !mine 두 곳에 글자 단위로 같은 코드가 있었다. 크기도 색도 제각각이라
   * (10px 에 색 4종) 시선이 흩어졌다 — 크기는 한 종류, 강조는 읽음 하나로 모은다.
   * `답글 N` 은 여기서 빼서 말풍선 아래 pill 로 옮겼다.
   */
  const renderMeta = (align: 'flex-end' | 'flex-start') => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 2, flexShrink: 0 }}>
      {isPending && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--m-accent)', whiteSpace: 'nowrap' }}>
          전송중
        </span>
      )}
      {wasEdited && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--z-400)', whiteSpace: 'nowrap' }}>
          수정됨
        </span>
      )}
      {displayedReadCount > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--m-accent)', whiteSpace: 'nowrap' }}>
          읽음 {displayedReadCount}
        </span>
      )}
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--z-400)', whiteSpace: 'nowrap' }}>
        {ts}
      </span>
    </div>
  );
  const canEditMessage = mine && message.is_deleted !== true && !hasFile && !isSystemMessage && Boolean(text.trim());

  const handleCopy = useCallback(() => {
    if (text) {
      navigator.clipboard?.writeText(text).catch(() => {});
      toast('메시지가 복사되었습니다.', 'success');
    }
  }, [text]);

  return (
    <MessageActionsHost
      mine={mine}
      canDelete={mine}
      enableContextMenu={true}
      testId={`chat-message-row-${message.id}`}
      onReact={(emoji) => onToggleReaction(String(message.id), emoji)}
      onReply={() => onReply?.(message)}
      onEdit={canEditMessage && onEdit ? () => onEdit(message) : undefined}
      onCopy={handleCopy}
      onForward={() => onForward(message)}
      onBookmark={() => onBookmark(message)}
      onTask={() => onTask(message)}
      onDelete={() => onDelete(message)}
      onReadDetail={onReadDetail && mine ? () => onReadDetail(message) : undefined}
      onOpenThread={onOpenThread ? () => onOpenThread(message) : undefined}
      threadReplyCount={threadReplyCount}
    >
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: mine ? 'flex-end' : 'flex-start',
          position: 'relative',
          padding: '4px 0',
          opacity: swiping ? 0.9 : 1,
          transition: 'opacity 0.2s, background-color 0.5s',
          backgroundColor: highlighted ? 'var(--m-accent-soft)' : 'transparent' }}
      >
        {!mine && (
          <div style={{ width: 4, flexShrink: 0 }} />
        )}
        <div
          style={{
            maxWidth: '78%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: mine ? 'flex-end' : 'flex-start' }}
        >
          {!mine && (
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--z-500)',
                marginBottom: 3,
                padding: '0 4px' }}
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
              minWidth: 0,
              maxWidth: '100%' }}
          >
            {mine && renderMeta('flex-end')}


            <div
              data-testid={`chat-message-${message.id}`}
              style={{
                padding: (imageMode || isEmoticonOrSticker) && !replyTarget ? 0 : '10px 14px',
                borderRadius: 16,
                background: ((imageMode || isEmoticonOrSticker) && !replyTarget
                  ? 'transparent'
                  : mine
                    ? 'var(--m-accent)'
                    : 'var(--m-bubble-in-bg)') as React.CSSProperties['background'],
                color: mine && !((imageMode || isEmoticonOrSticker) && !replyTarget) ? '#fff' : 'var(--z-900)',
                border: (mine || ((imageMode || isEmoticonOrSticker) && !replyTarget) ? 'none' : '1px solid var(--m-bubble-in-border)') as React.CSSProperties['border'],
                borderBottomRightRadius: mine ? 5 : 16,
                borderBottomLeftRadius: mine ? 16 : 5,
                fontSize: 14.5,
                lineHeight: 1.55,
                fontWeight: 500,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
                overflow: 'hidden',
                minWidth: 0,
                flexShrink: 1,
                textWrap: 'pretty' }}
            >
              {(replyTarget || message.reply_to_id) && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (message.reply_to_id) {
                      onJumpToMessage?.(String(message.reply_to_id));
                    }
                  }}
                  style={{
                    background: (mine ? 'rgba(255, 255, 255, 0.16)' : 'var(--z-100)') as React.CSSProperties['background'],
                    borderRadius: 10,
                    padding: '7px 10px 7px 9px',
                    fontSize: 12,
                    borderLeft: `2px solid ${mine ? 'rgba(255, 255, 255, 0.85)' : 'var(--m-accent)'}`,
                    color: mine ? 'rgba(255, 255, 255, 0.9)' : 'var(--z-700)',
                    margin: '0 -4px 8px',
                    cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 2, color: mine ? '#fff' : 'var(--m-accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {replyTarget ? (
                      `${replyTarget.sender_name || staffs.find((s) => String(s.id) === String(replyTarget.sender_id))?.name || '알 수 없음'}에게 답장`
                    ) : (
                      '이전 대화 답글'
                    )}
                  </div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.9 }}>
                    {replyTarget ? (
                      typeof replyTarget.content === 'string' && replyTarget.content ? replyTarget.content : (replyTarget.file_name ? '첨부파일' : '(내용 없음)')
                    ) : (
                      '원문 메시지로 이동하려면 클릭하세요.'
                    )}
                  </div>
                </div>
              )}
              {imageMode && message.file_url ? (
                <a
                  href={buildStorageInlineUrl(String(message.file_url), fileName)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`첨부 이미지 ${fileName}`}
                  style={{ display: 'block' }}
                >
                  <img
                    // 저장된 file_url 은 공개 R2 도메인(https://r2.pchos.kr/...)인데
                    // 버킷이 공개가 아니라 401 이 나서 모바일에서 이미지가 깨져 있었다.
                    // PC(메신저첨부.tsx)와 동일하게 인증 프록시 URL 로 변환해서 쓴다.
                    src={buildStorageInlineUrl(String(message.file_url), fileName)}
                    alt={fileName}
                    onLoad={onImageLoad}
                    style={{
                      display: 'block',
                      maxWidth: 220,
                      maxHeight: 260,
                      borderRadius: 12,
                      objectFit: 'cover' }}
                    loading="lazy"
                  />
                </a>
              ) : hasFile ? (
                <a
                  href={buildStorageDownloadUrl(String(message.file_url), fileName)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`파일 다운로드 ${fileName}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: mine ? '#fff' : 'var(--z-900)',
                    textDecoration: 'none' }}
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
                        textOverflow: 'ellipsis' }}
                    >
                      {fileName}
                    </span>
                    {fileSize && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: 0.75 }}
                      >
                        {fileSize}
                      </span>
                    )}
                  </span>
                  <MIcon name="chevR" size={18} />
                </a>
              ) : (
                text ? renderMessageContent(text, mine, '', onOpenBoardPost) : <span style={{ opacity: 0.7 }}>(빈 메시지)</span>
              )}
            </div>


            {!mine && renderMeta('flex-start')}
          </div>

          {hasThreadReplies && (
            <button
              type="button"
              aria-label={`스레드 답글 ${threadReplyCount}개 보기`}
              onClick={() => onOpenThread?.(message)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 26,
                marginTop: 6,
                padding: '0 10px',
                borderRadius: 999,
                background: 'var(--m-accent-soft)',
                color: 'var(--m-accent)',
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer' }}
            >
              <MIcon name="chat" size={13} />
              답글 {threadReplyCount}
              <MIcon name="chevR" size={12} />
            </button>
          )}

          {reactionEntries.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginTop: 4,
                flexWrap: 'wrap',
                justifyContent: mine ? 'flex-end' : 'flex-start' }}
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
                    onContextMenu={(e) => {
                      if (onReactionDetail) {
                        e.preventDefault();
                        onReactionDetail(message);
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      height: 24,
                      padding: '0 9px',
                      borderRadius: 999,
                      background: mineReaction ? 'var(--m-accent-soft)' : 'var(--m-card)',
                      color: mineReaction ? 'var(--m-accent)' : 'var(--z-600)',
                      fontSize: 11.5,
                      fontWeight: 800,
                      border: `1px solid ${mineReaction ? 'rgba(37, 99, 235, 0.28)' : 'var(--m-border)'}`,
                      cursor: 'pointer' }}
                  >
                    {entry.emoji} {entry.users.length}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MessageActionsHost>
  );
}

