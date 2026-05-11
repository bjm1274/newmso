'use client';

/**
 * app/components/dev/WebVitalsInit.tsx
 * Web Vitals 초기화 전용 Client 컴포넌트 — 렌더링 없음, 부수효과만 (JM2·JM3)
 *
 * - Server Component인 app/layout.tsx에서 useEffect를 쓸 수 없으므로 분리
 * - 컴포넌트 자체는 null 반환 → DOM 영향 없음
 */

import { useEffect } from 'react';
import { initWebVitals } from '@/lib/measurement/web-vitals';

export default function WebVitalsInit(): null {
  useEffect(() => {
    initWebVitals();
  }, []);

  return null;
}
