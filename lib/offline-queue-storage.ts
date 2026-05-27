/**
 * offline-queue-storage — 오프라인 큐 스토리지 어댑터.
 *
 * 우선순위: IndexedDB > localStorage > in-memory
 * - IDB는 브라우저 지원율 99%+, 5MB 이상 저장 가능.
 * - IDB 불가 시 localStorage로 폴백.
 * - localStorage 불가 시 in-memory(탭 세션 내 유지).
 *
 * 마이그레이션:
 * - localStorage `mso:offline-queue:v1` 키에 데이터 있으면 IDB로 1회 이전 후 삭제.
 *
 * JM: 단일 책임 (~200줄)
 * JM3: IDB open 실패·트랜잭션 충돌·QuotaExceeded 명시 구분
 * JM4: any 금지, unknown + 타입 가드
 * JM5: 민감 정보(토큰·비밀번호) 저장 금지 — 호출자 책임
 */

import type { QueuedAction } from './offline-queue';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const IDB_DB_NAME = 'mso-offline-queue';
const IDB_STORE_NAME = 'queue';
const IDB_VERSION = 1;
const LEGACY_LS_KEY = 'mso:offline-queue:v1';
const FAILED_LS_KEY = 'mso:offline-queue-failed:v1';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

type StoredQueue = {
  version: 1;
  items: QueuedAction[];
};

// ─────────────────────────────────────────────────────────────
// IDB 유틸
// ─────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        resolve((e.target as IDBOpenDBRequest).result);
      };

      req.onerror = () => {
        // IDB 열기 실패 → localStorage 폴백
        dbPromise = null;
        resolve(null);
      };

      req.onblocked = () => {
        // 다른 탭에서 DB 잠금 → 실패로 처리
        dbPromise = null;
        resolve(null);
      };
    } catch {
      // Private Browsing 등 IDB 차단 환경
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

async function idbGetAll(db: IDBDatabase): Promise<QueuedAction[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as QueuedAction[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbPutAll(db: IDBDatabase, items: readonly QueuedAction[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);

      // 기존 전체 삭제 후 재삽입 (순서 보장)
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      clearReq.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// localStorage 유틸
// ─────────────────────────────────────────────────────────────

function lsRead(key: string): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as StoredQueue).items)
    ) {
      return [];
    }
    return (parsed as StoredQueue).items;
  } catch {
    return [];
  }
}

function lsWrite(key: string, items: readonly QueuedAction[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const payload: StoredQueue = { version: 1, items: [...items] };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    // QuotaExceededError 등
    return false;
  }
}

function lsRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// in-memory 폴백
// ─────────────────────────────────────────────────────────────

const memStore = new Map<string, QueuedAction[]>();

// ─────────────────────────────────────────────────────────────
// IDB ↔ localStorage 마이그레이션 (1회)
// ─────────────────────────────────────────────────────────────

let migrated = false;

async function migrateLegacyIfNeeded(db: IDBDatabase): Promise<void> {
  if (migrated) return;
  migrated = true;

  const legacy = lsRead(LEGACY_LS_KEY);
  if (legacy.length === 0) return;

  // IDB에 기존 active 큐가 비어 있을 때만 이전 (덮어쓰기 방지)
  const existing = await idbGetAll(db);
  if (existing.length > 0) {
    lsRemove(LEGACY_LS_KEY);
    return;
  }

  await idbPutAll(db, legacy);
  lsRemove(LEGACY_LS_KEY);
}

// ─────────────────────────────────────────────────────────────
// 공개 스토리지 API
// ─────────────────────────────────────────────────────────────

/**
 * active 큐 전체 읽기.
 * IDB → localStorage → in-memory 순서로 폴백.
 */
export async function storageReadQueue(): Promise<QueuedAction[]> {
  const db = await openIdb();
  if (db) {
    await migrateLegacyIfNeeded(db);
    return idbGetAll(db);
  }

  const lsItems = lsRead(LEGACY_LS_KEY);
  if (lsItems.length > 0 || lsWrite(LEGACY_LS_KEY, lsItems)) {
    return lsItems;
  }

  return memStore.get('queue') ?? [];
}

/**
 * active 큐 전체 쓰기.
 */
export async function storageWriteQueue(items: readonly QueuedAction[]): Promise<void> {
  const db = await openIdb();
  if (db) {
    await idbPutAll(db, items);
    return;
  }

  if (!lsWrite(LEGACY_LS_KEY, items)) {
    memStore.set('queue', [...items]);
  }
}

/**
 * failed 큐 읽기 (localStorage 전용 — 실패 항목은 작아서 충분).
 */
export function storageReadFailed(): QueuedAction[] {
  return lsRead(FAILED_LS_KEY);
}

/**
 * failed 큐 쓰기.
 */
export function storageWriteFailed(items: readonly QueuedAction[]): void {
  lsWrite(FAILED_LS_KEY, items);
}

/** 테스트 전용: IDB promise 캐시 초기화 */
export function __resetStorageForTests(): void {
  dbPromise = null;
  migrated = false;
  memStore.clear();
  lsRemove(LEGACY_LS_KEY);
  lsRemove(FAILED_LS_KEY);
}
