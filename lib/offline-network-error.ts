/**
 * isNetworkError — offline queue / upload 공용 네트워크 실패 판별 (SSOT).
 *
 * navigator.onLine === false, fetch TypeError, 및 흔한 네트워크 메시지 패턴을 감지.
 */

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('networkerror') ||
      msg.includes('network error') ||
      msg.includes('fetch failed')
    ) {
      return true;
    }
    // TypeError 전체가 아니라 네트워크성 메시지만 (null deref 등 오탐 방지)
    if (err instanceof TypeError && (msg.includes('fetch') || msg.includes('network') || msg.includes('load failed'))) {
      return true;
    }
  }
  return false;
}
