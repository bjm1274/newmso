import { NextResponse } from 'next/server';

/**
 * CRON_SECRET Bearer 토큰 검증.
 * 인증 실패 시 401 Response 반환, 성공 시 null 반환.
 *
 * 사용 예시:
 * ```ts
 * const authError = verifyCronSecret(request);
 * if (authError) return authError;
 * ```
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
