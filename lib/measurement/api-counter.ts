/**
 * lib/measurement/api-counter.ts
 * K8 API 호출 카운터 read API — fetcher.ts 변경 없이 카운터를 읽는다 (JM4)
 *
 * ⚠️ fetcher.ts는 이미 globalThis.__API_CALL_COUNTER__ 에 카운팅을 박아두었다.
 *    이 파일은 읽기(read) 전용이며 절대 fetcher.ts를 수정하지 않는다 (JM8).
 */

// ─────────────────────────────────────────────
// 전역 타입 보강
// ─────────────────────────────────────────────

declare global {
  // fetcher.ts와 동일한 선언 (중복 선언 허용 — TypeScript merges them)
   
  var __API_CALL_COUNTER__: number | undefined;

  // 분 단위 스냅샷 기록용 (api-counter.ts가 관리)
   
  var __API_CALL_MINUTE_SNAPSHOT__: number | undefined;
   
  var __API_CALL_MINUTE_TIMESTAMP__: number | undefined;
}

// ─────────────────────────────────────────────
// Read API
// ─────────────────────────────────────────────

/** 세션 시작 이후 누적 API 호출 수 */
export function getApiCallCount(): number {
  return globalThis.__API_CALL_COUNTER__ ?? 0;
}

/** 누적 카운터를 0으로 초기화 */
export function resetApiCallCount(): void {
  globalThis.__API_CALL_COUNTER__ = 0;
}

// ─────────────────────────────────────────────
// 최근 1분 카운트 헬퍼
// ─────────────────────────────────────────────

/**
 * 최근 1분(60초) 동안의 API 호출 수를 반환한다.
 * 호출 시점 기준으로 1분 전 스냅샷과의 차이를 계산한다.
 *
 * ApiCounterBadge가 1초마다 이 함수를 호출하여 rolling diff를 표시한다.
 */
export function getLastMinuteCallCount(): number {
  const now = Date.now();
  const current = getApiCallCount();

  const snapTime = globalThis.__API_CALL_MINUTE_SNAPSHOT__;
  const snapTs = globalThis.__API_CALL_MINUTE_TIMESTAMP__;

  // 스냅샷이 없거나 1분 이상 지났으면 스냅샷 갱신
  if (snapTs === undefined || now - snapTs >= 60_000) {
    globalThis.__API_CALL_MINUTE_SNAPSHOT__ = current;
    globalThis.__API_CALL_MINUTE_TIMESTAMP__ = now;
    return 0;
  }

  return current - (snapTime ?? 0);
}
