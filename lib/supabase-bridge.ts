/**
 * Supabase Realtime 인증 토큰 브릿지 — 레거시 심볼 유지 파일
 *
 * Realtime은 더 이상 사용하지 않으므로 토큰 발급·저장이 불필요하다.
 * lib/supabase.ts 가 getStoredSupabaseAccessToken 을 import하기 때문에
 * 해당 심볼은 no-op으로 남겨둔다.
 * persistSupabaseAccessToken 은 호출처(login/main/client-logout)에서
 * 제거 완료되면 이 파일 자체를 삭제해도 된다.
 */

export const SUPABASE_ACCESS_TOKEN_STORAGE_KEY = 'erp_supabase_access_token';

/** @deprecated Realtime 인증 제거 — 항상 null 반환 */
export function getStoredSupabaseAccessToken(): string | null {
  return null;
}

/** @deprecated Realtime 인증 제거 — no-op */
export function persistSupabaseAccessToken(_token?: string | null): void {
  // intentional no-op: Realtime 인증 제거 완료
}
