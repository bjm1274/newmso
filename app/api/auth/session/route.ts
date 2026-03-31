import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAccessToken } from '@/lib/server-supabase-bridge';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionCookieOptions,
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/server-session';

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    const response = NextResponse.json(
      { authenticated: false, error: '세션이 없습니다.' },
      { status: 200 }
    );
    return clearSessionCookie(response);
  }

  const currentSessionUser = normalizeSessionUser(session.user);
  let freshSessionUser = currentSessionUser;

  try {
    freshSessionUser = await resolveLatestSessionUser(currentSessionUser);
  } catch {
    // 동기화 실패 시 기존 세션 사용자 유지
  }

  const supabaseAccessToken = await createSupabaseAccessToken(freshSessionUser);

  const response = NextResponse.json({
    authenticated: true,
    user: freshSessionUser,
    expiresAt: session.exp,
    supabaseAccessToken,
  });

  const remainingAgeSeconds = Math.max(1, session.exp - Math.floor(Date.now() / 1000));
  const userChanged = JSON.stringify(currentSessionUser) !== JSON.stringify(freshSessionUser);
  // 남은 시간이 6시간 미만이거나 사용자 정보 변경 시 → 12시간 전체로 갱신
  const shouldRefresh = userChanged || remainingAgeSeconds < SESSION_MAX_AGE_SECONDS / 2;
  if (shouldRefresh) {
    const newAgeSeconds = SESSION_MAX_AGE_SECONDS;
    const refreshedToken = await createSessionToken(freshSessionUser, newAgeSeconds);
    response.cookies.set(
      SESSION_COOKIE_NAME,
      refreshedToken,
      getSessionCookieOptions(newAgeSeconds)
    );
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}
