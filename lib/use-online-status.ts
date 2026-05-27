'use client';

/**
 * useOnlineStatus — navigator.onLine + online/offline 이벤트 구독.
 *
 * SSR 안전: typeof window 가드 포함.
 * offlineSinceMs: 오프라인 진입 epoch ms (온라인이면 null).
 *
 * JM: 단일 책임 (~50줄)
 * JM2: 이벤트 리스너 1회 등록, 의존성 없음
 * JM4: 타입 명시
 */

import { useEffect, useState } from 'react';

export type OnlineStatus = {
  /** 현재 온라인 여부 */
  online: boolean;
  /**
   * 오프라인 진입 시각 (epoch ms).
   * 온라인 상태면 null.
   */
  offlineSinceMs: number | null;
};

function getBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function useOnlineStatus(): OnlineStatus {
  const [state, setState] = useState<OnlineStatus>(() => ({
    online: getBrowserOnline(),
    offlineSinceMs: getBrowserOnline() ? null : Date.now(),
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setState({ online: true, offlineSinceMs: null });
    };

    const handleOffline = () => {
      setState({ online: false, offlineSinceMs: Date.now() });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return state;
}
