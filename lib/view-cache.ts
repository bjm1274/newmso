/**
 * view-cache — 이미 본 화면 데이터를 IndexedDB 에 두고 다시 열 때 즉시 그린다.
 *
 * 왜 필요한가:
 * 채팅방·게시판의 캐시는 전부 **모듈 변수**뿐이었다. 탭을 새로고침하거나
 * 모바일 브라우저가 백그라운드 탭을 죽이면 그대로 날아가서, 같은 방을 다섯 번
 * 열면 다섯 번 다 받아왔다. 서비스워커도 js/css/폰트만 캐시하고 API 응답은
 * 손대지 않는다.
 *
 * 동작은 stale-while-revalidate 다 — 저장분을 먼저 그려 화면을 띄우고, 네트워크
 * 응답이 오면 갈아끼운다. 캐시는 "먼저 보여줄 그림"일 뿐 정답은 항상 서버다.
 *
 * ── 보안 (JM5) ────────────────────────────────────────────────
 * 채팅 메시지와 게시글에는 환자명·차트번호가 들어간다. 병원 공용 PC 를 전제로:
 *  - 키를 사용자 id 로 나눈다. 다른 계정으로 로그인하면 남의 캐시를 못 읽는다.
 *  - 로그아웃 시 performClientLogout 이 clearViewCache() 로 통째로 지운다.
 *  - 7일이 지난 항목은 열 때 자동 삭제한다(보관 최소화).
 *  - IndexedDB 를 못 쓰면 조용히 비활성 — 메모리 폴백조차 두지 않는다.
 *    (읽기 실패는 "조금 느림"이지만 잘못 남는 건 사고다.)
 *
 * JM: 단일 책임(뷰 데이터 캐시), JM3(실패 경로 명시), JM4(any 금지)
 */

const IDB_DB_NAME = 'mso-view-cache';
const IDB_STORE_NAME = 'entries';
const IDB_VERSION = 1;

/** 이 기간이 지난 항목은 읽는 순간 버린다. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CacheRecord<T> = {
  /** `${userId}:${scope}:${key}` */
  id: string;
  userId: string;
  savedAt: number;
  payload: T;
};

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
          const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
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

function buildId(userId: string, scope: string, key: string): string {
  return `${userId}:${scope}:${key}`;
}

/**
 * 저장분을 읽는다. 없거나·만료됐거나·다른 사용자 것이면 null.
 * 만료 항목은 읽는 김에 지운다.
 */
export async function readViewCache<T>(
  userId: string | null | undefined,
  scope: string,
  key: string,
): Promise<T | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;
  const db = await openIdb();
  if (!db) return null;

  const id = buildId(uid, scope, key);
  const record = await new Promise<CacheRecord<T> | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as CacheRecord<T> | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  if (!record) return null;
  // 키에 userId 가 들어 있지만, 저장 시점 값과도 대조한다 (키 규칙이 바뀌어도 새지 않게).
  if (record.userId !== uid) return null;
  if (Date.now() - record.savedAt > MAX_AGE_MS) {
    void deleteViewCache(uid, scope, key);
    return null;
  }
  return record.payload;
}

/** 저장한다. 실패는 삼킨다 — 캐시 쓰기 실패가 화면을 막으면 안 된다. */
export async function writeViewCache<T>(
  userId: string | null | undefined,
  scope: string,
  key: string,
  payload: T,
): Promise<void> {
  const uid = String(userId ?? '').trim();
  if (!uid) return;
  const db = await openIdb();
  if (!db) return;

  const record: CacheRecord<T> = {
    id: buildId(uid, scope, key),
    userId: uid,
    savedAt: Date.now(),
    payload };

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(IDB_STORE_NAME).put(record);
      req.onsuccess = () => resolve();
      // QuotaExceededError 포함 — 저장 못 해도 화면은 그대로 간다.
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteViewCache(
  userId: string | null | undefined,
  scope: string,
  key: string,
): Promise<void> {
  const uid = String(userId ?? '').trim();
  if (!uid) return;
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(IDB_STORE_NAME).delete(buildId(uid, scope, key));
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * 캐시 전체 삭제. 로그아웃에서 호출한다.
 *
 * 사용자별로 고르지 않고 통째로 비운다 — 공용 기기에서 "내 것만 지웠다" 는
 * 판정이 하나라도 틀리면 남의 대화가 남는다. 캐시는 다시 채우면 그만이다.
 */
export async function clearViewCache(): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(IDB_STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
