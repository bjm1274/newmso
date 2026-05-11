'use client';

/**
 * ConversationView.tsx — 대화 화면 (헤더 + 메시지 목록 + 입력창)
 *
 * JM4: any 금지, 타입 명시
 * JM6: aria-label, 뒤로가기 버튼 aria-label
 */

import React, { useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ChatRoom, ChatMessage } from './dummy-data';
import { USER_MAP, ROOM_MESSAGES, ME_ID } from './dummy-data';
import { VirtualMessageList } from './VirtualMessageList';
import { MessageInput } from './MessageInput';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface ConversationViewProps {
  room: ChatRoom;
  onBack?: () => void; // 모바일 뒤로가기
}

// ── 방 부제목 ─────────────────────────────────────────────────────────────────

function roomSubtitle(room: ChatRoom): string {
  if (room.type === 'group') {
    return `${room.participants.length}명`;
  }
  const otherId = room.participants.find((id) => id !== ME_ID) ?? '';
  return USER_MAP[otherId]?.name ?? '';
}

// ── ConversationView ──────────────────────────────────────────────────────────

export function ConversationView({ room, onBack }: ConversationViewProps) {
  const initialMessages = ROOM_MESSAGES[room.id] ?? [];
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages]);

  const handleSend = useCallback((text: string) => {
    const newMsg: ChatMessage = {
      id: `${room.id}_local_${Date.now()}`,
      roomId: room.id,
      senderId: ME_ID,
      text,
      sentAt: new Date().toISOString(),
      status: 'sent',
    };
    setMessages((prev) => [...prev, newMsg]);
  }, [room.id]);

  return (
    <section
      aria-label={`${room.name} 대화`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--page-bg)',
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          height: 56,
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {onBack && (
          <button
            type="button"
            aria-label="채팅방 목록으로 돌아가기"
            onClick={onBack}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'transparent',
              color: 'var(--foreground)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            className="transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            className="text-sm font-bold truncate"
            style={{ color: 'var(--foreground)', margin: 0 }}
          >
            {room.name}
          </h1>
          <p
            className="text-xs"
            style={{ color: 'var(--toss-gray-4)', margin: 0 }}
          >
            {roomSubtitle(room)}
          </p>
        </div>
      </header>

      {/* 메시지 목록 (가상 스크롤) */}
      <VirtualMessageList messages={messages} />

      {/* 입력창 */}
      <MessageInput onSend={handleSend} />
    </section>
  );
}
