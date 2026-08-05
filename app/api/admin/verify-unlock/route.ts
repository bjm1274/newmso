import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt, resetAttempts } from '@/lib/rate-limit';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5분

/**
 * 잠금해제 시도 카운터 키.
 *
 * 예전에는 `unlock:${x-forwarded-for 첫 값}:${userId}` 였다.
 * `x-forwarded-for` 는 클라이언트가 그대로 써 보낼 수 있는 헤더라
 * 매 요청 헤더를 바꾸면 키가 매번 달라졌고, 5회/5분 잠금이 사실상 무한 시도가 됐다.
 * 세션에서만 나오는 userId 로 키를 고정한다 —
 * 어차피 이 라우트는 관리자 세션이 있어야 도달하므로 IP 를 섞을 이유가 없다.
 */
function getRateLimitKey(userId: string) {
  return `unlock:${userId}`;
}

export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session || !isAdminSession(session.user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user?.id || session.user?.user_id || 'unknown');
  const rateLimitKey = getRateLimitKey(userId);
  // failClosed: 판정 불가 시 통과가 아니라 차단 (RESET_SECRET 대입 방어).
  const rateCheck = await checkRateLimit(rateLimitKey, MAX_ATTEMPTS, LOCKOUT_MS, { failClosed: true });

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
    await resetAttempts(rateLimitKey);
  } else {
    await recordFailedAttempt(rateLimitKey, LOCKOUT_MS);
  }

  return NextResponse.json({ ok });
}
