'use client';

/**
 * VirtualMessageList.tsx — IntersectionObserver 기반 가상 스크롤 메시지 목록
 *
 * 구현 전략:
 *   - 초기: 마지막 50개 렌더 (WINDOW = 50)
 *   - 위로 스크롤 → 상단 sentinel이 보이면 이전 50개 prepend
 *   - 역방향 무한 스크롤 패턴
 *
 * JM2: 최대 WINDOW개 메시지만 DOM에 유지, IntersectionObserver로 조건부 prepend
 * JM4: any 금지, 명시적 타입
 * JM6: role="log" aria-live="polite" aria-label
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage } from './dummy-data';
import { USER_MAP, ME_ID } from './dummy-data';

// ── 상수 ──────────────────────────────────────────────────────────────────────

const WINDOW = 50;

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface VirtualMessageListProps {
  messages: readonly ChatMessage[];
}

// ── 메시지 시간 포맷 ──────────────────────────────────────────────────────────

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ── 날짜 구분선 ───────────────────────────────────────────────────────────────

function DateDivider({ iso }: { iso: string }) {
  const label = new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div
      role="separator"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span className="text-[11px]" style={{ color: 'var(--toss-gray-4)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// ── 메시지 버블 ───────────────────────────────────────────────────────────────

interface BubbleProps {
  msg: ChatMessage;
  showSender: boolean;
}

const MessageBubble = React.memo(function MessageBubble({ msg, showSender }: BubbleProps) {
  const isMe = msg.senderId === ME_ID;
  const sender = USER_MAP[msg.senderId];
  const senderName = sender?.name ?? '알 수 없음';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
        padding: '2px 16px',
      }}
    >
      {/* 상대방 이름 (그룹채팅 최초 등장 시) */}
      {!isMe && showSender && (
        <span
          className="text-[11px] font-semibold mb-1"
          style={{ color: senderName ? sender?.color : 'var(--toss-gray-4)' }}
        >
          {senderName}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMe ? 'row-reverse' : 'row' }}>
        {/* 버블 */}
        <div
          style={{
            maxWidth: '72%',
            padding: '8px 12px',
            borderRadius: isMe
              ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)'
              : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
            background: isMe ? 'var(--accent)' : 'var(--card)',
            border: isMe ? 'none' : '1px solid var(--border)',
            color: isMe ? '#fff' : 'var(--foreground)',
            wordBreak: 'break-word',
          }}
        >
          <p className="text-sm leading-relaxed" style={{ margin: 0 }}>
            {msg.text}
          </p>
        </div>

        {/* 시간 */}
        <span
          className="text-[10px] shrink-0"
          aria-label={`${formatMsgTime(msg.sentAt)} 전송`}
          style={{ color: 'var(--toss-gray-4)', marginBottom: 2 }}
        >
          {formatMsgTime(msg.sentAt)}
        </span>
      </div>
    </div>
  );
});

// ── VirtualMessageList 본체 ───────────────────────────────────────────────────

export function VirtualMessageList({ messages }: VirtualMessageListProps) {
  const total = messages.length;

  // 렌더 시작 인덱스 (끝에서 WINDOW개)
  const [startIdx, setStartIdx] = useState(() => Math.max(0, total - WINDOW));

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMore = useRef(false);

  // 메시지 변경 시 끝으로 이동
  useEffect(() => {
    setStartIdx(Math.max(0, total - WINDOW));
  }, [total]);

  // 새 메시지 도착 시 스크롤 맨 아래로
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // 위쪽 sentinel 감지 → 이전 메시지 prepend
  const loadMore = useCallback(() => {
    if (isLoadingMore.current) return;
    setStartIdx((prev) => {
      if (prev <= 0) return prev;
      isLoadingMore.current = true;
      const next = Math.max(0, prev - WINDOW);
      // 스크롤 위치 유지: 높이 변화만큼 보정
      requestAnimationFrame(() => {
        if (listRef.current) {
          const el = listRef.current;
          const oldHeight = el.scrollHeight;
          requestAnimationFrame(() => {
            el.scrollTop += el.scrollHeight - oldHeight;
            isLoadingMore.current = false;
          });
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { root: listRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const visible = messages.slice(startIdx);

  // 날짜 구분선 계산
  function needDateDivider(i: number): boolean {
    if (i === 0) return true;
    const prev = visible[i - 1];
    const curr = visible[i];
    if (!prev || !curr) return false;
    return new Date(prev.sentAt).toDateString() !== new Date(curr.sentAt).toDateString();
  }

  return (
    <div
      ref={listRef}
      role="log"
      aria-label="채팅 메시지 목록"
      aria-live="polite"
      aria-atomic="false"
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 8,
      }}
    >
      {/* 상단 sentinel: 더 이전 메시지 로드 트리거 */}
      <div ref={sentinelRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />

      {startIdx > 0 && (
        <div
          style={{ textAlign: 'center', padding: '8px 0', color: 'var(--toss-gray-4)', fontSize: 12 }}
          aria-live="polite"
        >
          이전 메시지 불러오는 중...
        </div>
      )}

      {visible.map((msg, i) => {
        const prevMsg = i > 0 ? visible[i - 1] : null;
        const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;

        return (
          <React.Fragment key={msg.id}>
            {needDateDivider(i) && <DateDivider iso={msg.sentAt} />}
            <MessageBubble msg={msg} showSender={showSender} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
