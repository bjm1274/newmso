import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt, resetAttempts } from '@/lib/rate-limit';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5분

function getRateLimitKey(req: Request, userId: string) {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `unlock:${ip}:${userId}`;
}

export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session || !isAdminSession(session.user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user?.id || session.user?.user_id || 'unknown');
  const rateLimitKey = getRateLimitKey(req, userId);
  const rateCheck = checkRateLimit(rateLimitKey, MAX_ATTEMPTS, LOCKOUT_MS);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: `너무 많은 시도입니다. ${rateCheck.retryAfterSec}초 후 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? '');
  const resetHash = process.env.RESET_SECRET_HASH;

  if (!resetHash) {
    return NextResponse.json({ ok: false, error: 'RESET_SECRET_HASH 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  const ok = await bcrypt.compare(password, resetHash);
  if (ok) {
    resetAttempts(rateLimitKey);
  } else {
    recordFailedAttempt(rateLimitKey, LOCKOUT_MS);
  }

  return NextResponse.json({ ok });
}
