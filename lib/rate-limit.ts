/**
 * D1 기반 Rate Limiting 모듈
 *
 * Cloudflare Workers는 요청마다 isolate가 분산되므로 인메모리 Map으로는
 * 레이트리밋이 사실상 무효다. D1 테이블(rate_limit_attempts)에 상태를 영속해
 * Workers 전체에서 실질적인 차단이 동작하도록 한다.
 *
 * Graceful Degradation:
 *   D1 binding을 가져올 수 없는 환경(로컬 dev 등)에서는 레이트리밋을 건너뛰되
 *   로그를 남기고 로그인 자체는 막지 않는다.
 *
 * 윈도우 리셋:
 *   다음 접근 시 window_start + windowMs < now 이면 카운트를 초기화한다.
 *   별도 정리 잡 없이 자연 리셋되는 슬라이딩-타임스탬프 방식.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { getD1Binding } from '@/lib/db';

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

interface RateLimitRow {
  key: string;
  count: number;
  window_start: string; // epoch ms (TEXT)
  updated_at: string | null;
}

/**
 * D1에서 레이트리밋 레코드를 조회한다.
 * 테이블이 없거나 오류 시 null을 반환한다.
 */
async function fetchRow(d1: D1Database, key: string): Promise<RateLimitRow | null> {
  const result = await d1
    .prepare('SELECT key, count, window_start, updated_at FROM rate_limit_attempts WHERE key = ?')
    .bind(key)
    .first<RateLimitRow>();
  return result ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 주어진 키의 요청이 허용되는지 확인한다.
 *
 * @param key         식별 키 (예: loginId, ip:userId 등)
 * @param maxAttempts 윈도우 내 최대 허용 시도 횟수
 * @param windowMs    윈도우 크기 (ms)
 * @returns allowed — true이면 요청 허용, retryAfterSec — 차단 시 남은 초
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  let d1: D1Database | undefined;
  try {
    d1 = await getD1Binding();
  } catch (err) {
    console.warn('[rate-limit] D1 binding 획득 실패, 레이트리밋 건너뜀:', err);
    return { allowed: true };
  }

  if (!d1) {
    // 로컬 dev 환경 — 레이트리밋 비활성
    return { allowed: true };
  }

  try {
    const now = Date.now();
    const row = await fetchRow(d1, key);

    if (!row) return { allowed: true };

    const windowStart = parseInt(row.window_start, 10);
    if (isNaN(windowStart) || now >= windowStart + windowMs) {
      // 윈도우 만료 — 카운트 리셋된 것으로 간주
      return { allowed: true };
    }

    if (row.count >= maxAttempts) {
      const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);
      return { allowed: false, retryAfterSec };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[rate-limit] checkRateLimit D1 오류, 레이트리밋 건너뜀:', err);
    return { allowed: true };
  }
}

/**
 * 실패한 시도를 기록한다.
 *
 * @param key      식별 키
 * @param windowMs 윈도우 크기 (ms). 첫 실패 시점부터 windowMs 후에 리셋된다.
 */
export async function recordFailedAttempt(key: string, windowMs: number): Promise<void> {
  let d1: D1Database | undefined;
  try {
    d1 = await getD1Binding();
  } catch (err) {
    console.warn('[rate-limit] D1 binding 획득 실패, 실패 기록 건너뜀:', err);
    return;
  }

  if (!d1) return;

  try {
    const now = Date.now();
    const row = await fetchRow(d1, key);

    const nowStr = String(now);
    const nowTs = new Date(now).toISOString();

    if (!row) {
      // 첫 실패 — 새 레코드 삽입
      await d1
        .prepare(
          'INSERT INTO rate_limit_attempts (key, count, window_start, updated_at) VALUES (?, 1, ?, ?)',
        )
        .bind(key, nowStr, nowTs)
        .run();
      return;
    }

    const windowStart = parseInt(row.window_start, 10);
    if (isNaN(windowStart) || now >= windowStart + windowMs) {
      // 윈도우 만료 — 리셋 후 카운트 1
      await d1
        .prepare(
          'UPDATE rate_limit_attempts SET count = 1, window_start = ?, updated_at = ? WHERE key = ?',
        )
        .bind(nowStr, nowTs, key)
        .run();
    } else {
      // 같은 윈도우 — 카운트 증가
      await d1
        .prepare(
          'UPDATE rate_limit_attempts SET count = count + 1, updated_at = ? WHERE key = ?',
        )
        .bind(nowTs, key)
        .run();
    }
  } catch (err) {
    console.error('[rate-limit] recordFailedAttempt D1 오류:', err);
  }
}

/**
 * 성공 시 해당 키의 시도 기록을 초기화한다.
 */
export async function resetAttempts(key: string): Promise<void> {
  let d1: D1Database | undefined;
  try {
    d1 = await getD1Binding();
  } catch (err) {
    console.warn('[rate-limit] D1 binding 획득 실패, 리셋 건너뜀:', err);
    return;
  }

  if (!d1) return;

  try {
    await d1
      .prepare('DELETE FROM rate_limit_attempts WHERE key = ?')
      .bind(key)
      .run();
  } catch (err) {
    console.error('[rate-limit] resetAttempts D1 오류:', err);
  }
}
