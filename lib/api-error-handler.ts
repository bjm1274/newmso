import { type NextRequest, NextResponse } from 'next/server';

/**
 * API 라우트 공통 에러 응답 래퍼.
 * catch(error) 블록에서 직접 반환한다.
 */
export function errorResponse(
  error: unknown,
  fallback = 'Internal server error',
  status = 500,
): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

/**
 * request.json() 파싱 헬퍼 — 파싱 실패 시 null 반환.
 */
export async function parseJsonBody<T = unknown>(request: NextRequest): Promise<T | null> {
  return request.json().catch(() => null) as Promise<T | null>;
}

/** 401 Unauthorized 응답 */
export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

/** 400 Bad Request 응답 */
export function badRequestResponse(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
