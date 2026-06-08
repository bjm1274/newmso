'use client';

/**
 * 모바일 채팅방의 버블 리스트.
 * 메시지 + 날짜 구분선(system bubble)을 묶어 렌더.
 * 채팅방.tsx에서 분리 (JM: 채팅방.tsx 500줄 이내 유지).
 */

import { useMemo } from 'react';
import type { ChatMessage } from '@/types';
import {
  formatBubbleDateLabel,
  isSameDay,
  type StaffDirectoryEntry,
} from './data-hooks';
import MessageBubble from './메시지버블';

export type BubbleListProps = {
  messages: ChatMessage[];
  userId: string | null;
  userName: string;
  staffs: StaffDirectoryEntry[];
  readCounts?: Record<string, number>;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onImageLoad?: () => void;
};

export default function BubbleList({
  messages,
  userId,
  userName,
  staffs,
  readCounts = {},
  onToggleReaction,
  onImageLoad,
}: BubbleListProps) {
  const items = useMemo(() => {
    const out: Array<
      | { kind: 'date'; label: string; key: string }
      | { kind: 'msg'; message: ChatMessage; key: string }
    > = [];
    let prevTimestamp: string | null = null;
    messages.forEach((message) => {
      const ts = (message.created_at as string | null | undefined) || null;
      if (!prevTimestamp || !isSameDay(prevTimestamp, ts || null)) {
        out.push({
          kind: 'date',
          label: formatBubbleDateLabel(ts),
          key: `date-${ts || message.id}`,
        });
      }
      out.push({ kind: 'msg', message, key: String(message.id) });
      prevTimestamp = ts;
    });
    return out;
  }, [messages]);

  return (
    <>
      {items.map((item) => {
        if (item.kind === 'date') {
          return <SystemBubble key={item.key} label={item.label} />;
        }
        return (
          <MessageBubble
            key={item.key}
            message={item.message}
            mine={String(item.message.sender_id || '') === String(userId || '')}
            myUserId={userId}
            staffs={staffs}
            readCount={readCounts[String(item.message.id)] || 0}
            fallbackMyName={userName}
            onToggleReaction={onToggleReaction}
            onImageLoad={onImageLoad}
          />
        );
      })}
    </>
  );
}

function SystemBubble({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', margin: '10px 0' }}>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 999,
          background: 'var(--z-200)',
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--z-600)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
