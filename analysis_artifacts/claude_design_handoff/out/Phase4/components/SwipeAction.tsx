'use client';

/**
 * SwipeAction.tsx — Phase 4 스와이프 액션 (List item)
 *
 * 좌/우 스와이프 시 뒤에 숨겨진 액션 버튼 노출
 * JM2: CSS transform + touchstart/touchmove/touchend (외부 라이브러리 불필요)
 * JM6: 액션 버튼에 aria-label, 키보드 fallback
 */

import React, { useRef, useState, useCallback } from 'react';

export interface SwipeActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  bgColor?: string;
  onClick: () => void;
}

export interface SwipeActionProps {
  leftActions?: SwipeActionItem[];
  rightActions?: SwipeActionItem[];
  threshold?: number;
  children: React.ReactNode;
  className?: string;
}

// ── 액션 버튼 너비 ────────────────────────────────────────────────────────────

const ACTION_WIDTH = 72;

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function SwipeAction({
  leftActions = [],
  rightActions = [],
  threshold = 40,
  children,
  className = '',
}: SwipeActionProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const isDragging = useRef(false);

  const maxLeft = leftActions.length * ACTION_WIDTH;
  const maxRight = rightActions.length * ACTION_WIDTH;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
    isDragging.current = true;
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const next = startOffset.current + dx;
    const clamped = Math.max(-maxRight, Math.min(maxLeft, next));
    setOffset(clamped);
  }, [maxLeft, maxRight]);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    // 스냅: threshold 초과 시 해당 방향 액션 열기, 아니면 닫기
    if (offset > threshold && leftActions.length > 0) {
      setOffset(maxLeft);
    } else if (offset < -threshold && rightActions.length > 0) {
      setOffset(-maxRight);
    } else {
      setOffset(0);
    }
  }, [offset, threshold, maxLeft, maxRight, leftActions.length, rightActions.length]);

  function close() { setOffset(0); }

  return (
    <div
      className={['relative overflow-hidden', className].join(' ')}
      style={{ touchAction: 'pan-y' }}
    >
      {/* 왼쪽 액션 영역 */}
      {leftActions.length > 0 && (
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 flex"
          style={{ width: maxLeft }}
        >
          {leftActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => { action.onClick(); close(); }}
              aria-label={action.label}
              className="flex flex-col items-center justify-center gap-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{
                width: ACTION_WIDTH,
                background: action.bgColor ?? 'var(--success)',
                color: action.color ?? '#fff',
              }}
            >
              {action.icon && <span aria-hidden="true" style={{ lineHeight: 0 }}>{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 오른쪽 액션 영역 */}
      {rightActions.length > 0 && (
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 bottom-0 flex"
          style={{ width: maxRight }}
        >
          {rightActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => { action.onClick(); close(); }}
              aria-label={action.label}
              className="flex flex-col items-center justify-center gap-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{
                width: ACTION_WIDTH,
                background: action.bgColor ?? 'var(--danger)',
                color: action.color ?? '#fff',
              }}
            >
              {action.icon && <span aria-hidden="true" style={{ lineHeight: 0 }}>{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 컨텐츠 (translateX로 이동) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
          willChange: 'transform',
          position: 'relative',
          zIndex: 1,
          background: 'var(--card)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
