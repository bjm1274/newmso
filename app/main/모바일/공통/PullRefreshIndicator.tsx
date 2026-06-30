'use client';

/**
 * PullRefreshIndicator — pull-to-refresh 시각 인디케이터.
 *
 * 사용법:
 *   const { containerRef, refreshing, pullProgress } = usePullToRefresh({ onRefresh });
 *   <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
 *
 * 동작:
 *   - pullProgress > 0: 화면 상단 고정 바 + 스피너 아이콘 (progress 비례 opacity·회전)
 *   - refreshing: 고정 스피너 유지 + aria-live="polite"로 "새로고침 중" 알림
 *   - 완료(refreshing false로 전환): "갱신 완료" 알림 (500ms 후 숨김)
 *
 * JM: 단일 책임 ~80줄
 * JM6: aria-live·aria-busy·role="status"
 */

import { useEffect, useState } from 'react';

export type PullRefreshIndicatorProps = {
  refreshing: boolean;
  pullProgress: number; // 0~1
};

export default function PullRefreshIndicator({
  refreshing,
  pullProgress }: PullRefreshIndicatorProps) {
  const [liveMsg, setLiveMsg] = useState('');
  const prevRefreshing = usePrevious(refreshing);

  // aria-live 메시지 관리
  useEffect(() => {
    if (refreshing && !prevRefreshing) {
      setLiveMsg('새로고침 중');
    } else if (!refreshing && prevRefreshing) {
      setLiveMsg('갱신 완료');
      const timer = setTimeout(() => setLiveMsg(''), 500);
      return () => clearTimeout(timer);
    }
  }, [refreshing, prevRefreshing]);

  const visible = refreshing || pullProgress > 0;
  if (!visible) {
    return (
      // 스크린리더 전용 영역 — 항상 DOM에 존재
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', left: -9999, top: -9999, width: 1, height: 1 }}
      >
        {liveMsg}
      </div>
    );
  }

  const opacity = refreshing ? 1 : pullProgress;
  // pullProgress에 따라 0 → 360도 회전, refreshing 중엔 연속 spin
  const rotation = refreshing ? undefined : `${pullProgress * 360}deg`;

  return (
    <>
      {/* 스크린리더 알림 */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', left: -9999, top: -9999, width: 1, height: 1 }}
      >
        {liveMsg}
      </div>

      {/* 시각 인디케이터 — 화면 최상단 고정 */}
      <div
        aria-hidden="true"
        aria-busy={refreshing}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none' }}
      >
        {/* 진행 바 */}
        <div
          style={{
            width: '100%',
            height: 2,
            background: 'var(--m-border)',
            overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--m-accent)',
              width: `${opacity * 100}%`,
              transition: refreshing ? 'none' : 'width 0.1s ease' }}
          />
        </div>

        {/* 스피너 아이콘 */}
        <div
          style={{
            width: 32,
            height: 32,
            marginTop: 4,
            display: 'grid',
            placeItems: 'center',
            opacity,
            transition: refreshing ? 'opacity 0.15s ease' : 'opacity 0.1s ease' }}
        >
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="var(--m-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{
              transform: rotation ? `rotate(${rotation})` : undefined,
              animation: refreshing ? 'spin 0.7s linear infinite' : undefined }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      </div>
    </>
  );
}

/** 이전 값 추적 — 완료 판단용 */
function usePrevious<T>(value: T): T | undefined {
  const [prev, setPrev] = useState<T | undefined>(undefined);
  useEffect(() => {
    setPrev(value);
  }, [value]);
  return prev;
}
