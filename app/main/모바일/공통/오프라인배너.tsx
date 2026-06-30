'use client';

/**
 * 오프라인배너 — 오프라인 상태 및 큐 동기화 상태를 상단 sticky 배너로 표시.
 *
 * 상태별 표시:
 *  - 오프라인 → 빨간 배너 ("오프라인 — N개 작업 + M개 첨부 대기")
 *  - 온라인 + 큐 N > 0 → 노란 배너 ("동기화 중 N개 작업 + M개 첨부")
 *  - 온라인 + 모든 큐 비어있음 → 미노출
 *
 * JM: 단일 책임 (~90줄)
 * JM2: subscribe 1회 등록, 의존성 없음
 * JM6: role=status + aria-live=polite
 */

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/use-online-status';
import { getOfflineQueue } from '@/lib/offline-queue';
import { getUploadQueueSize, subscribeUploadQueue } from '@/lib/offline-upload-queue';

export default function 오프라인배너() {
  const { online, offlineSinceMs } = useOnlineStatus();
  const [queueSize, setQueueSize] = useState(0);
  const [uploadSize, setUploadSize] = useState(0);

  // mutation 큐 크기 구독 — 진입 1회
  useEffect(() => {
    const queue = getOfflineQueue();
    const unsubscribe = queue.subscribe((items) => {
      setQueueSize(items.length);
    });
    return unsubscribe;
  }, []);

  // 업로드 큐 크기 구독 — 진입 1회
  useEffect(() => {
    // 초기값 동기 읽기
    setUploadSize(getUploadQueueSize());
    // 변경 구독
    const unsubscribe = subscribeUploadQueue(() => {
      setUploadSize(getUploadQueueSize());
    });
    return unsubscribe;
  }, []);

  // 오프라인 경과 시간 (분)
  const offlineMinutes =
    !online && offlineSinceMs !== null
      ? Math.floor((Date.now() - offlineSinceMs) / 60_000)
      : 0;

  const total = queueSize + uploadSize;

  // 온라인 + 모든 큐 없음 → 미노출
  if (online && total === 0) return null;

  const isOffline = !online;

  const bg = isOffline
    ? 'var(--m-danger, #EF4444)'
    : 'var(--m-warning, #F59E0B)';

  function buildText(): string {
    const parts: string[] = [];
    if (queueSize > 0) parts.push(`${queueSize}개 작업`);
    if (uploadSize > 0) parts.push(`${uploadSize}개 첨부`);
    const summary = parts.join(' + ');
    const timeNote = offlineMinutes > 0 ? ` (${offlineMinutes}분째)` : '';

    if (isOffline) {
      return summary.length > 0
        ? `오프라인 — ${summary} 대기${timeNote}`
        : `오프라인${timeNote}`;
    }
    return `동기화 중 ${summary}`;
  }

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
        letterSpacing: '-0.01em' }}
    >
      {buildText()}
    </div>
  );
}
