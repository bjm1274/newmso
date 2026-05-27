'use client';

/**
 * MessageHoverToolbar — 옵션 ① 호버 플로팅 툴바
 * (newmso(14).zip handoff_chat_actions/INSTRUCTIONS.md §1-1)
 *
 * - 데스크톱 전용: @media (hover: hover) and (pointer: fine) — 모바일/터치는 숨김
 * - 부모 hover 시 200ms delay 후 fade-in / leave 50ms fade-out
 * - 빠른 리액션 4개(👍 🙏 ✅ 👏) + [😀+] 이모지 추가 + 구분선 + [↩답글] [⧉복사] [⋯더보기]
 *
 * JM2: stateless presentation
 * JM6: 각 버튼 aria-label
 */

import type { MouseEvent } from 'react';
import { MenuIcon } from '../조직도서브/조직도측면창';

const QUICK_REACTIONS = ['👍', '🙏', '✅', '👏'] as const;

interface MessageHoverToolbarProps {
  /** 본인 메시지인지 — 위치 좌우 반전 */
  mine?: boolean;
  /** 빠른 리액션 클릭 */
  onReact: (emoji: string) => void;
  /** [+] 이모지 추가 트리거 — EmojiPicker open */
  onAddEmoji: (anchorX: number, anchorY: number) => void;
  /** 답글 */
  onReply: () => void;
  /** 복사 */
  onCopy: () => void;
  /** ⋯ 더보기 — ContextMenu와 동일 메뉴 */
  onMore: (anchorX: number, anchorY: number) => void;
}

export default function MessageHoverToolbar({
  mine = false,
  onReact,
  onAddEmoji,
  onReply,
  onCopy,
  onMore,
}: MessageHoverToolbarProps) {
  const handleStop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const handleAddEmoji = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    onAddEmoji(rect.left, rect.bottom);
  };

  const handleMore = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    onMore(rect.right, rect.bottom);
  };

  return (
    <div
      data-message-hover-toolbar
      data-mine={mine ? '1' : '0'}
      onClick={handleStop}
      className={`message-hover-toolbar absolute z-[5] flex items-center gap-0.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-1 shadow-[var(--shadow-pop,0_12px_32px_rgba(0,0,0,0.10)_,0_0_0_1px_rgba(0,0,0,0.05))] ${
        mine ? 'left-3 right-auto' : 'left-auto right-3'
      } -top-[22px]`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`${emoji} 반응`}
          title={`${emoji} 반응`}
          onClick={(event) => {
            event.stopPropagation();
            onReact(emoji);
          }}
          className="quick-react grid h-[30px] w-[30px] place-items-center rounded-md text-base transition-transform hover:scale-[1.2] hover:bg-[var(--muted)]"
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-label="이모지 추가"
        title="이모지 추가"
        onClick={handleAddEmoji}
        className="quick-react grid h-[30px] w-[30px] place-items-center rounded-md text-base text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
      >
        <MenuIcon name="smile" className="h-4 w-4" />
      </button>
      <span aria-hidden="true" className="sep mx-1 h-[18px] w-px bg-[var(--border)]" />
      <button
        type="button"
        aria-label="답글"
        title="답글"
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        className="icon-btn grid h-[30px] w-[30px] place-items-center rounded-md text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
      >
        <MenuIcon name="reply" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="복사"
        title="복사"
        onClick={(event) => {
          event.stopPropagation();
          onCopy();
        }}
        className="icon-btn grid h-[30px] w-[30px] place-items-center rounded-md text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
      >
        <MenuIcon name="copy" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="더보기"
        title="더보기"
        onClick={handleMore}
        className="icon-btn grid h-[30px] w-[30px] place-items-center rounded-md text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
      >
        <MenuIcon name="more" className="h-4 w-4" />
      </button>
    </div>
  );
}
