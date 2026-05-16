/**
 * Promise timeout 헬퍼 — Gemini SDK 같이 자체 timeout이 없는 호출에 강제 시간 제한.
 *
 * 사용:
 *   const result = await withTimeout(model.generateContent(...), 30_000, 'Gemini');
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout (${ms}ms)`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
