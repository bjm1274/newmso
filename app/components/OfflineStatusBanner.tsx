'use client';

import { useEffect, useState } from 'react';
import { getOfflineQueue } from '@/lib/offline-queue';

export default function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncStatus = () => {
      setIsOffline(!window.navigator.onLine);
    };

    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);

    const queue = getOfflineQueue();
    const unsubscribe = queue.subscribe((items) => {
      setPendingCount(items.length);
    });

    return () => {
      window.removeEventListener('online', syncStatus);
      window.removeEventListener('offline', syncStatus);
      unsubscribe();
    };
  }, []);

  // 오프라인이거나, 온라인이지만 큐에 남은 작업이 있으면 표시
  if (!isOffline && pendingCount === 0) return null;

  const message = isOffline
    ? pendingCount > 0
      ? `오프라인 상태입니다. 대기 중인 작업 ${pendingCount}건은 네트워크가 복구되면 자동으로 다시 동기화됩니다.`
      : '오프라인 상태입니다. 네트워크가 복구되면 채팅, 알림, 저장 요청이 다시 동기화됩니다.'
    : `대기 중인 작업 ${pendingCount}건을 다시 동기화 중입니다.`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border border-amber-300 bg-amber-50/95 px-4 py-2.5 text-[12px] font-semibold text-amber-900 shadow-sm backdrop-blur"
    >
      {message}
    </div>
  );
}
