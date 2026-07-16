/**
 * isNetworkError — offline queue / upload 공용 네트워크 실패 판별 (SSOT).
 *
 * navigator.onLine === false, fetch TypeError, 및 흔한 네트워크 메시지 패턴을 감지.
 */

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch failed
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('networkerror')
    ) {
      return true;
    }
  }
  return false;
}
