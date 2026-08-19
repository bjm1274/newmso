'use client';

/**
 * 길게 누르기(500ms) 시 말풍선 위·아래에 붙는 반응 바 + 가로 액션 바.
 *
 * 왜 이 모양인가:
 * 처음에는 롱프레스가 곧바로 바텀 시트를 올렸다. 반응 하나 다는 데도 화면
 * 절반이 덮이고, 어느 메시지에 다는 건지 시트에 가려 보이지 않았다.
 * 그다음엔 시트를 남겨둔 채 퀵 바를 얹었더니 `더보기` 를 누르면 같은 항목이
 * 시트로 또 나와 결국 두 벌이 됐다.
 *
 * 지금은 **시트 없이** 이 컴포넌트 하나로 끝낸다. 반응은 말풍선 위, 액션은
 * 말풍선 바로 아래 가로 한 줄. 화면 하단이 아니라 누른 메시지에 붙여야
 * "이 메시지에 대한 메뉴" 라는 게 보인다. 항목이 많으면 가로로 스크롤한다.
 *
 * 문서 흐름 밖(portal)이라 메시지 행 높이는 그대로다 — 지시서의 "컨테이너에
 * paddingTop 46 상시 확보" 는 행마다 46px 이 붙어 한 화면 대화량이 줄어든다.
 *
 * JM6: button + aria-label. JM4: any 금지.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuIcon } from '../조직도서브/조직도측면창';

/** 액션 메뉴의 퀵 반응과 같은 목록을 쓴다 — 두 곳에서 다른 이모지가 나오면 안 된다. */
export const QUICK_BAR_REACTIONS = ['👍', '❤️', '😂', '🙏', '👌'] as const;

const REACTION_BAR_HEIGHT = 48;
const ACTION_BAR_HEIGHT = 56;
const GAP = 6;
const EDGE_MARGIN = 8;

export type QuickActionBarProps = {
  /** 길게 누른 말풍선의 화면 좌표 */
  rect: { top: number; bottom: number; left: number; right: number };
  mine: boolean;
  canDelete: boolean;
  canEdit: boolean;
  threadReplyCount?: number;
  onReact: (emoji: string) => void;
  onOpenPicker: (x: number, y: number) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onBookmark: () => void;
  onTask: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpenThread?: () => void;
  onReadDetail?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
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
  canEdit,
  threadReplyCount = 0,
  onReact,
  onOpenPicker,
  onReply,
  onForward,
  onCopy,
  onBookmark,
  onTask,
  onEdit,
  onDelete,
  onOpenThread,
  onReadDetail,
  onPin,
  isPinned = false,
  onClose }: QuickActionBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  // 기본은 반응 바가 위, 액션 바가 아래. 어느 한쪽이 화면 밖으로 나가면 뒤집는다.
  const spaceAbove = rect.top;
  const spaceBelow = viewportH - rect.bottom;
  const flipped = spaceAbove < REACTION_BAR_HEIGHT + GAP + EDGE_MARGIN
    && spaceBelow > spaceAbove;

  const reactionTop = flipped
    ? Math.min(viewportH - REACTION_BAR_HEIGHT - EDGE_MARGIN, rect.bottom + ACTION_BAR_HEIGHT + GAP * 2)
    : Math.max(EDGE_MARGIN, rect.top - REACTION_BAR_HEIGHT - GAP);
  const actionTop = flipped
    ? Math.max(EDGE_MARGIN, rect.bottom + GAP)
    : Math.min(viewportH - ACTION_BAR_HEIGHT - EDGE_MARGIN, rect.bottom + GAP);

  // 보낸 사람 쪽에 붙인다. 화면 밖으로 밀리지 않게 양끝은 여백으로 잡아둔다.
  const align: React.CSSProperties = mine
    ? { right: Math.max(EDGE_MARGIN, viewportW - rect.right), maxWidth: viewportW - EDGE_MARGIN * 2 }
    : { left: Math.max(EDGE_MARGIN, rect.left), maxWidth: viewportW - EDGE_MARGIN * 2 };

  const surface: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1401,
    display: 'flex',
    alignItems: 'center',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    boxShadow: '0 6px 20px rgba(24, 24, 27, 0.16)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    ...align };

  /*
   * 예전 바텀 시트에 있던 항목을 전부 여기에 둔다. `더보기` 로 시트를 다시 열면
   * 같은 메뉴가 두 벌이 되므로, 시트 경로 자체를 없앴다.
   */
  const actions: BarAction[] = [
    { key: 'reply', icon: 'reply', label: '답장', onSelect: onReply },
    { key: 'forward', icon: 'arrow-right', label: '전달', onSelect: onForward },
    { key: 'copy', icon: 'document', label: '복사', onSelect: onCopy },
    { key: 'bookmark', icon: 'tag', label: '북마크', onSelect: onBookmark },
    { key: 'task', icon: 'check', label: '할 일', onSelect: onTask },
    ...(onOpenThread
      ? [{
          key: 'thread',
          icon: 'chat',
          label: threadReplyCount > 0 ? `스레드 ${threadReplyCount}` : '스레드',
          onSelect: onOpenThread }]
      : []),
    ...(onReadDetail ? [{ key: 'read', icon: 'search', label: '읽음', onSelect: onReadDetail }] : []),
    ...(onPin ? [{ key: 'pin', icon: 'bell', label: isPinned ? '공지 해제' : '공지', onSelect: onPin }] : []),
    ...(onEdit && canEdit ? [{ key: 'edit', icon: 'edit', label: '수정', onSelect: onEdit }] : []),
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

      {/* 반응 — 말풍선 위 */}
      <div
        role="toolbar"
        aria-label="빠른 반응"
        style={{ ...surface, top: reactionTop, height: REACTION_BAR_HEIGHT, borderRadius: 999, padding: '0 2px' }}
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
              flexShrink: 0,
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              fontSize: 21,
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
            flexShrink: 0,
            width: 42,
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

      {/* 액션 — 말풍선 바로 아래 가로 한 줄 */}
      <div
        role="toolbar"
        aria-label="메시지 액션"
        style={{ ...surface, top: actionTop, height: ACTION_BAR_HEIGHT, padding: '0 2px' }}
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
              flexShrink: 0,
              // 44px 터치 타깃을 지키면서 라벨이 들어갈 만큼만 넓힌다.
              minWidth: 54,
              height: 48,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '0 6px',
              background: 'transparent',
              border: 'none',
              borderRadius: 10,
              color: action.danger ? 'var(--danger)' : 'var(--zinc-600)',
              fontSize: 10.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              cursor: 'pointer' }}
          >
            <MenuIcon name={action.icon} className="h-[19px] w-[19px]" />
            {action.label}
          </button>
        ))}
      </div>
    </>,
    document.querySelector('.mso-mobile') || document.body,
  );
}
