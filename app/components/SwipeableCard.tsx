'use client';

/**
 * SwipeableCard — 좌/우 스와이프 액션 카드 (모바일 우선)
 *
 * pointer events 기반 드래그로 카드를 좌/우로 밀면, 반대쪽에 숨겨진 액션 패널이
 * 드러난다. 임계값(threshold)을 넘기면 진동 + 액션 확정, 미달이면 원위치로
 * 스냅된다. 다른 카드를 스와이프하면 자동으로 닫힌다(전역 이벤트 버스).
 *
 * Props
 * - leftActions : 좌→우 스와이프 시 카드 왼쪽에서 드러나는 액션
 * - rightActions: 우→좌 스와이프 시 카드 오른쪽에서 드러나는 액션
 * - threshold   : 액션을 잠그는 최소 이동 거리 (기본 80px)
 * - actionWidth : 액션 1개당 너비 (기본 80px)
 *
 * 접근성(JM6)
 * - 스와이프는 보조 UX. 호출 측에서 별도 버튼(메뉴/우클릭) 으로도 액션 노출 필수.
 * - prefers-reduced-motion 환경에서는 transition 비활성화.
 * - 액션 버튼은 패널이 열렸을 때만 tabbable.
 *
 * JM:  단일 책임, 150줄 내외
 * JM3: pointer cancel/leave 모두 처리, setPointerCapture try/catch
 * JM4: SwipeAction 타입 export, any 없음
 * JM6: motion-reduce 가드, aria-hidden / tabIndex 동기화
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode } from 'react';
import { haptics } from '@/app/lib/haptics';

export type SwipeActionTone = 'normal' | 'danger' | 'ok';

export type SwipeAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: SwipeActionTone;
  onTrigger: () => void;
};

export type SwipeableCardProps = {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  threshold?: number;
  actionWidth?: number;
  onSwipeStart?: () => void;
  className?: string;
};

/** 다른 카드 열림 시 이전 카드 자동 닫기용 가벼운 이벤트 버스 */
type CloseListener = (sourceId: number) => void;
const closeListeners = new Set<CloseListener>();
let cardSeq = 0;

function toneClass(tone: SwipeActionTone | undefined): string {
  if (tone === 'danger') return 'bg-[var(--danger)] text-white';
  if (tone === 'ok') return 'bg-[var(--success)] text-white';
  return 'bg-[var(--accent)] text-white';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function ActionPanel({
  side,
  actions,
  open,
  width,
  itemWidth,
  onTrigger }: {
  side: 'left' | 'right';
  actions: SwipeAction[];
  open: boolean;
  width: number;
  itemWidth: number;
  onTrigger: (a: SwipeAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div
      className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} flex items-stretch`}
      aria-hidden={!open}
      style={{ width, pointerEvents: open ? 'auto' : 'none' }}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onTrigger(a)}
          className={`flex flex-col items-center justify-center gap-1 text-xs font-medium ${toneClass(a.tone)}`}
          style={{ width: itemWidth }}
          aria-label={a.label}
          tabIndex={open ? 0 : -1}
        >
          {a.icon}
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SwipeableCard({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 80,
  actionWidth = 80,
  onSwipeStart,
  className }: SwipeableCardProps) {
  const cardIdRef = useRef<number>(0);
  if (cardIdRef.current === 0) cardIdRef.current = ++cardSeq;

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);
  const hapticFiredRef = useRef(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = prefersReducedMotion();
    const listener: CloseListener = (sourceId) => {
      if (sourceId !== cardIdRef.current) setOffset(0);
    };
    closeListeners.add(listener);
    return () => {
      closeListeners.delete(listener);
    };
  }, []);

  const leftMax = leftActions.length * actionWidth;
  const rightMax = rightActions.length * actionWidth;

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      startXRef.current = e.clientX;
      startOffsetRef.current = offset;
      hapticFiredRef.current = false;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 일부 환경 미지원 */
      }
      onSwipeStart?.();
      closeListeners.forEach((fn) => fn(cardIdRef.current));
    },
    [offset, onSwipeStart],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (startXRef.current === null) return;
      const dx = e.clientX - startXRef.current;
      let next = startOffsetRef.current + dx;
      if (next > 0 && leftActions.length === 0) next = 0;
      if (next < 0 && rightActions.length === 0) next = 0;
      if (next > leftMax) next = leftMax;
      if (next < -rightMax) next = -rightMax;
      setOffset(next);

      const passed = Math.abs(next) >= threshold;
      if (passed && !hapticFiredRef.current) {
        haptics.selection();
        hapticFiredRef.current = true;
      } else if (!passed) {
        hapticFiredRef.current = false;
      }
    },
    [leftActions.length, rightActions.length, leftMax, rightMax, threshold],
  );

  const settle = useCallback(() => {
    setDragging(false);
    startXRef.current = null;
    setOffset((curr) => {
      if (curr >= threshold) return leftMax;
      if (curr <= -threshold) return -rightMax;
      return 0;
    });
  }, [leftMax, rightMax, threshold]);

  const triggerAction = useCallback((action: SwipeAction) => {
    haptics.medium();
    action.onTrigger();
    setOffset(0);
  }, []);

  const transition =
    dragging || reduceMotionRef.current
      ? 'none'
      : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';

  const contentStyle: CSSProperties = {
    transform: `translate3d(${offset}px, 0, 0)`,
    transition,
    touchAction: 'pan-y' };

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-lg)] ${className ?? ''}`}
      data-swipeable-card
    >
      <ActionPanel
        side="left"
        actions={leftActions}
        open={offset > 0}
        width={leftMax}
        itemWidth={actionWidth}
        onTrigger={triggerAction}
      />
      <ActionPanel
        side="right"
        actions={rightActions}
        open={offset < 0}
        width={rightMax}
        itemWidth={actionWidth}
        onTrigger={triggerAction}
      />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onPointerLeave={settle}
        style={contentStyle}
        className="relative bg-[var(--card)] will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeableCard;
