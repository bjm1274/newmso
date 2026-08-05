/**
 * D1 기반 Rate Limiting 모듈
 *
 * Cloudflare Workers는 요청마다 isolate가 분산되므로 인메모리 Map으로는
 * 레이트리밋이 사실상 무효다. D1 테이블(rate_limit_attempts)에 상태를 영속해
 * Workers 전체에서 실질적인 차단이 동작하도록 한다.
 *
 * Graceful Degradation (failClosed 미지정 시):
 *   D1 binding을 가져올 수 없는 환경(로컬 dev 등)에서는 레이트리밋을 건너뛰되
 *   로그를 남기고 요청 자체는 막지 않는다.
 *
 * fail-closed 옵션:
 *   예전에는 실패 경로가 **전부** `allowed: true` 였다. D1 장애·바인딩 누락·
 *   `rate_limit_attempts` 테이블/인덱스 유실 중 하나만 발생해도 로그인 잠금이
 *   조용히 사라져 무제한 온라인 대입이 가능했다(관측 수단도 console 뿐이었다).
 *   MEMORY 의 "D1 복원은 인덱스를 잃는다" 사례처럼 실제로 일어난 적 있는
 *   시나리오라, 인증 계열 호출부는 `{ failClosed: true }` 로 넘겨
 *   판정 불가 = 차단(429)으로 바꾼다.
 *   운영 중 D1 이 오래 죽어 전면 로그인 불가가 되는 최악을 대비해
 *   `RATE_LIMIT_FAIL_OPEN=1` 환경변수로만 예전 동작으로 되돌릴 수 있다.
 *
 * 윈도우 리셋:
 *   다음 접근 시 window_start + windowMs < now 이면 카운트를 초기화한다.
 *   별도 정리 잡 없이 자연 리셋되는 슬라이딩-타임스탬프 방식.
 *
 * API 총량 제한: consumeRateLimit (check+increment 단일 SQL, TOCTOU 없음)
 * 로그인 실패 제한: checkRateLimit(읽기) + recordFailedAttempt(원자 upsert)
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

async function resolveD1(): Promise<D1Database | undefined> {
  try {
    return await getD1Binding();
  } catch (err) {
    console.warn('[rate-limit] D1 binding 획득 실패, 레이트리밋 건너뜀:', err);
    return undefined;
  }
}

/** 레이트리밋 판정이 불가능했던 횟수 — 조용한 무력화를 관측 가능하게 하는 카운터. */
let degradedCount = 0;

export function getRateLimitDegradedCount(): number {
  return degradedCount;
}

export interface RateLimitOptions {
  /**
   * 판정 불가(D1 미바인딩·쿼리 오류·RETURNING 공백) 시 차단할지 여부.
   * 로그인/잠금해제 등 인증 계열은 true 로 넘긴다.
   */
  failClosed?: boolean;
}

/** fail-closed 강제 해제 탈출구 — 운영 장애 시에만 사용한다. */
function failOpenOverride(): boolean {
  return String(process.env.RATE_LIMIT_FAIL_OPEN ?? '').trim() === '1';
}

/**
 * 판정 불가 상황의 단일 처리점.
 * 예전에는 각 경로가 조용히 `{ allowed: true }` 를 돌려줘 로그 한 줄 외에
 * 아무 흔적이 없었다. 여기로 모아 카운터를 올리고 태그를 고정한다.
 */
function degrade(
  where: string,
  reason: string,
  options?: RateLimitOptions,
): { allowed: boolean; retryAfterSec?: number; degraded: true } {
  degradedCount += 1;
  const closed = options?.failClosed === true && !failOpenOverride();
  console.error(
    `[rate-limit][DEGRADED] ${where}: ${reason} — ${closed ? 'fail-closed(차단)' : 'fail-open(통과)'} (누적 ${degradedCount}회)`,
  );
  return closed
    ? { allowed: false, retryAfterSec: 30, degraded: true }
    : { allowed: true, degraded: true };
}

/**
 * 원자적 upsert + RETURNING.
 * - 신규 키: count=1, window_start=now
 * - 같은 윈도우: count = count + 1
 * - 만료된 윈도우: count=1, window_start=now
 */
async function upsertAndReturn(
  d1: D1Database,
  key: string,
  windowMs: number,
): Promise<{ count: number; window_start: string } | null> {
  const now = Date.now();
  const nowStr = String(now);
  const nowTs = new Date(now).toISOString();

  const result = await d1
    .prepare(
      `INSERT INTO rate_limit_attempts (key, count, window_start, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN CAST(rate_limit_attempts.window_start AS INTEGER) + ? <= ?
             THEN 1
           ELSE rate_limit_attempts.count + 1
         END,
         window_start = CASE
           WHEN CAST(rate_limit_attempts.window_start AS INTEGER) + ? <= ?
             THEN ?
           ELSE rate_limit_attempts.window_start
         END,
         updated_at = ?
       RETURNING count, window_start`,
    )
    .bind(key, nowStr, nowTs, windowMs, now, windowMs, now, nowStr, nowTs)
    .first<{ count: number; window_start: string }>();

  return result ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 주어진 키의 요청이 허용되는지 확인한다 (읽기 전용 — 카운트 증가 없음).
 * 로그인 잠금 등 "실패 시에만 증가" 패턴용. 총량 제한은 consumeRateLimit 사용.
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
  options?: RateLimitOptions,
): Promise<{ allowed: boolean; retryAfterSec?: number; degraded?: boolean }> {
  const d1 = await resolveD1();
  if (!d1) {
    // 로컬 dev 환경 — 레이트리밋 비활성 (인증 계열은 failClosed 로 차단)
    return degrade('checkRateLimit', 'D1 binding 없음', options);
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
    return degrade('checkRateLimit', `D1 오류: ${err instanceof Error ? err.message : String(err)}`, options);
  }
}

/**
 * check + increment를 단일 SQL(RETURNING)로 원자 처리한다.
 * API 총량 제한(query/mutate/upload 등)에 사용 — TOCTOU 없음.
 *
 * 증가 후 count > maxAttempts 이면 거부(초과분도 카운트에 포함).
 */
export async function consumeRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  options?: RateLimitOptions,
): Promise<{ allowed: boolean; retryAfterSec?: number; count?: number; degraded?: boolean }> {
  const d1 = await resolveD1();
  if (!d1) {
    return degrade('consumeRateLimit', 'D1 binding 없음', options);
  }

  try {
    const now = Date.now();
    const row = await upsertAndReturn(d1, key, windowMs);
    if (!row) {
      // RETURNING 이 비면 카운트가 올랐는지조차 알 수 없다.
      // 예전에는 "가용성 우선"으로 무조건 통과시켜, 이 상태가 지속되면
      // 총량 제한이 통째로 사라지는데도 아무도 몰랐다.
      return degrade('consumeRateLimit', 'RETURNING 공백', options);
    }

    const count = Number(row.count) || 0;
    const windowStart = parseInt(String(row.window_start), 10);
    if (count > maxAttempts) {
      const retryAfterSec = Number.isFinite(windowStart)
        ? Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
        : 60;
      return { allowed: false, retryAfterSec, count };
    }
    return { allowed: true, count };
  } catch (err) {
    return degrade('consumeRateLimit', `D1 오류: ${err instanceof Error ? err.message : String(err)}`, options);
  }
}

/**
 * 실패한 시도를 기록한다 (원자적 upsert).
 * 로그인 등 "실패 시에만 +1" 패턴용. 총량 제한은 consumeRateLimit 사용.
 *
 * @param key      식별 키
 * @param windowMs 윈도우 크기 (ms). 첫 실패 시점부터 windowMs 후에 리셋된다.
 */
export async function recordFailedAttempt(key: string, windowMs: number): Promise<void> {
  const d1 = await resolveD1();
  if (!d1) {
    // 기록이 안 되면 checkRateLimit 가 영원히 통과시킨다 — 조용히 넘기지 않는다.
    degrade('recordFailedAttempt', 'D1 binding 없음');
    return;
  }

  try {
    await upsertAndReturn(d1, key, windowMs);
  } catch (err) {
    degrade('recordFailedAttempt', `D1 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 성공 시 해당 키의 시도 기록을 초기화한다.
 */
export async function resetAttempts(key: string): Promise<void> {
  const d1 = await resolveD1();
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
