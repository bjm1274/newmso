'use client';

/**
 * useLongPress — 모바일/데스크톱 통합 롱프레스 훅
 *
 * pointer events (touch + mouse + pen 통합) 기반으로 일정 시간 누르고 있으면
 * callback 을 실행한다. 트리거 시 medium 햅틱이 발생한다(옵션으로 끌 수 있음).
 *
 * 핵심 동작
 * - threshold(ms) 지나면 callback(event) 호출 + medium 햅틱
 * - 손가락이 일정 거리(moveTolerance, default 10px) 이상 움직이면 취소 → 스크롤과 충돌 X
 * - pointerup/leave/cancel 또는 컴포넌트 unmount 시 안전하게 타이머 정리
 * - 우클릭(button !== 0)은 무시
 *
 * iOS 텍스트 선택 충돌 방지를 위해 호출 측에서 다음 CSS 를 권장:
 *   `style={{ userSelect: 'none', WebkitTouchCallout: 'none' }}`
 *
 * 사용 예:
 * ```tsx
 * const handlers = useLongPress<HTMLDivElement>((e) => openContextMenu(e), { threshold: 400 });
 * <div {...handlers}>롱프레스</div>
 * ```
 *
 * JM:  단일 책임 — 롱프레스 감지만 담당
 * JM3: 타이머 cleanup 보장, pointer cancel 모두 처리
 * JM4: 제네릭 E extends Element, 핸들러 타입 명시
 * JM6: 키보드 사용자는 별도의 컨텍스트 트리거(우클릭/버튼)를 호출 측에서 제공해야 함
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { haptics } from '@/app/lib/haptics';

export type UseLongPressOptions = {
  /** 발동까지 누르고 있어야 하는 시간(ms). 기본 500 */
  threshold?: number;
  /** 햅틱 발생 여부 (기본 true) */
  haptic?: boolean;
  /** 이 거리(px) 이상 움직이면 취소. 기본 10 */
  moveTolerance?: number;
  /** 트리거 직후 contextmenu 이벤트를 막을지 (기본 true, 모바일 길게-눌러 메뉴 충돌 방지) */
  preventContextMenu?: boolean;
};

export type LongPressHandlers<E extends Element> = {
  onPointerDown: (e: ReactPointerEvent<E>) => void;
  onPointerMove: (e: ReactPointerEvent<E>) => void;
  onPointerUp: (e: ReactPointerEvent<E>) => void;
  onPointerLeave: (e: ReactPointerEvent<E>) => void;
  onPointerCancel: (e: ReactPointerEvent<E>) => void;
  onContextMenu: (e: ReactPointerEvent<E> | React.MouseEvent<E>) => void;
};

export function useLongPress<E extends Element = HTMLElement>(
  callback: (event: ReactPointerEvent<E>) => void,
  options?: UseLongPressOptions,
): LongPressHandlers<E> {
  const { threshold = 500, haptic = true, moveTolerance = 10, preventContextMenu = true } =
    options ?? {};

  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const callbackRef = useRef(callback);

  // 콜백 갱신 시 핸들러 재생성 없이 최신 참조 사용
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // unmount 시 잔여 타이머 정리
  useEffect(() => clearTimer, [clearTimer]);

  const handlers = useMemo<LongPressHandlers<E>>(
    () => ({
      onPointerDown: (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return; // 좌클릭/터치/펜만
        triggeredRef.current = false;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          triggeredRef.current = true;
          if (haptic) haptics.medium();
          callbackRef.current(e);
        }, threshold);
      },
      onPointerMove: (e) => {
        const start = startPosRef.current;
        if (!start || timerRef.current === null) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > moveTolerance * moveTolerance) {
          clearTimer();
        }
      },
      onPointerUp: () => clearTimer(),
      onPointerLeave: () => clearTimer(),
      onPointerCancel: () => clearTimer(),
      onContextMenu: (e) => {
        // 모바일 롱프레스가 contextmenu 도 발화하는 경우 중복 방지
        if (preventContextMenu && triggeredRef.current) {
          e.preventDefault();
          triggeredRef.current = false;
        }
      },
    }),
    [clearTimer, haptic, moveTolerance, preventContextMenu, threshold],
  );

  return handlers;
}

export default useLongPress;
