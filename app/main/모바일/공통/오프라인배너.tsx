'use client';

/**
 * 오프라인배너 — 오프라인 상태 및 큐 동기화 상태를 상단 sticky 배너로 표시.
 *
 * 상태별 표시:
 *  - 오프라인 → 빨간 배너 ("오프라인 — N개 작업 대기")
 *  - 온라인 + 큐 N > 0 → 노란 배너 ("동기화 중 N개")
 *  - 온라인 + 큐 비어있음 → 미노출
 *
 * JM: 단일 책임 (~80줄)
 * JM2: subscribe 1회 등록, 의존성 없음
 * JM6: role=status + aria-live=polite
 */

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/use-online-status';
import { getOfflineQueue } from '@/lib/offline-queue';

export default function 오프라인배너() {
  const { online, offlineSinceMs } = useOnlineStatus();
  const [queueSize, setQueueSize] = useState(0);

  // 큐 크기 구독 — 진입 1회
  useEffect(() => {
    const queue = getOfflineQueue();
    const unsubscribe = queue.subscribe((items) => {
      setQueueSize(items.length);
    });
    return unsubscribe;
  }, []);

  // 오프라인 경과 시간 (분)
  const offlineMinutes =
    !online && offlineSinceMs !== null
      ? Math.floor((Date.now() - offlineSinceMs) / 60_000)
      : 0;

  // 온라인 + 큐 없음 → 미노출
  if (online && queueSize === 0) return null;

  const isOffline = !online;

  const bg = isOffline
    ? 'var(--m-danger, #EF4444)'
    : 'var(--m-warning, #F59E0B)';

  const text = isOffline
    ? queueSize > 0
      ? `오프라인 — ${queueSize}개 작업 대기${offlineMinutes > 0 ? ` (${offlineMinutes}분째)` : ''}`
      : `오프라인${offlineMinutes > 0 ? ` (${offlineMinutes}분째)` : ''}`
    : `동기화 중 ${queueSize}개`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: bg,
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'center',
        padding: '7px 16px',
        letterSpacing: '-0.01em',
      }}
    >
      {text}
    </div>
  );
}
