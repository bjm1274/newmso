/**
 * lib/fetcher.ts
 * 공용 fetcher — inflight dedup + TTL 캐시 + API 호출 카운터 (JM2·JM3·JM4)
 */

declare global {
   
  var __API_CALL_COUNTER__: number | undefined;
}

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type FetcherOptions = {
  /** 캐시 TTL (ms). 기본 5분 */
  ttl?: number;
  /** AbortSignal 전달 시 fetch 취소 가능 */
  signal?: AbortSignal;
  /** 동일 key 진행 중 호출을 기존 Promise에 합류. 기본 true */
  dedupe?: boolean;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

// ─────────────────────────────────────────────
// 내부 저장소
// ─────────────────────────────────────────────

const inflightMap = new Map<string, Promise<unknown>>();
const cacheMap = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 300_000; // 5분

// ─────────────────────────────────────────────
// 개발 환경 호출 카운터
// ─────────────────────────────────────────────

function incrementCallCounter(): void {
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__API_CALL_COUNTER__ =
      (globalThis.__API_CALL_COUNTER__ ?? 0) + 1;
  }
}

// ─────────────────────────────────────────────
// 핵심 fetcher
// ─────────────────────────────────────────────

/**
 * 공용 데이터 fetcher.
 *
 * 1. TTL 캐시 히트 → 즉시 반환 (API 호출 없음)
 * 2. dedupe=true + 진행 중인 동일 key → 기존 Promise 재사용
 * 3. 신규 호출 → fn() 실행 후 캐시 저장
 *
 * 에러는 그대로 throw (JM3). signal.aborted면 AbortError swallow 가능.
 *
 * ⚠️ key에 민감정보(토큰·이메일·전화번호)를 포함하지 마세요 (JM5).
 */
export async function fetcher<T>(
  key: string,
  fn: (signal?: AbortSignal) => Promise<T>,
  options?: FetcherOptions,
): Promise<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const dedupe = options?.dedupe ?? true;
  const signal = options?.signal;

  // 1. 캐시 확인
  const cached = cacheMap.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  // 만료된 캐시 정리
  if (cached) {
    cacheMap.delete(key);
  }

  // 2. 진행 중 dedup
  if (dedupe) {
    const inflight = inflightMap.get(key) as Promise<T> | undefined;
    if (inflight) {
      return inflight;
    }
  }

  // 3. 신규 호출
  incrementCallCounter();

  const promise = fn(signal)
    .then((value) => {
      cacheMap.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    })
    .finally(() => {
      inflightMap.delete(key);
    });

  if (dedupe) {
    inflightMap.set(key, promise as Promise<unknown>);
  }

  return promise;
}

// ─────────────────────────────────────────────
// 캐시 무효화 유틸
// ─────────────────────────────────────────────

/**
 * 특정 key(또는 RegExp 매칭)의 캐시를 무효화합니다.
 * mutate 후 즉시 최신 데이터를 강제할 때 사용하세요.
 */
export function invalidateCache(key: string | RegExp): void {
  if (typeof key === 'string') {
    cacheMap.delete(key);
    inflightMap.delete(key);
    return;
  }
  for (const k of cacheMap.keys()) {
    if (key.test(k)) {
      cacheMap.delete(k);
    }
  }
  for (const k of inflightMap.keys()) {
    if (key.test(k)) {
      inflightMap.delete(k);
    }
  }
}

/** 전체 캐시 초기화 (로그아웃·테스트 용도) */
export function clearCache(): void {
  cacheMap.clear();
  inflightMap.clear();
}
