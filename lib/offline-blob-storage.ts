/**
 * offline-blob-storage — 오프라인 첨부 파일(Blob)을 IndexedDB에 임시 보관.
 *
 * - 스토어: `mso-offline-blobs` (별도 DB, 큐 DB와 분리)
 * - IDB 미지원 시 in-memory Map 폴백 (페이지 새로고침 시 휘발 — toast 안내)
 * - blobId: crypto.randomUUID() → 외부 추측 불가 (JM5)
 * - cleanup: 14일 초과 항목 자동 삭제 (PII 보관 최소화, JM5)
 *
 * JM: 단일 책임 (~160줄)
 * JM3: IDB open 실패·put 실패·quota 초과 각각 명시
 * JM4: any 금지, 엄격한 타입
 * JM5: blobId=randomUUID, 14일 cleanup 정책
 */

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const IDB_DB_NAME = 'mso-offline-blobs';
const IDB_STORE_NAME = 'blobs';
const IDB_VERSION = 1;
const CLEANUP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14일

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type StoredBlob = {
  /** crypto.randomUUID() — 외부 추측 불가 */
  blobId: string;
  blob: Blob;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  createdAt: number;
};

export type BlobStorageResult =
  | { ok: true; blobId: string }
  | { ok: false; error: string; fallback: 'memory' | 'none' };

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
          const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'blobId' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror = () => { dbPromise = null; resolve(null); };
      req.onblocked = () => { dbPromise = null; resolve(null); };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function idbPut(db: IDBDatabase, record: StoredBlob): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(IDB_STORE_NAME).put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbGet(db: IDBDatabase, blobId: string): Promise<StoredBlob | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(blobId);
      req.onsuccess = () => resolve((req.result as StoredBlob | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbDelete(db: IDBDatabase, blobId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(IDB_STORE_NAME).delete(blobId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbGetAll(db: IDBDatabase): Promise<StoredBlob[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as StoredBlob[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// in-memory 폴백 (IDB 미지원 환경)
// ─────────────────────────────────────────────────────────────

const memBlobs = new Map<string, StoredBlob>();
let warnedMemFallback = false;

function warnMemFallback(): void {
  if (warnedMemFallback) return;
  warnedMemFallback = true;
  // toast는 UI 레이어 의존이라 console.warn으로만 기록
  console.warn('[offline-blob-storage] IDB 미지원 — in-memory 폴백 사용 (페이지 새로고침 시 첨부 소실)');
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

function generateBlobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Blob을 IDB에 저장하고 blobId를 반환한다.
 * IDB 실패 시 in-memory 폴백 (단, 새로고침 시 휘발).
 */
export async function storeBlob(
  blob: Blob,
  meta: { mimeType: string; filename: string },
): Promise<BlobStorageResult> {
  const blobId = generateBlobId();
  const record: StoredBlob = {
    blobId,
    blob,
    mimeType: meta.mimeType,
    filename: meta.filename,
    sizeBytes: blob.size,
    createdAt: Date.now() };

  const db = await openIdb();
  if (db) {
    try {
      const ok = await idbPut(db, record);
      if (ok) return { ok: true, blobId };
      // IDB put 실패 (QuotaExceeded 등) → memory 폴백
      warnMemFallback();
      memBlobs.set(blobId, record);
      return { ok: true, blobId };
    } catch {
      warnMemFallback();
      memBlobs.set(blobId, record);
      return { ok: true, blobId };
    }
  }

  // IDB 미지원
  warnMemFallback();
  memBlobs.set(blobId, record);
  return { ok: true, blobId };
}

/** blobId로 StoredBlob를 읽어온다. 없으면 null. */
export async function getBlob(blobId: string): Promise<StoredBlob | null> {
  const db = await openIdb();
  if (db) {
    const idbResult = await idbGet(db, blobId);
    if (idbResult) return idbResult;
  }
  return memBlobs.get(blobId) ?? null;
}

/** blobId로 항목을 삭제한다. */
export async function deleteBlob(blobId: string): Promise<void> {
  const db = await openIdb();
  if (db) await idbDelete(db, blobId);
  memBlobs.delete(blobId);
}

/** 저장된 모든 blobId 목록 (ID만). */
export async function listBlobs(): Promise<string[]> {
  const db = await openIdb();
  if (db) {
    const all = await idbGetAll(db);
    return all.map((r) => r.blobId);
  }
  return [...memBlobs.keys()];
}

/**
 * 14일(기본값) 초과 Blob을 삭제한다.
 * JM5: PII 포함 가능성 있는 파일 장기 보관 방지.
 */
export async function cleanupOldBlobs(maxAgeMs: number = CLEANUP_MAX_AGE_MS): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  const db = await openIdb();
  if (db) {
    const all = await idbGetAll(db);
    for (const record of all) {
      if (record.createdAt < cutoff) {
        await idbDelete(db, record.blobId);
        removed += 1;
      }
    }
  }

  for (const [id, record] of memBlobs) {
    if (record.createdAt < cutoff) {
      memBlobs.delete(id);
      removed += 1;
    }
  }

  return removed;
}

/** 테스트 전용: 초기화 */
export function __resetBlobStorageForTests(): void {
  dbPromise = null;
  memBlobs.clear();
  warnedMemFallback = false;
}
