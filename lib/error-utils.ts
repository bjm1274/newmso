/**
 * Supabase 쿼리 에러를 포함한 다양한 에러 타입을 일관된 형태로 정규화한다.
 * catch 블록에서 `unknown` 타입의 에러를 로그/표시할 때 사용한다.
 */
export function normalizeQueryError(error: unknown): {
  name?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: unknown | null;
  status?: unknown | null;
  stack?: string;
} {
  if (error instanceof Error) {
    const e = error as Error & Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      details: typeof e.details === 'string' ? e.details : null,
      hint: typeof e.hint === 'string' ? e.hint : null,
      code: e.code ?? null,
      status: e.status ?? null,
    };
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(e),
      details: e.details != null ? String(e.details) : null,
      hint: e.hint != null ? String(e.hint) : null,
      code: e.code ?? null,
      status: e.status ?? null,
    };
  }

  return {
    message: typeof error === 'string' ? error : String(error ?? 'unknown error'),
    details: null,
    hint: null,
    code: null,
    status: null,
  };
}
