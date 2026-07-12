'use client';

/**
 * useKeyboardLift — 소프트 키보드 높이만큼 sticky/fixed 하단 바를 위로 올림.
 * useVisualViewportOffset 래퍼. 채팅 컴포저·댓글·m-sticky-foot 공용.
 */

import type { CSSProperties } from 'react';
import { useVisualViewportOffset } from '@/app/hooks/useVisualViewportOffset';

export function useKeyboardLift(): {
  kbOffset: number;
  /** transform + 선택적 transition */
  liftStyle: CSSProperties;
} {
  const kbOffset = useVisualViewportOffset();
  return {
    kbOffset,
    liftStyle:
      kbOffset > 0
        ? {
            transform: `translateY(-${kbOffset}px)`,
            transition: 'transform 0.12s ease-out',
          }
        : {},
  };
}

/** Enter 전송 시 IME 조합 중이면 무시 */
export function isImeComposing(event: {
  nativeEvent?: { isComposing?: boolean };
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  if (event.nativeEvent?.isComposing || event.isComposing) return true;
  // 일부 브라우저: 조합 중 keyCode 229
  if (event.keyCode === 229) return true;
  return false;
}
