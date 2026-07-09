/**
 * offline-queue-db — IndexedDB 백엔드 오프라인 큐 호환 엔트리.
 *
 * 실제 구현은 lib/offline-queue.ts + lib/offline-queue-storage.ts
 * (IndexedDB → localStorage → in-memory 폴백).
 * 이 파일은 레거시/대체 경로 import 를 깨지지 않게 re-export 한다.
 */

export {
  getOfflineQueue,
  OfflineQueue,
  listFailed,
  retryFailed,
  dismissFailed,
  subscribeFailed,
  type QueuedAction,
  type EnqueueInput,
  type QueueListener,
  type FailedQueueListener,
  type FlushHandler,
} from './offline-queue';
