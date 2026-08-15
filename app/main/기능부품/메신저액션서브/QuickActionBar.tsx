'use client';

/**
 * 길게 누르기(500ms) 시 말풍선 위/아래에 뜨는 퀵 반응 바 + 액션 pill 행.
 *
 * 예전에는 길게 누르면 곧바로 바텀 시트가 올라왔다. 반응 하나 다는 데도 화면
 * 절반이 덮이고, 어느 메시지에 다는 건지 시트에 가려 보이지 않았다. 자주 쓰는
 * 반응 5개와 액션 4개를 말풍선 옆에 붙이고, 나머지는 `⋯` 에서 시트로 넘긴다.
 *
 * 위치: 말풍선 rect 기준 portal. 위에 자리가 없으면 아래로 뒤집는다.
 * 지시서는 컨테이너에 paddingTop: 46 을 상시 확보하라고 했지만, 그러면 메시지
 * 행마다 46px 이 붙어 한 화면에 들어가는 대화가 크게 줄어든다. 문서 흐름 밖
 * (portal)에 띄우면 레이아웃 점프 없이 같은 목적을 달성한다.
 *
 * JM6: button + aria-label. JM4: any 금지.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** 액션 메뉴의 퀵 반응과 같은 목록을 쓴다 — 두 곳에서 다른 이모지가 나오면 안 된다. */
export const QUICK_BAR_REACTIONS = ['👍', '❤️', '😂', '🙏', '👌'] as const;

const BAR_HEIGHT = 52;
const PILL_ROW_HEIGHT = 40;
const EDGE_MARGIN = 8;

export type QuickActionBarProps = {
  /** 길게 누른 말풍선의 화면 좌표 */
  rect: { top: number; bottom: number; left: number; right: number };
  mine: boolean;
  onReact: (emoji: string) => void;
  onOpenPicker: (x: number, y: number) => void;
  onReply: () => void;
  onForward: () => void;
  onTask: () => void;
  onMore: (x: number, y: number) => void;
  onClose: () => void;
};

export default function QuickActionBar({
  rect,
  mine,
  onReact,
  onOpenPicker,
  onReply,
  onForward,
  onTask,
  onMore,
  onClose }: QuickActionBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // 위에 바가 들어갈 자리가 없으면 말풍선 아래로 뒤집는다.
  const flipped = rect.top < BAR_HEIGHT + EDGE_MARGIN * 2;
  const barTop = flipped ? rect.bottom + EDGE_MARGIN : rect.top - BAR_HEIGHT - EDGE_MARGIN;
  const pillTop = flipped ? rect.top - PILL_ROW_HEIGHT - EDGE_MARGIN : rect.bottom + EDGE_MARGIN;

  const align: React.CSSProperties = mine
    ? { right: Math.max(EDGE_MARGIN, window.innerWidth - rect.right) }
    : { left: Math.max(EDGE_MARGIN, rect.left) };

  const surface: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1400,
    display: 'flex',
    alignItems: 'center',
    background: 'var(--m-card)',
    border: '1px solid var(--m-border)',
    borderRadius: 999,
    boxShadow: '0 6px 20px rgba(24, 24, 27, 0.16)',
    ...align };

  const pillBtn: React.CSSProperties = {
    height: 32,
    padding: '0 12px',
    borderRadius: 999,
    background: 'transparent',
    color: 'var(--z-700)',
    fontSize: 12.5,
    fontWeight: 800,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' };

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 1399, background: 'transparent' }}
      />

      <div role="toolbar" aria-label="빠른 반응" style={{ ...surface, top: barTop, height: BAR_HEIGHT, padding: '0 4px', gap: 0 }}>
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
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--z-500)',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--m-border)',
            cursor: 'pointer' }}
        >
          +
        </button>
      </div>

      <div role="toolbar" aria-label="메시지 액션" style={{ ...surface, top: pillTop, height: PILL_ROW_HEIGHT, padding: '0 4px', gap: 2 }}>
        <button type="button" aria-label="답장" style={pillBtn} onClick={() => { onReply(); onClose(); }}>
          답장
        </button>
        <button type="button" aria-label="전달" style={pillBtn} onClick={() => { onForward(); onClose(); }}>
          전달
        </button>
        <button type="button" aria-label="할 일로 변환" style={pillBtn} onClick={() => { onTask(); onClose(); }}>
          할 일
        </button>
        <button
          type="button"
          aria-label="더 보기"
          style={{ ...pillBtn, padding: '0 10px', fontSize: 16 }}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            onMore(r.left, r.bottom);
          }}
        >
          ⋯
        </button>
      </div>
    </>,
    document.querySelector('.mso-mobile') || document.body,
  );
}
