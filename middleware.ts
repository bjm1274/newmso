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

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/main')) {
    return NextResponse.next();
  }

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
  matcher: ['/main/:path*'],
};
