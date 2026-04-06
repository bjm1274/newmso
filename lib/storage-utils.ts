/**
 * localStorage 공통 헬퍼
 * 예산관리, 전자결재양식관리 등에서 중복 정의되던 read/write 래퍼를 통합
 */

/** localStorage에서 JSON 파싱하여 반환, 실패 시 fallback 반환 */
export function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** localStorage에 JSON 직렬화하여 저장, 실패 시 무시 */
export function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
