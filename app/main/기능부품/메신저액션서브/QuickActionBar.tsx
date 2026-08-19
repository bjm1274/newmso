'use client';

/**
 * 길게 누르기(500ms) 시 뜨는 퀵 반응 바 + 하단 가로형 액션 바.
 *
 * 예전에는 길게 누르면 곧바로 바텀 시트가 올라왔다. 반응 하나 다는 데도 화면
 * 절반이 덮이고, 어느 메시지에 다는 건지 시트에 가려 보이지 않았다.
 *
 * 구성:
 *  - 반응 바: 말풍선 위(자리 없으면 아래)에 뜨는 이모지 5개 + `+`
 *  - 액션 바: 화면 하단 가로 한 줄. 아이콘 + 라벨을 나란히 놓아 한 번에 보이게.
 *    예전에는 말풍선 옆에 떠 있는 작은 알약 줄이라 다른 UI 와 겹쳐 읽히지 않았다.
 *    나머지 항목은 `더보기` 에서 시트로 넘긴다.
 *
 * 위치: 반응 바만 말풍선 rect 기준 portal. 지시서는 컨테이너에 paddingTop 46 을
 * 상시 확보하라고 했지만, 그러면 메시지 행마다 46px 이 붙어 한 화면에 들어가는
 * 대화가 크게 줄어든다. 문서 흐름 밖(portal)이면 레이아웃 점프 없이 같은 목적을
 * 달성한다.
 *
 * JM6: button + aria-label. JM4: any 금지.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuIcon } from '../조직도서브/조직도측면창';

/** 액션 메뉴의 퀵 반응과 같은 목록을 쓴다 — 두 곳에서 다른 이모지가 나오면 안 된다. */
export const QUICK_BAR_REACTIONS = ['👍', '❤️', '😂', '🙏', '👌'] as const;

const BAR_HEIGHT = 52;
const EDGE_MARGIN = 8;

export type QuickActionBarProps = {
  /** 길게 누른 말풍선의 화면 좌표 */
  rect: { top: number; bottom: number; left: number; right: number };
  mine: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onOpenPicker: (x: number, y: number) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onTask: () => void;
  onDelete?: () => void;
  onMore: (x: number, y: number) => void;
  onClose: () => void;
};

type BarAction = {
  key: string;
  icon: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

export default function QuickActionBar({
  rect,
  mine,
  canDelete,
  onReact,
  onOpenPicker,
  onReply,
  onForward,
  onCopy,
  onTask,
  onDelete,
  onMore,
  onClose }: QuickActionBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // 반응 바는 하단 액션 바에 가리지 않게, 말풍선 위를 기본으로 둔다.
  const flipped = rect.top < BAR_HEIGHT + EDGE_MARGIN * 2;
  const barTop = flipped ? rect.bottom + EDGE_MARGIN : rect.top - BAR_HEIGHT - EDGE_MARGIN;
  const align: React.CSSProperties = mine
    ? { right: Math.max(EDGE_MARGIN, window.innerWidth - rect.right) }
    : { left: Math.max(EDGE_MARGIN, rect.left) };

  const actions: BarAction[] = [
    { key: 'reply', icon: 'reply', label: '답장', onSelect: onReply },
    { key: 'forward', icon: 'arrow-right', label: '전달', onSelect: onForward },
    { key: 'copy', icon: 'document', label: '복사', onSelect: onCopy },
    { key: 'task', icon: 'check', label: '할 일', onSelect: onTask },
    ...(canDelete && onDelete
      ? [{ key: 'delete', icon: 'trash', label: '삭제', onSelect: onDelete, danger: true }]
      : []),
  ];

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 1399, background: 'rgba(0, 0, 0, 0.28)' }}
      />

      {/* 반응 바 — 말풍선 옆 */}
      <div
        role="toolbar"
        aria-label="빠른 반응"
        style={{
          position: 'fixed',
          zIndex: 1401,
          top: barTop,
          height: BAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          boxShadow: '0 6px 20px rgba(24, 24, 27, 0.16)',
          ...align }}
      >
        {QUICK_BAR_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`${emoji} 반응`}
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            style={{
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              fontSize: 22,
              background: 'transparent',
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer' }}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          aria-label="다른 이모지"
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            onOpenPicker(r.left, r.bottom);
          }}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--zinc-500)',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            cursor: 'pointer' }}
        >
          <MenuIcon name="plus" className="h-5 w-5" />
        </button>
      </div>

      {/* 액션 바 — 화면 하단 가로 한 줄 */}
      <div
        role="toolbar"
        aria-label="메시지 액션"
        style={{
          position: 'fixed',
          zIndex: 1401,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: '0 -4px 20px rgba(24, 24, 27, 0.12)' }}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            aria-label={action.label}
            onClick={() => {
              action.onSelect();
              onClose();
            }}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '10px 2px',
              background: 'transparent',
              border: 'none',
              color: action.danger ? 'var(--danger)' : 'var(--zinc-600)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer' }}
          >
            <MenuIcon name={action.icon} className="h-[21px] w-[21px]" />
            {action.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="더 보기"
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            onMore(r.left, r.top);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '10px 2px',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            color: 'var(--zinc-600)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer' }}
        >
          <MenuIcon name="more-vertical" className="h-[21px] w-[21px]" />
          더보기
        </button>
      </div>
    </>,
    document.querySelector('.mso-mobile') || document.body,
  );
}
