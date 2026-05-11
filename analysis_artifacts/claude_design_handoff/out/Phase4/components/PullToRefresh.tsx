'use client';

/**
 * PullToRefresh.tsx — Phase 4 당겨서 새로고침
 *
 * touchstart / touchmove / touchend 순수 구현
 * JM2: 외부 라이브러리 없이 CSS transform + state
 * JM6: aria-live="polite" 로 상태 알림
 */

import React, { useRef, useState, useCallback, useId } from 'react';

export interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  children: React.ReactNode;
  className?: string;
}

type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing';

const STATE_LABEL: Record<PullState, string> = {
  idle:       '',
  pulling:    '당겨서 새로고침',
  ready:      '놓으면 새로고침',
  refreshing: '새로고침 중...',
};

// ── 인디케이터 ─────────────────────────────────────────────────────────────────

function Indicator({ state, pullRatio }: { state: PullState; pullRatio: number }) {
  const size = 28;
  const isSpinning = state === 'refreshing';
  const opacity = Math.min(pullRatio, 1);
  const scale = 0.7 + 0.3 * Math.min(pullRatio, 1);

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center"
      style={{
        height: size,
        opacity,
        transform: `scale(${scale})`,
        transition: isSpinning ? 'opacity 0.2s' : 'none',
      }}
    >
      {isSpinning ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
          stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round"
          style={{ animation: 'ptr-spin 0.7s linear infinite' }}
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
          stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: state === 'ready' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      )}
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function PullToRefresh({
  onRefresh,
  threshold = 64,
  maxPull = 96,
  children,
  className = '',
}: PullToRefreshProps) {
  const statusId = useId();
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || pullState === 'refreshing') return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) return;

    const clamped = Math.min(dy * 0.5, maxPull);
    setPullDistance(clamped);
    setPullState(clamped >= threshold ? 'ready' : 'pulling');
  }, [pullState, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullState === 'ready') {
      setPullState('refreshing');
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setPullState('idle');
        setPullDistance(0);
      }
    } else {
      setPullState('idle');
      setPullDistance(0);
    }
  }, [pullState, threshold, onRefresh]);

  const isActive = pullState !== 'idle';
  const indicatorHeight = isActive ? Math.max(pullDistance, pullState === 'refreshing' ? 40 : 0) : 0;

  return (
    <div
      className={['relative overflow-hidden', className].join(' ')}
      style={{ touchAction: 'pan-x' }}
    >
      {/* 상태 알림 (스크린 리더) */}
      <div
        id={statusId}
        role="status"
        aria-live="polite"
        aria-label={STATE_LABEL[pullState]}
        className="sr-only"
      />

      {/* 인디케이터 슬롯 */}
      <div
        aria-hidden="true"
        style={{
          height: indicatorHeight,
          overflow: 'hidden',
          transition: pullState === 'idle' || pullState === 'refreshing'
            ? 'height 0.25s cubic-bezier(0.25,0.46,0.45,0.94)'
            : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isActive && (
          <Indicator state={pullState} pullRatio={pullDistance / threshold} />
        )}
      </div>

      {/* 스크롤 컨텐츠 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}
