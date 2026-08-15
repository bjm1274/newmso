'use client';

/**
 * 모바일 채팅방의 버블 리스트.
 * 메시지 + 날짜 구분선(system bubble)을 묶어 렌더.
 * 채팅방.tsx에서 분리 (JM: 채팅방.tsx 500줄 이내 유지).
 * 2026-07-20: 가변 높이 안전 윈도우 렌더(슬라이스+오버스캔). FixedSizeList 미사용.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@/types';
import {
  formatBubbleDateLabel,
  isSameDay,
  type StaffDirectoryEntry } from './data-hooks';
import MessageBubble from './메시지버블';
import { PollCard } from './투표';
import type { RoomPollsResult } from './메시지액션';

const BUBBLE_INITIAL_WINDOW = 80;
const BUBBLE_EXPAND_BY = 40;
const BUBBLE_JUMP_OVERSCAN = 20;

type BubbleListItem =
  | { kind: 'date'; label: string; key: string }
  | { kind: 'msg'; message: ChatMessage; key: string; ts: number }
  | { kind: 'poll'; poll: RoomPollsResult['polls'][number]; key: string; ts: number };

export type BubbleListProps = {
  messages: ChatMessage[];
  userId: string | null;
  userName: string;
  staffs: StaffDirectoryEntry[];
  readCounts?: Record<string, number>;
  isGroupChat?: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onImageLoad?: () => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
  onBookmark: (message: ChatMessage) => void;
  onTask: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onReactionDetail?: (message: ChatMessage) => void;
  onReadDetail?: (message: ChatMessage) => void;
  onOpenThread?: (message: ChatMessage) => void;
  searchMessageId?: string | null;
  onJumpToMessage?: (messageId: string) => void;
  pollData?: RoomPollsResult;
  pollVoting?: boolean;
  onVotePoll?: (pollId: string, optionIndex: number) => void;
};

export default function BubbleList({
  messages,
  userId,
  userName,
  staffs,
  readCounts = {},
  isGroupChat = false,
  onToggleReaction,
  onReply,
  onEdit,
  onImageLoad,
  onOpenBoardPost,
  onBookmark,
  onTask,
  onDelete,
  onForward,
  onReactionDetail,
  onReadDetail,
  onOpenThread,
  searchMessageId,
  onJumpToMessage,
  pollData,
  pollVoting = false,
  onVotePoll }: BubbleListProps) {
  // 각 루트 메시지에 달린 답글(reply_to_id) 수 — 스레드 뱃지
  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((m) => {
      const parentId = m.reply_to_id ? String(m.reply_to_id) : '';
      if (parentId) counts[parentId] = (counts[parentId] || 0) + 1;
    });
    return counts;
  }, [messages]);

  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((message) => {
      const id = String(message.id || '').trim();
      if (id) map.set(id, message);
    });
    return map;
  }, [messages]);

  const items = useMemo(() => {
    const out: BubbleListItem[] = [];

    const combined: Array<
      | { type: 'msg'; data: ChatMessage; ts: number; iso: string | null }
      | { type: 'poll'; data: RoomPollsResult['polls'][number]; ts: number; iso: string | null }
    > = [];

    messages.forEach((m) => {
      const ts = m.created_at ? new Date(m.created_at as string).getTime() : 0;
      combined.push({ type: 'msg', data: m, ts, iso: (m.created_at as string | null) || null });
    });

    if (pollData?.polls) {
      pollData.polls.forEach((p) => {
        const ts = p.created_at ? new Date(p.created_at as string).getTime() : 0;
        combined.push({ type: 'poll', data: p, ts, iso: (p.created_at as string | null) || null });
      });
    }

    combined.sort((a, b) => a.ts - b.ts);

    let prevTimestamp: string | null = null;
    combined.forEach((item) => {
      const iso = item.iso;
      if (!prevTimestamp || !isSameDay(prevTimestamp, iso)) {
        out.push({
          kind: 'date',
          label: formatBubbleDateLabel(iso),
          key: `date-${iso || item.ts}` });
      }
      if (item.type === 'msg') {
        out.push({ kind: 'msg', message: item.data, key: String(item.data.id), ts: item.ts });
      } else {
        out.push({ kind: 'poll', poll: item.data, key: `poll-${item.data.id}`, ts: item.ts });
      }
      prevTimestamp = iso;
    });
    return out;
  }, [messages, pollData]);

  const roomSignature = useMemo(() => {
    const first = messages[0] ? String(messages[0].id) : '';
    const last = messages.length > 0 ? String(messages[messages.length - 1]?.id || '') : '';
    return `${messages.length}:${first}:${last}:${pollData?.polls?.length || 0}`;
  }, [messages, pollData?.polls?.length]);

  const [windowStart, setWindowStart] = useState(() =>
    items.length <= BUBBLE_INITIAL_WINDOW ? 0 : Math.max(0, items.length - BUBBLE_INITIAL_WINDOW),
  );
  const prevMetaRef = useRef<{ signature: string; firstMsgId: string; length: number }>({
    signature: roomSignature,
    firstMsgId: messages[0] ? String(messages[0].id) : '',
    length: items.length,
  });
  const pendingScrollRestoreRef = useRef<{ parent: HTMLElement; prevHeight: number } | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const prev = prevMetaRef.current;
    const nextFirstMsgId = messages[0] ? String(messages[0].id) : '';
    const nextLength = items.length;

    if (prev.signature === roomSignature) {
      // items 재계산만 있고 시그니처 동일하면 클램프만
      setWindowStart((start) => {
        if (nextLength <= BUBBLE_INITIAL_WINDOW) return 0;
        return Math.min(start, Math.max(0, nextLength - 1));
      });
      return;
    }

    const firstChanged = prev.firstMsgId !== nextFirstMsgId;
    if (firstChanged && prev.firstMsgId) {
      const oldFirstIdx = items.findIndex(
        (item) => item.kind === 'msg' && String(item.message.id) === prev.firstMsgId,
      );
      if (oldFirstIdx > 0) {
        // loadOlder prepend — 보이는 구간 유지
        setWindowStart((start) => Math.min(nextLength, start + oldFirstIdx));
        prevMetaRef.current = {
          signature: roomSignature,
          firstMsgId: nextFirstMsgId,
          length: nextLength,
        };
        return;
      }
    }

    if (firstChanged || prev.length === 0) {
      // 방 전환 또는 초기 로드 — 최신 쪽 윈도우
      setWindowStart(nextLength <= BUBBLE_INITIAL_WINDOW ? 0 : Math.max(0, nextLength - BUBBLE_INITIAL_WINDOW));
    } else {
      // 하단 append — windowStart 유지(항상 끝까지 렌더)
      setWindowStart((start) => {
        if (nextLength <= BUBBLE_INITIAL_WINDOW) return 0;
        return Math.min(start, Math.max(0, nextLength - 1));
      });
    }

    prevMetaRef.current = {
      signature: roomSignature,
      firstMsgId: nextFirstMsgId,
      length: nextLength,
    };
  }, [items, messages, roomSignature]);

  // 검색/점프 대상이 윈도우 밖이면 확장
  useLayoutEffect(() => {
    const targetId = String(searchMessageId || '').trim();
    if (!targetId || items.length === 0) return;
    const targetIndex = items.findIndex(
      (item) => item.kind === 'msg' && String(item.message.id) === targetId,
    );
    if (targetIndex < 0) return;
    setWindowStart((start) => {
      const next = Math.max(0, targetIndex - BUBBLE_JUMP_OVERSCAN);
      return next < start ? next : start;
    });
  }, [items, searchMessageId]);

  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    if (!restore) return;
    pendingScrollRestoreRef.current = null;
    const delta = restore.parent.scrollHeight - restore.prevHeight;
    if (delta !== 0) {
      restore.parent.scrollTop = restore.parent.scrollTop + delta;
    }
  }, [windowStart]);

  const effectiveWindowStart =
    items.length <= BUBBLE_INITIAL_WINDOW ? 0 : Math.min(windowStart, Math.max(0, items.length - 1));
  const visibleItems = useMemo(
    () => (effectiveWindowStart > 0 ? items.slice(effectiveWindowStart) : items),
    [effectiveWindowStart, items],
  );

  const expandWindowUp = useCallback(() => {
    if (effectiveWindowStart <= 0) return;
    const sentinel = topSentinelRef.current;
    const parent = (sentinel?.closest('.m-scroll') || sentinel?.parentElement) as HTMLElement | null;
    if (parent) {
      pendingScrollRestoreRef.current = { parent, prevHeight: parent.scrollHeight };
    }
    setWindowStart((start) => Math.max(0, start - BUBBLE_EXPAND_BY));
  }, [effectiveWindowStart]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || effectiveWindowStart <= 0) return;
    const scrollRoot = sentinel.closest('.m-scroll') as Element | null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          expandWindowUp();
        }
      },
      { root: scrollRoot, rootMargin: '120px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [effectiveWindowStart, expandWindowUp, visibleItems.length]);

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      const targetId = String(messageId || '').trim();
      if (!targetId) return;
      const targetIndex = items.findIndex(
        (item) => item.kind === 'msg' && String(item.message.id) === targetId,
      );
      if (targetIndex >= 0) {
        setWindowStart((start) => {
          const next = Math.max(0, targetIndex - BUBBLE_JUMP_OVERSCAN);
          return next < start ? next : start;
        });
      }
      window.requestAnimationFrame(() => {
        onJumpToMessage?.(targetId);
      });
    },
    [items, onJumpToMessage],
  );

  return (
    <div data-testid="chat-bubble-list-window">
      {effectiveWindowStart > 0 ? (
        <div
          ref={topSentinelRef}
          data-testid="chat-bubble-window-sentinel"
          style={{ textAlign: 'center', margin: '6px 0', fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.4)' }}
        >
          이전 메시지 {effectiveWindowStart}개 · 스크롤하여 더 보기
        </div>
      ) : null}
      {visibleItems.map((item) => {
        if (item.kind === 'date') {
          return <DateDivider key={item.key} label={item.label} />;
        }
        if (item.kind === 'poll') {
          return (
            <div key={item.key} style={{ padding: '0 16px' }}>
              <PollCard
                poll={item.poll}
                voteCounts={pollData?.voteCounts[item.poll.id] || {}}
                myVote={pollData?.myVotes[item.poll.id]}
                voting={pollVoting}
                onVote={(pid, opt) => onVotePoll?.(pid, opt)}
              />
            </div>
          );
        }
        const replyId = item.message.reply_to_id ? String(item.message.reply_to_id) : '';
        return (
          <MessageBubble
            key={item.key}
            message={item.message}
            replyTarget={replyId ? messageById.get(replyId) : undefined}
            mine={String(item.message.sender_id || '') === String(userId || '')}
            myUserId={userId}
            staffs={staffs}
            readCount={readCounts[String(item.message.id)] || 0}
            isGroupChat={isGroupChat}
            fallbackMyName={userName}
            onToggleReaction={onToggleReaction}
            onReply={onReply}
            onEdit={onEdit}
            onImageLoad={onImageLoad}
            onOpenBoardPost={onOpenBoardPost}
            onBookmark={onBookmark}
            onTask={onTask}
            onDelete={onDelete}
            onForward={onForward}
            onReactionDetail={onReactionDetail}
            onReadDetail={onReadDetail}
            onOpenThread={onOpenThread}
            threadReplyCount={threadCounts[String(item.message.id)] || 0}
            searchMessageId={searchMessageId}
            onJumpToMessage={handleJumpToMessage}
          />
        );
      })}
    </div>
  );
}

/**
 * 날짜 구분선.
 *
 * 예전에는 시스템 안내와 같은 pill 을 썼다 — "2월 3일" 과 "박준호님이 참여했습니다"
 * 가 같은 모양이라 어느 쪽이 시간 눈금인지 구분되지 않았다. 날짜는 좌우 헤어라인,
 * 시스템 안내는 pill(메시지버블.tsx)로 갈라 둔다.
 */
function DateDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 16px 4px' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--m-border)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-400)' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--m-border)' }} />
    </div>
  );
}
