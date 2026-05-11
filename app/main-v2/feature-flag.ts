/**
 * feature-flag.ts — v2 라우트 활성화 여부 판별 헬퍼
 *
 * - isV2Enabled(): Server Component / Server Action에서 cookie 읽기
 * - enableV2() / disableV2(): Server Action에서 Set-Cookie
 *
 * JM5: cookie 값은 === 'true' 만 허용, HttpOnly·Secure 권장
 */

import { cookies } from 'next/headers';

export const V2_COOKIE_NAME = 'mso_v2' as const;

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1년
} as const;

/**
 * 현재 요청에서 v2 활성화 여부를 반환한다.
 * Server Component / middleware에서 호출한다.
 */
export async function isV2Enabled(): Promise<boolean> {
  const store = await cookies();
  return store.get(V2_COOKIE_NAME)?.value === 'true';
}

/**
 * v2를 활성화한다 (Server Action 또는 Route Handler에서 호출).
 */
export async function enableV2(): Promise<void> {
  const store = await cookies();
  store.set(V2_COOKIE_NAME, 'true', COOKIE_BASE);
}

/**
 * v2를 비활성화하고 v1으로 되돌린다.
 */
export async function disableV2(): Promise<void> {
  const store = await cookies();
  store.set(V2_COOKIE_NAME, 'false', { ...COOKIE_BASE, maxAge: 0 });
}
