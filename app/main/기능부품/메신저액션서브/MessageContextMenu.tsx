'use client';

/**
 * MessageContextMenu — 옵션 ② 우클릭 컨텍스트 메뉴
 * (handoff_chat_actions/INSTRUCTIONS.md §1-2)
 *
 * 구조 (위→아래):
 *  - Quick reactions row (6 이모지 + [+] 피커 트리거)
 *  - 답글 (R) / 복사 (⌘C) / 전달 / 북마크 (B) / 할일
 *  - 삭제 (본인 메시지만, danger 톤)
 *
 * 위치: position:fixed @ (x, y). 화면 가장자리 자동 flip.
 * 단축키: R/B/⌘C (메뉴 열린 상태에서). ESC/바깥클릭 닫힘.
 *
 * JM3: 이벤트 핸들러 격리. JM6: role=menu/menuitem, aria-label, ESC.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👌'] as const;

const MENU_WIDTH = 240;
const MENU_HEIGHT_APPROX = 340;

export interface MessageContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onAddEmoji: (anchorX: number, anchorY: number) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onBookmark: () => void;
  onTask: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export default function MessageContextMenu({
  x,
  y,
  onClose,
  onReact,
  onAddEmoji,
  onReply,
  onCopy,
  onForward,
  onBookmark,
  onTask,
  onDelete,
  canDelete = false,
}: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // 화면 가장자리 자동 flip
  const pos = useMemo(() => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const left = x + MENU_WIDTH > viewportW ? Math.max(8, x - MENU_WIDTH) : x;
    const top = y + MENU_HEIGHT_APPROX > viewportH ? Math.max(8, y - MENU_HEIGHT_APPROX) : y;
    return { left, top };
  }, [x, y]);

  // 다음 tick에 mousedown 리스너 부착 (트리거 이벤트 자체를 outside로 잡지 않도록)
  useEffect(() => {
    setReady(true);
    const focusFirstId = window.setTimeout(() => {
      ref.current?.querySelector<HTMLButtonElement>('button[data-default-focus]')?.focus();
    }, 0);
    const handleClickOutside = (event: MouseEvent | globalThis.MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // 단축키: R / B / ⌘C
      const meta = event.metaKey || event.ctrlKey;
      if (!meta && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        onReply();
        onClose();
      } else if (!meta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        onBookmark();
        onClose();
      } else if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        onCopy();
        onClose();
      }
    };
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside as EventListener);
    }, 0);
    document.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(focusFirstId);
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, onReply, onCopy, onBookmark]);

  const stop = (event: MouseEvent) => event.stopPropagation();

  const handleAddEmoji = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    onAddEmoji(rect.left, rect.bottom);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="메시지 액션 메뉴"
      onClick={stop}
      style={{ left: pos.left, top: pos.top }}
      className={`message-ctx-menu fixed z-[100] min-w-[220px] rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-1.5 text-[13px] shadow-[0_20px_50px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] transition-opacity duration-100 ${ready ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Quick reactions row */}
      <div className="flex items-center gap-1 p-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            aria-label={`${emoji} 반응`}
            onClick={(event) => {
              event.stopPropagation();
              onReact(emoji);
              onClose();
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-[15px] transition-transform hover:scale-[1.18] hover:bg-[var(--muted)]"
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          aria-label="이모지 추가"
          onClick={handleAddEmoji}
          className="ml-0.5 grid h-7 w-7 place-items-center rounded-md border-l border-dashed border-[var(--border)] pl-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
        >
          +
        </button>
      </div>
      <div role="separator" aria-hidden="true" className="my-1 h-px bg-[var(--border)]" />
      <button
        type="button"
        role="menuitem"
        data-default-focus
        onClick={() => {
          onReply();
          onClose();
        }}
        className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <span aria-hidden="true" className="text-[var(--toss-gray-4)]">↩</span>
        <span>답글로 전송</span>
        <kbd className="rounded-[4px] bg-[var(--muted)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">R</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <span aria-hidden="true" className="text-[var(--toss-gray-4)]">⧉</span>
        <span>메시지 복사</span>
        <kbd className="rounded-[4px] bg-[var(--muted)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">⌘C</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onForward();
          onClose();
        }}
        className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <span aria-hidden="true" className="text-[var(--toss-gray-4)]">✈</span>
        <span>다른 대화로 전달</span>
        <span />
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onBookmark();
          onClose();
        }}
        className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <span aria-hidden="true" className="text-[var(--toss-gray-4)]">🔖</span>
        <span>북마크에 저장</span>
        <kbd className="rounded-[4px] bg-[var(--muted)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">B</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTask();
          onClose();
        }}
        className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
      >
        <span aria-hidden="true" className="text-[var(--toss-gray-4)]">📋</span>
        <span>할 일로 변환</span>
        <span />
      </button>
      <div role="separator" aria-hidden="true" className="my-1 h-px bg-[var(--border)]" />
      <button
        type="button"
        role="menuitem"
        disabled={!canDelete}
        aria-disabled={!canDelete}
        onClick={() => {
          if (canDelete) {
            onDelete?.();
            onClose();
          }
        }}
        className={`grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors ${
          canDelete
            ? 'text-[var(--danger)] hover:bg-[var(--danger-light,color-mix(in_srgb,var(--danger)_12%,transparent))]'
            : 'cursor-not-allowed text-[var(--toss-gray-3)] opacity-50'
        }`}
      >
        <span aria-hidden="true">🗑</span>
        <span>메시지 삭제</span>
        <span />
      </button>
    </div>
  );
}
