/**
 * 공유 Rate Limiting 모듈
 *
 * 인메모리 Map 기반으로 동작하며, 만료된 엔트리를 주기적으로 정리하고
 * 최대 엔트리 수를 제한하여 메모리 누수를 방지합니다.
 *
 * 한계: Worker/서버리스 환경에서는 인스턴스 간 메모리가 공유되지 않아
 * 실질적 보호 효과가 제한적입니다. 강화가 필요하면 Supabase 테이블 또는
 * 외부 Redis 계층을 고려하세요.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms — 이 시각 이후에는 엔트리 만료
}

const store = new Map<string, RateLimitEntry>();

/** 저장소에 보관할 최대 키 수. 초과 시 만료된 엔트리를 우선 정리합니다. */
const MAX_ENTRIES = 10_000;

/** 자동 정리 주기 (ms). 60초마다 만료 엔트리를 삭제합니다. */
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
    // 타이머가 프로세스 종료를 막지 않도록 unref
    if (store.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Node.js 환경에서 타이머가 프로세스를 잡아두지 않도록 설정
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

/** 만료 엔트리를 정리하고, 여전히 MAX_ENTRIES 초과 시 가장 오래된 엔트리부터 제거 */
function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  // 1차: 만료된 엔트리 삭제
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
  // 2차: 여전히 초과 시 가장 오래된(resetAt이 작은) 엔트리부터 삭제
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = store.size - MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      store.delete(sorted[i][0]);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 주어진 키의 요청이 허용되는지 확인합니다.
 *
 * @param key          식별 키 (예: loginId, ip:userId 등)
 * @param maxAttempts  윈도우 내 최대 허용 시도 횟수
 * @param windowMs     윈도우 크기 (ms)
 * @returns allowed — true이면 요청 허용, retryAfterSec — 차단 시 남은 초
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) return { allowed: true };

  if (entry.count >= maxAttempts) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

/**
 * 실패한 시도를 기록합니다.
 *
 * @param key       식별 키
 * @param windowMs  윈도우 크기 (ms). 첫 실패 시점부터 windowMs 후에 리셋됩니다.
 */
export function recordFailedAttempt(key: string, windowMs: number): void {
  ensureCleanupTimer();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
  }

  evictIfNeeded();
}

/**
 * 성공 시 해당 키의 시도 기록을 초기화합니다.
 */
export function resetAttempts(key: string): void {
  store.delete(key);
}
