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
import { PollCard } from './투표';
import type { RoomPollsResult } from './메시지액션';

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
  pollData,
  pollVoting = false,
  onVotePoll,
}: BubbleListProps) {
  // 각 루트 메시지에 달린 답글(reply_to_id) 수 — 스레드 뱃지
  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((m) => {
      const parentId = m.reply_to_id ? String(m.reply_to_id) : '';
      if (parentId) counts[parentId] = (counts[parentId] || 0) + 1;
    });
    return counts;
  }, [messages]);

  const items = useMemo(() => {
    const out: Array<
      | { kind: 'date'; label: string; key: string }
      | { kind: 'msg'; message: ChatMessage; key: string; ts: number }
      | { kind: 'poll'; poll: RoomPollsResult['polls'][number]; key: string; ts: number }
    > = [];
    
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
          key: `date-${iso || item.ts}`,
        });
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

  return (
    <>
      {items.map((item) => {
        if (item.kind === 'date') {
          return <SystemBubble key={item.key} label={item.label} />;
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
        return (
          <MessageBubble
            key={item.key}
            message={item.message}
            replyTarget={item.message.reply_to_id ? messages.find(m => String(m.id) === String(item.message.reply_to_id)) : undefined}
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
