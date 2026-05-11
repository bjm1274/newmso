'use client';

/**
 * ChatClient.tsx — 채팅 메인 클라이언트
 *
 * 레이아웃:
 *   - 모바일 (<600px): 방 목록 → 대화 전환 (풀스크린)
 *   - PC (≥600px): 좌 280px 방 목록 + 우 flex 대화 (split view)
 *
 * JM2: useDebouncedSearch (300ms), useMemo 필터링
 * JM4: any 금지, 타입 명시
 * JM6: 검색 input aria-label, 빵부스러기 nav
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { DUMMY_ROOMS } from './dummy-data';
import type { ChatRoom } from './dummy-data';
import { RoomList } from './RoomList';
import { ConversationView } from './ConversationView';

// ── useDebouncedSearch ────────────────────────────────────────────────────────

function useDebouncedSearch(delay = 300): [string, string, (v: string) => void] {
  const [raw, setRaw] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setQuery(v: string) {
    setRaw(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v), delay);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return [raw, debounced, setQuery];
}

// ── 채팅 검색바 ───────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

function ChatSearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div
      role="search"
      aria-label="채팅방 검색"
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--toss-gray-4)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          aria-label="채팅방 이름 또는 메시지 검색"
          placeholder="채팅방 검색"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: 32,
            paddingRight: value ? 32 : 12,
            paddingTop: 7,
            paddingBottom: 7,
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--input-bg)',
            color: 'var(--foreground)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
        />
        {value && (
          <button
            type="button"
            aria-label="검색 초기화"
            onClick={() => onChange('')}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--toss-gray-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── 빈 상태 (대화 미선택) ─────────────────────────────────────────────────────

function EmptyConversation() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--toss-gray-4)',
        gap: 8,
      }}
      aria-label="채팅방을 선택하세요"
    >
      <span style={{ fontSize: 40 }} aria-hidden="true">💬</span>
      <p className="text-sm">채팅방을 선택하세요</p>
    </div>
  );
}

// ── 빵부스러기 ─────────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  roomName: string | null;
}

function Breadcrumb({ roomName }: BreadcrumbProps) {
  return (
    <nav aria-label="현재 위치" style={{ padding: '8px 16px 0' }}>
      <ol
        style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: 'var(--toss-gray-4)' }}
      >
        <li>채팅</li>
        {roomName && (
          <>
            <li aria-hidden="true">/</li>
            <li aria-current="page" style={{ color: 'var(--foreground)' }}>{roomName}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

// ── ChatClient 본체 ───────────────────────────────────────────────────────────

export function ChatClient() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [rawQuery, debouncedQuery, setQuery] = useDebouncedSearch(300);

  const selectedRoom = useMemo<ChatRoom | null>(
    () => DUMMY_ROOMS.find((r) => r.id === selectedRoomId) ?? null,
    [selectedRoomId],
  );

  const handleSelectRoom = useCallback((id: string) => {
    setSelectedRoomId(id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedRoomId(null);
  }, []);

  // 모바일: 방 선택 시 대화 화면 표시
  const showConversation = selectedRoom !== null;

  return (
    <>
      {/* CSS: 반응형 레이아웃 */}
      <style>{`
        .chat-shell {
          display: flex;
          height: 100%;
          background: var(--page-bg);
        }
        .chat-room-panel {
          display: flex;
          flex-direction: column;
          width: 100%;
          background: var(--card);
          border-right: 1px solid var(--border);
          overflow: hidden;
        }
        .chat-conv-panel {
          display: none;
          flex: 1;
          overflow: hidden;
        }
        /* PC split view */
        @media (min-width: 600px) {
          .chat-room-panel {
            width: 280px;
            flex-shrink: 0;
          }
          .chat-conv-panel {
            display: flex;
            flex-direction: column;
          }
          .chat-mobile-back { display: none !important; }
        }
        /* 모바일: 선택 시 방 목록 숨김 */
        @media (max-width: 599px) {
          .chat-room-panel.is-hidden {
            display: none;
          }
          .chat-conv-panel.is-visible {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
        }
      `}</style>

      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Breadcrumb roomName={selectedRoom?.name ?? null} />

        <div className="chat-shell" style={{ flex: 1, minHeight: 0 }}>
          {/* 방 목록 패널 */}
          <div
            className={`chat-room-panel${showConversation ? ' is-hidden' : ''}`}
            aria-label="채팅방 목록"
          >
            {/* 패널 헤더 */}
            <div
              style={{
                padding: '14px 16px 10px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h2
                className="text-base font-bold"
                style={{ color: 'var(--foreground)', margin: 0 }}
              >
                채팅
              </h2>
            </div>

            <ChatSearchBar value={rawQuery} onChange={setQuery} />

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <RoomList
                rooms={DUMMY_ROOMS}
                selectedRoomId={selectedRoomId}
                searchQuery={debouncedQuery}
                onSelectRoom={handleSelectRoom}
              />
            </div>
          </div>

          {/* 대화 패널 */}
          <div
            className={`chat-conv-panel${showConversation ? ' is-visible' : ''}`}
          >
            {selectedRoom ? (
              <ConversationView
                room={selectedRoom}
                onBack={handleBack}
              />
            ) : (
              <EmptyConversation />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
