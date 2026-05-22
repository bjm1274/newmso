/**
 * 서버 측 Supabase JWT 생성 브릿지 — 레거시 심볼 유지 파일
 *
 * Realtime은 더 이상 사용하지 않으므로 JWT 발급이 불필요하다.
 * 모든 호출처에서 createSupabaseAccessToken import를 제거했으므로
 * 이 파일은 안전하게 삭제해도 되나, 잔여 참조가 없는지 확인 후 삭제한다.
 *
 * SUPABASE_JWT_SECRET 환경변수는 이 파일이 제거되면 코드에서 완전히 사라진다.
 */

import type { SessionUser } from './server-session';

/** @deprecated Realtime 인증 제거 — 항상 null 반환 */
export async function createSupabaseAccessToken(
  _user: SessionUser,
  _maxAgeSeconds?: number
): Promise<null> {
  return null;
}
