'use client';

/**
 * 모바일 채팅 컴포저용 이모지 picker.
 * 8×4 = 32개 자주 쓰는 이모지를 popover로 노출.
 *
 * - position: fixed, 컴포저 위 floating
 * - 외부 클릭/ESC로 닫힘
 * - role="dialog" + aria-label, 각 셀은 button[aria-label=이모지]
 *
 * 제약: JM(단일 책임), JM6(키보드/ARIA), JM4(props 타입 명시).
 */

import { useCallback, useEffect, useRef } from 'react';

export const COMPOSER_EMOJI_PALETTE: readonly string[] = [
  '👍', '🙏', '❤️', '😂', '🎉', '😊', '🥲', '😢',
  '😭', '🔥', '👏', '✨', '👀', '🤔', '🙇‍♂️', '😀',
  '😅', '😍', '😎', '🤝', '💪', '💯', '🥹', '🤣',
  '😉', '🫶', '🙌', '😆', '😄', '😘', '🥰', '🤗',
] as const;

export type EmojiPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** 컴포저 영역(앵커)의 bottom px 기준 위치. 기본 84 (input + 약간의 여백). */
  bottomOffset?: number;
};

export default function EmojiPicker({
  open,
  onClose,
  onSelect,
  bottomOffset = 78,
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ESC 닫기
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

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const node = containerRef.current;
      if (!node) return;
      const target = event.target as Node | null;
      if (target && node.contains(target)) return;
      onClose();
    };
    // mousedown으로 잡아야 input blur보다 먼저 동작
    window.addEventListener('mousedown', onDocPointer);
    window.addEventListener('touchstart', onDocPointer, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('touchstart', onDocPointer);
    };
  }, [open, onClose]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      // 컴포저 입력감을 끊지 않도록 picker는 닫지 않는다(연속 선택 가능).
      // 외부 클릭 또는 ESC로 닫는다.
    },
    [onSelect],
  );

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="이모지 선택"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: bottomOffset,
        zIndex: 60,
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: 8,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 4,
        }}
      >
        {COMPOSER_EMOJI_PALETTE.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => handleSelect(emoji)}
            style={{
              height: 36,
              borderRadius: 8,
              fontSize: 20,
              lineHeight: 1,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--m-bg)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div
        style={{
          textAlign: 'right',
          marginTop: 6,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="이모지 선택 닫기"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--z-500)',
            padding: '4px 8px',
            borderRadius: 6,
            background: 'transparent',
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
