import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

// 인메모리 rate limiting: IP + 세션별 시도 횟수
const attempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5분

function getRateLimitKey(req: Request, userId: string) {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${userId}`;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry) return { allowed: true };

  if (now - entry.lastAttempt > LOCKOUT_MS) {
    attempts.delete(key);
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOCKOUT_MS - (now - entry.lastAttempt)) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

function recordAttempt(key: string, success: boolean) {
  if (success) {
    attempts.delete(key);
    return;
  }

  const now = Date.now();
  const entry = attempts.get(key);
  if (entry) {
    entry.count += 1;
    entry.lastAttempt = now;
  } else {
    attempts.set(key, { count: 1, lastAttempt: now });
  }
}

export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session || !isAdminSession(session.user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user?.id || session.user?.user_id || 'unknown');
  const rateLimitKey = getRateLimitKey(req, userId);
  const rateCheck = checkRateLimit(rateLimitKey);

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
  recordAttempt(rateLimitKey, ok);

  return NextResponse.json({ ok });
}
