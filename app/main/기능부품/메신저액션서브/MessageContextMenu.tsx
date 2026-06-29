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
import { createPortal } from 'react-dom';

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
  onEdit?: () => void;
  onCopy: () => void;
  onForward: () => void;
  onBookmark: () => void;
  onTask: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  canEdit?: boolean;
  onReadDetail?: () => void;
  onOpenThread?: () => void;
  threadReplyCount?: number;
}

export default function MessageContextMenu({
  x,
  y,
  onClose,
  onReact,
  onAddEmoji,
  onReply,
  onEdit,
  onCopy,
  onForward,
  onBookmark,
  onTask,
  onDelete,
  canDelete = false,
  canEdit = false,
  onReadDetail,
  onOpenThread,
  threadReplyCount,
}: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 화면 가장자리 자동 flip
  const pos = useMemo(() => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (viewportW <= 768) {
      // 모바일(768px 이하)인 경우 화면 가로/세로 정중앙 정렬
      const left = Math.max(8, (viewportW - MENU_WIDTH) / 2);
      const top = Math.max(8, (viewportH - MENU_HEIGHT_APPROX) / 2);
      return { left, top };
    }

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

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99] bg-black/40 md:hidden animate-fade-in"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={ref}
        role="menu"
        aria-label="메시지 액션 메뉴"
        onClick={stop}
        style={{
          left: pos.left,
          top: pos.top,
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '1px solid rgba(255, 255, 255, 0.45)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)',
        }}
        className={`message-ctx-menu macos-glass fixed z-[100] min-w-[220px] rounded-[20px] p-2.5 text-[13px] transition-opacity duration-100 ${ready ? 'opacity-100' : 'opacity-0'}`}
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
              className="grid h-7 w-7 place-items-center rounded-[10px] text-[15px] transition-transform hover:scale-[1.18] hover:bg-[rgba(0,0,0,0.04)]"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            aria-label="이모지 추가"
            onClick={handleAddEmoji}
            className="ml-0.5 grid h-7 w-7 place-items-center rounded-[10px] border-l border-dashed border-[rgba(0,0,0,0.06)] pl-1.5 text-[var(--toss-gray-4)] hover:bg-[rgba(0,0,0,0.04)]"
          >
            +
          </button>
        </div>
        <div role="separator" aria-hidden="true" className="my-1 h-px bg-[rgba(0,0,0,0.06)]" />
        <button
          type="button"
          role="menuitem"
          data-default-focus
          onClick={() => {
            onReply();
            onClose();
          }}
          className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
        >
          <span aria-hidden="true" className="text-[var(--toss-gray-4)]">↩</span>
          <span>답글로 전송</span>
          <kbd className="rounded-[4px] bg-[rgba(0,0,0,0.04)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">R</kbd>
        </button>
        {onEdit && (
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit}
            aria-disabled={!canEdit}
            onClick={() => {
              if (canEdit) {
                onEdit();
                onClose();
              }
            }}
            className={`grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] transition-colors ${
              canEdit
                ? 'text-[var(--foreground)] hover:bg-[rgba(0,0,0,0.04)]'
                : 'cursor-not-allowed text-[var(--toss-gray-3)] opacity-50'
            }`}
          >
            <span aria-hidden="true" className="text-[var(--toss-gray-4)]">✎</span>
            <span>메시지 수정</span>
            <span />
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopy();
            onClose();
          }}
          className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
        >
          <span aria-hidden="true" className="text-[var(--toss-gray-4)]">⧉</span>
          <span>메시지 복사</span>
          <kbd className="rounded-[4px] bg-[rgba(0,0,0,0.04)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">⌘C</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onForward();
            onClose();
          }}
          className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
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
          className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
        >
          <span aria-hidden="true" className="text-[var(--toss-gray-4)]">🔖</span>
          <span>북마크에 저장</span>
          <kbd className="rounded-[4px] bg-[rgba(0,0,0,0.04)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--toss-gray-4)]">B</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onTask();
            onClose();
          }}
          className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
        >
          <span aria-hidden="true" className="text-[var(--toss-gray-4)]">📋</span>
          <span>할 일로 변환</span>
          <span />
        </button>

        {(onOpenThread || onReadDetail) && (
          <>
            <div role="separator" aria-hidden="true" className="my-1 h-px bg-[rgba(0,0,0,0.06)]" />
            {onOpenThread && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenThread();
                  onClose();
                }}
                className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
              >
                <span aria-hidden="true" className="text-[var(--toss-gray-4)]">💬</span>
                <span>스레드 답글 {threadReplyCount && threadReplyCount > 0 ? `(${threadReplyCount})` : ''}</span>
                <span />
              </button>
            )}
            {onReadDetail && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReadDetail();
                  onClose();
                }}
                className="grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] text-[var(--foreground)] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
              >
                <span aria-hidden="true" className="text-[var(--toss-gray-4)]">👀</span>
                <span>읽음 확인</span>
                <span />
              </button>
            )}
          </>
        )}

        <div role="separator" aria-hidden="true" className="my-1 h-px bg-[rgba(0,0,0,0.06)]" />
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
          className={`grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[10px] px-2 text-left text-[12.5px] transition-colors ${
            canDelete
              ? 'text-[var(--danger)] hover:bg-[rgba(0,0,0,0.04)]'
              : 'cursor-not-allowed text-[var(--toss-gray-3)] opacity-50'
          }`}
        >
          <span aria-hidden="true" className="text-[var(--danger)]">🗑</span>
          <span>메시지 삭제</span>
          <span />
        </button>
      </div>
    </>,
    document.querySelector('.mso-mobile') || document.body
  );
}
