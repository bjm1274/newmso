'use client';

/** 재시도 큐 공통 유틸 — localStorage(메시지) · IndexedDB(첨부파일) 양쪽에서 사용 */

export function buildRetryQueueId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sortByCreatedAt<T extends { createdAt: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
  );
}

export function limitToMaxSize<T extends { createdAt: string }>(entries: T[], maxSize: number): T[] {
  if (entries.length <= maxSize) return entries;
  return sortByCreatedAt(entries).slice(-maxSize);
}
