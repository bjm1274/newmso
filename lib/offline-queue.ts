/**
 * 오프라인 액션 큐
 *
 * 네트워크 끊김 시 사용자 액션(요청)을 localStorage에 큐잉하고,
 * 네트워크가 복구되면 자동으로 재시도한다.
 *
 * 사용 예:
 *   const queue = getOfflineQueue();
 *   queue.enqueue({ type: 'create-note', payload: { ... } });
 *   const stop = queue.startAutoFlush(async (action) => {
 *     await fetch('/api/notes', { method: 'POST', body: JSON.stringify(action.payload) });
 *   });
 */

const STORAGE_KEY = 'mso:offline-queue:v1';
const STORAGE_KEY_PREFIX = 'mso:offline-queue:';
const MAX_RETRY_COUNT = 5;
const RETRY_BACKOFF_MS = 4000;

export type QueuedAction = {
  /** 큐 항목 고유 ID (자동 생성) */
  readonly id: string;
  /** 액션 종류 식별자 (예: 'create-note', 'update-status') */
  readonly type: string;
  /** 액션 페이로드 (직렬화 가능해야 함) */
  readonly payload: unknown;
  /** 큐에 등록된 시각 (epoch ms) */
  readonly createdAt: number;
  /** 재시도 횟수 */
  readonly retryCount: number;
  /** 마지막 시도 시각 (epoch ms, 0이면 미시도) */
  readonly lastAttemptAt: number;
};

export type EnqueueInput = {
  readonly type: string;
  readonly payload: unknown;
};

export type QueueListener = (items: readonly QueuedAction[]) => void;
export type FlushHandler = (action: QueuedAction) => Promise<void>;

type StoredQueue = {
  version: 1;
  items: QueuedAction[];
};

function isQueuedAction(value: unknown): value is QueuedAction {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.retryCount === 'number' &&
    typeof record.lastAttemptAt === 'number'
  );
}

function safeReadStorage(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as StoredQueue).items)
    ) {
      return [];
    }
    return (parsed as StoredQueue).items.filter(isQueuedAction);
  } catch {
    return [];
  }
}

function safeWriteStorage(items: readonly QueuedAction[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const payload: StoredQueue = { version: 1, items: [...items] };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // QuotaExceededError, SecurityError 등은 무시 (큐가 휘발됨)
    return false;
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `oq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OfflineQueue {
  private items: QueuedAction[];
  private listeners: Set<QueueListener>;

  constructor() {
    this.items = safeReadStorage();
    this.listeners = new Set();
  }

  list(): readonly QueuedAction[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  enqueue(input: EnqueueInput): QueuedAction {
    const action: QueuedAction = {
      id: generateId(),
      type: input.type,
      payload: input.payload,
      createdAt: Date.now(),
      retryCount: 0,
      lastAttemptAt: 0,
    };
    this.items = [...this.items, action];
    safeWriteStorage(this.items);
    this.emit();
    return action;
  }

  dequeue(id: string): void {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    safeWriteStorage(this.items);
    this.emit();
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    safeWriteStorage(this.items);
    this.emit();
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // 초기 상태 즉시 통지
    listener(this.list());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 네트워크 복원 시(`online` 이벤트) 또는 즉시 큐의 모든 항목을 handler로 전달.
   * 성공 시 dequeue, 실패 시 retryCount 증가. MAX_RETRY_COUNT 초과 시 제거.
   * 호출 시 unsubscribe 함수를 반환.
   */
  startAutoFlush(handler: FlushHandler): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    let cancelled = false;
    let flushing = false;

    const flush = async () => {
      if (flushing || cancelled) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushing = true;
      try {
        // 매 사이클마다 최신 items 스냅샷 사용
        const snapshot = [...this.items];
        for (const action of snapshot) {
          if (cancelled) break;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

          const now = Date.now();
          // 백오프: lastAttemptAt + retryCount * RETRY_BACKOFF_MS 이전이면 스킵
          if (
            action.lastAttemptAt > 0 &&
            now - action.lastAttemptAt < action.retryCount * RETRY_BACKOFF_MS
          ) {
            continue;
          }

          try {
            await handler(action);
            this.dequeue(action.id);
          } catch {
            this.markAttempted(action.id);
          }
        }
      } finally {
        flushing = false;
      }
    };

    const onOnline = () => {
      void flush();
    };

    window.addEventListener('online', onOnline);
    // 시작 시 한 번 시도
    void flush();

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }

  private markAttempted(id: string): void {
    let removed = false;
    const next = this.items.flatMap<QueuedAction>((item) => {
      if (item.id !== id) return [item];
      const retryCount = item.retryCount + 1;
      if (retryCount > MAX_RETRY_COUNT) {
        removed = true;
        return [];
      }
      return [{ ...item, retryCount, lastAttemptAt: Date.now() }];
    });
    this.items = next;
    safeWriteStorage(this.items);
    if (removed || true) this.emit();
  }

  private emit(): void {
    const snapshot = this.list();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // 리스너 에러는 큐 동작에 영향 주지 않음
      }
    });
  }
}

let singleton: OfflineQueue | null = null;

/**
 * 브라우저 환경에서 공유되는 OfflineQueue 싱글톤을 반환한다.
 * 서버 사이드 호출 시에도 안전하게 빈 인스턴스를 반환한다.
 */
export function getOfflineQueue(): OfflineQueue {
  if (!singleton) singleton = new OfflineQueue();
  return singleton;
}

/** 테스트 전용: 싱글톤 초기화 */
export function __resetOfflineQueueForTests(): void {
  singleton = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** 큐 스토리지 키 prefix (충돌 방지용 외부 확인) */
export const OFFLINE_QUEUE_STORAGE_PREFIX = STORAGE_KEY_PREFIX;
