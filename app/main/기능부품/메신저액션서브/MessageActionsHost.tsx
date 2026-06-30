'use client';

/**
 * MessageActionsHost — 메시지 1행의 액션 박스(호버 툴바·우클릭 메뉴·이모지 피커) 통합 호스트
 * (newmso(14).zip handoff_chat_actions/INSTRUCTIONS.md §2)
 *
 * 책임:
 *  - 행 단위 hovered/ctxMenu/picker 상태 관리 (row 사이 공유 X)
 *  - 부모 row 컨테이너의 onMouseEnter/Leave/ContextMenu 핸들러를 제공
 *  - 각 액션의 콜백을 묶어 MessageHoverToolbar/MessageContextMenu/EmojiPicker로 위임
 *
 * JM: 단일 책임 — row 액션 박스만 다룬다. row 자체 렌더는 부모 책임.
 * JM6: 키보드/터치/스크린리더는 각 자식 컴포넌트가 부담.
 */

import { useCallback, useState, useRef, useEffect, type MouseEvent, type ReactNode } from 'react';
import EmojiPicker from './EmojiPicker';
import MessageContextMenu from './MessageContextMenu';

type Anchor = { x: number; y: number };

interface MessageActionsHostProps {
  /** 본인이 보낸 메시지인지(삭제 가능 여부) */
  mine: boolean;
  /** 삭제 가능 여부(보통 mine && !isDeletedMessage). 미지정 시 mine 사용 */
  canDelete?: boolean;
  /** 우클릭 메뉴를 활성화할지 */
  enableContextMenu?: boolean;
  /** 메시지 내용을 그대로 자식으로 받음(말풍선 등) */
  children: ReactNode;
  /** 컨테이너에 추가할 className */
  className?: string;
  /** 행 컨테이너의 data-testid */
  testId?: string;
  /** 행 컨테이너의 inline style */
  style?: React.CSSProperties;
  /** ref */
  containerRef?: (element: HTMLDivElement | null) => void;
  /* 액션 콜백들 */
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onForward: () => void;
  onBookmark: () => void;
  onTask: () => void;
  onDelete?: () => void;
  onReadDetail?: () => void;
  onOpenThread?: () => void;
  threadReplyCount?: number;
}

export default function MessageActionsHost({
  mine,
  canDelete,
  enableContextMenu = true,
  children,
  className,
  testId,
  style,
  containerRef,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onForward,
  onBookmark,
  onTask,
  onDelete,
  onReadDetail,
  onOpenThread,
  threadReplyCount }: MessageActionsHostProps) {
  const [ctxMenu, setCtxMenu] = useState<Anchor | null>(null);
  const [picker, setPicker] = useState<Anchor | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMoveRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localRef = useRef<HTMLDivElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (containerRef) {
        containerRef(node);
      }
    },
    [containerRef],
  );

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;

    const clearLongPressTimer = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const onTouchStart = (e: globalThis.TouchEvent) => {
      if (window.innerWidth > 768) return;
      const touch = e.touches[0];
      if (touch) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        touchMoveRef.current = null;

        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (enableContextMenu) {
            setCtxMenu({ x: touch.clientX, y: touch.clientY });
            if (navigator.vibrate) {
              navigator.vibrate(40);
            }
          }
        }, 500); // 500ms long press threshold
      }
    };

    const onTouchMove = (e: globalThis.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchMoveRef.current = { x: touch.clientX, y: touch.clientY };

      const diffX = touch.clientX - touchStartRef.current.x;
      const diffY = touch.clientY - touchStartRef.current.y;

      // Cancel long press if drag distance is more than 10px
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        clearLongPressTimer();
      }

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        // Elastic drag formula (limit max offset to 80px)
        const dampedOffset = Math.sign(diffX) * Math.min(80, Math.abs(diffX) * 0.5);
        setSwipeOffset(dampedOffset);
      }
    };

    const onTouchEnd = () => {
      clearLongPressTimer();
      if (!touchStartRef.current) return;
      setSwipeOffset(0);

      if (touchMoveRef.current) {
        const diffX = touchMoveRef.current.x - touchStartRef.current.x;
        const diffY = touchMoveRef.current.y - touchStartRef.current.y;

        if (Math.abs(diffX) > 50 && Math.abs(diffY) < 30) {
          if (enableContextMenu) {
            // Open context menu centered horizontally
            setCtxMenu({ x: window.innerWidth / 2, y: window.innerHeight - 340 });
          }
        }
      }

      touchStartRef.current = null;
      touchMoveRef.current = null;
    };

    const onTouchCancel = () => {
      clearLongPressTimer();
      setSwipeOffset(0);
      touchStartRef.current = null;
      touchMoveRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      clearLongPressTimer();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enableContextMenu]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!enableContextMenu) return;
      event.preventDefault();
      event.stopPropagation();
      setCtxMenu({ x: event.clientX, y: event.clientY });
    },
    [enableContextMenu],
  );

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const closePicker = useCallback(() => setPicker(null), []);

  const handleReactClose = useCallback(
    (emoji: string) => {
      try {
        onReact(emoji);
      } finally {
        setCtxMenu(null);
        setPicker(null);
      }
    },
    [onReact],
  );

  const openPicker = useCallback((x: number, y: number) => {
    setPicker({ x, y });
  }, []);

  return (
    <div
      ref={setRefs}
      data-chat-message-row
      data-testid={testId}
      onContextMenu={handleContextMenu}
      className={`relative ${className || ''}`}
      style={style}
    >
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          width: '100%' }}
      >
        {children}
      </div>
      {ctxMenu && (
        <MessageContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={closeCtxMenu}
          onReact={handleReactClose}
          onAddEmoji={openPicker}
          onReply={onReply}
          onEdit={onEdit}
          onCopy={onCopy}
          onForward={onForward}
          onBookmark={onBookmark}
          onTask={onTask}
          onDelete={onDelete}
          canDelete={canDelete ?? mine}
          canEdit={Boolean(onEdit) && (canDelete ?? mine)}
          onReadDetail={onReadDetail}
          onOpenThread={onOpenThread}
          threadReplyCount={threadReplyCount}
        />
      )}
      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          onPick={handleReactClose}
          onClose={closePicker}
        />
      )}
    </div>
  );
}
