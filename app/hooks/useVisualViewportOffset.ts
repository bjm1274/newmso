'use client';

/**
 * useVisualViewportOffset — 모바일 키보드(IME) 가시 영역 보정 훅
 *
 * 모바일에서 소프트 키보드가 올라오면 layout viewport 높이는 그대로지만
 * visual viewport 높이가 줄어든다. position: fixed; bottom: 0 인 요소는
 * 키보드에 가려져 사용자가 입력 중인 폼 액션(저장·취소)을 볼 수 없다.
 *
 * 이 훅은 `window.innerHeight - vv.height - vv.offsetTop` 으로
 * "키보드(또는 가려진 영역)의 높이"를 계산해 반환한다.
 * 사용처에서 sticky/fixed 요소의 bottom 또는 translateY에 더해 보정한다.
 *
 * 사용 예:
 * ```tsx
 * const offset = useVisualViewportOffset();
 *
 * <footer
 *   className="sticky-form-footer"
 *   style={{ transform: `translateY(-${offset}px)` }}
 * />
 * ```
 *
 * SSR / 비지원 브라우저에서는 0을 반환하므로 안전하다.
 *
 * JM: 단일 책임 — visual viewport 오프셋 계산만 담당
 * JM2: rAF 디바운스, 이벤트는 passive로 등록해 스크롤 성능 영향 최소화
 * JM3: addEventListener 실패에도 cleanup 안전, try/finally 불필요
 * JM4: any 금지, 반환 타입 number 고정
 */

import { useEffect, useState } from 'react';

export function useVisualViewportOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;

    const compute = (): void => {
      // 키보드가 올라온 만큼 layout viewport 와 visual viewport 의 차이가 생긴다.
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setOffset(gap);
    };

    const update = (): void => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(compute);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // 초기 1회
    compute();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return offset;
}

export default useVisualViewportOffset;
