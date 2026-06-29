'use client';

/**
 * 모바일 채팅 — 스레드(답글 모음) 바텀시트.
 * PC 메신저스레드패널.ThreadPanel 의 모바일 버전.
 *
 * 스레드 구성: 루트 메시지 + reply_to_id === root.id 인 답글들(시간순).
 * (PC와 동일하게 reply_to_id 1-depth 기준. 별도 thread 테이블/컬럼을 만들지 않는다.)
 * 답글 전송은 부모(채팅방.tsx)의 onSendReply(rootMessage, text)로 위임 — 기존
 * sendMobileTextMessage(replyToId) 경로를 그대로 재사용한다.
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/aria).
 */

import { useMemo, useState } from 'react';
import type { ChatMessage } from '@/types';
import { renderMessageContent } from '@/app/main/기능부품/메신저메시지렌더';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import {
  formatBubbleTimestamp,
  type StaffDirectoryEntry,
} from './data-hooks';

export type ThreadSheetProps = {
  rootMessage: ChatMessage | null;
  messages: ChatMessage[];
  staffs: StaffDirectoryEntry[];
  userId: string | null;
  sending: boolean;
  onClose: () => void;
  onSendReply: (rootMessage: ChatMessage, text: string) => void;
};

function senderName(message: ChatMessage, staffs: StaffDirectoryEntry[]): string {
  return (
    message.sender_name ||
    staffs.find((s) => String(s.id) === String(message.sender_id || ''))?.name ||
    '알 수 없음'
  );
}

function ThreadRow({
  message,
  staffs,
  mine,
  isRoot = false,
}: {
  message: ChatMessage;
  staffs: StaffDirectoryEntry[];
  mine: boolean;
  isRoot?: boolean;
}) {
  const text = typeof message.content === 'string' ? message.content : '';

  if (isRoot) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: mine ? '#007AFF' : 'var(--z-700)' }}>
            {senderName(message, staffs)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--z-400)', fontWeight: 600 }}>
            {formatBubbleTimestamp(message.created_at)}
          </span>
          {mine && (
            <span style={{ fontSize: 9, background: 'rgba(0,122,255,0.1)', color: '#007AFF', padding: '1px 4px', borderRadius: 4, fontWeight: 700 }}>
              내 글
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: 'var(--z-900)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', marginTop: 4 }}>
          {message.file_url ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--m-accent)', fontWeight: 600 }}>
              <MIcon name="paperclip" size={13} color="var(--m-accent)" />
              {message.file_name || '첨부파일'}
            </span>
          ) : text ? (
            renderMessageContent(text, false, '')
          ) : (
            <span style={{ opacity: 0.6 }}>(빈 메시지)</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: mine ? 'flex-end' : 'flex-start',
        gap: 4,
        padding: '6px 0',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: mine ? 'row-reverse' : 'row' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-600)' }}>
          {senderName(message, staffs)}
        </span>
        <span style={{ fontSize: 9, color: 'var(--z-400)', fontWeight: 500 }}>
          {formatBubbleTimestamp(message.created_at)}
        </span>
      </div>
      <div
        className={mine ? '' : 'macos-glass'}
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          background: mine
            ? 'linear-gradient(135deg, #007AFF, #0A55E1)'
            : 'rgba(255, 255, 255, 0.75)',
          borderRadius: mine ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
          border: mine ? 'none' : '1px solid rgba(255, 255, 255, 0.4)',
          color: mine ? '#fff' : 'var(--z-900)',
          boxShadow: mine ? '0 4px 12px rgba(0, 122, 255, 0.15)' : '0 4px 12px rgba(0, 0, 0, 0.02)',
        }}
      >
        {message.file_url ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: mine ? '#fff' : 'var(--m-accent)', fontWeight: 600 }}>
            <MIcon name="paperclip" size={13} color={mine ? '#fff' : 'var(--m-accent)'} />
            {message.file_name || '첨부파일'}
          </span>
        ) : text ? (
          renderMessageContent(text, false, mine ? '#fff' : '')
        ) : (
          <span style={{ opacity: mine ? 0.6 : 0.4 }}>(빈 메시지)</span>
        )}
      </div>
    </div>
  );
}

export function ThreadSheet({
  rootMessage,
  messages,
  staffs,
  userId,
  sending,
  onClose,
  onSendReply,
}: ThreadSheetProps) {
  const [draft, setDraft] = useState('');

  const replies = useMemo(() => {
    if (!rootMessage) return [];
    return messages
      .filter((m) => String(m.reply_to_id || '') === String(rootMessage.id))
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  }, [messages, rootMessage]);

  const participantCount = useMemo(() => {
    if (!rootMessage) return 0;
    const ids = new Set<string>();
    ids.add(String(rootMessage.sender_id || ''));
    replies.forEach((m) => ids.add(String(m.sender_id || '')));
    ids.delete('');
    return ids.size;
  }, [replies, rootMessage]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !rootMessage) return;
    onSendReply(rootMessage, text);
    setDraft('');
  };

  return (
    <MSheet open={!!rootMessage} onClose={onClose} title="스레드">
      {rootMessage && (
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '72vh' }}>
          <div style={{ padding: '8px 20px 16px', flex: 1, overflowY: 'auto' }}>
            {/* 루트 메시지 */}
            <div
              className="macos-glass macos-squircle"
              style={{
                background: 'rgba(255, 255, 255, 0.45)',
                padding: '14px 16px',
                borderLeft: '4px solid #007AFF',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: '#007AFF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                원문 메시지
              </div>
              <ThreadRow
                message={rootMessage}
                staffs={staffs}
                mine={String(rootMessage.sender_id || '') === String(userId || '')}
                isRoot={true}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '12px 0 8px', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-500)', background: 'rgba(120, 120, 128, 0.08)', padding: '2px 8px', borderRadius: 12 }}>
                답글 {replies.length}개
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-500)', background: 'rgba(120, 120, 128, 0.08)', padding: '2px 8px', borderRadius: 12 }}>
                참여 {participantCount}명
              </span>
            </div>

            {replies.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--z-400)', fontWeight: 500 }}>
                아직 답글이 없습니다. 첫 답글을 남겨보세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {replies.map((reply) => (
                  <ThreadRow
                    key={String(reply.id)}
                    message={reply}
                    staffs={staffs}
                    mine={String(reply.sender_id || '') === String(userId || '')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 답글 입력 */}
          <div
            style={{
              borderTop: '1px solid rgba(120, 120, 128, 0.12)',
              padding: '12px 16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255, 255, 255, 0.35)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="스레드에 답글 달기"
              aria-label="스레드에 답글 달기"
              disabled={sending}
              style={{
                flex: 1,
                padding: '11px 16px',
                fontSize: 14,
                fontFamily: 'inherit',
                background: 'rgba(120, 120, 128, 0.08)',
                border: '1px solid rgba(120, 120, 128, 0.15)',
                borderRadius: 22,
                outline: 'none',
                color: 'var(--z-900)',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#007AFF';
                e.target.style.background = 'rgba(255, 255, 255, 0.85)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
                e.target.style.background = 'rgba(120, 120, 128, 0.08)';
              }}
            />
            <button
              type="button"
              aria-label="답글 전송"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: draft.trim() && !sending
                  ? 'linear-gradient(135deg, #007AFF, #0A55E1)'
                  : 'rgba(120, 120, 128, 0.15)',
                color: draft.trim() && !sending ? '#fff' : 'rgba(120, 120, 128, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                flexShrink: 0,
                cursor: draft.trim() && !sending ? 'pointer' : 'not-allowed',
                boxShadow: draft.trim() && !sending ? '0 4px 10px rgba(0, 122, 255, 0.25)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <MIcon name="send" size={15} color={draft.trim() && !sending ? '#fff' : 'rgba(120, 120, 128, 0.4)'} />
            </button>
          </div>
        </div>
      )}
    </MSheet>
  );
}
