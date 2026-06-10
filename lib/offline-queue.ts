/**
 * 오프라인 액션 큐
 *
 * 네트워크 끊김 시 사용자 액션(요청)을 IndexedDB(→ localStorage → in-memory)에
 * 큐잉하고, 네트워크가 복구되면 자동으로 재시도한다.
 *
 * 스토리지 우선순위: IndexedDB > localStorage > in-memory
 * 기존 localStorage `mso:offline-queue:v1` 데이터는 최초 IDB 접근 시 1회 자동 이전.
 *
 * 사용 예:
 *   const queue = getOfflineQueue();
 *   queue.enqueue({ type: 'create-note', payload: { ... } });
 *   const stop = queue.startAutoFlush(async (action) => {
 *     await fetch('/api/notes', { method: 'POST', body: JSON.stringify(action.payload) });
 *   });
 *
 * JM: 단일 책임 (~300줄)
 * JM2: subscribe는 진입 1회, primitive deps
 * JM3: IDB 실패·MAX_RETRY·failed 큐 명시 구분
 * JM4: any 금지, unknown + 가드
 * JM5: 민감 정보(토큰·비밀번호) 저장 금지 — 호출자 책임
 */

import {
  storageReadQueue,
  storageWriteQueue,
  storageReadFailed,
  storageWriteFailed,
} from './offline-queue-storage';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

/** @deprecated 내부 스토리지 키 — 직접 접근 금지, storageReadQueue 사용 */
const STORAGE_KEY = 'mso:offline-queue:v1';
const STORAGE_KEY_PREFIX = 'mso:offline-queue:';
const MAX_RETRY_COUNT = 5;
const RETRY_BACKOFF_MS = 4000;

// ─────────────────────────────────────────────────────────────
// 공개 타입
// ─────────────────────────────────────────────────────────────

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
  /** 트랜잭션 그룹 ID (순서 의존 큐잉 시) */
  readonly groupId?: string;
  /** 그룹 내 순서 인덱스 */
  readonly groupIndex?: number;
};

export type EnqueueInput = {
  readonly type: string;
  readonly payload: unknown;
  /** 트랜잭션 그룹 ID (선택) */
  readonly groupId?: string;
  /** 그룹 내 순서 인덱스 (선택) */
  readonly groupIndex?: number;
};

export type QueueListener = (items: readonly QueuedAction[]) => void;
export type FailedQueueListener = (items: readonly QueuedAction[]) => void;
export type FlushHandler = (action: QueuedAction) => Promise<void>;

// ─────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────

function isQueuedAction(value: unknown): value is QueuedAction {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.type === 'string' &&
    typeof r.createdAt === 'number' &&
    typeof r.retryCount === 'number' &&
    typeof r.lastAttemptAt === 'number'
  );
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `oq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────
// OfflineQueue 클래스
// ─────────────────────────────────────────────────────────────

export class OfflineQueue {
  /** 로딩 전 in-memory 버퍼 — IDB async init 완료 전 enqueue 요청 보관 */
  private items: QueuedAction[] = [];
  private failedItems: QueuedAction[] = [];
  private listeners: Set<QueueListener> = new Set();
  private failedListeners: Set<FailedQueueListener> = new Set();
  /** IDB에서 초기 읽기가 완료됐는지 */
  private loaded = false;
  /** 초기화 Promise (중복 방지) */
  private initPromise: Promise<void> | null = null;

  constructor() {
    // failed 큐는 동기 localStorage에서 즉시 로드
    this.failedItems = storageReadFailed().filter(isQueuedAction);
    // active 큐는 비동기 IDB에서 로드
    this.initPromise = this.load();
  }

  /** IDB(또는 폴백) 에서 초기 로드 */
  private async load(): Promise<void> {
    const items = await storageReadQueue();
    this.items = items.filter(isQueuedAction);
    this.loaded = true;
    this.emit();
  }

  /** 초기화 완료 대기 */
  async ready(): Promise<void> {
    if (this.loaded) return;
    await this.initPromise;
  }

  list(): readonly QueuedAction[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  // ─────────────────────────────────────────────────────────────
  // active 큐 조작
  // ─────────────────────────────────────────────────────────────

  enqueue(input: EnqueueInput): QueuedAction {
    const action: QueuedAction = {
      id: generateId(),
      type: input.type,
      payload: input.payload,
      createdAt: Date.now(),
      retryCount: 0,
      lastAttemptAt: 0,
      ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
      ...(input.groupIndex !== undefined ? { groupIndex: input.groupIndex } : {}),
    };
    this.items = [...this.items, action];
    void storageWriteQueue(this.items);
    this.emit();
    return action;
  }

  dequeue(id: string): void {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    void storageWriteQueue(this.items);
    this.emit();
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    void storageWriteQueue(this.items);
    this.emit();
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─────────────────────────────────────────────────────────────
  // failed 큐 API (작업 3)
  // ─────────────────────────────────────────────────────────────

  listFailed(): readonly QueuedAction[] {
    return [...this.failedItems];
  }

  /**
   * failed 항목을 active 큐로 되돌리고 flush를 트리거한다.
   */
  retryFailed(id: string): void {
    const target = this.failedItems.find((item) => item.id === id);
    if (!target) return;
    this.failedItems = this.failedItems.filter((item) => item.id !== id);
    storageWriteFailed(this.failedItems);
    this.emitFailed();

    // retryCount·lastAttemptAt 리셋 후 active 큐 재삽입
    const reset: QueuedAction = { ...target, retryCount: 0, lastAttemptAt: 0 };
    this.items = [...this.items, reset];
    void storageWriteQueue(this.items);
    this.emit();
  }

  /**
   * failed 항목을 영구 삭제한다.
   */
  dismissFailed(id: string): void {
    const next = this.failedItems.filter((item) => item.id !== id);
    if (next.length === this.failedItems.length) return;
    this.failedItems = next;
    storageWriteFailed(this.failedItems);
    this.emitFailed();
  }

  subscribeFailed(listener: FailedQueueListener): () => void {
    this.failedListeners.add(listener);
    listener(this.listFailed());
    return () => {
      this.failedListeners.delete(listener);
    };
  }

  // ─────────────────────────────────────────────────────────────
  // auto flush
  // ─────────────────────────────────────────────────────────────

  /**
   * 네트워크 복원 시(`online` 이벤트) 또는 즉시 큐의 모든 항목을 handler로 전달.
   * 성공 시 dequeue, 실패 시 retryCount 증가.
   * MAX_RETRY_COUNT 초과 시 active 큐에서 제거하고 failed 큐로 이동.
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
        await this.ready();
        const snapshot = [...this.items];
        for (const action of snapshot) {
          if (cancelled) break;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

          const now = Date.now();
          if (
            action.lastAttemptAt > 0 &&
            now - action.lastAttemptAt < action.retryCount * RETRY_BACKOFF_MS
          ) {
            continue;
          }

          // 같은 그룹에서 앞선 항목이 아직 큐에 남아 있으면 이 항목은 보류
          if (action.groupId !== undefined && action.groupIndex !== undefined && action.groupIndex > 0) {
            const currentGroupIndex = action.groupIndex;
            const prevInGroup = this.items.find(
              (i) => i.groupId === action.groupId && i.groupIndex === currentGroupIndex - 1,
            );
            if (prevInGroup) continue;
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
    void flush();

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 내부 메서드
  // ─────────────────────────────────────────────────────────────

  private markAttempted(id: string): void {
    const next = this.items.flatMap<QueuedAction>((item) => {
      if (item.id !== id) return [item];
      const retryCount = item.retryCount + 1;
      if (retryCount > MAX_RETRY_COUNT) {
        // silent 삭제 → failed 큐로 이동 (작업 3)
        const failedItem: QueuedAction = { ...item, retryCount, lastAttemptAt: Date.now() };
        this.failedItems = [...this.failedItems, failedItem];
        storageWriteFailed(this.failedItems);
        this.emitFailed();
        return [];
      }
      return [{ ...item, retryCount, lastAttemptAt: Date.now() }];
    });
    this.items = next;
    void storageWriteQueue(this.items);
    this.emit();
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

  private emitFailed(): void {
    const snapshot = this.listFailed();
    this.failedListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // ignore
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 싱글톤
// ─────────────────────────────────────────────────────────────

let singleton: OfflineQueue | null = null;

/**
 * 브라우저 환경에서 공유되는 OfflineQueue 싱글톤을 반환한다.
 * 서버 사이드 호출 시에도 안전하게 빈 인스턴스를 반환한다.
 */
export function getOfflineQueue(): OfflineQueue {
  if (!singleton) singleton = new OfflineQueue();
  return singleton;
}

// ─────────────────────────────────────────────────────────────
// 모듈-레벨 failed 큐 공개 함수 (작업 3 인터페이스)
// ─────────────────────────────────────────────────────────────

export function listFailed(): readonly QueuedAction[] {
  return getOfflineQueue().listFailed();
}

export function retryFailed(id: string): void {
  getOfflineQueue().retryFailed(id);
}

export function dismissFailed(id: string): void {
  getOfflineQueue().dismissFailed(id);
}

export function subscribeFailed(listener: (items: readonly QueuedAction[]) => void): () => void {
  return getOfflineQueue().subscribeFailed(listener);
}

// ─────────────────────────────────────────────────────────────
// 테스트 전용
// ─────────────────────────────────────────────────────────────

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
