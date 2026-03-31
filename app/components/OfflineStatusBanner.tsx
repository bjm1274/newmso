'use client';

import { useEffect, useState } from 'react';

export default function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncStatus = () => {
      setIsOffline(!window.navigator.onLine);
    };

    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);

    return () => {
      window.removeEventListener('online', syncStatus);
      window.removeEventListener('offline', syncStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border border-amber-300 bg-amber-50/95 px-4 py-2.5 text-[12px] font-semibold text-amber-900 shadow-sm backdrop-blur"
    >
      오프라인 상태입니다. 네트워크가 복구되면 채팅, 알림, 저장 요청이 다시 동기화됩니다.
    </div>
  );
}
