'use client';

/**
 * usePullToRefresh — 터치 기반 당겨서 새로고침 훅.
 *
 * 동작:
 *   1. scrollTop === 0 인 상태에서 아래 방향 터치이동 시 추적 시작
 *   2. 이동 거리가 threshold(기본 60px)를 넘으면 인디케이터 표시
 *   3. touchend 시 threshold 이상이면 onRefresh() 콜백 호출
 *   4. 연속 PTR 방지: refresh 완료 후 COOLDOWN_MS(1500ms) 동안 재시도 차단
 *
 * 제약:
 *   - JM: 단일 책임(터치 로직) ~120줄
 *   - JM2: passive:false touchmove — iOS Safari overscroll 충돌 방지, refreshing 중 불필요 호출 차단
 *   - JM3: onRefresh 에러는 무음 처리 후 인디케이터 복원
 *   - JM4: any 금지, RefObject<HTMLDivElement> 정확히
 *   - JM6: aria-live 상태 알림(갱신 중/완료)은 소비 컴포넌트(PullRefreshIndicator)에서 처리
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const COOLDOWN_MS = 1_500;
const DRAG_DAMPING = 0.45; // 저항감 계수 — 실제 드래그의 45%만 반영

export type UsePullToRefreshOptions = {
  onRefresh: () => Promise<void>;
  enabled?: boolean;
  threshold?: number;
};

export type UsePullToRefreshResult = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  refreshing: boolean;
  pullProgress: number; // 0~1
};

export function usePullToRefresh({
  onRefresh,
  enabled = true,
  threshold = 60,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);

  // refs — 렌더 없이 추적
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastCooldownRef = useRef<number>(0);
  const refreshingRef = useRef(false);

  const triggerRefresh = useCallback(async () => {
    const now = Date.now();
    if (refreshingRef.current) return;
    if (now - lastCooldownRef.current < COOLDOWN_MS) return;

    refreshingRef.current = true;
    setRefreshing(true);
    setPullProgress(1);

    try {
      await onRefresh();
    } catch {
      // JM3: 에러 무음 처리 — 인디케이터만 복원
    } finally {
      lastCooldownRef.current = Date.now();
      refreshingRef.current = false;
      setRefreshing(false);
      setPullProgress(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      // scrollTop === 0 일 때만 PTR 추적 시작
      if (el && el.scrollTop > 0) return;
      const touch = e.touches[0];
      startYRef.current = touch ? touch.clientY : null;
      draggingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (startYRef.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dy = touch.clientY - startYRef.current;
      if (dy <= 0) {
        // 위로 올리는 건 PTR 아님 — 추적 중단
        startYRef.current = null;
        setPullProgress(0);
        return;
      }

      // 스크롤이 0보다 크면 PTR 취소 (사용자가 먼저 스크롤 내렸을 수 있음)
      if (el && el.scrollTop > 0) {
        startYRef.current = null;
        setPullProgress(0);
        return;
      }

      draggingRef.current = true;

      // iOS Safari 기본 overscroll-bounce 차단
      e.preventDefault();

      const damped = dy * DRAG_DAMPING;
      const progress = Math.min(damped / threshold, 1);
      setPullProgress(progress);
    }

    function onTouchEnd() {
      if (!draggingRef.current) {
        startYRef.current = null;
        return;
      }

      // 현재 progress를 읽어 threshold 이상이면 refresh
      setPullProgress((prev) => {
        if (prev >= 1) {
          void triggerRefresh();
        } else {
          // 미달 — 즉시 복원
        }
        return 0;
      });

      startYRef.current = null;
      draggingRef.current = false;
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // preventDefault 필요
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, threshold, triggerRefresh]);

  // 키보드 R 단축키 (JM6)
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName ?? '';
        // input/textarea 포커스 중엔 무시
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        void triggerRefresh();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, triggerRefresh]);

  return { containerRef, refreshing, pullProgress };
}
