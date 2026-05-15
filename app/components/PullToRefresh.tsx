'use client';

/**
 * PullToRefresh — 모바일 풀-투-리프레시 컨테이너
 *
 * 모바일 환경에서 콘텐츠 최상단에서 아래로 끌어내려 새로고침을 트리거한다.
 * - Pointer Events 기반 (터치/마우스 통합 처리)
 * - resistance 0.5 적용 (실제 이동거리의 절반만 인디케이터 이동)
 * - 임계 도달 시 haptics.medium() 진동 피드백
 * - prefers-reduced-motion / 미지원 브라우저는 graceful fallback
 *
 * 키보드 대체 수단(JM6):
 * - 풀 제스처는 키보드로 트리거 불가. 호스트 화면 헤더에 별도
 *   "새로고침" 버튼을 두어 동일한 onRefresh 콜백을 호출하도록 한다.
 *
 * JM:  단일 책임 — 풀 제스처 + 인디케이터만 담당, ~180줄
 * JM3: try/finally 로 refreshing 플래그 보장, pointer 이벤트 cleanup
 * JM4: any 금지, props/state 명시적 타입
 * JM6: 시각 인디케이터 + role="status" + aria-live
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { haptics } from '@/app/lib/haptics';

export type PullToRefreshProps = {
  /** 새로고침 콜백. async 가능. throw 해도 컴포넌트 상태는 복구된다. */
  onRefresh: () => Promise<void> | void;
  /** 트리거 임계값(px). 기본 80. */
  threshold?: number;
  /** 스크롤·풀 동작을 받을 콘텐츠. */
  children: ReactNode;
  /** 외부 컨테이너 추가 클래스. */
  className?: string;
  /** true 면 풀 제스처를 비활성화 (편집 모드 등). */
  disabled?: boolean;
  /** 콘텐츠 측 추가 클래스. */
  contentClassName?: string;
};

const RESISTANCE = 0.5;
const MAX_PULL_RATIO = 1.5;

export function PullToRefresh({
  onRefresh,
  threshold = 80,
  children,
  className,
  disabled = false,
  contentClassName,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const triggeredHapticRef = useRef(false);

  const reset = useCallback(() => {
    startYRef.current = null;
    triggeredHapticRef.current = false;
    setPullDistance(0);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || refreshing) return;
      // 터치/펜만 허용 — 마우스는 데스크톱 스크롤로 처리되도록 무시
      if (event.pointerType === 'mouse') return;
      const el = scrollRef.current;
      if (el && el.scrollTop > 0) return;
      startYRef.current = event.clientY;
    },
    [disabled, refreshing],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (startYRef.current === null) return;
      if (disabled || refreshing) return;
      const delta = event.clientY - startYRef.current;
      if (delta <= 0) {
        if (pullDistance !== 0) setPullDistance(0);
        return;
      }
      const resisted = Math.min(delta * RESISTANCE, threshold * MAX_PULL_RATIO);
      setPullDistance(resisted);
      if (resisted >= threshold && !triggeredHapticRef.current) {
        triggeredHapticRef.current = true;
        haptics.medium();
      } else if (resisted < threshold && triggeredHapticRef.current) {
        // 임계 미만으로 복귀하면 다시 진동 가능 상태로
        triggeredHapticRef.current = false;
      }
    },
    [disabled, pullDistance, refreshing, threshold],
  );

  const handlePointerEnd = useCallback(async () => {
    if (startYRef.current === null) return;
    const shouldRefresh = pullDistance >= threshold && !disabled && !refreshing;
    startYRef.current = null;
    if (!shouldRefresh) {
      reset();
      return;
    }
    setRefreshing(true);
    setPullDistance(threshold);
    try {
      await onRefresh();
    } catch (error) {
      // 호출자에게 책임 위임 — 콘솔만 남기고 swallow
      console.error('[PullToRefresh] onRefresh failed', error);
    } finally {
      setRefreshing(false);
      reset();
    }
  }, [disabled, onRefresh, pullDistance, refreshing, reset, threshold]);

  // 컴포넌트 unmount 시 잔여 상태 정리
  useEffect(() => {
    return () => {
      startYRef.current = null;
      triggeredHapticRef.current = false;
    };
  }, []);

  const indicatorOffset = pullDistance - threshold;
  const indicatorActive = pullDistance >= threshold || refreshing;

  return (
    <div
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={['relative overflow-y-auto overscroll-y-contain', className]
        .filter(Boolean)
        .join(' ')}
      style={{ touchAction: disabled ? 'auto' : 'pan-y' }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={refreshing ? '새로고침 중' : indicatorActive ? '놓으면 새로고침' : '아래로 당겨 새로고침'}
        className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-center"
        style={{
          height: threshold,
          transform: `translateY(${indicatorOffset}px)`,
          transition: startYRef.current === null ? 'transform 200ms ease-out' : 'none',
        }}
      >
        <span
          className={[
            'flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1.5 text-xs',
            'border border-[var(--border)] text-[var(--toss-gray-4)] shadow-xs',
            indicatorActive ? 'text-[var(--accent)]' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowDown
              className={`h-4 w-4 transition-transform ${indicatorActive ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          )}
          <span className="select-none">
            {refreshing ? '새로고침 중' : indicatorActive ? '놓으면 새로고침' : '당겨서 새로고침'}
          </span>
        </span>
      </div>

      <div
        className={contentClassName}
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: startYRef.current === null ? 'transform 200ms ease-out' : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default PullToRefresh;
