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
import QuickActionBar from './QuickActionBar';

type Anchor = { x: number; y: number };

/** 길게 누르기 판정 시간 */
const LONG_PRESS_MS = 500;
/** 이 거리 이상 끌면 롱프레스는 취소한다 (스크롤/스와이프 의도) */
const DRAG_CANCEL_PX = 10;
/** 스와이프 동작이 발동하는 최소 가로 이동 */
const SWIPE_THRESHOLD = 50;
/** 손가락을 아무리 끌어도 말풍선이 밀려나는 최대치 */
const SWIPE_MAX = 80;
/** 세로로 이만큼 넘게 움직였으면 스크롤로 본다 */
const SWIPE_VERTICAL_TOLERANCE = 30;
/** 스와이프 힌트에 띄우는 대표 이모지 (실제로 다는 건 사용자가 고른다) */
const SWIPE_REACTION_HINT = '😀';

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
  onPin?: () => void;
  isPinned?: boolean;
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
  onPin,
  isPinned = false,
  onDelete,
  onReadDetail,
  onOpenThread,
  threadReplyCount }: MessageActionsHostProps) {
  const [ctxMenu, setCtxMenu] = useState<Anchor | null>(null);
  const [picker, setPicker] = useState<Anchor | null>(null);
  const [quickRect, setQuickRect] = useState<DOMRect | null>(null);
  /*
   * 퀵 바 표시 모드.
   *  - 'full'     : 길게 누르기 — 반응 줄 + 액션 줄
   *  - 'reaction' : 오른쪽 스와이프 — 반응만 고르게
   * 예전에는 오른쪽 스와이프가 👍 를 곧바로 달아버려서 다른 이모지를 고를
   * 방법이 없었다. 스와이프는 '반응 고르기' 를 여는 동작으로 바꾼다.
   */
  const [quickMode, setQuickMode] = useState<'full' | 'reaction'>('full');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMoveRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 스와이프 콜백은 리스너 안에서 최신 값을 봐야 한다 (리스너는 재부착하지 않는다).
  const swipeActionsRef = useRef({ onReply, onReact });
  swipeActionsRef.current = { onReply, onReact };
  /*
   * 안드로이드 크롬은 길게 누르면 contextmenu 이벤트도 함께 쏜다.
   * 그래서 롱프레스 타이머(퀵 반응 바)와 onContextMenu(바텀 시트)가 **둘 다**
   * 열려 화면에 반응 줄이 두 벌, 액션 메뉴가 두 벌 겹쳐 보였다.
   * 터치로 시작한 컨텍스트 메뉴는 퀵 바가 이미 담당하므로 무시한다.
   */
  const touchActiveRef = useRef(false);

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
        touchActiveRef.current = true;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        touchMoveRef.current = null;

        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (enableContextMenu) {
            // 곧바로 바텀 시트를 올리면 화면 절반이 덮여 어느 메시지인지 안 보인다.
            // 말풍선 옆에 퀵 반응 바를 띄우고, 나머지는 거기 `⋯` 에서 연다.
            const node = localRef.current;
            if (node) {
              setQuickMode('full');
              setQuickRect(node.getBoundingClientRect());
            } else {
              setCtxMenu({ x: touch.clientX, y: touch.clientY });
            }
            if (navigator.vibrate) {
              navigator.vibrate(40);
            }
          }
        }, LONG_PRESS_MS);
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
      if (Math.abs(diffX) > DRAG_CANCEL_PX || Math.abs(diffY) > DRAG_CANCEL_PX) {
        clearLongPressTimer();
      }

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        const dampedOffset = Math.sign(diffX) * Math.min(SWIPE_MAX, Math.abs(diffX) * 0.5);
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

        // 왼쪽 = 답장, 오른쪽 = 반응 고르기.
        // 예전에는 어느 쪽으로 밀든 컨텍스트 메뉴가 열려 롱프레스와 하는 일이
        // 같았고, 그 뒤에는 오른쪽이 👍 를 곧바로 달아 다른 이모지를 고를 수
        // 없었다. 이제 오른쪽은 반응 줄을 띄운다.
        if (Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(diffY) < SWIPE_VERTICAL_TOLERANCE) {
          if (diffX < 0) {
            swipeActionsRef.current.onReply();
          } else {
            const node = localRef.current;
            if (node) {
              setQuickMode('reaction');
              setQuickRect(node.getBoundingClientRect());
            }
          }
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }

      touchStartRef.current = null;
      touchMoveRef.current = null;
      // contextmenu 는 touchend 뒤에 오기도 한다. 한 틱 늦게 내린다.
      window.setTimeout(() => { touchActiveRef.current = false; }, 400);
    };

    const onTouchCancel = () => {
      clearLongPressTimer();
      setSwipeOffset(0);
      touchStartRef.current = null;
      touchMoveRef.current = null;
      window.setTimeout(() => { touchActiveRef.current = false; }, 400);
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
      // 터치 롱프레스가 만든 contextmenu 는 퀵 바가 이미 처리했다.
      if (touchActiveRef.current) return;
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
      {/*
        스와이프 힌트. 밀기만 해서는 무슨 일이 일어날지 알 수 없어 임계값을 넘긴
        순간 방향에 맞는 아이콘을 드러낸다. 말풍선이 비켜난 쪽에 띄운다.
      */}
      {Math.abs(swipeOffset) > SWIPE_THRESHOLD * 0.5 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            [swipeOffset < 0 ? 'right' : 'left']: 6,
            width: 34,
            height: 34,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 999,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 16,
            pointerEvents: 'none' }}
        >
          {swipeOffset < 0 ? (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5L3 10l5 5" />
              <path d="M3 10h9a5 5 0 0 1 5 5" />
            </svg>
          ) : (
            SWIPE_REACTION_HINT
          )}
        </span>
      )}
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          width: '100%' }}
      >
        {children}
      </div>
      {/*
        모바일 롱프레스는 이 바 하나로 끝낸다. 예전에는 `더보기` 가 바텀 시트를
        다시 열어 같은 메뉴가 두 벌이 됐다 — 시트 경로 자체를 두지 않는다.
        (MessageContextMenu 는 PC 우클릭 전용으로 남는다.)
      */}
      {quickRect && !ctxMenu && (
        <QuickActionBar
          rect={quickRect}
          mine={mine}
          canDelete={canDelete ?? mine}
          canEdit={Boolean(onEdit) && (canDelete ?? mine)}
          showActions={quickMode === 'full'}
          threadReplyCount={threadReplyCount}
          onReact={handleReactClose}
          onOpenPicker={(x, y) => {
            setQuickRect(null);
            openPicker(x, y);
          }}
          onReply={onReply}
          onForward={onForward}
          onCopy={onCopy}
          onBookmark={onBookmark}
          onTask={onTask}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpenThread={onOpenThread}
          onReadDetail={onReadDetail}
          onPin={onPin}
          isPinned={isPinned}
          onClose={() => setQuickRect(null)}
        />
      )}
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
          onPin={onPin}
          isPinned={isPinned}
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
