'use client';

/**
 * 메시지 옆에 뜨는 미니 이모지 picker (5개).
 * 메시지 버블의 "+ 반응" 버튼 옆에 떠서 빠르게 반응을 토글한다.
 *
 * - 외부 클릭/ESC 닫기
 * - role="dialog"
 *
 * 제약: JM(단일 책임), JM6(키보드/ARIA).
 */

import { useEffect, useRef } from 'react';
import { MOBILE_QUICK_REACTIONS } from './반응';

export type ReactionMenuProps = {
  open: boolean;
  align: 'start' | 'end';
  /** 이미 내가 누른 이모지(하이라이트용). */
  myEmojis?: ReadonlySet<string>;
  onPick: (emoji: string) => void;
  onClose: () => void;
};

export default function ReactionMenu({
  open,
  align,
  myEmojis,
  onPick,
  onClose,
}: ReactionMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const node = ref.current;
      if (!node) return;
      const target = event.target as Node | null;
      if (target && node.contains(target)) return;
      onClose();
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="반응 선택"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        [align === 'end' ? 'right' : 'left']: 0,
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 999,
        boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
        padding: 4,
        display: 'flex',
        gap: 2,
        zIndex: 40,
      }}
    >
      {MOBILE_QUICK_REACTIONS.map((emoji) => {
        const mine = myEmojis?.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            aria-label={`${emoji} 반응 ${mine ? '취소' : '추가'}`}
            onClick={() => onPick(emoji)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              fontSize: 18,
              lineHeight: 1,
              display: 'grid',
              placeItems: 'center',
              background: mine ? 'var(--accent-tint)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
