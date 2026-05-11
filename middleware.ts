/**
 * Edge Middleware — Cloudflare Workers 호환
 * proxy.ts(Next.js 16 Node.js 전용)에서 변환됨
 * Web Crypto API 기반 세션 검증으로 Edge Runtime에서 동작
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/server-session';
import { V2_COOKIE_NAME } from '@/app/main-v2/feature-flag';

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/main')) {
    return NextResponse.next();
  }

  // ─ feature flag 라우팅: /main → /main-v2 ──────────────────────────
  // JM5: cookie 값은 === 'true' 만 신뢰
  const isV2 = request.cookies.get(V2_COOKIE_NAME)?.value === 'true';
  const isV2Route = request.nextUrl.pathname.startsWith('/main-v2');

  if (!isV2Route && isV2) {
    // /main/* → /main-v2/* 로 리다이렉트 (v2 활성화 상태)
    const v2Url = request.nextUrl.clone();
    v2Url.pathname = request.nextUrl.pathname.replace(/^\/main/, '/main-v2');
    return NextResponse.redirect(v2Url);
  }
  // /main-v2/* 직접 진입은 cookie 없어도 허용 (그대로 진행)
  // ──────────────────────────────────────────────────────────────────

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/';
  redirectUrl.search = '';

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  return clearSessionCookie(response);
}

export const config = {
  matcher: ['/main/:path*', '/main-v2/:path*'],
};
