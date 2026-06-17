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
}: {
  message: ChatMessage;
  staffs: StaffDirectoryEntry[];
  mine: boolean;
}) {
  const text = typeof message.content === 'string' ? message.content : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: mine ? 'var(--m-accent)' : 'var(--z-700)' }}>
          {senderName(message, staffs)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--z-400)', fontWeight: 600 }}>
          {formatBubbleTimestamp(message.created_at)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--z-900)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {message.file_url ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--m-accent)' }}>
            <MIcon name="paperclip" size={13} />
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
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          <div style={{ padding: '4px 20px 12px', flex: 1, overflowY: 'auto' }}>
            {/* 루트 메시지 */}
            <div
              style={{
                background: 'var(--m-bg)',
                borderRadius: 12,
                padding: '12px 14px',
                borderLeft: '3px solid var(--m-accent)',
              }}
            >
              <ThreadRow
                message={rootMessage}
                staffs={staffs}
                mine={String(rootMessage.sender_id || '') === String(userId || '')}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '12px 0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>답글 {replies.length}개</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>· 참여 {participantCount}명</span>
            </div>

            {replies.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--z-400)', fontWeight: 600 }}>
                아직 답글이 없습니다. 첫 답글을 남겨보세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
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
              borderTop: '1px solid var(--m-border)',
              padding: '8px 16px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
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
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'inherit',
                background: 'var(--m-bg)',
                border: '1px solid var(--m-border)',
                borderRadius: 22,
                outline: 'none',
                color: 'var(--z-900)',
              }}
            />
            <button
              type="button"
              aria-label="답글 전송"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: draft.trim() && !sending ? 'var(--m-accent)' : 'var(--z-300)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                flexShrink: 0,
              }}
            >
              <MIcon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
    </MSheet>
  );
}
