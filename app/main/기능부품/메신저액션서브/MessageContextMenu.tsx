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

import { MenuIcon } from '../조직도서브/조직도측면창';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👌'] as const;

/**
 * 메뉴 한 줄. 모바일 시트와 PC 팝오버가 이 정의를 공유한다.
 * 아이콘은 이모지 대신 선 아이콘 이름 (ICON_PATHS 키).
 */
type MenuItemDef = {
  key: string;
  icon: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  defaultFocus?: boolean;
};

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
  onPin?: () => void;
  isPinned?: boolean;
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
  onPin,
  isPinned = false,
  onDelete,
  canDelete = false,
  canEdit = false,
  onReadDetail,
  onOpenThread,
  threadReplyCount }: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== 'undefined') {
      const platform = String(navigator.platform || '');
      const userAgent = String(navigator.userAgent || '');
      setIsMac(/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac|iPhone|iPad|iPod/i.test(userAgent));
    }
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
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

  /**
   * 항목 정의를 한 벌만 둔다.
   *
   * 예전에는 모바일 시트와 PC 팝오버가 같은 9개 항목을 각자 <button> 으로 적어
   * 두 벌이었다 — 라벨이 한쪽만 바뀌거나(전달 아이콘 📤 vs ➡️) 조건이 어긋나는
   * 일이 실제로 있었다. 렌더 껍데기만 갈라 두고 목록은 여기서 만든다.
   */
  const items: MenuItemDef[] = [
    { key: 'reply', icon: 'reply', label: '답글로 전송', shortcut: 'R', defaultFocus: true, onSelect: onReply },
    ...(onEdit
      ? [{ key: 'edit', icon: 'edit', label: '메시지 수정', disabled: !canEdit, onSelect: onEdit }]
      : []),
    { key: 'copy', icon: 'document', label: '메시지 복사', shortcut: isMac ? '⌘C' : 'Ctrl+C', onSelect: onCopy },
    { key: 'forward', icon: 'arrow-right', label: '다른 대화로 전달', onSelect: onForward },
    { key: 'bookmark', icon: 'tag', label: '북마크에 저장', shortcut: 'B', onSelect: onBookmark },
    ...(onPin
      ? [{ key: 'pin', icon: 'bell', label: isPinned ? '공지 해제' : '공지로 등록', onSelect: onPin }]
      : []),
    { key: 'task', icon: 'check', label: '할 일로 변환', onSelect: onTask },
    ...(onOpenThread
      ? [{
          key: 'thread',
          icon: 'chat',
          label: threadReplyCount && threadReplyCount > 0 ? `스레드 답글 (${threadReplyCount})` : '스레드 답글',
          onSelect: onOpenThread }]
      : []),
    ...(onReadDetail
      ? [{ key: 'read', icon: 'search', label: '읽음 확인', onSelect: onReadDetail }]
      : []),
  ];

  const deleteItem: MenuItemDef = {
    key: 'delete',
    icon: 'trash',
    label: '메시지 삭제',
    disabled: !canDelete,
    danger: true,
    onSelect: () => onDelete?.() };

  const run = (item: MenuItemDef) => {
    if (item.disabled) return;
    item.onSelect();
    onClose();
  };

  const separator = (
    <div role="separator" aria-hidden="true" className="my-1 h-px bg-[var(--border)]" />
  );

  if (isMobile) {
    return createPortal(
      <>
        {/* Backdrop Overlay */}
        <div
          className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 animate-fade-in"
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
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom))'
          }}
          className={`fixed bottom-0 left-0 right-0 z-[var(--z-bottomsheet)] rounded-t-[24px] bg-[var(--card)] border-x-0 border-b-0 border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] p-4 text-[14px] transition-all duration-300 ease-out transform ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}
        >
          {/* Drag Handle Indicator */}
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)]" />

          {/* Quick reactions row — 44×44 (터치 타깃 최소치) */}
          <div className="flex items-center justify-between gap-1 px-1 py-2">
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
                className="grid h-11 w-11 place-items-center rounded-xl text-[22px] transition-transform active:scale-125 hover:bg-[var(--muted)]"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              aria-label="이모지 추가"
              onClick={handleAddEmoji}
              className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-[var(--border)] text-[var(--zinc-500)] hover:bg-[var(--muted)]"
            >
              <MenuIcon name="plus" className="h-[19px] w-[19px]" />
            </button>
          </div>

          {separator}

          {/*
            2열 그리드. 세로 한 줄이면 9개 × 48px 로 시트가 화면 대부분을 덮고
            스크롤까지 생겼다. 삭제만 전폭으로 떼어 오조작을 줄인다.
          */}
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-1">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                aria-disabled={item.disabled}
                {...(item.defaultFocus ? { 'data-default-focus': true } : {})}
                onClick={() => run(item)}
                className={`flex h-[48px] w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-3 text-left text-[14px] transition-colors ${
                  item.disabled
                    ? 'cursor-not-allowed text-[var(--toss-gray-5)] opacity-65'
                    : 'text-[var(--foreground)] active:bg-[var(--muted)] hover:bg-[var(--muted)]'
                }`}
              >
                <MenuIcon name={item.icon} className="h-[19px] w-[19px] shrink-0 text-[var(--zinc-500)]" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {separator}

          <button
            type="button"
            role="menuitem"
            disabled={deleteItem.disabled}
            aria-disabled={deleteItem.disabled}
            onClick={() => run(deleteItem)}
            className={`flex h-[48px] w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-3 text-left text-[14px] transition-colors ${
              deleteItem.disabled
                ? 'cursor-not-allowed text-[var(--toss-gray-5)] opacity-65'
                : 'text-[var(--danger)] active:bg-[rgba(239,68,68,0.12)] hover:bg-[rgba(239,68,68,0.08)]'
            }`}
          >
            <MenuIcon name={deleteItem.icon} className="h-[19px] w-[19px] shrink-0" />
            <span>{deleteItem.label}</span>
          </button>
        </div>
      </>,
      document.querySelector('.mso-mobile') || document.body
    );
  }

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
        }}
        className={`message-ctx-menu bg-[var(--card)] border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] fixed z-[100] min-w-[220px] rounded-[20px] p-2.5 text-[13px] transition-opacity duration-100 ${ready ? 'opacity-100' : 'opacity-0'}`}
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
              className="grid h-7 w-7 place-items-center rounded-[10px] text-[15px] transition-transform hover:scale-[1.18] hover:bg-[var(--muted)]"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            aria-label="이모지 추가"
            onClick={handleAddEmoji}
            className="ml-0.5 grid h-7 w-7 place-items-center rounded-[10px] border-l border-dashed border-[var(--border)] pl-1.5 text-[var(--zinc-500)] hover:bg-[var(--muted)]"
          >
            <MenuIcon name="plus" className="h-4 w-4" />
          </button>
        </div>

        {separator}

        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            aria-disabled={item.disabled}
            {...(item.defaultFocus ? { 'data-default-focus': true } : {})}
            onClick={() => run(item)}
            className={`grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-[12.5px] transition-colors ${
              item.disabled
                ? 'cursor-not-allowed text-[var(--toss-gray-5)] opacity-65'
                : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <MenuIcon name={item.icon} className="h-[17px] w-[17px] text-[var(--zinc-500)]" />
            <span className="truncate">{item.label}</span>
            {item.shortcut ? (
              <kbd className="rounded-[4px] bg-[var(--muted)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--zinc-500)]">
                {item.shortcut}
              </kbd>
            ) : (
              <span />
            )}
          </button>
        ))}

        {separator}

        <button
          type="button"
          role="menuitem"
          disabled={deleteItem.disabled}
          aria-disabled={deleteItem.disabled}
          onClick={() => run(deleteItem)}
          className={`grid h-9 w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-[12.5px] transition-colors ${
            deleteItem.disabled
              ? 'cursor-not-allowed text-[var(--toss-gray-5)] opacity-65'
              : 'text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]'
          }`}
        >
          <MenuIcon name={deleteItem.icon} className="h-[17px] w-[17px]" />
          <span>{deleteItem.label}</span>
          <span />
        </button>
      </div>
    </>,
    document.querySelector('.mso-mobile') || document.body
  );
}
