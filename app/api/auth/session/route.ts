import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  readSessionFromRequest,
} from '@/lib/server-session';

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    const response = NextResponse.json(
      { authenticated: false, error: '세션이 없습니다.' },
      { status: 401 }
    );
    return clearSessionCookie(response);
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    expiresAt: session.exp,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}
